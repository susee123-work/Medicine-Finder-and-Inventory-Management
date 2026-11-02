import math
import numpy as np
from datetime import datetime, timedelta, timezone, date
from typing import Optional, List, Dict, Any
from collections import defaultdict
from fastapi import APIRouter, Depends, Query, HTTPException
from backend.app.db.client import db, rows
from backend.app.ml.forecasting import forecasting_pipeline
from backend.app.core.auth import get_current_user_optional

router = APIRouter(prefix="/predictions", tags=["Predictions"])

def get_cluster_averages() -> Dict[int, float]:
    """Compute average daily demand per medicine cluster group across all historical sales."""
    meds = rows(db.table("medicines").select("id, cluster_group").execute())
    med_cluster = {m["id"]: m.get("cluster_group", 0) for m in meds}
    
    since = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
    sales = rows(db.table("sales").select("medicine_id, quantity, sold_at").gte("sold_at", since).execute())
    
    cluster_totals = defaultdict(int)
    for s in sales:
        c = med_cluster.get(s["medicine_id"], 0)
        cluster_totals[c] += s["quantity"]
        
    cluster_rates = {}
    for c, total in cluster_totals.items():
        cluster_rates[c] = round(total / 30.0, 2)
    return cluster_rates

@router.get("/shortages")
def get_shortage_predictions(
    pharmacy_id: Optional[str] = Query(None, description="Pharmacy UUID"),
    horizon_days: int = Query(7, ge=1, le=30),
    user = Depends(get_current_user_optional)
):
    """
    Predict shortage risk for all stocked medicines in a pharmacy.
    Integrates day-of-week seasonality, Holt-Winters / Ridge forecasting,
    confidence intervals, lead-time variance safety stock, and 0-100 risk scores.
    """
    if not pharmacy_id:
        if user and user.pharmacy_id:
            pharmacy_id = user.pharmacy_id
        else:
            first_p = rows(db.table("pharmacies").select("id").limit(1).execute())
            if first_p:
                pharmacy_id = first_p[0]["id"]
            else:
                return []

    # Fetch current inventory batches
    inv_rows = rows(
        db.table("inventory")
        .select("medicine_id, quantity, expiry_date, batch_no, medicines(id, name, generic_name, cluster_group, therapeutic_category, suppliers(typical_lead_time_days))")
        .eq("pharmacy_id", pharmacy_id)
        .execute()
    )
    
    if not inv_rows:
        return []

    # Fetch 45 days of sales history for time series modeling
    since = (datetime.now(timezone.utc) - timedelta(days=45)).isoformat()
    sales_rows = rows(
        db.table("sales")
        .select("medicine_id, quantity, sold_at")
        .eq("pharmacy_id", pharmacy_id)
        .gte("sold_at", since)
        .execute()
    )
    
    # Group sales by medicine
    sales_by_med = defaultdict(list)
    for s in sales_rows:
        sales_by_med[s["medicine_id"]].append(s)

    # Aggregate stock and identify expiring batches
    stock_by_med = defaultdict(int)
    expiring_by_med = defaultdict(int)
    med_meta = {}
    
    horizon_cutoff = (date.today() + timedelta(days=horizon_days)).isoformat()
    
    for item in inv_rows:
        mid = item["medicine_id"]
        qty = int(item.get("quantity", 0))
        stock_by_med[mid] += qty
        
        # Check expiry
        if item.get("expiry_date") and str(item["expiry_date"]) <= horizon_cutoff:
            expiring_by_med[mid] += qty
            
        if mid not in med_meta:
            m = item.get("medicines") or {}
            supp = m.get("suppliers") or {}
            lead = int(supp.get("typical_lead_time_days") or 3)
            med_meta[mid] = {
                "name": m.get("name") or "Unknown Medicine",
                "generic_name": m.get("generic_name") or "",
                "cluster_group": m.get("cluster_group", 0),
                "category": m.get("therapeutic_category") or "General",
                "lead_time_days": lead
            }

    cluster_rates = get_cluster_averages()
    results = []

    for mid, total_stock in stock_by_med.items():
        meta = med_meta.get(mid, {})
        cluster = meta.get("cluster_group", 0)
        cluster_fallback = cluster_rates.get(cluster, 2.5)
        lead_time = meta.get("lead_time_days", 3)
        
        med_sales = sales_by_med.get(mid, [])
        daily_df = forecasting_pipeline.build_daily_series(med_sales, days_lookback=45)
        
        forecast_mean, forecast_lower, forecast_upper, mape, model_type = forecasting_pipeline.fit_and_forecast(
            daily_df,
            horizon_days=horizon_days,
            cluster_fallback_rate=cluster_fallback
        )
        
        daily_rate = float(np.mean(forecast_mean))
        daily_std = float(np.std(daily_df["quantity"].values)) if len(daily_df) > 0 else 1.0
        
        # Calculate Safety Stock based on service level & lead-time variability
        safety_stock = forecasting_pipeline.compute_safety_stock(
            daily_demand_mean=daily_rate,
            daily_demand_std=daily_std,
            lead_time_days=lead_time,
            lead_time_std=1.0 # 1-day variance in delivery
        )
        
        days_of_cover = (total_stock / daily_rate) if daily_rate > 0 else 999.0
        reorder_point = (daily_rate * lead_time) + safety_stock
        suggested_order_qty = max(0, int(math.ceil((daily_rate * (lead_time + 14)) + safety_stock - total_stock)))
        
        risk_score, risk_level, factors = forecasting_pipeline.evaluate_risk_score(
            current_stock=total_stock,
            daily_demand_rate=daily_rate,
            days_of_cover=days_of_cover,
            lead_time_days=lead_time,
            safety_stock=safety_stock,
            expiring_within_horizon=expiring_by_med.get(mid, 0)
        )
        
        results.append({
            "medicine_id": mid,
            "medicine": meta.get("name"),
            "medicine_name": meta.get("name"),
            "generic_name": meta.get("generic_name"),
            "category": meta.get("category"),
            "stock": total_stock,
            "daily_demand": round(daily_rate, 2),
            "days_cover": round(days_of_cover, 1) if days_of_cover < 999 else 999.0,
            "lead_time_days": lead_time,
            "safety_stock": safety_stock,
            "recommended_safety_stock": safety_stock,
            "reorder_point": int(math.ceil(reorder_point)),
            "reorder_now": total_stock <= reorder_point,
            "suggested_order_qty": suggested_order_qty,
            "risk_score": risk_score, # 0 to 100
            "risk": risk_level.lower(), # critical, high, medium, low
            "risk_level": risk_level,
            "mape": mape,
            "model_version": model_type,
            "forecast_7d": forecast_mean,
            "forecast_lower_7d": forecast_lower,
            "forecast_upper_7d": forecast_upper,
            "top_risk_factors": factors,
            "message": f"{meta.get('name')} has {days_of_cover:.1f} days of cover (Supplier lead time: {lead_time}d). Risk Score: {risk_score}/100."
        })

    # Sort primarily by risk score descending
    results.sort(key=lambda x: -x["risk_score"])
    return results

