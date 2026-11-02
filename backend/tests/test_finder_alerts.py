import pytest
from backend.app.api.finder import haversine
from backend.app.db.client import db, rows

def test_haversine_distance():
    # Distance between Chennai (13.0827, 80.2707) and Tambaram (12.9249, 80.1000) ~ 25 km
    dist = haversine(13.0827, 80.2707, 12.9249, 80.1000)
    assert dist is not None
    assert 20.0 <= dist <= 30.0

def test_finder_endpoint(client):
    resp = client.get("/finder?medicine=Amoxicillin&lat=13.0418&lng=80.2341")
    assert resp.status_code == 200
    data = resp.json()
    assert "results" in data
    assert "generic_substitutes" in data
    if data["results"]:
        first = data["results"][0]
        assert "distance_km" in first
        assert "verified_hours_ago" in first
        assert "in_stock" in first

def test_confirmation_request_workflow(client):
    pharms = rows(db.table("pharmacies").select("id").execute())
    pharm_id = pharms[0]["id"]
    meds = rows(db.table("medicines").select("id").execute())
    med_id = meds[0]["id"]

    # Submit request
    req_resp = client.post("/finder/confirm", json={
        "pharmacy_id": pharm_id,
        "medicine_id": med_id,
        "patient_contact": "+919876543210",
        "patient_name": "Test Patient",
        "notes": "Urgent prescription"
    })
    assert req_resp.status_code == 200
    req_id = req_resp.json()["id"]

    # Check status
    status_resp = client.get(f"/finder/confirm/{req_id}")
    assert status_resp.status_code == 200
    assert status_resp.json()["status"] == "pending"

    # Pharmacy responds
    patch_resp = client.patch(f"/finder/pharmacy-requests/{req_id}", json={
        "status": "available",
        "notes": "2 packs reserved at counter"
    })
    assert patch_resp.status_code == 200
    assert patch_resp.json()["status"] == "available"

def test_restock_subscription(client):
    meds = rows(db.table("medicines").select("id").execute())
    med_id = meds[0]["id"]

    resp = client.post("/alerts/subscribe", json={
        "medicine_id": med_id,
        "patient_email": "patient@example.com",
        "patient_phone": "+919988776655"
    })
    assert resp.status_code == 200
    assert resp.json()["status"] == "SUCCESS"

def test_monitoring_health_and_metrics(client):
    health = client.get("/health")
    assert health.status_code == 200
    assert health.json()["status"] == "ok"

    metrics = client.get("/metrics")
    assert metrics.status_code == 200
    assert "medipulse_uptime_seconds" in metrics.text
    assert "medipulse_pharmacies_total" in metrics.text

