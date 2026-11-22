import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Dict, Any, Optional
from fastapi import APIRouter, HTTPException, Depends, status
from backend.app.db.client import db, rows
from backend.app.models.schemas import (
    UserCreate,
    UserLogin,
    UserOut,
    Token,
    EmailOTPRequest,
    EmailOTPVerify,
)
from backend.app.core.auth import (
    hash_password,
    verify_password,
    create_access_token,
    get_current_user
)
from backend.app.config import settings
from backend.app.services.notifications import notification_service

router = APIRouter(prefix="/auth", tags=["Authentication & Multi-Tenancy"])

PORTAL_ROLE_MAP = {
    "admin": "pharmacy_admin",
    "pharmacy_admin": "pharmacy_admin",
    "staff": "pharmacy_staff",
    "pharmacy_staff": "pharmacy_staff",
    "official": "health_official",
    "health_official": "health_official",
    "patient": "patient",
}

PORTAL_LABEL_MAP = {
    "pharmacy_admin": "Pharmacy Admin Portal",
    "pharmacy_staff": "Pharmacy Staff Portal",
    "health_official": "Health Official Directorate",
    "patient": "Patient Access Portal",
}

# In-memory single-use OTP verification store: email -> {code, expires_at, portal_role, purpose, attempts, pending_user}
_otp_store: Dict[str, Dict[str, Any]] = {}
OTP_TTL_SECONDS = 600  # 10 minutes
OTP_MAX_ATTEMPTS = 5


def _issue_token_for_user(u: Dict[str, Any]) -> Token:
    user_role = u.get("role", "patient")
    mem = rows(db.table("pharmacy_members").select("pharmacy_id, pharmacies(name)").eq("user_id", u["id"]).execute())
    pharm_id = mem[0]["pharmacy_id"] if mem else None
    pharm_name = (mem[0].get("pharmacies") or {}).get("name") if mem and mem[0].get("pharmacies") else None

    token = create_access_token(str(u["id"]), u["email"], user_role, str(pharm_id) if pharm_id else None)
    user_out = UserOut(
        id=str(u["id"]),
        email=u["email"],
        full_name=u.get("full_name", "MediPulse User"),
        role=user_role,
        pharmacy_id=str(pharm_id) if pharm_id else None,
        pharmacy_name=pharm_name,
        is_active=u.get("is_active", True)
    )
    return Token(access_token=token, token_type="bearer", user=user_out)


def _create_user_record(
    email: str,
    full_name: str,
    password: Optional[str],
    role: str,
    pharmacy_id: Optional[str] = None,
    phone: Optional[str] = None,
    is_verified: bool = True,
) -> Dict[str, Any]:
    user_id = str(uuid.uuid4())
    hashed = hash_password(password) if password else hash_password(secrets.token_urlsafe(24))

    assigned_pharmacy_id = pharmacy_id
    if not assigned_pharmacy_id and role in ("pharmacy_staff", "pharmacy_admin"):
        pharms = rows(db.table("pharmacies").select("id").limit(1).execute())
        if pharms:
            assigned_pharmacy_id = pharms[0]["id"]

    new_user = {
        "id": user_id,
        "email": email.lower().strip(),
        "full_name": full_name.strip(),
        "role": role,
        "phone": phone,
        "password_hash": hashed,
        "is_active": True,
        "is_verified": is_verified,
    }
    db.table("users").insert(new_user).execute()

    if assigned_pharmacy_id and role in ("pharmacy_staff", "pharmacy_admin"):
        db.table("pharmacy_members").insert({
            "user_id": user_id,
            "pharmacy_id": assigned_pharmacy_id,
            "role": role,
            "is_primary": True
        }).execute()

    return new_user


@router.get("/portal-stats")
def get_portal_stats():
    """Live dynamic telemetry & pharmacy directory for the portal selector & login screens."""
    pharms = rows(db.table("pharmacies").select("id, name, city, locality").execute())
    meds = rows(db.table("medicines").select("id").execute())
    cities = sorted({p.get("city") for p in pharms if p.get("city")})
    smtp_info = notification_service.get_smtp_status()
    return {
        "pharmacies_count": len(pharms),
        "medicines_count": len(meds),
        "cities_count": len(cities),
        "smtp_live": bool(smtp_info["configured"] and not smtp_info["mock_mode"]),
        "pharmacies": [
            {"id": p["id"], "name": p["name"], "city": p.get("city", ""), "locality": p.get("locality", "")}
            for p in pharms
        ],
    }


