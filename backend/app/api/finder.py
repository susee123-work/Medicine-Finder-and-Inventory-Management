import math
from collections import defaultdict
from datetime import datetime, timezone, timedelta, date, time
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Query, HTTPException, Depends
from backend.app.db.client import db, rows
from backend.app.models.schemas import ConfirmIn, ConfirmRespond
from backend.app.services.notifications import notification_service
from backend.app.core.rate_limit import check_rate_limit
from backend.app.core.auth import get_current_user_optional
from backend.app.core.websocket import ws_manager

router = APIRouter(prefix="/finder", tags=["Medicine Finder"])

def haversine(lat1: Optional[float], lon1: Optional[float], lat2: Optional[float], lon2: Optional[float]) -> Optional[float]:
    if None in (lat1, lon1, lat2, lon2):
        return None
    try:
        p1, p2 = math.radians(float(lat1)), math.radians(float(lat2))
        d_lat = math.radians(float(lat2) - float(lat1))
        d_lon = math.radians(float(lon2) - float(lon1))
        h = math.sin(d_lat / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(d_lon / 2) ** 2
        return round(12742 * math.asin(math.sqrt(h)), 2)
    except Exception:
        return None

def is_pharmacy_open(pharm: Dict[str, Any]) -> bool:
    if pharm.get("is_24_hours"):
        return True
    now_time = datetime.now().time()
    try:
        open_t = time.fromisoformat(str(pharm.get("open_time", "08:00:00")))
        close_t = time.fromisoformat(str(pharm.get("close_time", "22:00:00")))
        return open_t <= now_time <= close_t
    except Exception:
        return True

@router.get("", dependencies=[Depends(check_rate_limit)])
@router.get("/search", dependencies=[Depends(check_rate_limit)])
def search_nearby_medicines(
    medicine: Optional[str] = Query(None, description="Medicine brand name or generic molecule"),
    medicine_name: Optional[str] = Query(None, description="Alias for medicine query"),
    lat: Optional[float] = Query(None, description="Patient Latitude"),
    lng: Optional[float] = Query(None, description="Patient Longitude"),
    radius_km: Optional[float] = Query(None, description="Search radius in kilometers"),
    open_now: Optional[bool] = Query(False, description="Filter for pharmacies currently open"),
    in_stock_only: Optional[bool] = Query(True, description="Only show pharmacies with available stock")
):
    """
    Search for medicines across community pharmacies with verification freshness timestamps,
    distance calculation, operating hours filter, and generic substitutes recommendation.
    """
    query_term = (medicine or medicine_name or "").strip()
    if not query_term:
        raise HTTPException(422, "Please provide 'medicine' or 'medicine_name' search term")

    # Find matching medicines by brand or generic name
    meds = rows(
        db.table("medicines")
        .select("id, name, generic_name, strength, dosage_form, therapeutic_category, atc_code, default_price")
        .ilike("name", f"%{query_term}%")
        .execute()
    )
    if not meds:
        # Try generic name search
        meds = rows(
            db.table("medicines")
            .select("id, name, generic_name, strength, dosage_form, therapeutic_category, atc_code, default_price")
            .ilike("generic_name", f"%{query_term}%")
            .execute()
        )

    matched_med_ids = [m["id"] for m in meds]
    primary_generic = meds[0].get("generic_name") if meds else None
    primary_cat = meds[0].get("therapeutic_category") if meds else None

    # Fetch active verified inventory for matching medicines
    inv_items = rows(
        db.table("inventory")
        .select("id, pharmacy_id, medicine_id, quantity, verified_at, expiry_date, pharmacies(*), medicines(name, generic_name, strength)")
        .execute()
    )

    now_utc = datetime.now(timezone.utc)
    today_iso = date.today().isoformat()

    # Aggregate stock by pharmacy and medicine
    results = []
    pharm_stock_map = defaultdict(lambda: {"total_qty": 0, "latest_verified": None, "pharmacy": None, "med": None})

    for item in inv_items:
        mid = item.get("medicine_id")
        if mid not in matched_med_ids:
            continue

        # Exclude expired stock
        exp = str(item.get("expiry_date") or "")
        if exp and exp < today_iso:
            continue

        qty = int(item.get("quantity") or 0)
        p = item.get("pharmacies")
        if not p or not p.get("is_active", True):
            continue

        pid = p["id"]
        v_ts = str(item.get("verified_at") or now_utc.isoformat())

        rec = pharm_stock_map[(pid, mid)]
        rec["total_qty"] += qty
        rec["pharmacy"] = p
        rec["med"] = item.get("medicines")
        if not rec["latest_verified"] or v_ts > rec["latest_verified"]:
            rec["latest_verified"] = v_ts

    for (pid, mid), val in pharm_stock_map.items():
        qty = val["total_qty"]
        if in_stock_only and qty <= 0:
            continue

        p = val["pharmacy"]
        m = val["med"] or {}
        
        # Check open now
        is_open = is_pharmacy_open(p)
        if open_now and not is_open:
            continue

        dist_km = haversine(lat, lng, p.get("latitude"), p.get("longitude"))

        # Calculate verified hours ago
        v_dt = datetime.fromisoformat(val["latest_verified"].replace("Z", "+00:00"))
        hours_ago = round((now_utc - v_dt).total_seconds() / 3600.0, 1)

        results.append({
            "medicine_id": mid,
            "medicine": m.get("name"),
            "generic_name": m.get("generic_name"),
            "strength": m.get("strength"),
            "pharmacy_id": pid,
            "pharmacy": p.get("name"),
            "phone": p.get("phone"),
            "address": p.get("address_line") or p.get("address"),
            "locality": p.get("locality"),
            "city": p.get("city"),
            "latitude": p.get("latitude"),
            "longitude": p.get("longitude"),
            "is_open": is_open,
            "is_24_hours": p.get("is_24_hours", False),
            "in_stock": qty > 0,
            "available_quantity": qty,
            "verified_at": val["latest_verified"],
            "verified_hours_ago": max(0.0, hours_ago),
            "distance_km": dist_km
        })

    # Sort: In-stock first, then by distance
    results.sort(key=lambda r: (not r["in_stock"], r["distance_km"] is None, r["distance_km"] or 0))

    # Look for generic substitutes or therapeutic alternatives if out of stock or for cost savings
    substitutes = []
    if primary_generic or primary_cat:
        alt_meds = rows(
            db.table("medicines")
            .select("id, name, generic_name, strength, therapeutic_category, default_price")
            .execute()
        )
        for am in alt_meds:
            if am["id"] in matched_med_ids:
                continue
            if (primary_generic and am.get("generic_name") == primary_generic) or \
               (primary_cat and am.get("therapeutic_category") == primary_cat):
                substitutes.append({
                    "medicine_id": am["id"],
                    "name": am["name"],
                    "generic_name": am.get("generic_name"),
                    "strength": am.get("strength"),
                    "therapeutic_category": am.get("therapeutic_category"),
                    "default_price": am.get("default_price", 40.0),
                    "reason": "Identical active molecule (Generic equivalent)" if am.get("generic_name") == primary_generic else "Same therapeutic drug class"
                })

    return {
        "searched_query": medicine,
        "results_count": len(results),
        "results": results,
        "generic_substitutes": substitutes[:5]
    }

@router.post("/confirm", dependencies=[Depends(check_rate_limit)])
def create_confirmation_request(req: ConfirmIn):
    """Submit a real-time medicine availability confirmation request to a specific pharmacy."""
    pharm = rows(db.table("pharmacies").select("name, phone, email, address_line, city").eq("id", req.pharmacy_id).execute())
    med = rows(db.table("medicines").select("name, generic_name, strength").eq("id", req.medicine_id).execute())
    
    p_info = pharm[0] if pharm else {}
    m_info = med[0] if med else {}
    p_name = p_info.get("name", "Pharmacy")
    m_name = m_info.get("name", "Medicine")

    record = req.model_dump()
    record["status"] = "pending"
    record["medicine_name"] = m_name
    record["pharmacy_name"] = p_name
    record["pharmacy_phone"] = p_info.get("phone", "")
    record["pharmacy_city"] = p_info.get("city", "")
    record["medicine_strength"] = m_info.get("strength", "")
    record["quantity_requested"] = req.quantity_requested or 1
    record["urgency"] = req.urgency or "Normal"
    record["pickup_preference"] = req.pickup_preference or "Counter Pickup"
    record["created_at"] = datetime.now(timezone.utc).isoformat()
    inserted = rows(db.table("confirmation_requests").insert(record).execute())[0]

    # Notify pharmacy staff via SMS and SMTP Email
    notification_service.send_sms(
        to_phone=p_info.get("phone", "+919876543210") if p_info else "+919876543210",
        message=f"MediPulse Alert: Patient requested {record['quantity_requested']}x '{m_name}'. Request ID: {inserted['id']}."
    )
    if p_info.get("email"):
        notification_service.send_email(
            to_email=p_info["email"],
            subject=f"MediPulse Stock Confirmation Request: {m_name}",
            html_content=(
                f"<div style='font-family:system-ui,sans-serif;max-width:560px;margin:auto;padding:20px;border:1px solid #dde;border-radius:8px;'>"
                f"<h2 style='color:#0b2a4a;margin-top:0;'>New Patient Medicine Reservation Request</h2>"
                f"<p>Medicine: <b>{m_name}</b> ({m_info.get('strength', '')})</p>"
                f"<p>Quantity: <b>{record['quantity_requested']} unit(s)</b></p>"
                f"<p>Urgency: <b>{record['urgency']}</b></p>"
                f"<p>Pickup Mode: <b>{record['pickup_preference']}</b></p>"
                f"<p>Pharmacy: <b>{p_name}</b></p>"
                f"<p>Patient: <b>{req.patient_name or 'Patient'}</b> ({req.patient_contact})</p>"
                f"<p>Notes: {req.notes or 'None'}</p>"
                f"</div>"
            )
        )

    ws_manager.broadcast_sync(
        "CONFIRMATION_REQUESTED",
        {
            "request_id": inserted["id"],
            "pharmacy_id": req.pharmacy_id,
            "medicine_id": req.medicine_id,
            "medicine": m_name,
            "pharmacy": p_name,
            "patient_name": req.patient_name,
            "patient_contact": req.patient_contact,
            "quantity_requested": record["quantity_requested"],
            "urgency": record["urgency"],
            "status": "pending",
            "created_at": inserted["created_at"],
        },
        f"Patient {req.patient_name or 'User'} requested {record['quantity_requested']}x {m_name} at {p_name}",
    )

    return {
        "id": inserted["id"],
        "status": "pending",
        "message": f"Confirmation request for {m_name} submitted to {p_name}. Pharmacy staff will verify stock immediately.",
        "request": inserted
    }

@router.get("/my-requests")
def get_my_patient_requests(contact: Optional[str] = Query(None, description="Patient email or phone number")):
    """Retrieve live active and historical medicine requests placed by the current patient."""
    all_reqs = rows(
        db.table("confirmation_requests")
        .select("*, medicines(name, generic_name, strength), pharmacies(name, address_line, city, phone)")
        .order("created_at", desc=True)
        .execute()
    )
    if contact and contact.strip():
        clean = contact.strip().lower()
        return [
            r for r in all_reqs
            if clean in str(r.get("patient_contact", "")).lower()
            or clean in str(r.get("patient_name", "")).lower()
        ]
    return all_reqs[:30]

@router.get("/confirm/{request_id}")
def check_confirmation_status(request_id: str):
    """Check the real-time status of a stock confirmation request."""
    res = rows(db.table("confirmation_requests").select("*, medicines(name), pharmacies(name, phone)").eq("id", request_id).execute())
    if not res:
        raise HTTPException(404, "Confirmation request not found")
    r = res[0]
    return {
        "id": r["id"],
        "status": r["status"],
        "medicine": r.get("medicine_name") or (r.get("medicines") or {}).get("name"),
        "pharmacy": r.get("pharmacy_name") or (r.get("pharmacies") or {}).get("name"),
        "quantity_requested": r.get("quantity_requested", 1),
        "urgency": r.get("urgency", "Normal"),
        "pickup_preference": r.get("pickup_preference", "Counter Pickup"),
        "created_at": r["created_at"],
        "responded_at": r.get("responded_at"),
        "notes": r.get("notes")
    }

@router.get("/pharmacy-requests")
def list_pharmacy_confirmation_requests(pharmacy_id: Optional[str] = Query(None)):
    """Pharmacy staff view to see pending and historical patient confirmation requests."""
    all_reqs = rows(
        db.table("confirmation_requests")
        .select("*, medicines(name, strength), pharmacies(name, city)")
        .order("created_at", desc=True)
        .execute()
    )
    if pharmacy_id and pharmacy_id.strip():
        return [r for r in all_reqs if r.get("pharmacy_id") == pharmacy_id.strip()]
    return all_reqs

@router.patch("/pharmacy-requests/{request_id}")
def respond_to_confirmation_request(request_id: str, resp: ConfirmRespond):
    """Pharmacy staff marks medicine as available or unavailable."""
    updated = rows(
        db.table("confirmation_requests")
        .update({
            "status": resp.status,
            "notes": resp.notes,
            "responded_at": datetime.now(timezone.utc).isoformat()
        })
        .eq("id", request_id)
        .execute()
    )
    if not updated:
        raise HTTPException(404, "Request not found")
    
    r = updated[0]
    m_name = r.get("medicine_name") or "Medicine"
    p_name = r.get("pharmacy_name") or "Pharmacy"

    # Notify patient via Email (if email address) or SMS
    patient_contact = r.get("patient_contact")
    if patient_contact:
        if "@" in str(patient_contact):
            email_status = "confirmed" if resp.status in ("available", "confirmed", "ready_for_pickup") else "unavailable"
            html = notification_service.generate_patient_confirmation_html(
                medicine=m_name, pharmacy=p_name, status=email_status, notes=resp.notes or ""
            )
            notification_service.send_email(
                to_email=str(patient_contact),
                subject=f"MediPulse Update: {m_name} at {p_name} ({resp.status.upper()})",
                html_content=html
            )
        else:
            notification_service.send_sms(
                to_phone=patient_contact,
                message=f"MediPulse Update: Your request for '{m_name}' has been marked '{resp.status.upper()}'. Staff notes: {resp.notes or 'Stock confirmed'}."
            )

    ws_manager.broadcast_sync(
        "CONFIRMATION_UPDATED",
        {
            "request_id": request_id,
            "pharmacy_id": r.get("pharmacy_id"),
            "status": resp.status,
            "notes": resp.notes,
            "medicine": m_name,
            "pharmacy": p_name,
            "patient_contact": r.get("patient_contact"),
            "responded_at": r.get("responded_at"),
        },
        f"Request {request_id[:8]} for {m_name} marked {resp.status.upper()}",
    )

    return r
