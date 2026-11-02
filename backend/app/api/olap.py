from typing import Optional, List, Dict, Any
from fastapi import APIRouter, HTTPException, Depends
from backend.app.dw.olap_engine import olap_engine
from backend.app.dw.etl import etl_pipeline
from backend.app.models.schemas import OLAPQueryIn, SavedViewIn
from backend.app.db.client import db, rows
from backend.app.core.auth import get_current_user_optional

router = APIRouter(prefix="/analytics/olap", tags=["OLAP & Data Warehouse"])

@router.post("/query")
def execute_olap_query(query: OLAPQueryIn, user = Depends(get_current_user_optional)):
    """
    Execute multidimensional slice, dice, drill-down, and roll-up across Star or Snowflake schemas.
    Supports Year > Quarter > Month > Day and Region > Pharmacy hierarchies, plus PoP comparisons.
    """
    res = olap_engine.query(
        schema_type=query.schema_type,
        dimensions=query.dimensions,
        measures=query.measures,
        filters=query.filters,
        period_comparison=query.period_comparison,
        top_n=query.top_n,
        order_by=query.order_by,
        order_desc=query.order_desc
    )
    return res

@router.get("/cube")
def get_olap_cube():
    """
    Returns an OLAP cube representation with cross-tabulated rollups
    simulating SQL GROUP BY CUBE across Time, Geography, and ATC Categories.
    """
    cube_data = olap_engine.query(
        schema_type="star",
        dimensions=["quarter_name", "therapeutic_category"],
        measures=["units_sold", "revenue"],
        period_comparison=True
    )
    return cube_data

@router.post("/etl/run")
def trigger_etl_run(user = Depends(get_current_user_optional)):
    """
    Triggers an incremental ETL run. Validates data quality, maintains SCD Type 2 dimensions,
    and logs run metrics into etl_runs.
    """
    result = etl_pipeline.run_pipeline()
    return result

@router.get("/etl/history")
def get_etl_history():
    """Returns history of all ETL pipeline runs with data quality audit metrics."""
    return rows(db.table("etl_runs").select("*").order("started_at", desc=True).limit(20).execute())

@router.get("/saved-views")
def list_saved_views():
    """List preconfigured and user-saved multidimensional OLAP views."""
    return olap_engine.get_saved_views()

@router.post("/saved-views")
def save_olap_view(view: SavedViewIn, user = Depends(get_current_user_optional)):
    """Save an OLAP exploration configuration for rapid dashboard recall."""
    saved = olap_engine.add_saved_view(
        name=view.name,
        description=view.description or "",
        query_config=view.query_config
    )
    return saved
