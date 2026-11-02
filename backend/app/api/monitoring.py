import time
import os
from datetime import datetime, timezone
from fastapi import APIRouter, Response
from backend.app.db.client import db, rows
from backend.app.config import settings

router = APIRouter(tags=["Monitoring & System Health"])

_start_time = time.time()

@router.get("/health")
def health_check():
    """Liveness and readiness health probe."""
    try:
        pharms_count = len(rows(db.table("pharmacies").select("id").limit(5).execute()))
        db_status = "connected"
    except Exception as e:
        db_status = f"unhealthy: {str(e)}"

    uptime_sec = round(time.time() - _start_time, 1)

    return {
        "status": "ok" if "unhealthy" not in db_status else "degraded",
        "service": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "environment": settings.ENV,
        "database": db_status,
        "uptime_seconds": uptime_sec,
        "timestamp": datetime.now(timezone.utc).isoformat()
    }

@router.get("/metrics")
def get_prometheus_metrics():
    """Prometheus-compatible exposition format metrics."""
    try:
        pharms = len(rows(db.table("pharmacies").select("id").execute()))
        meds = len(rows(db.table("medicines").select("id").execute()))
        batches = len(rows(db.table("inventory").select("id").execute()))
        sales_tx = len(rows(db.table("sales").select("id").execute()))
        delivs = len(rows(db.table("deliveries").select("id").execute()))
        etl_runs = len(rows(db.table("etl_runs").select("run_id").execute()))
    except Exception:
        pharms = meds = batches = sales_tx = delivs = etl_runs = 0

    uptime_sec = round(time.time() - _start_time, 1)

    lines = [
        "# HELP medipulse_uptime_seconds Application uptime in seconds.",
        "# TYPE medipulse_uptime_seconds gauge",
        f"medipulse_uptime_seconds {uptime_sec}",
        "",
        "# HELP medipulse_pharmacies_total Total monitored pharmacies.",
        "# TYPE medipulse_pharmacies_total gauge",
        f"medipulse_pharmacies_total {pharms}",
        "",
        "# HELP medipulse_medicines_total Total medicines catalogued.",
        "# TYPE medipulse_medicines_total gauge",
        f"medipulse_medicines_total {meds}",
        "",
        "# HELP medipulse_inventory_batches_total Total inventory batches on hand.",
        "# TYPE medipulse_inventory_batches_total gauge",
        f"medipulse_inventory_batches_total {batches}",
        "",
        "# HELP medipulse_sales_transactions_total Total recorded sales transactions.",
        "# TYPE medipulse_sales_transactions_total counter",
        f"medipulse_sales_transactions_total {sales_tx}",
        "",
        "# HELP medipulse_deliveries_total Total purchase order deliveries.",
        "# TYPE medipulse_deliveries_total counter",
        f"medipulse_deliveries_total {delivs}",
        "",
        "# HELP medipulse_etl_runs_total Total incremental ETL runs executed.",
        "# TYPE medipulse_etl_runs_total counter",
        f"medipulse_etl_runs_total {etl_runs}",
    ]
    
    return Response(content="\n".join(lines) + "\n", media_type="text/plain; version=0.0.4; charset=utf-8")

