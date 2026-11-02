from datetime import datetime, timezone, timedelta, date
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, HTTPException, Depends, Query, status
from backend.app.db.client import db, rows
from backend.app.models.schemas import (
    PharmacyIn, SupplierIn, MedicineIn, StockIn, StockBulkIn, SaleIn, DeliveryIn
)
from backend.app.core.auth import get_current_user_optional, require_roles, require_pharmacy_access
from backend.app.core.audit import log_audit_event
from backend.app.services.notifications import notification_service

router = APIRouter(tags=["Inventory & Transactions"])

def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()

# ---------- PHARMACIES & SUPPLIERS ----------
@router.get("/pharmacies")
def list_pharmacies():
    return rows(db.table("pharmacies").select("*").order("name").execute())

@router.post("/pharmacies")
def add_pharmacy(p: PharmacyIn, user = Depends(get_current_user_optional)):
    data = p.model_dump()
    data["created_at"] = now_iso()
    inserted = rows(db.table("pharmacies").insert(data).execute())[0]
    log_audit_event("CREATE_PHARMACY", "pharmacy", inserted["id"], new_state=inserted)
    return inserted

@router.get("/suppliers")
def list_suppliers():
    return rows(db.table("suppliers").select("*").order("name").execute())

@router.post("/suppliers")
def add_supplier(s: SupplierIn, user = Depends(get_current_user_optional)):
    data = s.model_dump()
    data["created_at"] = now_iso()
    inserted = rows(db.table("suppliers").insert(data).execute())[0]
    log_audit_event("CREATE_SUPPLIER", "supplier", inserted["id"], new_state=inserted)
    return inserted

# ---------- MEDICINES CATALOGUE ----------
@router.get("/medicines")
def list_medicines():
    return rows(db.table("medicines").select("*, suppliers(name, typical_lead_time_days)").order("name").execute())

@router.post("/medicines")
def add_medicine(m: MedicineIn, user = Depends(get_current_user_optional)):
    data = m.model_dump()
    data["created_at"] = now_iso()
    inserted = rows(db.table("medicines").insert(data).execute())[0]
    log_audit_event("CREATE_MEDICINE", "medicine", inserted["id"], new_state=inserted)
    return inserted

# ---------- INVENTORY & BATCHES (FEFO) ----------
@router.get("/inventory")
@router.get("/inventory/batches")
def get_inventory(pharmacy_id: Optional[str] = Query(None, description="Pharmacy UUID")):
    """List stock batches for pharmacy ordered by expiry date (FEFO priority)."""
    q = db.table("inventory").select("*, medicines(id, name, generic_name, strength, dosage_form, atc_code, therapeutic_category)")
    if pharmacy_id:
        q = q.eq("pharmacy_id", pharmacy_id)
    return rows(q.order("expiry_date").execute())

@router.post("/inventory")
def upsert_stock(s: StockIn, user = Depends(get_current_user_optional)):
    """Add or update an inventory batch with verification timestamp and audit logging."""
    if user and user.role in ("pharmacy_staff", "pharmacy_admin"):
        require_pharmacy_access(s.pharmacy_id, user)

    d = s.model_dump(mode="json")
    d["verified_at"] = now_iso()
    d["updated_at"] = now_iso()
    
    # Check previous state for audit log
    existing = rows(
        db.table("inventory")
        .select("*")
        .eq("pharmacy_id", s.pharmacy_id)
        .eq("medicine_id", s.medicine_id)
        .eq("batch_no", s.batch_no)
        .execute()
    )
    prev = existing[0] if existing else None

    inserted = rows(db.table("inventory").upsert(d, on_conflict="pharmacy_id,medicine_id,batch_no").execute())[0]
    
    log_audit_event(
        action="UPDATE_STOCK" if prev else "CREATE_BATCH",
        entity_type="inventory",
        entity_id=inserted["id"],
        pharmacy_id=s.pharmacy_id,
        actor_user_id=user.id if user else None,
        previous_state=prev,
        new_state=inserted
    )

    # Check restock subscriptions if stock is now > 0
    if s.quantity > 0:
        _check_and_notify_restock(s.medicine_id, s.pharmacy_id, s.quantity)

    return inserted

