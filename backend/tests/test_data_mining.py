import pytest
from backend.app.ml.mining import mining_engine

def test_market_basket_association_rules():
    rules = mining_engine.mine_association_rules(min_support=0.01, min_confidence=0.10)
    assert len(rules) > 0
    first = rules[0]
    assert "antecedent_name" in first
    assert "consequent_name" in first
    assert "support" in first
    assert "confidence" in first
    assert "lift" in first
    assert "conviction" in first
    assert first["lift"] > 0

def test_demand_surge_detection():
    alerts = mining_engine.detect_demand_surges()
    # At least check method returns valid structured list
    assert isinstance(alerts, list)
    if alerts:
        first = alerts[0]
        assert "alert_level" in first
        assert "z_score" in first
        assert "cusum_statistic" in first

def test_random_forest_shortage_classifier():
    result = mining_engine.train_shortage_classifier()
    assert result["accuracy"] >= 0.70
    assert "feature_importances" in result
    assert len(result["feature_importances"]) > 0
    assert "days_of_cover" in result["feature_importances"]

def test_pharmacy_clustering():
    clusters = mining_engine.cluster_pharmacies(k=3)
    assert len(clusters) > 0
    for c in clusters:
        assert "cluster_id" in c
        assert "cluster_profile" in c
        assert "daily_transactions" in c
        assert "stock_buffer_days" in c

def test_supplier_reliability_scoring():
    scores = mining_engine.score_supplier_reliability()
    assert len(scores) > 0
    first = scores[0]
    assert "composite_reliability_score" in first
    assert "on_time_delivery_pct" in first
    assert "fill_rate_pct" in first
    assert "partner_tier" in first

