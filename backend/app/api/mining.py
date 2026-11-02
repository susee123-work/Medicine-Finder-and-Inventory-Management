from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Depends, Query
from backend.app.ml.mining import mining_engine
from backend.app.db.client import db, rows
from backend.app.core.auth import get_current_user_optional

router = APIRouter(prefix="/analytics/mining", tags=["Data Mining"])

@router.get("/association-rules")
def get_association_rules(
    min_support: float = Query(0.02, ge=0.001, le=1.0),
    min_confidence: float = Query(0.20, ge=0.05, le=1.0)
):
    """
    Market Basket Analysis: Extract co-purchased medicine association rules (FP-Growth / Apriori)
    with Support, Confidence, Lift, and Conviction metrics.
    """
    return mining_engine.mine_association_rules(min_support=min_support, min_confidence=min_confidence)

@router.get("/demand-surges")
def get_demand_surges():
    """
    Epidemic & Demand Surge Detection: Statistical CUSUM and Z-Score residual analysis
    flagging localized surges in antibiotics, antivirals, or respiratory medicines by area.
    """
    return mining_engine.detect_demand_surges()

@router.get("/pharmacy-clusters")
def get_pharmacy_clusters(k: int = Query(3, ge=2, le=6)):
    """
    Unsupervised K-Means clustering of retail pharmacies based on sales throughput,
    inventory buffers, and stockout vulnerability.
    """
    return mining_engine.cluster_pharmacies(k=k)

@router.get("/supplier-scores")
def get_supplier_scores():
    """
    Supplier Reliability Scoring: Multi-attribute composite rating evaluating
    on-time delivery rate, fill rate, and lead-time variance.
    """
    return mining_engine.score_supplier_reliability()

@router.post("/retrain")
def trigger_model_retraining(user = Depends(get_current_user_optional)):
    """
    Executes a model retraining job for the supervised Shortage Risk Random Forest classifier.
    Calculates accuracy, F1-score, feature importances, and records run in model_registry.
    """
    metrics = mining_engine.train_shortage_classifier()
    return {
        "status": "SUCCESS",
        "message": "Random Forest Shortage Risk Classifier successfully retrained.",
        "results": metrics
    }

@router.get("/model-registry")
def get_model_registry():
    """Returns catalog of registered data mining models with training timestamps, metrics, and versions."""
    res = rows(db.table("model_registry").select("*").order("trained_at", desc=True).execute())
    if not res:
        # Initial train to ensure registry is never empty
        mining_engine.train_shortage_classifier()
        res = rows(db.table("model_registry").select("*").order("trained_at", desc=True).execute())
    return res

@router.get("/all")
def get_all_data_mining_models():
    """Returns all data mining models and results in a single aggregated payload."""
    rules = mining_engine.mine_association_rules()
    surges = mining_engine.detect_demand_surges()
    clusters = mining_engine.cluster_pharmacies()
    suppliers = mining_engine.score_supplier_reliability()
    clf_metrics = mining_engine.train_shortage_classifier()
    registry = rows(db.table("model_registry").select("*").order("trained_at", desc=True).execute())
    return {
        "association_rules": rules,
        "outbreak_surges": surges,
        "risk_classifier": clf_metrics,
        "pharmacy_clusters": clusters,
        "supplier_reliability": suppliers,
        "model_registry": registry
    }

