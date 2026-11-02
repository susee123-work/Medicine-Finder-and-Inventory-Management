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
