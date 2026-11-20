import pytest
from backend.app.core.auth import (
    hash_password,
    verify_password,
    create_access_token,
    decode_access_token
)
from backend.app.db.client import db, rows

def test_password_hashing():
    pwd = "SecretPassword123!"
    hashed = hash_password(pwd)
    assert hashed != pwd
    assert verify_password(pwd, hashed)
    assert not verify_password("WrongPassword", hashed)

def test_jwt_generation_and_decoding():
    token = create_access_token("user-123", "test@medipulse.ai", "pharmacy_admin", "pharm-456")
    payload = decode_access_token(token)
    assert payload["sub"] == "user-123"
    assert payload["email"] == "test@medipulse.ai"
    assert payload["role"] == "pharmacy_admin"
    assert payload["pharmacy_id"] == "pharm-456"

def test_auth_endpoints(client):
    # Test registration
    email = "newstaff@testpharm.com"
    reg_resp = client.post("/auth/register", json={
        "email": email,
        "full_name": "Test Pharmacist",
        "password": "Password123!",
        "role": "pharmacy_staff"
    })
    assert reg_resp.status_code == 200
    token = reg_resp.json()["access_token"]
    assert token

    # Test login
    login_resp = client.post("/auth/login", json={
        "email": email,
        "password": "Password123!"
    })
    assert login_resp.status_code == 200
    assert login_resp.json()["access_token"]

    # Test /auth/me with Bearer token
    me_resp = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me_resp.status_code == 200
    assert me_resp.json()["email"] == email

def test_demo_tokens_endpoint(client):
    resp = client.get("/auth/demo-tokens")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 4
    roles = [d["role"] for d in data]
    assert "pharmacy_admin" in roles
    assert "pharmacy_staff" in roles
    assert "health_official" in roles
    assert "patient" in roles


def test_separate_portal_logins_and_role_isolation(client):
    # Each portal accepts its own seeded account
    portals = [
        ("admin", "admin@apollopharm.com", "Admin@123", "pharmacy_admin"),
        ("staff", "staff@apollopharm.com", "Staff@123", "pharmacy_staff"),
        ("official", "health.official@tn.gov.in", "Official@123", "health_official"),
        ("patient", "patient@gmail.com", "Patient@123", "patient"),
    ]
    for portal_key, email, pwd, expected_role in portals:
        resp = client.post(f"/auth/login/{portal_key}", json={"email": email, "password": pwd})
        assert resp.status_code == 200, f"Failed for {portal_key}: {resp.text}"
        body = resp.json()
        assert body["user"]["role"] == expected_role
        assert body["access_token"]

    # Wrong password rejected with 401
    bad_pw = client.post("/auth/login/admin", json={"email": "admin@apollopharm.com", "password": "WrongPassword"})
    assert bad_pw.status_code == 401

    # Cross-portal login rejected with 403 (patient trying to sign in to admin portal)
    cross = client.post("/auth/login/admin", json={"email": "patient@gmail.com", "password": "Patient@123"})
    assert cross.status_code == 403


def test_email_status_and_test_endpoint(client):
    st = client.get("/email/status")
    assert st.status_code == 200
    assert "host" in st.json()

    res = client.post("/email/test?to=test@example.com")
    assert res.status_code == 200
    assert res.json()["success"] is True


def test_email_otp_signup_and_dynamic_login(client):
    from backend.app.api.auth import _otp_store

    # 1. Portal stats returns live pharmacies & counts
    stats = client.get("/auth/portal-stats")
    assert stats.status_code == 200
    sdata = stats.json()
    assert sdata["pharmacies_count"] > 0
    assert len(sdata["pharmacies"]) > 0
    pharm_id = sdata["pharmacies"][0]["id"]

    # 2. Request OTP for new pharmacy_staff signup
    new_email = "otp.verified.staff@medipulse.in"
    req = client.post("/auth/otp/request", json={
        "email": new_email,
        "portal_role": "pharmacy_staff",
        "purpose": "signup",
        "full_name": "Verified Pharmacist",
        "password": "StrongPassword1!",
        "pharmacy_id": pharm_id,
    })
    assert req.status_code == 200, req.text
    assert req.json()["status"] == "OTP_SENT"
    code = _otp_store[new_email]["code"]
    assert len(code) == 6

    # Wrong OTP rejected
    bad = client.post("/auth/otp/verify", json={
        "email": new_email,
        "code": "000000" if code != "000000" else "999999",
        "portal_role": "pharmacy_staff",
    })
    assert bad.status_code == 401

    # Correct OTP succeeds, creates user, and returns JWT
    ok = client.post("/auth/otp/verify", json={
        "email": new_email,
        "code": code,
        "portal_role": "pharmacy_staff",
    })
    assert ok.status_code == 200, ok.text
    token_data = ok.json()
    assert token_data["access_token"]
    assert token_data["user"]["role"] == "pharmacy_staff"
    assert token_data["user"]["pharmacy_id"] == pharm_id

    # Cross-portal OTP login rejected with 403
    cross_otp = client.post("/auth/otp/request", json={
        "email": new_email,
        "portal_role": "pharmacy_admin",
        "purpose": "login",
    })
    assert cross_otp.status_code == 403



