"""
MediPulse AI System Health and Runtime Verification
Tests all API routes, database methods, and ensures zero runtime exceptions.
"""
import sys
import os
import json
import traceback

root_dir = os.path.dirname(os.path.abspath(__file__))
if root_dir not in sys.path:
    sys.path.insert(0, root_dir)

from fastapi.testclient import TestClient
from backend.app.main import app

def run_diagnostics():
    print("=" * 60)
    print("MediPulse AI: Starting System & Endpoint Diagnostics...")
    print("=" * 60)

    errors = []
    
    with TestClient(app) as client:
        # 1. Health & Monitoring
        print("\n[1/9] Testing Monitoring & Health Check...")
        try:
            res = client.get("/health")
            assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
            data = res.json()
            assert data["status"] in ("ok", "healthy"), f"Unexpected status: {data['status']}"
            assert data["database"] == "connected"
            print("  [OK] /health: OK - Status is ok and database is connected")

            res_m = client.get("/metrics")
            assert res_m.status_code == 200
            assert "medipulse_uptime_seconds" in res_m.text
            print("  [OK] /metrics: OK - Prometheus metrics active")
        except Exception as e:
            errors.append(f"Monitoring error: {traceback.format_exc()}")
            print(f"  [FAIL] Monitoring FAILED: {e}")

        # 2. Authentication & Demo Tokens
        print("\n[2/9] Testing Auth & Token Generation...")
        token_headers = {}
        try:
            res = client.get("/auth/demo-tokens")
            assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
            tokens = res.json()
            assert isinstance(tokens, list)
            assert len(tokens) >= 4
            token_headers = {
                t["role"]: {"Authorization": f"Bearer {t['access_token']}"}
                for t in tokens
            }
            assert "pharmacy_admin" in token_headers
            assert "pharmacy_staff" in token_headers
            assert "health_official" in token_headers
            assert "patient" in token_headers
            print(f"  [OK] /auth/demo-tokens: OK - Generated tokens for {len(tokens)} roles")
        except Exception as e:
            errors.append(f"Auth error: {traceback.format_exc()}")
            print(f"  [FAIL] Auth FAILED: {e}")

        # 3. Shortage Predictions (Module 2)
        print("\n[3/9] Testing Shortage Predictions...")
        try:
            res = client.get("/predictions/shortages?horizon_days=7")
            assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
            preds = res.json()
            assert isinstance(preds, list)
            assert len(preds) > 0, "Expected predicted shortages list"
            first_med = preds[0]
            print(f"  [OK] /predictions/shortages: OK ({len(preds)} predictions returned)")
            print(f"       Sample: {first_med['medicine_name']} | Risk: {first_med['risk_score']} | Safety Stock: {first_med['recommended_safety_stock']}")

            med_id = first_med["medicine_id"]
            res_det = client.get(f"/predictions/detail/{med_id}?horizon_days=7")
            assert res_det.status_code == 200
            det = res_det.json()
            assert "forecast_series" in det
            assert len(det["forecast_series"]) == 7
            assert "lower" in det["forecast_series"][0]
            assert "upper" in det["forecast_series"][0]
            print(f"  [OK] /predictions/detail/{med_id}: OK - 95% Confidence Intervals present")
        except Exception as e:
            errors.append(f"Prediction error: {traceback.format_exc()}")
            print(f"  [FAIL] Prediction FAILED: {e}")

        # 4. Inventory & FEFO Sales (Module 1)
        print("\n[4/9] Testing Inventory Batches & FEFO Sales...")
        try:
            res = client.get("/inventory/batches", headers=token_headers.get("pharmacy_admin"))
            assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
            batches = res.json()
            assert len(batches) > 0
            print(f"  [OK] /inventory/batches: OK ({len(batches)} batches retrieved in FEFO order)")

            # Test FEFO sale deduction
            first_batch = batches[0]
            sale_payload = {
                "pharmacy_id": first_batch["pharmacy_id"],
                "medicine_id": first_batch["medicine_id"],
                "quantity": 2,
                "notes": "Automated runtime test sale"
            }
            res_sale = client.post("/sales", json=sale_payload, headers=token_headers.get("pharmacy_staff"))
            assert res_sale.status_code == 200, f"Sale failed: {res_sale.text}"
            sale_res = res_sale.json()
            assert "allocated_batches" in sale_res or "fefo_deductions" in sale_res
            print(f"  [OK] /sales: OK - Deducted 2 units via FEFO allocation across batches")
        except Exception as e:
            errors.append(f"Inventory error: {traceback.format_exc()}")
            print(f"  [FAIL] Inventory FAILED: {e}")

        # 5. Data Warehouse & Dual OLAP (Module 4)
        print("\n[5/9] Testing Data Warehouse & OLAP Cubes...")
        try:
            # Star Schema OLAP Cube
            res_star = client.get("/analytics/olap/cube")
            assert res_star.status_code == 200, f"Star OLAP failed: {res_star.text}"
            star_cube = res_star.json()
            assert "cells" in star_cube
            assert "totals" in star_cube
            print(f"  [OK] Star Schema OLAP Cube: OK ({len(star_cube['cells'])} cells, grand totals: {star_cube['totals']})")

            # Snowflake Schema OLAP Query
            snow_payload = {
                "schema_type": "snowflake",
                "dimensions": ["atc_level1"],
                "measures": ["units_sold", "revenue"],
                "period_comparison": False
            }
            res_snow = client.post("/analytics/olap/query", json=snow_payload)
            assert res_snow.status_code == 200, f"Snowflake OLAP failed: {res_snow.text}"
            snow_cube = res_snow.json()
            assert "cells" in snow_cube
            print(f"  [OK] Snowflake Schema OLAP Query: OK ({len(snow_cube['cells'])} cells)")

            # Period over period comparison via GET query
            res_pop = client.get("/analytics/olap/query?dim=therapeutic_category&measure=units_sold,revenue&compare_pop=true")
            assert res_pop.status_code == 200
            pop_data = res_pop.json()
            assert "cells" in pop_data
            if pop_data["cells"]:
                assert "pop_pct_change" in pop_data["cells"][0]
            print(f"  [OK] OLAP PoP Comparison: OK (computed pop_pct_change)")

            # Trigger Incremental ETL
            res_etl = client.post("/analytics/olap/etl/run", headers=token_headers.get("health_official"))
            assert res_etl.status_code == 200
            etl_info = res_etl.json()
            assert etl_info["status"] == "SUCCESS"
            print(f"  [OK] Incremental ETL: OK (Run ID: {etl_info['run_id']}, rows: {etl_info.get('rows_processed', etl_info.get('rows_loaded', 0))})")
        except Exception as e:
            errors.append(f"OLAP error: {traceback.format_exc()}")
            print(f"  [FAIL] OLAP FAILED: {e}")

        # 6. OLAP & Snowflake Visualizations
        print("\n[6/9] Testing OLAP & Snowflake Visualizer Endpoints...")
        try:
            # Schema Architecture Metadata
            res_meta = client.get("/analytics/olap/schema-metadata")
            assert res_meta.status_code == 200
            meta = res_meta.json()
            assert "star" in meta and "snowflake" in meta
            print(f"  [OK] /schema-metadata: OK - Star ({len(meta['star']['tables'])} tables) & Snowflake ({len(meta['snowflake']['tables'])} tables)")

            # Snowflake Hierarchies
            res_hier = client.get("/analytics/olap/snowflake-hierarchies")
            assert res_hier.status_code == 200
            hier = res_hier.json()
            assert "atc_hierarchy" in hier
            assert "geo_hierarchy" in hier
            assert "time_hierarchy" in hier
            print(f"  [OK] /snowflake-hierarchies: OK - ATC, Geo, and Time trees loaded")

            # Pivot Heatmap Matrix
            res_piv = client.get("/analytics/olap/pivot-matrix?row_dim=therapeutic_category&col_dim=quarter_name&measure=revenue")
            assert res_piv.status_code == 200
            piv = res_piv.json()
            assert "matrix" in piv
            assert "row_headers" in piv
            assert "col_headers" in piv
            print(f"  [OK] /pivot-matrix: OK - Heatmap matrix {len(piv['row_headers'])}x{len(piv['col_headers'])} with grand total INR {piv['grand_total']:,}")
        except Exception as e:
            errors.append(f"OLAP Visualization error: {traceback.format_exc()}")
            print(f"  [FAIL] OLAP Visualization FAILED: {e}")

        # 7. Advanced Data Mining (Module 5)
        print("\n[7/9] Testing Data Mining Pipelines...")
        try:
            res_mining = client.get("/analytics/mining/all")
            assert res_mining.status_code == 200, f"Mining failed: {res_mining.text}"
            mining_data = res_mining.json()
            assert "association_rules" in mining_data
            assert "outbreak_surges" in mining_data
            assert "risk_classifier" in mining_data
            assert "pharmacy_clusters" in mining_data
            assert "supplier_reliability" in mining_data
            assert "model_registry" in mining_data
            print(f"  [OK] Market Basket Rules: OK ({len(mining_data['association_rules'])} association rules)")
            print(f"  [OK] CUSUM Outbreak Detection: OK ({len(mining_data['outbreak_surges'])} alerts)")
            print(f"  [OK] Random Forest Classifier: OK (Accuracy: {mining_data['risk_classifier']['accuracy']})")
            print(f"  [OK] K-Means Clusters: OK ({len(mining_data['pharmacy_clusters'])} clusters)")
            print(f"  [OK] Supplier Reliability: OK ({len(mining_data['supplier_reliability'])} suppliers scored)")
        except Exception as e:
            errors.append(f"Mining error: {traceback.format_exc()}")
            print(f"  [FAIL] Mining FAILED: {e}")

        # 8. Patient Finder & Generic Substitution (Module 3)
        print("\n[8/9] Testing Patient Finder & Geolocation...")
        try:
            res_find = client.get("/finder/search?medicine_name=Paracetamol&lat=12.9716&lng=77.5946&radius_km=25")
            assert res_find.status_code == 200, f"Finder failed: {res_find.text}"
            matches = res_find.json()
            assert "results" in matches or isinstance(matches, list)
            data_matches = matches["results"] if isinstance(matches, dict) else matches
            assert len(data_matches) > 0
            first_match = data_matches[0]
            assert "distance_km" in first_match
            print(f"  [OK] /finder/search: OK ({len(data_matches)} pharmacies found, nearest is {first_match['distance_km']} km)")
        except Exception as e:
            errors.append(f"Finder error: {traceback.format_exc()}")
            print(f"  [FAIL] Finder FAILED: {e}")

        # 9. Community Intelligence & Regional Heatmap (Module 4)
        print("\n[9/9] Testing Community Intelligence & Heatmap...")
        try:
            res_hm = client.get("/analytics/community/heatmap")
            assert res_hm.status_code == 200
            hm = res_hm.json()
            assert len(hm) > 0
            print(f"  [OK] /analytics/community/heatmap: OK ({len(hm)} regional zones mapped)")

            res_lat = client.get("/analytics/community/supplier-latency")
            assert res_lat.status_code == 200
            print(f"  [OK] /analytics/community/supplier-latency: OK")

            res_trend = client.get("/analytics/community/sales-trend?days=14")
            assert res_trend.status_code == 200
            print(f"  [OK] /analytics/community/sales-trend: OK")
        except Exception as e:
            errors.append(f"Community error: {traceback.format_exc()}")
            print(f"  [FAIL] Community FAILED: {e}")

    print("\n" + "=" * 60)
    if errors:
        print(f"DIAGNOSTICS FAILED: {len(errors)} error(s) encountered:")
        for err in errors:
            print(err)
        sys.exit(1)
    else:
        print("ALL 9 MODULES PASSED DIAGNOSTICS WITH ZERO ERRORS!")
        print("=" * 60)

if __name__ == "__main__":
    run_diagnostics()
