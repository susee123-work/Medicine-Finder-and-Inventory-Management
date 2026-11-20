from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Query, HTTPException, Depends
from backend.app.db.client import db, rows
from backend.app.models.schemas import RestockSubIn
from backend.app.services.notifications import notification_service
from backend.app.api.predictions import get_shortage_predictions
from backend.app.core.auth import get_current_user_optional
from backend.app.core.websocket import ws_manager

router = APIRouter(prefix="/alerts", tags=["Alerts & Notifications"])

@router.post("/subscribe")
def subscribe_to_restock_alert(sub: RestockSubIn):
    """Allow a patient to subscribe to email/SMS notifications when a medicine is back in stock."""
    med = rows(db.table("medicines").select("name").eq("id", sub.medicine_id).execute())
    if not med:
        raise HTTPException(404, "Medicine not found")
        
    record = sub.model_dump()
    record["is_notified"] = False
    inserted = rows(db.table("restock_subscriptions").insert(record).execute())[0]

    # Send confirmation email/sms
    notification_service.send_email(
        to_email=sub.patient_email,
        subject=f"MediPulse Alert: Subscribed to restock alerts for {med[0]['name']}",
        html_content=f"<p>Hello,</p><p>You have successfully subscribed to restock notifications for <b>{med[0]['name']}</b>. We will alert you immediately when fresh stock arrives.</p>"
    )

    ws_manager.broadcast_sync(
        "SUBSCRIPTION_CREATED",
        {"subscription_id": inserted["id"], "medicine_id": sub.medicine_id, "medicine": med[0]["name"]},
        f"New restock alert subscription for {med[0]['name']}",
    )

    return {
        "status": "SUCCESS",
        "message": f"Subscribed to restock notifications for {med[0]['name']}.",
        "subscription_id": inserted["id"]
    }

@router.get("/subscriptions")
def list_subscriptions(medicine_id: Optional[str] = None):
    query = db.table("restock_subscriptions").select("*, medicines(name), pharmacies(name)")
    if medicine_id:
        query = query.eq("medicine_id", medicine_id)
    return rows(query.order("created_at", desc=True).execute())

@router.get("/digest/preview")
def preview_daily_digest(pharmacy_id: str):
    """Preview the daily digest email for a pharmacy with at-risk and expiring stock."""
    pharm = rows(db.table("pharmacies").select("name, email").eq("id", pharmacy_id).execute())
    if not pharm:
        raise HTTPException(404, "Pharmacy not found")
    p = pharm[0]

    # Fetch shortages
    predictions = get_shortage_predictions(pharmacy_id=pharmacy_id, horizon_days=7)
    at_risk = [p for p in predictions if p["risk_level"] in ("HIGH", "CRITICAL")]

    # Fetch expiring stock
    exp_rows = rows(
        db.table("inventory")
        .select("*, medicines(name)")
        .eq("pharmacy_id", pharmacy_id)
        .gt("quantity", 0)
        .order("expiry_date")
        .limit(10)
        .execute()
    )
    expiring = [
        {
            "medicine_name": (e.get("medicines") or {}).get("name", "Unknown"),
            "batch_no": e.get("batch_no"),
            "quantity": e.get("quantity"),
            "expiry_date": e.get("expiry_date")
        }
        for e in exp_rows
    ]

    html = notification_service.generate_daily_digest_html(p["name"], at_risk, expiring)
    return {
        "pharmacy": p["name"],
        "target_email": p.get("email") or "pharmacy-admin@medipulse.ai",
        "at_risk_count": len(at_risk),
        "expiring_count": len(expiring),
        "digest_html_preview": html
    }

@router.post("/digest/send")
def send_daily_digest(pharmacy_id: str, to_email: Optional[str] = Query(None, description="Optional override recipient email")):
    """Trigger dispatch of the daily stockout & expiry digest email to pharmacy staff."""
    preview = preview_daily_digest(pharmacy_id)
    recipient = (to_email or "").strip() or preview["target_email"]
    res = notification_service.send_email(
        to_email=recipient,
        subject=f"MediPulse Daily Digest: Stock Risks & Expiry Summary for {preview['pharmacy']}",
        html_content=preview["digest_html_preview"]
    )
    ws_manager.broadcast_sync(
        "DIGEST_DISPATCHED",
        {"pharmacy_id": pharmacy_id, "pharmacy": preview["pharmacy"], "recipient": recipient, "success": bool(res.get("success"))},
        f"Daily digest dispatched for {preview['pharmacy']}",
    )
    return {
        "status": "SENT" if res.get("success") else "FAILED",
        "recipient": recipient,
        "result": res
    }

