import hmac
import hashlib
import time
from typing import Optional, List
import jwt
from fastapi import HTTPException, Security, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from backend.app.config import settings
from backend.app.db.client import db, rows
from backend.app.models.schemas import UserOut

security = HTTPBearer(auto_error=False)

def hash_password(password: str) -> str:
    """Generate salted PBKDF2 HMAC SHA-256 hash."""
    salt = settings.JWT_SECRET[:16].encode("utf-8")
    pwd_hash = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 100000)
    return pwd_hash.hex()

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return hmac.compare_digest(hash_password(plain_password), hashed_password)

def create_access_token(user_id: str, email: str, role: str, pharmacy_id: Optional[str] = None) -> str:
    now_ts = int(time.time())
    payload = {
        "sub": user_id,
        "email": email,
        "role": role,
        "pharmacy_id": pharmacy_id,
        "iat": now_ts,
        "exp": now_ts + (settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60)
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)

def decode_access_token(token: str) -> dict:
    try:
        return jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token has expired")
    except Exception:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid authorization token")

def get_current_user_optional(creds: Optional[HTTPAuthorizationCredentials] = Security(security)) -> Optional[UserOut]:
    if not creds:
        return None
    try:
        payload = decode_access_token(creds.credentials)
        user_id = payload.get("sub")
        # Fetch user
        user_res = rows(db.table("users").select("*").eq("id", user_id).execute())
        if not user_res:
            return None
        u = user_res[0]
        # Fetch pharmacy membership
        mem = rows(db.table("pharmacy_members").select("pharmacy_id, pharmacies(name)").eq("user_id", user_id).execute())
        pharm_id = mem[0].get("pharmacy_id") if mem else payload.get("pharmacy_id")
        pharm_name = (mem[0].get("pharmacies") or {}).get("name") if mem and mem[0].get("pharmacies") else None
        
        return UserOut(
            id=str(u["id"]),
            email=u["email"],
            full_name=u.get("full_name", ""),
            role=u.get("role", payload.get("role", "patient")),
            pharmacy_id=str(pharm_id) if pharm_id else None,
            pharmacy_name=pharm_name,
            is_active=u.get("is_active", True)
        )
    except Exception:
        return None

def get_current_user(creds: Optional[HTTPAuthorizationCredentials] = Security(security)) -> UserOut:
    user = get_current_user_optional(creds)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required. Please provide a valid Bearer token.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is disabled")
    return user

def require_roles(allowed_roles: List[str]):
    def role_checker(user: UserOut = Depends(get_current_user)) -> UserOut:
        if user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied. Requires one of roles: {', '.join(allowed_roles)}. Your role is '{user.role}'."
            )
        return user
    return role_checker

def require_pharmacy_access(pharmacy_id: str, user: UserOut = Depends(get_current_user)) -> UserOut:
    """Enforce multi-tenant pharmacy isolation:
    - pharmacy_staff and pharmacy_admin can only manage their own pharmacy.
    - health_official has read-only oversight across all pharmacies.
    """
    if user.role == "health_official":
        return user
        
    if user.role in ("pharmacy_staff", "pharmacy_admin"):
        if not user.pharmacy_id or str(user.pharmacy_id) != str(pharmacy_id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Tenant authorization failure: You can only access and modify stock for your assigned pharmacy."
            )
        return user
        
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Patients and unauthorized users cannot perform pharmacy inventory operations."
    )
