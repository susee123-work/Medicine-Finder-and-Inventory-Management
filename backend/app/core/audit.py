import logging
from typing import Optional, Dict, Any
from datetime import datetime, timezone
from backend.app.db.client import db

logger = logging.getLogger("medipulse.audit")

def log_audit_event(
    action: str,
    entity_type: str,
    entity_id: Optional[str] = None,
    pharmacy_id: Optional[str] = None,
    actor_user_id: Optional[str] = None,
    previous_state: Optional[Dict[str, Any]] = None,
    new_state: Optional[Dict[str, Any]] = None,
    ip_address: Optional[str] = None
) -> None:
    try:
        record = {
            "action": action,
            "entity_type": entity_type,
            "entity_id": str(entity_id) if entity_id else None,
            "pharmacy_id": str(pharmacy_id) if pharmacy_id else None,
            "actor_user_id": str(actor_user_id) if actor_user_id else None,
            "previous_state": previous_state,
            "new_state": new_state,
            "ip_address": ip_address,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        db.table("audit_logs").insert(record).execute()
        logger.info("Audit: [%s] on %s id=%s by user=%s", action, entity_type, entity_id, actor_user_id)
    except Exception as e:
        logger.error("Failed to write audit log: %s", e)