@router.post("/otp/request")
def request_email_otp(payload: EmailOTPRequest):
    """
    Generate a 6-digit email verification code and send it via Gmail SMTP.
    Supports both:
      - purpose='signup': validates new account fields and holds pending registration until verified
      - purpose='login': passwordless / email-verified dynamic login for the selected portal
    """
    email_lower = payload.email.lower().strip()
    if "@" not in email_lower or "." not in email_lower.split("@")[-1]:
        raise HTTPException(status_code=422, detail="Please enter a valid email address.")

    existing = rows(db.table("users").select("*").eq("email", email_lower).execute())

    if payload.purpose == "signup":
        if existing:
            raise HTTPException(status_code=400, detail="An account with this email already exists. Try signing in instead.")
        if not payload.full_name or len(payload.full_name.strip()) < 2:
            raise HTTPException(status_code=422, detail="Please enter your full name.")
        if not payload.password or len(payload.password) < 6:
            raise HTTPException(status_code=422, detail="Password must be at least 6 characters.")
        recipient_name = payload.full_name.strip()
    else:
        # Login via Email OTP
        if existing:
            existing_role = existing[0].get("role", "patient")
            if existing_role != payload.portal_role:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"This email is registered under the '{existing_role.replace('_', ' ')}' portal. Please switch to that portal."
                )
            recipient_name = existing[0].get("full_name", email_lower.split("@")[0])
        else:
            recipient_name = (payload.full_name or email_lower.split("@")[0].replace(".", " ").title()).strip()

    code = f"{secrets.randbelow(1_000_000):06d}"
    expires_at = datetime.now(timezone.utc) + timedelta(seconds=OTP_TTL_SECONDS)

    _otp_store[email_lower] = {
        "code": code,
        "expires_at": expires_at,
        "portal_role": payload.portal_role,
        "purpose": payload.purpose,
        "attempts": 0,
        "pending_user": {
            "email": email_lower,
            "full_name": recipient_name,
            "password": payload.password,
            "role": payload.portal_role,
            "pharmacy_id": payload.pharmacy_id,
            "phone": payload.phone,
        },
    }

    portal_label = PORTAL_LABEL_MAP.get(payload.portal_role, "MediPulse AI")
    html = notification_service.generate_otp_email_html(
        code=code,
        portal_label=portal_label,
        purpose=payload.purpose,
        recipient_name=recipient_name,
    )
    subject = f"{code} is your MediPulse AI verification code — {portal_label}"
    send_res = notification_service.send_email(
        to_email=email_lower,
        subject=subject,
        html_content=html,
    )

    if not send_res.get("success"):
        err_msg = send_res.get("error", "SMTP delivery failed")
        logger.warning(
            "Could not deliver email to %s (%s). Providing verification fallback code.",
            email_lower,
            err_msg
        )
        return {
            "status": "OTP_SENT",
            "email": email_lower,
            "portal_role": payload.portal_role,
            "purpose": payload.purpose,
            "expires_in_seconds": OTP_TTL_SECONDS,
            "provider": "cloud_smtp_blocked_fallback",
            "smtp_error": err_msg,
            "dev_code": code,
            "message": (
                f"Your cloud host blocked outbound SMTP ports 587/465 ({err_msg}). "
                f"Render free tier restricts direct SMTP ports by default. "
                f"Enter the verification code below to activate your account, or configure RESEND_API_KEY for port-443 live delivery."
            ),
        }

    return {
        "status": "OTP_SENT",
        "email": email_lower,
        "portal_role": payload.portal_role,
        "purpose": payload.purpose,
        "expires_in_seconds": OTP_TTL_SECONDS,
        "provider": send_res.get("provider", "gmail_smtp"),
        "message": f"A 6-digit verification code has been sent to {email_lower}.",
    }


@router.post("/otp/verify", response_model=Token)
def verify_email_otp(payload: EmailOTPVerify):
    """Verify the 6-digit email OTP, finalize account activation if needed, and issue a portal JWT."""
    email_lower = payload.email.lower().strip()
    record = _otp_store.get(email_lower)
    if not record:
        raise HTTPException(status_code=400, detail="No active verification code found. Please request a new code.")

    if datetime.now(timezone.utc) > record["expires_at"]:
        _otp_store.pop(email_lower, None)
        raise HTTPException(status_code=400, detail="Verification code has expired. Please request a new code.")

    if record["portal_role"] != payload.portal_role:
        raise HTTPException(status_code=403, detail="This verification code was requested for a different portal.")

    record["attempts"] += 1
    if record["attempts"] > OTP_MAX_ATTEMPTS:
        _otp_store.pop(email_lower, None)
        raise HTTPException(status_code=429, detail="Too many failed attempts. Please request a new verification code.")

    if not secrets.compare_digest(record["code"], payload.code.strip()):
        remaining = max(0, OTP_MAX_ATTEMPTS - record["attempts"])
        raise HTTPException(
            status_code=401,
            detail=f"Invalid verification code. {remaining} attempt(s) remaining."
        )

    # Valid code — consume it immediately (single-use)
    _otp_store.pop(email_lower, None)

    existing = rows(db.table("users").select("*").eq("email", email_lower).execute())
    if existing:
        u = existing[0]
        db.table("users").update({"is_verified": True}).eq("id", u["id"]).execute()
        u["is_verified"] = True
    else:
        pending = record["pending_user"]
        u = _create_user_record(
            email=pending["email"],
            full_name=pending["full_name"],
            password=pending.get("password"),
            role=pending["role"],
            pharmacy_id=pending.get("pharmacy_id"),
            phone=pending.get("phone"),
            is_verified=True,
        )

    return _issue_token_for_user(u)


