import pytest
from backend.app.dw.etl import etl_pipeline
from backend.app.dw.olap_engine import olap_engine
from backend.app.db.client import db, rows

def test_etl_pipeline_execution():
    result = etl_pipeline.run_pipeline()
    assert result["status"] == "SUCCESS"
    assert result["rows_loaded"] > 0
    assert result["quality_checks_passed"] > 0
    assert result["quality_checks_failed"] == 0

    # Verify Star Schema facts populated
    sales_facts = rows(db.table("star_fact_daily_sales").select("*").execute())
    assert len(sales_facts) > 0

    deliv_facts = rows(db.table("star_fact_deliveries").select("*").execute())
    assert len(deliv_facts) > 0

    # Verify Snowflake dimensions populated
    snow_atc = rows(db.table("snow_dim_atc_level1").select("*").execute())
    assert len(snow_atc) > 0

def test_olap_query_slice_and_dice():
    # Slice by specific measure and dimension
    res = olap_engine.query(
        schema_type="star",
        dimensions=["month_name", "therapeutic_category"],
        measures=["units_sold", "revenue"],
        period_comparison=True
    )
    assert res["cell_count"] > 0
    assert len(res["cells"]) > 0
    first_cell = res["cells"][0]
    assert "units_sold" in first_cell
    assert "revenue" in first_cell
    assert "pop_pct_change" in first_cell # Period-over-Period verified

def test_olap_query_endpoint(client):
    payload = {
        "schema_type": "star",
        "dimensions": ["quarter_name", "pharmacy_name"],
        "measures": ["units_sold", "revenue"],
        "period_comparison": False,
        "top_n": 5
    }
    resp = client.post("/analytics/olap/query", json=payload)
    assert resp.status_code == 200
    data = resp.json()
    assert data["cell_count"] <= 5
    assert "totals" in data

def test_olap_cube_endpoint(client):
    resp = client.get("/analytics/olap/cube")
    assert resp.status_code == 200
    cube = resp.json()
    assert "cells" in cube
    assert len(cube["cells"]) > 0