@router.post("/inventory/bulk")
def bulk_upload_stock(bulk: StockBulkIn, user = Depends(get_current_user_optional)):
    """
    Bulk CSV/Excel stock upload endpoint with row-level validation,
    automatic medicine name resolution, and audit logging.
    """
    if user and user.role in ("pharmacy_staff", "pharmacy_admin"):
        require_pharmacy_access(bulk.pharmacy_id, user)

    meds = rows(db.table("medicines").select("id, name, generic_name").execute())
    med_lookup = {m["name"].lower(): m["id"] for m in meds}
    for m in meds:
        if m.get("generic_name"):
            med_lookup[m["generic_name"].lower()] = m["id"]

    processed = []
    errors = []

    for idx, item in enumerate(bulk.items):
        clean_name = item.medicine_name.strip().lower()
        med_id = med_lookup.get(clean_name)
        if not med_id:
            # Create medicine on the fly if missing
            new_med = rows(db.table("medicines").insert({
                "name": item.medicine_name.strip(),
                "generic_name": item.medicine_name.strip(),
                "default_price": item.selling_price or 50.0
            }).execute())[0]
            med_id = new_med["id"]
            med_lookup[clean_name] = med_id

        # Validate expiry date format
        try:
            exp_date = str(item.expiry_date)[:10]
            date.fromisoformat(exp_date)
        except Exception:
            errors.append(f"Row {idx+1}: Invalid expiry date '{item.expiry_date}' (expected YYYY-MM-DD)")
            continue

        record = {
            "pharmacy_id": bulk.pharmacy_id,
            "medicine_id": med_id,
            "batch_no": item.batch_no.strip(),
            "quantity": item.quantity,
            "expiry_date": exp_date,
            "unit_cost": item.unit_cost,
            "selling_price": item.selling_price,
            "verified_at": now_iso()
        }
        res = rows(db.table("inventory").upsert(record, on_conflict="pharmacy_id,medicine_id,batch_no").execute())
        if res:
            processed.append(res[0])

    log_audit_event(
        action="BULK_STOCK_IMPORT",
        entity_type="inventory",
        pharmacy_id=bulk.pharmacy_id,
        actor_user_id=user.id if user else None,
        new_state={"rows_processed": len(processed), "errors_count": len(errors)}
    )

    return {
        "status": "COMPLETED",
        "rows_processed": len(processed),
        "errors": errors,
        "sample": processed[:5]
    }

@router.patch("/inventory/verify/{batch_id}")
def verify_batch_stock(batch_id: str, user = Depends(get_current_user_optional)):
    """Mark physical stock of a batch as manually verified right now by pharmacy staff."""
    updated = rows(
        db.table("inventory")
        .update({"verified_at": now_iso(), "updated_at": now_iso()})
        .eq("id", batch_id)
        .execute()
    )
    if not updated:
        raise HTTPException(404, "Batch not found")
    log_audit_event("VERIFY_STOCK", "inventory", batch_id, actor_user_id=user.id if user else None)
    return updated[0]

@router.get("/inventory/expiring")
def get_expiring_stock(pharmacy_id: str = Query(...), days: int = Query(60, ge=1, le=365)):
    """Fetch batches expiring within N days sorted by expiration date."""
    cutoff = (date.today() + timedelta(days=days)).isoformat()
    return rows(
        db.table("inventory")
        .select("*, medicines(name, strength)")
        .eq("pharmacy_id", pharmacy_id)
        .gt("quantity", 0)
        .lte("expiry_date", cutoff)
        .order("expiry_date")
        .execute()
    )

# ---------- SALES EXECUTION (FEFO ALLOCATION) ----------
@router.post("/sales")
def record_sale(s: SaleIn, user = Depends(get_current_user_optional)):
    """
    Record a customer sale. Enforces First-Expired, First-Out (FEFO) allocation
    across active batches, updates inventory, and logs audit events.
    """
    if user and user.role in ("pharmacy_staff", "pharmacy_admin"):
        require_pharmacy_access(s.pharmacy_id, user)

    # Fetch active batches ordered by expiry date (FEFO)
    batches = rows(
        db.table("inventory")
        .select("*")
        .eq("pharmacy_id", s.pharmacy_id)
        .eq("medicine_id", s.medicine_id)
        .gt("quantity", 0)
        .order("expiry_date")
        .execute()
    )

    total_avail = sum(b.get("quantity", 0) for b in batches)
    if total_avail < s.quantity:
        raise HTTPException(
            status_code=400,
            detail=f"Insufficient stock for sale. Requested: {s.quantity}, Available: {total_avail}."
        )

    remaining = s.quantity
    deductions = []
    earliest_batch_id = None

    for b in batches:
        take = min(remaining, b["quantity"])
        new_qty = b["quantity"] - take
        
        db.table("inventory").update({
            "quantity": new_qty,
            "verified_at": now_iso(),
            "updated_at": now_iso()
        }).eq("id", b["id"]).execute()

        deductions.append({"batch_no": b["batch_no"], "deducted": take, "remaining": new_qty})
        if not earliest_batch_id:
            earliest_batch_id = b["id"]

        remaining -= take
        if remaining == 0:
            break

    # Record sale transaction
    sale_data = s.model_dump()
    sale_data["batch_id"] = earliest_batch_id
    sale_data["sold_at"] = now_iso()
    sale_data["total_amount"] = round((s.unit_price or 50.0) * s.quantity, 2)
    sale_rec = rows(db.table("sales").insert(sale_data).execute())[0]

    log_audit_event(
        action="RECORD_SALE",
        entity_type="sales",
        entity_id=sale_rec["id"],
        pharmacy_id=s.pharmacy_id,
        actor_user_id=user.id if user else None,
        new_state={"sale_id": sale_rec["id"], "quantity": s.quantity, "fefo_allocations": deductions}
    )

    return {
        "sale": sale_rec,
        "fefo_deductions": deductions
    }