@router.post("/register", response_model=Token)
def register(user_in: UserCreate):
    existing = rows(db.table("users").select("id").eq("email", user_in.email.lower()).execute())
    if existing:
        raise HTTPException(status_code=400, detail="User with this email already exists")

    new_user = _create_user_record(
        email=user_in.email,
        full_name=user_in.full_name,
        password=user_in.password,
        role=user_in.role,
        pharmacy_id=user_in.pharmacy_id,
        phone=user_in.phone,
        is_verified=True,
    )

    # Send welcome email via SMTP (best-effort)
    try:
        role_display = user_in.role.replace("_", " ").title()
        notification_service.send_email(
            to_email=user_in.email.lower(),
            subject=f"Welcome to MediPulse AI — {role_display} Portal",
            html_content=(
                f"<div style='font-family:Helvetica,Arial,sans-serif;max-width:540px;margin:auto;padding:24px;background:#FAF8F5;border:1px solid #E5E0D8;border-radius:12px;'>"
                f"<h2 style='color:#141210;margin-top:0;'>Welcome to MediPulse AI, {user_in.full_name}!</h2>"
                f"<p style='color:#44403C;'>Your <b>{role_display}</b> account is active.</p>"
                f"<p style='font-size:12px;color:#78716C;margin-top:20px;'>MediPulse AI · Predictive Medicine Availability Intelligence</p>"
                f"</div>"
            )
        )
    except Exception:
        pass

    return _issue_token_for_user(new_user)


def _authenticate_user(creds: UserLogin, required_role: Optional[str] = None) -> Token:
    email_lower = creds.email.lower().strip()
    user_res = rows(db.table("users").select("*").eq("email", email_lower).execute())
    if not user_res:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password"
        )

    u = user_res[0]
    if "password_hash" in u and u["password_hash"]:
        if not verify_password(creds.password, u["password_hash"]):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or password"
            )

    user_role = u.get("role", "patient")
    expected = required_role or creds.portal_role
    if expected and user_role != expected:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"This account belongs to the '{user_role.replace('_', ' ')}' portal, not '{expected.replace('_', ' ')}'."
        )

    return _issue_token_for_user(u)


@router.post("/login", response_model=Token)
def login(creds: UserLogin):
    return _authenticate_user(creds, required_role=creds.portal_role)


@router.post("/login/{portal}", response_model=Token)
def portal_login(portal: str, creds: UserLogin):
    """Separate dedicated login endpoint per portal: admin, staff, official, patient."""
    expected_role = PORTAL_ROLE_MAP.get(portal.lower())
    if not expected_role:
        raise HTTPException(
            status_code=404,
            detail=f"Unknown portal '{portal}'. Valid portals: admin, staff, official, patient."
        )
    return _authenticate_user(creds, required_role=expected_role)


@router.get("/me", response_model=UserOut)
def get_me(user: UserOut = Depends(get_current_user)):
    return user


@router.get("/demo-tokens")
def get_demo_role_tokens():
    """
    Returns ready-to-use tokens for evaluating all 4 system roles:
    1. pharmacy_admin (Full stock, reorders & staff control)
    2. pharmacy_staff (FEFO inventory & sales operations)
    3. health_official (System-wide community shortage analytics & OLAP explorer)
    4. patient (Public medicine finder & verification requests)
    """
    pharms = rows(db.table("pharmacies").select("id, name").limit(1).execute())
    pharm_id = pharms[0]["id"] if pharms else str(uuid.uuid4())
    pharm_name = pharms[0]["name"] if pharms else "Apollo Pharmacy"

    demo_roles = [
        {"role": "pharmacy_admin", "name": "Dr. Sarah Chen (Admin)", "email": "admin@apollopharm.com", "pharmacy_id": pharm_id, "pharmacy_name": pharm_name},
        {"role": "pharmacy_staff", "name": "Ravi Kumar (Staff)", "email": "staff@apollopharm.com", "pharmacy_id": pharm_id, "pharmacy_name": pharm_name},
        {"role": "health_official", "name": "Dr. Arumugam (Director of Health Services)", "email": "health.official@tn.gov.in", "pharmacy_id": None, "pharmacy_name": None},
        {"role": "patient", "name": "Ananya Sharma (Patient)", "email": "patient@gmail.com", "pharmacy_id": None, "pharmacy_name": None}
    ]

    result = []
    for d in demo_roles:
        uid = f"demo-{d['role']}"
        tok = create_access_token(uid, d["email"], d["role"], d["pharmacy_id"])
        result.append({
            "role": d["role"],
            "name": d["name"],
            "email": d["email"],
            "pharmacy_id": d["pharmacy_id"],
            "pharmacy_name": d["pharmacy_name"],
            "access_token": tok
        })
    return result
