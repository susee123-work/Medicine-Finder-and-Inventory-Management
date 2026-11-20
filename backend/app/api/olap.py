from typing import Optional, List, Dict, Any
from fastapi import APIRouter, HTTPException, Depends
from backend.app.dw.olap_engine import olap_engine
from backend.app.dw.etl import etl_pipeline
from backend.app.core.websocket import ws_manager
from backend.app.api.community import invalidate_community_cache
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

@router.get("/query")
def get_olap_query(
    dim: Optional[str] = None,
    dimensions: Optional[str] = None,
    measure: Optional[str] = None,
    measures: Optional[str] = None,
    schema_type: str = "star",
    compare_pop: bool = False,
    period_comparison: bool = False,
    top_n: Optional[int] = None,
    order_by: Optional[str] = None,
    order_desc: bool = True,
    user = Depends(get_current_user_optional)
):
    """Convenience GET query endpoint supporting comma-separated dimension and measure strings."""
    dims = []
    raw_dim = dimensions or dim
    if raw_dim:
        dims = [d.strip() for d in raw_dim.split(",") if d.strip()]
    meas = []
    raw_meas = measures or measure
    if raw_meas:
        meas = [m.strip() for m in raw_meas.split(",") if m.strip()]
    return olap_engine.query(
        schema_type=schema_type,
        dimensions=dims or ["therapeutic_category"],
        measures=meas or ["units_sold", "revenue"],
        period_comparison=compare_pop or period_comparison,
        top_n=top_n,
        order_by=order_by,
        order_desc=order_desc
    )

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
    invalidate_community_cache()
    ws_manager.broadcast_sync(
        "ETL_COMPLETED",
        {"run_id": result.get("run_id"), "rows_processed": result.get("rows_processed", result.get("rows_loaded", 0))},
        f"Incremental ETL completed ({result.get('rows_processed', result.get('rows_loaded', 0))} rows)",
    )
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

@router.get("/schema-metadata")
def get_schema_metadata():
    """Returns visual schema diagrams, table grain, foreign keys, and preview data for Star & Snowflake."""
    return olap_engine.get_schema_metadata()

@router.get("/snowflake-hierarchies")
def get_snowflake_hierarchies():
    """Returns live nested hierarchy roll-up trees for ATC classification, Geography, and Time."""
    return olap_engine.get_snowflake_hierarchies()

@router.get("/pivot-matrix")
def get_pivot_matrix(
    row_dim: str = "therapeutic_category",
    col_dim: str = "quarter_name",
    measure: str = "revenue",
    schema_type: str = "star"
):
    """Returns a 2D cross-tabulation pivot matrix with row/col totals and heatmap intensity values."""
    return olap_engine.get_pivot_matrix(
        row_dim=row_dim,
        col_dim=col_dim,
        measure=measure,
        schema_type=schema_type
    )

@router.get("/cube-3d")
def get_cube_3d_tensor():
    """Returns 3D OLAP tensor data across Time × Geography × Product Category for 3D visualization."""
    return olap_engine.get_cube_3d()

