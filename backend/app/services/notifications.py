import logging
from typing import Dict, Any, Optional, List
from datetime import datetime, timezone
import httpx
from backend.app.config import settings

logger = logging.getLogger("medipulse.notifications")

class NotificationService:
    def __init__(self):
        self.mock_mode = settings.MOCK_NOTIFICATIONS or not (settings.TWILIO_ACCOUNT_SID or settings.RESEND_API_KEY)
        self.dispatched_log: List[Dict[str, Any]] = []

    def send_sms(self, to_phone: str, message: str) -> Dict[str, Any]:
        """Dispatch SMS notification via Twilio or local development stub."""
        record = {
            "channel": "SMS",
            "to": to_phone,
            "message": message,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "status": "SENT"
        }
        
        if self.mock_mode or not (settings.TWILIO_ACCOUNT_SID and settings.TWILIO_AUTH_TOKEN):
            logger.info("[LOCAL DEV STUB] SMS to %s: %s", to_phone, message)
            record["provider"] = "mock_stub"
            self.dispatched_log.append(record)
            return {"success": True, "provider": "mock_stub", "detail": "SMS simulated in local sandbox mode"}

        try:
            # Twilio REST API via HTTP
            url = f"https://api.twilio.com/2010-04-01/Accounts/{settings.TWILIO_ACCOUNT_SID}/Messages.json"
            data = {
                "To": to_phone,
                "From": settings.TWILIO_PHONE_NUMBER,
                "Body": message
            }
            auth = (settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN)
            with httpx.Client(timeout=10.0) as client:
                res = client.post(url, data=data, auth=auth)
                res.raise_for_status()
                record["provider"] = "twilio"
                self.dispatched_log.append(record)
                return {"success": True, "provider": "twilio", "response": res.json()}
        except Exception as e:
            logger.error("Failed to send SMS via Twilio: %s", e)
            record["status"] = "FAILED"
            record["error"] = str(e)
            self.dispatched_log.append(record)
            return {"success": False, "error": str(e)}

    def send_email(self, to_email: str, subject: str, html_content: str) -> Dict[str, Any]:
        """Dispatch Email notification via Resend or local development stub."""
        record = {
            "channel": "EMAIL",
            "to": to_email,
            "subject": subject,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "status": "SENT"
        }

        if self.mock_mode or not settings.RESEND_API_KEY:
            logger.info("[LOCAL DEV STUB] Email to %s [%s]:\n%s", to_email, subject, html_content[:200])
            record["provider"] = "mock_stub"
            self.dispatched_log.append(record)
            return {"success": True, "provider": "mock_stub", "detail": "Email simulated in local sandbox mode"}

        try:
            url = "https://api.resend.com/emails"
            headers = {
                "Authorization": f"Bearer {settings.RESEND_API_KEY}",
                "Content-Type": "application/json"
            }
            payload = {
                "from": "MediPulse AI <alerts@medipulse.ai>",
                "to": [to_email],
                "subject": subject,
                "html": html_content
            }
            with httpx.Client(timeout=10.0) as client:
                res = client.post(url, json=payload, headers=headers)
                res.raise_for_status()
                record["provider"] = "resend"
                self.dispatched_log.append(record)
                return {"success": True, "provider": "resend", "response": res.json()}
        except Exception as e:
            logger.error("Failed to send Email via Resend: %s", e)
            record["status"] = "FAILED"
            record["error"] = str(e)
            self.dispatched_log.append(record)
            return {"success": False, "error": str(e)}

    def generate_daily_digest_html(self, pharmacy_name: str, at_risk_items: List[Dict[str, Any]], expiring_items: List[Dict[str, Any]]) -> str:
        rows_risk = "".join(
            f"<tr><td style='padding:8px;border-bottom:1px solid #ddd;'><b>{i.get('medicine')}</b></td>"
            f"<td style='padding:8px;border-bottom:1px solid #ddd;'>{i.get('stock')} units</td>"
            f"<td style='padding:8px;border-bottom:1px solid #ddd;color:#c00;'>{i.get('days_cover')} days ({i.get('risk_level')})</td></tr>"
            for i in at_risk_items[:8]
        ) or "<tr><td colspan='3' style='padding:8px;'>No critical shortage risks today.</td></tr>"

        rows_exp = "".join(
            f"<tr><td style='padding:8px;border-bottom:1px solid #ddd;'><b>{i.get('medicine_name')}</b></td>"
            f"<td style='padding:8px;border-bottom:1px solid #ddd;'>Batch {i.get('batch_no')}</td>"
            f"<td style='padding:8px;border-bottom:1px solid #ddd;color:#e65100;'>Expires {i.get('expiry_date')} ({i.get('quantity')} units)</td></tr>"
            for i in expiring_items[:8]
        ) or "<tr><td colspan='3' style='padding:8px;'>No batches expiring in the next 30 days.</td></tr>"

        html = f"""
        <div style="font-family:system-ui,sans-serif;max-width:600px;margin:auto;border:1px solid #cfdde3;border-radius:8px;padding:20px;background:#ffffff;">
            <div style="background:#0b2a4a;color:#ffffff;padding:12px;border-radius:6px;text-align:center;">
                <h2 style="margin:0;">MediPulse AI Daily Inventory Digest</h2>
                <p style="margin:4px 0 0;font-size:14px;color:#0fa3a3;">Pharmacy: {pharmacy_name}</p>
            </div>
            
            <h3 style="color:#d32f2f;margin-top:20px;">⚠️ At-Risk Shortage Alerts</h3>
            <table style="width:100%;border-collapse:collapse;font-size:14px;">
                <thead>
                    <tr style="background:#f3f8fa;text-align:left;">
                        <th style="padding:8px;">Medicine</th>
                        <th style="padding:8px;">Current Stock</th>
                        <th style="padding:8px;">Estimated Cover</th>
                    </tr>
                </thead>
                <tbody>{rows_risk}</tbody>
            </table>

            <h3 style="color:#f57c00;margin-top:24px;">⏳ Expiring Batches (Next 30 Days)</h3>
            <table style="width:100%;border-collapse:collapse;font-size:14px;">
                <thead>
                    <tr style="background:#f3f8fa;text-align:left;">
                        <th style="padding:8px;">Medicine</th>
                        <th style="padding:8px;">Batch</th>
                        <th style="padding:8px;">Expiry Status</th>
                    </tr>
                </thead>
                <tbody>{rows_exp}</tbody>
            </table>

            <p style="margin-top:24px;font-size:12px;color:#5b6b7a;text-align:center;">
                Generated automatically by MediPulse AI Predictive Inventory Intelligence.
            </p>
        </div>
        """
        return html

notification_service = NotificationService()
