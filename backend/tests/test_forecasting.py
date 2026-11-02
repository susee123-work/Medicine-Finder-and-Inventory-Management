import pytest
import numpy as np
import pandas as pd
from backend.app.ml.forecasting import forecasting_pipeline, calculate_mape
from backend.app.db.client import db, rows

def test_mape_calculation():
    actual = np.array([10.0, 20.0, 30.0])
    pred = np.array([11.0, 18.0, 33.0])
    mape = calculate_mape(actual, pred)
    assert 0.0 <= mape <= 20.0

def test_safety_stock_computation():
    # Mean demand = 10, std = 2, lead time = 3 days, lead std = 1
    # Term1 = 3 * 4 = 12
    # Term2 = 100 * 1 = 100
    # Combined = 112 -> sqrt(112) ~ 10.58 -> Z=1.65 -> ~ 17.4 -> 18 units
    safety_stock = forecasting_pipeline.compute_safety_stock(
        daily_demand_mean=10.0,
        daily_demand_std=2.0,
        lead_time_days=3,
        lead_time_std=1.0
    )
    assert safety_stock >= 15
    assert safety_stock <= 25

def test_risk_score_evaluation():
    # Critical condition: stock 0
    score, level, factors = forecasting_pipeline.evaluate_risk_score(
        current_stock=0,
        daily_demand_rate=5.0,
        days_of_cover=0.0,
        lead_time_days=3,
        safety_stock=15,
        expiring_within_horizon=0
    )
    assert score >= 75.0
    assert level == "CRITICAL"
    assert len(factors) > 0

    # Low risk condition: stock 200, 40 days of cover
    score_low, level_low, _ = forecasting_pipeline.evaluate_risk_score(
        current_stock=200,
        daily_demand_rate=5.0,
        days_of_cover=40.0,
        lead_time_days=3,
        safety_stock=15,
        expiring_within_horizon=0
    )
    assert score_low < 35.0
    assert level_low in ("LOW", "MEDIUM")

def test_shortage_prediction_endpoint(client):
    pharms = rows(db.table("pharmacies").select("id").execute())
    pharm_id = pharms[0]["id"]

    resp = client.get(f"/predictions/shortages?pharmacy_id={pharm_id}&horizon_days=7")
    assert resp.status_code == 200
    preds = resp.json()
    assert len(preds) > 0

    first = preds[0]
    assert "medicine" in first
    assert "risk_score" in first
    assert 0.0 <= first["risk_score"] <= 100.0
    assert "safety_stock" in first
    assert "mape" in first
    assert "forecast_7d" in first
    assert len(first["forecast_7d"]) == 7
    assert "top_risk_factors" in first