# ---------- DELIVERIES & PURCHASE RECEIPTS ----------
@router.get("/deliveries")
def list_deliveries(pharmacy_id: Optional[str] = None):
    query = db.table("deliveries").select("*, suppliers(name), medicines(name)")
    if pharmacy_id:
        query = query.eq("pharmacy_id", pharmacy_id)
    return rows(query.order("ordered_on", desc=True).execute())

@router.post("/deliveries")
def create_delivery_order(d: DeliveryIn, user = Depends(get_current_user_optional)):
    data = d.model_dump(mode="json")
    data["status"] = "ORDERED"
    inserted = rows(db.table("deliveries").insert(data).execute())[0]
    log_audit_event("CREATE_PURCHASE_ORDER", "deliveries", inserted["id"], pharmacy_id=d.pharmacy_id)
    return inserted

@router.patch("/deliveries/{delivery_id}/receive")
def receive_delivery(
    delivery_id: str,
    quantity_received: int = Query(..., ge=1),
    batch_no: str = Query(..., min_length=2),
    expiry_date: str = Query(..., description="YYYY-MM-DD"),
    user = Depends(get_current_user_optional)
):
    """
    Receive purchase order delivery:
    1. Updates delivery status to DELIVERED.
    2. Calculates actual lead time and delay days.
    3. Automatically upserts inventory batch with the received quantity!
    4. Triggers restock notifications for patients waiting on this medicine.
    """
    deliv_res = rows(db.table("deliveries").select("*").eq("id", delivery_id).execute())
    if not deliv_res:
        raise HTTPException(404, "Delivery not found")
    d = deliv_res[0]

    today_val = date.today()
    ord_date = date.fromisoformat(str(d["ordered_on"])[:10])
    exp_date = date.fromisoformat(str(d["expected_on"])[:10])

    actual_lead = (today_val - ord_date).days
    delay_days = max(0, (today_val - exp_date).days)

    updated_deliv = rows(
        db.table("deliveries")
        .update({
            "received_on": today_val.isoformat(),
            "quantity_received": quantity_received,
            "status": "DELIVERED",
            "lead_time_days": actual_lead,
            "delay_days": delay_days
        })
        .eq("id", delivery_id)
        .execute()
    )[0]

    # Automatically increment / create inventory batch
    batch_data = {
        "pharmacy_id": d["pharmacy_id"],
        "medicine_id": d["medicine_id"],
        "batch_no": batch_no.strip(),
        "quantity": quantity_received,
        "expiry_date": expiry_date,
        "supplier_id": d["supplier_id"],
        "verified_at": now_iso()
    }
    db.table("inventory").upsert(batch_data, on_conflict="pharmacy_id,medicine_id,batch_no").execute()

    # Notify restock subscribers
    _check_and_notify_restock(d["medicine_id"], d["pharmacy_id"], quantity_received)

    log_audit_event(
        action="RECEIVE_DELIVERY",
        entity_type="deliveries",
        entity_id=delivery_id,
        pharmacy_id=d["pharmacy_id"],
        new_state=updated_deliv
    )

    return {
        "delivery": updated_deliv,
        "message": f"Successfully received {quantity_received} units (Lead time: {actual_lead}d, Delay: {delay_days}d)."
    }

def _check_and_notify_restock(medicine_id: str, pharmacy_id: str, quantity: int):
    """Notify subscribed patients when restock arrives."""
    subs = rows(
        db.table("restock_subscriptions")
        .select("*, medicines(name)")
        .eq("medicine_id", medicine_id)
        .eq("is_notified", False)
        .execute()
    )
    for sub in subs:
        med_name = (sub.get("medicines") or {}).get("name", "Medicine")
        notification_service.send_email(
            to_email=sub["patient_email"],
            subject=f"MediPulse Restock Alert: {med_name} is back in stock!",
            html_content=f"<p>Good news! Fresh stock ({quantity} units) of <b>{med_name}</b> has arrived at the pharmacy.</p>"
        )
        db.table("restock_subscriptions").update({"is_notified": True, "notified_at": now_iso()}).eq("id", sub["id"]).execute()

