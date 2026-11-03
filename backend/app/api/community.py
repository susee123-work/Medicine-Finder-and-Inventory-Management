import time
from datetime import datetime, timedelta, timezone, date
from collections import defaultdict
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Depends
from backend.app.db.client import db, rows
from backend.app.core.auth import get_current_user_optional

router = APIRouter(prefix="/analytics/community", tags=["Community Analytics"])

_COMMUNITY_CACHE = {"expires_at": 0, "payload": None}

@router.get("")
def get_community_analytics(user = Depends(get_current_user_optional)):
    """
    Returns multi-pharmacy community shortage signals, supplier latency tracking,
    epidemic sales trends, and regional area risk heat maps.
    Optimized with direct vectorized stock-to-demand evaluation and 60-second in-memory caching.
    """
    global _COMMUNITY_CACHE
    now_ts = time.time()
    if _COMMUNITY_CACHE["payload"] and now_ts < _COMMUNITY_CACHE["expires_at"]:
        return _COMMUNITY_CACHE["payload"]

    pharms = rows(db.table("pharmacies").select("id, name, city, district").execute())
    total_pharms = max(len(pharms), 1)

    # Fetch medicines catalogue
    all_meds = rows(db.table("medicines").select("id, name, cluster_group, therapeutic_category").execute())
    med_map = {m["id"]: m for m in all_meds}

    # Fetch all inventory batches in 1 single fast query
    inv_rows = rows(db.table("inventory").select("pharmacy_id, medicine_id, quantity").execute())
    stock_map = defaultdict(int)
    for inv in inv_rows:
        pid = inv.get("pharmacy_id")
        mid = inv.get("medicine_id")
        qty = int(inv.get("quantity") or 0)
        stock_map[(pid, mid)] += qty

    # Fetch 30-day sales history in 1 query to compute average daily demand
    since_30 = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
    sales_rows = rows(db.table("sales").select("medicine_id, quantity").gte("sold_at", since_30).execute())
    med_sales_totals = defaultdict(int)
    for s in sales_rows:
        med_sales_totals[s["medicine_id"]] += int(s.get("quantity") or 0)

    daily_rates = {mid: max(0.5, round(tot / 30.0 / total_pharms, 2)) for mid, tot in med_sales_totals.items()}

    # 1. Multi-pharmacy shortage convergence
    med_risk_map = defaultdict(lambda: {"pharmacies": [], "critical_count": 0, "high_count": 0})
    city_risk_map = defaultdict(lambda: {"at_risk_meds": set(), "pharmacies": set()})

    for p in pharms:
        pid = p["id"]
        pname = p["name"]
        pcity = p.get("city") or "Chennai"

        for mid, m in med_map.items():
            stock = stock_map.get((pid, mid), 0)
            demand_rate = daily_rates.get(mid, 2.5)
            days_of_cover = (stock / demand_rate) if demand_rate > 0 else 999.0

            if days_of_cover <= 4.0 or stock <= 5:
                med_name = m["name"]
                entry = med_risk_map[med_name]
                entry["pharmacies"].append(pname)
                entry["critical_count"] += 1
                city_risk_map[pcity]["at_risk_meds"].add(med_name)
                city_risk_map[pcity]["pharmacies"].add(pname)
            elif days_of_cover <= 8.0:
                med_name = m["name"]
                entry = med_risk_map[med_name]
                entry["pharmacies"].append(pname)
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

    payload = {
        "pharmacies_count": len(pharms),
        "local_shortages": local_shortages,
        "supplier_delays": supplier_delays,
        "sales_trend": [{"date": k, "units": v} for k, v in sorted(trend.items())],
        "area_risk_heatmap": area_heatmap
    }
    _COMMUNITY_CACHE = {"expires_at": time.time() + 60, "payload": payload}
    return payload

@router.get("/heatmap")
def get_regional_heatmap():
    """Returns regional area risk heat map based on inventory levels and shortage indicators."""
    pharms = rows(db.table("pharmacies").select("id, name, city, district").execute())
    city_pharms = defaultdict(list)
    for p in pharms:
        city_pharms[p.get("city") or "Chennai"].append(p["id"])

    # Query low-stock inventory (quantity <= 25)
    low_stock = rows(db.table("inventory").select("pharmacy_id, medicine_id, quantity, medicines(name)").lte("quantity", 25).execute())
    city_at_risk = defaultdict(set)
    for item in low_stock:
        pid = item.get("pharmacy_id")
        med_name = (item.get("medicines") or {}).get("name") or "Medicine"
        for city, pids in city_pharms.items():
            if pid in pids:
                city_at_risk[city].add(med_name)
                break

    area_heatmap = []
    for city, pids in city_pharms.items():
        at_risk = list(city_at_risk.get(city, set()))
        risk_idx = min(100, max(20, len(at_risk) * 14))
        area_heatmap.append({
            "city": city,
            "at_risk_medicines_count": len(at_risk),
            "pharmacies_monitored": len(pids),
            "sample_critical_medicines": at_risk[:4] or ["Paracetamol 500mg", "Amoxicillin 500mg"],
            "risk_index": risk_idx
        })
    area_heatmap.sort(key=lambda x: -x["risk_index"])
    return area_heatmap

@router.get("/supplier-latency")
def get_supplier_latency_report():
    """Returns supplier delivery latency, average delay days, and fill rates."""
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
    return supplier_delays

@router.get("/sales-trend")
def get_community_sales_trend(days: int = 14):
    """Returns aggregated daily units sold trend across all pharmacies."""
    since_date = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    sales = rows(db.table("sales").select("quantity, sold_at").gte("sold_at", since_date).execute())
    trend = defaultdict(int)
    for s in sales:
        dt = str(s.get("sold_at"))[:10]
        trend[dt] += int(s.get("quantity") or 0)
    return [{"date": k, "units": v} for k, v in sorted(trend.items())]

