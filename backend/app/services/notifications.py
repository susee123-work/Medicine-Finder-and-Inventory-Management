"""
MediPulse AI — Notification Service
Real SMTP email via Gmail (app-password) + Twilio SMS stub.
Falls back gracefully when credentials are missing.
"""
import logging
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Dict, Any, List
from datetime import datetime, timezone

from backend.app.config import settings

logger = logging.getLogger("medipulse.notifications")


class NotificationService:
    def __init__(self):
        self.dispatched_log: List[Dict[str, Any]] = []

    @property
    def smtp_ready(self) -> bool:
        return bool(
            (settings.SMTP_USERNAME and settings.SMTP_PASSWORD)
            or settings.RESEND_API_KEY
            or settings.EMAIL_WEBHOOK_URL
        )

    def get_smtp_status(self) -> Dict[str, Any]:
        transport = "gmail_smtp"
        if settings.EMAIL_WEBHOOK_URL:
            transport = "https_webhook"
        elif settings.RESEND_API_KEY:
            transport = "resend_https"
        return {
            "configured": self.smtp_ready,
            "mock_mode": settings.MOCK_NOTIFICATIONS,
            "transport": transport,
            "host": settings.SMTP_HOST,
            "port": settings.SMTP_PORT,
            "username": settings.SMTP_USERNAME or None,
            "from_name": settings.SMTP_FROM_NAME,
            "use_tls": settings.SMTP_USE_TLS,
            "https_relay_configured": bool(settings.EMAIL_WEBHOOK_URL or settings.RESEND_API_KEY),
            "recent_dispatches": self.dispatched_log[-10:],
        }

    def _send_via_https_webhook(self, to_email: str, subject: str, html_content: str) -> Dict[str, Any]:
        import httpx
        with httpx.Client(timeout=15.0, follow_redirects=True) as client:
            res = client.post(
                settings.EMAIL_WEBHOOK_URL,
                json={"to": to_email, "subject": subject, "html": html_content},
            )
            res.raise_for_status()
            return {"success": True, "provider": "https_webhook", "to": to_email}

    def _send_via_resend(self, to_email: str, subject: str, html_content: str) -> Dict[str, Any]:
        import httpx
        with httpx.Client(timeout=15.0) as client:
            res = client.post(
                "https://api.resend.com/emails",
                headers={
                    "Authorization": f"Bearer {settings.RESEND_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "from": f"{settings.SMTP_FROM_NAME} <onboarding@resend.dev>",
                    "to": [to_email],
                    "subject": subject,
                    "html": html_content,
                },
            )
            res.raise_for_status()
            return {"success": True, "provider": "resend_https", "to": to_email}

    # ------------------------------------------------------------------ #
    # Public interface                                                      #
    # ------------------------------------------------------------------ #

    def send_email(self, to_email: str, subject: str, html_content: str) -> Dict[str, Any]:
        """Send email via HTTPS relay (port 443) if configured, or Gmail SMTP (587 -> 465)."""
        record: Dict[str, Any] = {
            "channel": "EMAIL",
            "to": to_email,
            "subject": subject,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

        if settings.MOCK_NOTIFICATIONS or not self.smtp_ready:
            logger.info("[STUB] Email → %s | %s", to_email, subject)
            record["status"] = "STUB"
            record["provider"] = "stub"
            self.dispatched_log.append(record)
            return {"success": True, "provider": "stub", "detail": "Email logged (stub mode)"}

        # 1. HTTPS Webhook (e.g. Google Apps Script bound to your Gmail — works over port 443!)
        if settings.EMAIL_WEBHOOK_URL:
            try:
                out = self._send_via_https_webhook(to_email, subject, html_content)
                record["status"] = "SENT"
                record["provider"] = "https_webhook"
                self.dispatched_log.append(record)
                return out
            except Exception as exc:
                logger.error("HTTPS email webhook failed: %s", exc)
                record["status"] = "FAILED"
                record["error"] = str(exc)
                self.dispatched_log.append(record)
                return {"success": False, "error": str(exc)}

        # 2. Resend HTTPS API (port 443)
        if settings.RESEND_API_KEY:
            try:
                out = self._send_via_resend(to_email, subject, html_content)
                record["status"] = "SENT"
                record["provider"] = "resend_https"
                self.dispatched_log.append(record)
                return out
            except Exception as exc:
                logger.error("Resend HTTPS API failed: %s", exc)
                record["status"] = "FAILED"
                record["error"] = str(exc)
                self.dispatched_log.append(record)
                return {"success": False, "error": str(exc)}

        # 3. Direct Gmail SMTP (STARTTLS 587 with automatic SSL 465 fallback)
        try:
            msg = MIMEMultipart("alternative")
            msg["Subject"] = subject
            msg["From"] = f"{settings.SMTP_FROM_NAME} <{settings.SMTP_USERNAME}>"
            msg["To"] = to_email
            msg.attach(MIMEText(html_content, "html", "utf-8"))

            if settings.SMTP_PORT == 465:
                with smtplib.SMTP_SSL(settings.SMTP_HOST, 465, timeout=15) as smtp:
                    smtp.login(settings.SMTP_USERNAME, settings.SMTP_PASSWORD)
                    smtp.sendmail(settings.SMTP_USERNAME, [to_email], msg.as_string())
            else:
                try:
                    with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=10) as smtp:
                        if settings.SMTP_USE_TLS:
                            smtp.ehlo()
                            smtp.starttls()
                            smtp.ehlo()
                        smtp.login(settings.SMTP_USERNAME, settings.SMTP_PASSWORD)
                        smtp.sendmail(settings.SMTP_USERNAME, [to_email], msg.as_string())
                except (TimeoutError, OSError):
                    # Automatic fallback to implicit SSL on port 465 if port 587 is blocked by network/firewall
                    logger.info("SMTP port %s unreachable, falling back to SSL port 465", settings.SMTP_PORT)
                    with smtplib.SMTP_SSL(settings.SMTP_HOST, 465, timeout=15) as smtp:
                        smtp.login(settings.SMTP_USERNAME, settings.SMTP_PASSWORD)
                        smtp.sendmail(settings.SMTP_USERNAME, [to_email], msg.as_string())

            logger.info("Email sent → %s via Gmail SMTP", to_email)
            record["status"] = "SENT"
            record["provider"] = "gmail_smtp"
            self.dispatched_log.append(record)
            return {"success": True, "provider": "gmail_smtp", "to": to_email}

        except smtplib.SMTPAuthenticationError as exc:
            logger.error("SMTP auth failed: %s", exc)
            record["status"] = "FAILED"
            record["error"] = "SMTP authentication failed — check SMTP_USERNAME / SMTP_PASSWORD in .env"
            self.dispatched_log.append(record)
            return {"success": False, "error": record["error"]}
        except Exception as exc:
            logger.error("Email send failed: %s", exc)
            record["status"] = "FAILED"
            record["error"] = str(exc)
            self.dispatched_log.append(record)
            return {"success": False, "error": str(exc)}

    def send_sms(self, to_phone: str, message: str) -> Dict[str, Any]:
        """Send SMS via Twilio or stub."""
        record: Dict[str, Any] = {
            "channel": "SMS",
            "to": to_phone,
            "message": message,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

        if not (settings.TWILIO_ACCOUNT_SID and settings.TWILIO_AUTH_TOKEN):
            logger.info("[STUB] SMS → %s: %s", to_phone, message)
            record["status"] = "STUB"
            record["provider"] = "stub"
            self.dispatched_log.append(record)
            return {"success": True, "provider": "stub", "detail": "SMS logged (stub mode)"}

        try:
            import httpx
            url = (
                f"https://api.twilio.com/2010-04-01/Accounts/"
                f"{settings.TWILIO_ACCOUNT_SID}/Messages.json"
            )
            auth = (settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN)
            with httpx.Client(timeout=10.0) as client:
                res = client.post(url, data={"To": to_phone, "From": settings.TWILIO_PHONE_NUMBER, "Body": message}, auth=auth)
                res.raise_for_status()
            record["status"] = "SENT"
            record["provider"] = "twilio"
            self.dispatched_log.append(record)
            return {"success": True, "provider": "twilio"}
        except Exception as exc:
            logger.error("SMS send failed: %s", exc)
            record["status"] = "FAILED"
            record["error"] = str(exc)
            self.dispatched_log.append(record)
            return {"success": False, "error": str(exc)}

    # ------------------------------------------------------------------ #
    # Email templates                                                       #
    # ------------------------------------------------------------------ #

    def generate_daily_digest_html(
        self,
        pharmacy_name: str,
        at_risk_items: List[Dict[str, Any]],
        expiring_items: List[Dict[str, Any]],
    ) -> str:
        rows_risk = "".join(
            f"<tr>"
            f"<td style='padding:8px;border-bottom:1px solid #ddd;'><b>{i.get('medicine')}</b></td>"
            f"<td style='padding:8px;border-bottom:1px solid #ddd;'>{i.get('stock')} units</td>"
            f"<td style='padding:8px;border-bottom:1px solid #ddd;color:#c00;'>{i.get('days_cover')} days ({i.get('risk_level')})</td>"
            f"</tr>"
            for i in at_risk_items[:8]
        ) or "<tr><td colspan='3' style='padding:8px;'>No critical shortage risks today.</td></tr>"

        rows_exp = "".join(
            f"<tr>"
            f"<td style='padding:8px;border-bottom:1px solid #ddd;'><b>{i.get('medicine_name')}</b></td>"
            f"<td style='padding:8px;border-bottom:1px solid #ddd;'>Batch {i.get('batch_no')}</td>"
            f"<td style='padding:8px;border-bottom:1px solid #ddd;color:#e65100;'>Expires {i.get('expiry_date')} ({i.get('quantity')} units)</td>"
            f"</tr>"
            for i in expiring_items[:8]
        ) or "<tr><td colspan='3' style='padding:8px;'>No batches expiring in the next 30 days.</td></tr>"

        return f"""
        <div style="font-family:system-ui,sans-serif;max-width:600px;margin:auto;border:1px solid #cfdde3;border-radius:8px;padding:20px;background:#ffffff;">
            <div style="background:#0b2a4a;color:#ffffff;padding:12px;border-radius:6px;text-align:center;">
                <h2 style="margin:0;">MediPulse AI Daily Inventory Digest</h2>
                <p style="margin:4px 0 0;font-size:14px;color:#0fa3a3;">Pharmacy: {pharmacy_name}</p>
            </div>
            <h3 style="color:#d32f2f;margin-top:20px;">&#9888; At-Risk Shortage Alerts</h3>
            <table style="width:100%;border-collapse:collapse;font-size:14px;">
                <thead><tr style="background:#f3f8fa;text-align:left;">
                    <th style="padding:8px;">Medicine</th>
                    <th style="padding:8px;">Current Stock</th>
                    <th style="padding:8px;">Estimated Cover</th>
                </tr></thead>
                <tbody>{rows_risk}</tbody>
            </table>
            <h3 style="color:#f57c00;margin-top:24px;">&#8987; Expiring Batches (Next 30 Days)</h3>
            <table style="width:100%;border-collapse:collapse;font-size:14px;">
                <thead><tr style="background:#f3f8fa;text-align:left;">
                    <th style="padding:8px;">Medicine</th>
                    <th style="padding:8px;">Batch</th>
                    <th style="padding:8px;">Expiry Status</th>
                </tr></thead>
                <tbody>{rows_exp}</tbody>
            </table>
            <p style="margin-top:24px;font-size:12px;color:#5b6b7a;text-align:center;">
                Generated automatically by MediPulse AI Predictive Inventory Intelligence.
            </p>
        </div>
        """

    def generate_restock_alert_html(self, medicine: str, pharmacy: str, stock: int, days_cover: float) -> str:
        return f"""
        <div style="font-family:system-ui,sans-serif;max-width:580px;margin:auto;border:1px solid #fcc;border-radius:8px;padding:20px;background:#fff;">
            <div style="background:#d32f2f;color:#fff;padding:10px 14px;border-radius:6px;">
                <h2 style="margin:0;font-size:18px;">&#9888; Restock Alert — MediPulse AI</h2>
            </div>
            <p style="margin-top:16px;font-size:15px;">
                <b>{medicine}</b> at <b>{pharmacy}</b> is at risk of a shortage.
            </p>
            <table style="font-size:14px;border-collapse:collapse;width:100%;">
                <tr><td style="padding:6px 0;color:#666;">Current Stock</td><td><b>{stock} units</b></td></tr>
                <tr><td style="padding:6px 0;color:#666;">Days of Cover</td><td><b style="color:#d32f2f;">{days_cover:.1f} days</b></td></tr>
            </table>
            <p style="margin-top:16px;font-size:13px;color:#555;">
                Please review and place a reorder request via the MediPulse AI dashboard.
            </p>
            <p style="font-size:11px;color:#aaa;margin-top:20px;">MediPulse AI · Predictive Medicine Availability Intelligence</p>
        </div>
        """

    def generate_patient_confirmation_html(self, medicine: str, pharmacy: str, status: str, notes: str = "") -> str:
        color = "#2e7d32" if status == "confirmed" else "#d32f2f"
        label = "Confirmed Available" if status == "confirmed" else "Currently Unavailable"
        return f"""
        <div style="font-family:system-ui,sans-serif;max-width:560px;margin:auto;border:1px solid #dde;border-radius:8px;padding:20px;background:#fff;">
            <div style="background:#0b2a4a;color:#fff;padding:10px 14px;border-radius:6px;">
                <h2 style="margin:0;font-size:18px;">Medicine Availability — MediPulse AI</h2>
            </div>
            <p style="margin-top:16px;font-size:15px;">Your availability request for <b>{medicine}</b> at <b>{pharmacy}</b> has been updated.</p>
            <div style="background:{color};color:#fff;border-radius:6px;padding:10px 14px;margin-top:12px;font-size:16px;font-weight:600;">
                {label}
            </div>
            {f'<p style="margin-top:12px;font-size:14px;color:#444;">{notes}</p>' if notes else ''}
            <p style="font-size:11px;color:#aaa;margin-top:20px;">MediPulse AI · Community Medicine Finder</p>
        </div>
        """

    def generate_otp_email_html(
        self,
        code: str,
        portal_label: str,
        purpose: str = "login",
        recipient_name: str = "there",
    ) -> str:
        action_text = "verify your new account" if purpose == "signup" else "sign in securely"
        spaced_code = " ".join(list(code))
        return f"""
        <div style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;max-width:540px;margin:24px auto;background:#FAF8F5;border:1px solid #E5E0D8;border-radius:16px;overflow:hidden;">
            <div style="background:#141210;padding:28px 32px;color:#FAF8F5;">
                <div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#E06D44;font-weight:700;">
                    MEDIPULSE AI · {portal_label.upper()}
                </div>
                <h1 style="margin:8px 0 0;font-size:24px;font-weight:700;color:#FAF8F5;letter-spacing:-0.4px;">
                    Email Verification Code
                </h1>
            </div>
            <div style="padding:32px;color:#1C1917;">
                <p style="margin:0 0 14px;font-size:15px;line-height:1.6;">
                    Hello <b>{recipient_name}</b>,
                </p>
                <p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#57534E;">
                    Use the one-time verification code below to {action_text} on the <b>{portal_label}</b> portal.
                    This code expires in <b>10 minutes</b>.
                </p>
                <div style="background:#141210;color:#FAF8F5;border-radius:12px;padding:22px;text-align:center;margin:0 0 24px;border:1px solid #292524;">
                    <div style="font-family:'Courier New',Courier,monospace;font-size:34px;font-weight:800;letter-spacing:10px;color:#F59E0B;">
                        {spaced_code}
                    </div>
                </div>
                <p style="margin:0;font-size:12px;color:#78716C;line-height:1.5;">
                    If you did not request this verification code, you can safely ignore this email. Never share this code with anyone.
                </p>
            </div>
            <div style="padding:16px 32px;background:#F3EFE9;border-top:1px solid #E5E0D8;font-size:11px;color:#78716C;text-align:center;">
                MediPulse AI · Predictive Medicine Availability &amp; Shortage Intelligence
            </div>
        </div>
        """


notification_service = NotificationService()
