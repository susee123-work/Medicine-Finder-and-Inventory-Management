import pytest
from datetime import date, timedelta
from backend.app.db.client import db, rows

def test_inventory_list_and_fefo_order(client):
    pharms = rows(db.table("pharmacies").select("id").execute())
    pharm_id = pharms[0]["id"]

    resp = client.get(f"/inventory?pharmacy_id={pharm_id}")
    assert resp.status_code == 200
    batches = resp.json()
    assert len(batches) > 0
    
    # Verify sorted by expiry_date ascending
    exp_dates = [b["expiry_date"] for b in batches if b.get("expiry_date")]
    assert exp_dates == sorted(exp_dates)

def test_fefo_sale_deduction(client):
    pharms = rows(db.table("pharmacies").select("id").execute())
    pharm_id = pharms[0]["id"]
    meds = rows(db.table("medicines").select("id, name").execute())
    med_id = meds[0]["id"]

    today = date.today()
    # Insert two specific batches: Batch A (earlier expiry), Batch B (later expiry)
    b_early = {
        "pharmacy_id": pharm_id,
        "medicine_id": med_id,
        "batch_no": "TEST-EARLY",
        "quantity": 10,
        "expiry_date": (today + timedelta(days=20)).isoformat()
    }
    b_late = {
        "pharmacy_id": pharm_id,
        "medicine_id": med_id,
        "batch_no": "TEST-LATE",
        "quantity": 20,
        "expiry_date": (today + timedelta(days=100)).isoformat()
    }
    client.post("/inventory", json=b_early)
    client.post("/inventory", json=b_late)

    # Perform sale of 15 units -> should consume all 10 of TEST-EARLY and 5 of TEST-LATE
    sale_resp = client.post("/sales", json={
        "pharmacy_id": pharm_id,
        "medicine_id": med_id,
        "quantity": 15,
        "unit_price": 45.0
    })
    assert sale_resp.status_code == 200
    deductions = sale_resp.json()["fefo_deductions"]
    
    early_ded = next((d for d in deductions if d["batch_no"] == "TEST-EARLY"), None)
    late_ded = next((d for d in deductions if d["batch_no"] == "TEST-LATE"), None)
    
    assert early_ded is not None
    assert early_ded["deducted"] == 10
    assert early_ded["remaining"] == 0

    assert late_ded is not None
    assert late_ded["deducted"] == 5
    assert late_ded["remaining"] == 15

def test_insufficient_stock_error(client):
    pharms = rows(db.table("pharmacies").select("id").execute())
    pharm_id = pharms[0]["id"]
    meds = rows(db.table("medicines").select("id").execute())
    med_id = meds[0]["id"]

    resp = client.post("/sales", json={
        "pharmacy_id": pharm_id,
        "medicine_id": med_id,
        "quantity": 999999, # Huge number
        "unit_price": 50.0
    })
    assert resp.status_code == 400
    assert "Insufficient stock" in resp.json()["detail"]

def test_manual_verification_bump(client):
    pharms = rows(db.table("pharmacies").select("id").execute())
    batches = rows(db.table("inventory").select("id").eq("pharmacy_id", pharms[0]["id"]).limit(1).execute())
    batch_id = batches[0]["id"]

    resp = client.patch(f"/inventory/verify/{batch_id}")
    assert resp.status_code == 200
    assert resp.json()["verified_at"] is not None