@router.get("/detail/{medicine_id}")
def get_prediction_detail(
    medicine_id: str,
    pharmacy_id: Optional[str] = Query(None, description="Pharmacy UUID"),
    horizon_days: int = Query(7, ge=1, le=14)
):
    """Return in-depth forecast diagnostics, confidence intervals, and daily history for a medicine."""
    if not pharmacy_id:
        first_p = rows(db.table("pharmacies").select("id").limit(1).execute())
        if first_p:
            pharmacy_id = first_p[0]["id"]
        else:
            raise HTTPException(404, "No pharmacies found")

    med_res = rows(db.table("medicines").select("*, suppliers(*)").eq("id", medicine_id).execute())
    if not med_res:
        raise HTTPException(404, "Medicine not found")
    med = med_res[0]
    
    since = (datetime.now(timezone.utc) - timedelta(days=45)).isoformat()
    sales = rows(
        db.table("sales")
        .select("quantity, sold_at")
        .eq("pharmacy_id", pharmacy_id)
        .eq("medicine_id", medicine_id)
        .gte("sold_at", since)
        .execute()
    )
    
    inv_items = rows(
        db.table("inventory")
        .select("*")
        .eq("pharmacy_id", pharmacy_id)
        .eq("medicine_id", medicine_id)
        .execute()
    )
    total_stock = sum(i.get("quantity", 0) for i in inv_items)
    
    daily_df = forecasting_pipeline.build_daily_series(sales, days_lookback=45)
    f_mean, f_lower, f_upper, mape, model = forecasting_pipeline.fit_and_forecast(
        daily_df,
        horizon_days=horizon_days,
        cluster_fallback_rate=2.5
    )
    
    lead_time = (med.get("suppliers") or {}).get("typical_lead_time_days", 3)
    daily_mean = float(np.mean(f_mean))
    daily_std = float(np.std(daily_df["quantity"].values)) if len(daily_df) > 0 else 1.0
    
    safety_stock = forecasting_pipeline.compute_safety_stock(daily_mean, daily_std, lead_time)
    days_of_cover = (total_stock / daily_mean) if daily_mean > 0 else 999.0
    
    score, risk_level, factors = forecasting_pipeline.evaluate_risk_score(
        current_stock=total_stock,
        daily_demand_rate=daily_mean,
        days_of_cover=days_of_cover,
        lead_time_days=lead_time,
        safety_stock=safety_stock,
        expiring_within_horizon=0
    )
    
    # Dates for future forecast
    future_dates = [(date.today() + timedelta(days=i+1)).isoformat() for i in range(horizon_days)]
    
    return {
        "medicine": med["name"],
        "generic_name": med.get("generic_name"),
        "stock": total_stock,
        "model_used": model,
        "mape": mape,
        "safety_stock": safety_stock,
        "reorder_point": int(math.ceil((daily_mean * lead_time) + safety_stock)),
        "risk_score": score,
        "risk_level": risk_level,
        "factors": factors,
        "historical_series": [
            {"date": row["date_str"], "quantity": int(row["quantity"])}
            for _, row in daily_df.tail(30).iterrows()
        ],
        "forecast_series": [
            {"date": future_dates[i], "mean": f_mean[i], "lower": f_lower[i], "upper": f_upper[i]}
            for i in range(horizon_days)
        ]
    }

