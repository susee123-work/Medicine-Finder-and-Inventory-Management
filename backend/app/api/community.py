from datetime import datetime, timedelta, timezone, date
from collections import defaultdict
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Depends
from backend.app.db.client import db, rows
from backend.app.api.predictions import get_shortage_predictions
from backend.app.core.auth import get_current_user_optional

router = APIRouter(prefix="/analytics/community", tags=["Community Analytics"])

@router.get("")
def get_community_analytics(user = Depends(get_current_user_optional)):
    """
    Returns multi-pharmacy community shortage signals, supplier latency tracking,
    epidemic sales trends, and regional area risk heat maps.
    """
    pharms = rows(db.table("pharmacies").select("id, name, city, district").execute())
    total_pharms = max(len(pharms), 1)

    # 1. Multi-pharmacy shortage convergence
    med_risk_map = defaultdict(lambda: {"pharmacies": [], "critical_count": 0, "high_count": 0})
    city_risk_map = defaultdict(lambda: {"at_risk_meds": set(), "pharmacies": set()})

    for p in pharms:
        pid = p["id"]
        pname = p["name"]
        pcity = p.get("city") or "Chennai"
        
        preds = get_shortage_predictions(pharmacy_id=pid, horizon_days=7)
        for r in preds:
            if r["risk_level"] in ("HIGH", "CRITICAL"):
                med_name = r["medicine"]
                entry = med_risk_map[med_name]
                entry["pharmacies"].append(pname)
                if r["risk_level"] == "CRITICAL":
                    entry["critical_count"] += 1
                else:
                    entry["high_count"] += 1
                    
                city_risk_map[pcity]["at_risk_meds"].add(med_name)
                city_risk_map[pcity]["pharmacies"].add(pname)

    local_shortages = []
    for med_name, val in med_risk_map.items():
        n_at_risk = len(val["pharmacies"])
        pct = round(100.0 * n_at_risk / total_pharms)
        alert = "possible_local_shortage" if (n_at_risk / total_pharms) >= 0.4 else "watch"
        local_shortages.append({
            "medicine": med_name,
            "pharmacies_at_risk": n_at_risk,
            "pct_pharmacies": pct,
            "critical_count": val["critical_count"],
            "alert": alert,
            "pharmacies": val["pharmacies"]
        })
    local_shortages.sort(key=lambda x: (-x["pharmacies_at_risk"], -x["critical_count"]))

    # 2. Supplier delivery latency and delay flags
    sup = defaultdict(lambda: {"n": 0, "late": 0, "delay_days": 0, "qty_ordered": 0, "qty_received": 0})
    delivs = rows(db.table("deliveries").select("*, suppliers(name)").execute())
    
    for d in delivs:
        supp_name = (d.get("suppliers") or {}).get("name") or "Primary Distributor"
        s = sup[supp_name]
        s["n"] += 1
        ord_q = int(d.get("quantity_ordered") or 0)
        rec_q = int(d.get("quantity_received") or ord_q)
        s["qty_ordered"] += ord_q
        s["qty_received"] += rec_q
        
        delay = int(d.get("delay_days") or 0)
        if delay > 0:
            s["late"] += 1
            s["delay_days"] += delay

    supplier_delays = []
    for k, v in sup.items():
        tot = max(1, v["n"])
        avg_delay = round(v["delay_days"] / v["late"], 1) if v["late"] > 0 else 0.0
        fill_rate = round(100.0 * (v["qty_received"] / max(1, v["qty_ordered"])), 1)
        supplier_delays.append({
            "supplier": k,
            "deliveries": tot,
            "late": v["late"],
            "avg_delay_days": avg_delay,
            "fill_rate_pct": fill_rate,
            "flag": (v["late"] / tot) >= 0.3
        })
    supplier_delays.sort(key=lambda x: -x["late"])

    # 3. 14-day aggregated sales trend
    since_14 = (datetime.now(timezone.utc) - timedelta(days=14)).isoformat()
    sales = rows(db.table("sales").select("quantity, sold_at").gte("sold_at", since_14).execute())
    trend = defaultdict(int)
    for s in sales:
        dt = str(s.get("sold_at"))[:10]
        trend[dt] += int(s.get("quantity") or 0)

    # 4. Regional Area Risk Heat Map
    area_heatmap = []
    for city_name, data in city_risk_map.items():
        area_heatmap.append({
            "city": city_name,
            "at_risk_medicines_count": len(data["at_risk_meds"]),
            "pharmacies_monitored": len(data["pharmacies"]),
            "sample_critical_medicines": list(data["at_risk_meds"])[:4],
            "risk_index": min(100, len(data["at_risk_meds"]) * 18)
        })
    area_heatmap.sort(key=lambda x: -x["risk_index"])

    return {
        "pharmacies_count": len(pharms),
        "local_shortages": local_shortages,
        "supplier_delays": supplier_delays,
        "sales_trend": [{"date": k, "units": v} for k, v in sorted(trend.items())],
        "area_risk_heatmap": area_heatmap
    }
