# MediPulse AI: Engineering Audit, Upgrade Plan, and Task Roadmap

**System Name:** MediPulse AI — A Predictive Medicine Availability and Community Shortage Intelligence System Using Data Warehousing and Data Mining  
**Architecture:** React (Vite) Frontend + FastAPI Backend + Supabase (PostgreSQL + Auth) + Data Warehouse (Star & Snowflake Schemas) + Data Mining Pipelines  
**Author:** Senior Full-Stack & Data Engineer  
**Date:** November 2026  

---

## 1. Initial Codebase Audit Findings

### 1.1 Existing Assets
1. **`main.py`**:
   - Initial monolithic FastAPI file containing partial implementations of Module 1 (Inventory, FEFO sales), Module 2 (Shortage prediction using 7d/30d moving average), Module 3 (Finder with Haversine distance and confirmation requests), and Module 4 (Community shortage summary).
2. **`README.md`**:
   - Outlined conceptual setup for `backend` and `frontend`, but lacked executable startup files for frontend and comprehensive tests.
3. **`styles.css` & `index.html`**:
   - Minimal skeleton with rudimentary styling.
4. **`medipulse_schema.sql` (found in workspace root / Downloads)**:
   - Initial PostgreSQL schema containing `users`, `pharmacies`, `medicines`, `inventory_batches`, `sales`, `sale_items`, `stock_movements`, `purchase_orders`, `shortage_predictions`, and `audit_logs`.
5. **Source Datasets (`data/source_csv/`)**:
   - `pharmacy-management-system-v3-csv-medications.csv` (300 medicines with suppliers and pricing).
   - `pharmacy-management-system-v3-csv-transactions.csv` (800 sales transactions).
   - `pharmacy-management-system-v3-csv-customers.csv` (customer profiles).

### 1.2 Critical Bugs & Architectural Deficiencies Identified
1. **Startup Crash on Missing Environment Variables**:
   - `main.py` line 12 directly accesses `os.environ["SUPABASE_URL"]` and `os.environ["SUPABASE_SERVICE_KEY"]` without safe fallbacks, crashing immediately with `KeyError` when run without a remote Supabase instance.
   - **Fix**: Implement an environment config manager (`config.py`) that falls back gracefully to a mock / in-memory / local database provider when remote Supabase credentials are absent or during test execution.
2. **No Multi-Tenancy or Pharmacy Member Enforcement**:
   - Endpoints in `main.py` accepted `pharmacy_id` as an untrusted query parameter or payload without verifying user ownership or pharmacy membership.
   - Any user could read or alter stock from any pharmacy.
   - **Fix**: Introduce `pharmacy_members` mapping table with roles (`pharmacy_staff`, `pharmacy_admin`, `health_official`, `patient`), JWT-based authentication dependency, and strict Postgres RLS policies.
3. **Crude Shortage Prediction Algorithm**:
   - Prediction in `predict_for()` relied on a naive weighted moving average (`(recent*2 + old)/(7*2 + 23)`).
   - Completely missed day-of-week seasonality, trend components, confidence intervals, lead-time variance, safety stock formulas, and zero-sales cold starts.
   - **Fix**: Replace with a statistical/ML pipeline incorporating Holt-Winters exponential smoothing, gradient boosting / linear regression with day-of-week seasonality, confidence intervals, $Z$-score service-level safety stock, and cluster-based fallback for cold-start medicines.
4. **Data Warehouse & OLAP Cubes Absent in Code**:
   - Star Schema, Snowflake Schema, fact tables for deliveries and stockouts, and OLAP explorer (`GROUP BY CUBE` / rollup) were documented in design but missing in code.
   - **Fix**: Implement full Star Schema and Snowflake Schema DDL, incremental ETL pipeline with data-quality assertions, SCD Type 2 tracking, and an interactive OLAP query engine.
5. **Data Mining Incomplete**:
   - No basket association rules (FP-Growth/Apriori), no epidemic surge detection (CUSUM/STL), and no supplier reliability rating or model registry.
   - **Fix**: Implement complete data mining module with FP-Growth/Apriori basket analysis, CUSUM/STL outbreak detector, Random Forest shortage classifier, K-Means pharmacy clustering, and a registered `model_registry` table.
6. **Frontend Non-Functional**:
   - No `package.json`, Vite configuration, React components, or router existed.
   - **Fix**: Construct a modern React dashboard using Vite, Tailwind/modern CSS, Lucide icons, responsive sidebar, KPI cards, Leaflet map, CSV/Excel import/export, and PDF generation.
7. **No Tests or CI/CD**:
   - Zero test suites (0% coverage).
   - **Fix**: Add Pytest suite with mock database layer, Vitest for frontend, ESLint/Prettier configs, and GitHub Actions CI workflow.

---

## 2. Key Assumptions

1. **Dual Schema Support (Star & Snowflake)**:
   - As explicitly requested, the system supports both the Star Schema (`star_*` views and tables with denormalized dimensions for fast OLAP querying) and Snowflake Schema (`snowflake_*` normalized tables across ATC medicine tiers and geographic hierarchies) for comprehensive data warehousing demonstration.
2. **Local Development Fallback & Seamless Testing**:
   - The backend runs seamlessly in local standalone/testing mode with a high-fidelity in-memory/SQLite transactional repository when live Supabase credentials are not provided, while supporting live Supabase (PostgreSQL + Auth + Realtime) in cloud deployment.
3. **Multi-Role RBAC Model**:
   - `pharmacy_staff`: Read/write stock, record sales, receive deliveries for assigned pharmacy.
   - `pharmacy_admin`: Manage pharmacy staff, manage stock and purchase orders for assigned pharmacy.
   - `health_official`: System-wide read-only access to community analytics, epidemic surge alerts, and OLAP explorer.
   - `patient`: Public access to the medicine finder, stock verification freshness, generic alternatives, and confirmation requests.

---

## 3. Prioritized Implementation Roadmap

### Phase 1: Environment, Audit, and Baseline Stabilization (Step 1)
- [x] Audit codebase and identify bugs.
- [x] Author `docs/DATA_WAREHOUSE.md` and `PLAN.md`.
- [x] Initialize Git tracking and directory layout (`backend/`, `frontend/`, `supabase/`, `data/`, `docs/`).
- [ ] Create `.env.example` and resilient backend configuration with DB client provider.
- [ ] Establish initial tests to verify backend import and endpoint functionality.

### Phase 2: Security, RBAC, Multi-Tenancy & Audit Logging (Step 2)
- [ ] Schema additions: `pharmacy_members` table, user role enum (`pharmacy_staff`, `pharmacy_admin`, `health_official`, `patient`).
- [ ] Implement Row-Level Security (RLS) policies for Postgres/Supabase.
- [ ] FastAPI auth dependencies: JWT verification, role validation, and tenant scoping (`get_current_user`, `require_pharmacy_access`).
- [ ] Add request rate limiting on public routes (using slowapi / token bucket).
- [ ] Stock change audit log mechanism capturing actor, action, previous stock, new stock, and timestamp.
- [ ] Strict CORS middleware configured for allowed origins.

### Phase 3: Advanced Predictive Modeling Pipeline (Step 3)
- [ ] Replace moving average with time-series forecasting pipeline:
  - Day-of-week seasonality extraction.
  - Holt-Winters exponential smoothing and Scikit-Learn regression / Gradient Boosting with lag features.
  - Backtesting engine calculating Mean Absolute Percentage Error (MAPE) per medicine.
- [ ] Confidence intervals for forecast demand.
- [ ] Safety stock calculation using service-level $Z$-factor ($95\% \rightarrow Z=1.65$) and supplier lead-time standard deviation $\sigma_L$:
  $$\text{Safety Stock} = Z \times \sqrt{\bar{L} \sigma_D^2 + \bar{D}^2 \sigma_L^2}$$
- [ ] 0–100 Shortage Risk Score with explainability breakdown (demand velocity, lead time risk, buffer deficit, expiry risk).
- [ ] Cold-start fallback: new medicines with little history utilize average demand of their therapeutic cluster.

### Phase 4: Data Warehouse & OLAP Engine Upgrade (Step 4)
- [x] Dual Schema Implementation:
  - Star Schema: `dim_date`, `dim_time_of_day`, `dim_pharmacy` (SCD Type 2), `dim_medicine` (SCD Type 2), `dim_supplier`, `dim_area`, `fact_daily_sales`, `fact_deliveries`, `fact_stockouts`, `fact_inventory_snapshot`.
  - Snowflake Schema: `dim_atc_level1` through `dim_atc_level4`, `dim_locality` $\rightarrow$ `dim_city` $\rightarrow$ `dim_district` $\rightarrow$ `dim_state`.
- [x] Incremental ETL Pipeline:
  - CDC extraction with watermarks.
  - Quality assertions (null checks, range constraints, referential integrity).
  - SCD Type 2 dimension expiration and insertion.
  - `etl_runs` audit log table.
- [x] Full OLAP Explorer API:
  - Hierarchies: Time (Year > Quarter > Month > Day) & Geography (Region > District > City > Pharmacy).
  - Multi-measures: units sold, stockouts, days of cover, avg delay, fill rate.
  - Slice, dice, drill-down, roll-up, period-over-period (PoP) percentage changes, top-N rankings, and saved views.

### Phase 5: Advanced Data Mining Suite (Step 5)
- [x] Association Rule Mining (FP-Growth / Apriori) on co-purchased medicines using `sale_baskets` with support, confidence, lift, and conviction metrics.
- [x] Outbreak / Epidemic Demand Surge Detection:
  - CUSUM (Cumulative Sum Control Chart) and STL residual anomaly detection per locality/city.
  - Multi-tier alert levels (Watch, Warning, Surge, Outbreak).
- [x] Supervised Classification for Shortage Risk (Random Forest / Gradient Boosted Trees) with feature importance rankings.
- [x] Unsupervised K-Means Clustering of pharmacies based on transaction velocity, stockout frequency, and reorder patterns.
- [x] Supplier Reliability Composite Score ($S_R$).
- [x] Model Registry table (`model_registry`) and retraining endpoint (`/analytics/mining/retrain`).

### Phase 6: Patient Medicine Finder & Realtime Alerts (Step 6)
- [x] Interactive Finder API:
  - Geographic search with distance filtering, verified stock freshness, open status, and generic therapeutic alternatives.
- [x] Stock confirmation workflow with status tracking (`pending`, `confirmed`, `unavailable`).
- [x] Realtime channel hooks (Supabase Realtime) and notification dispatcher stub for SMS/Email (Twilio / Resend) with local sandbox mode.
- [x] Restock alert subscription mechanism and pharmacy daily digest generator for at-risk/expiring batches.

### Phase 7: Responsive Modern Frontend Dashboard (Step 7)
- [x] Initialize Vite + React project with Tailwind CSS, Lucide icons, and modern design system.
- [x] UI Architecture:
  - Sidebar navigation with role-based view switching (`pharmacy_admin`, `pharmacy_staff`, `health_official`, `patient`).
  - Dark mode / Light mode toggle.
  - Loading skeletons, empty states, and error boundaries.
  - Accessible forms, high contrast, ARIA labels.
- [x] Views & Pages:
  - **Overview / KPI Dashboard**: Executive metrics, inventory health, risk gauges, sales charts.
  - **Inventory Management**: FEFO batch listing, expiry alerts, manual verification button, barcode/QR mock scan, and bulk CSV/Excel upload with row-level validation.
  - **Shortage Prediction & Safety Stock**: Model forecast cards, MAPE metrics, risk score 0–100 explainability breakdown, reorder recommendations.
  - **Data Warehouse & OLAP Explorer**: Interactive multidimensional cube, slice-and-dice filters, pivot tables, top-N ranking, and period-over-period comparisons.
  - **Data Mining Studio**: Market basket rules network, epidemic outbreak heat map, pharmacy clustering visualization, and model registry manager.
  - **Patient Finder & Pharmacy Map**: Leaflet map with pharmacy markers, distance calculation, generic alternative recommendations, and confirmation requests.
  - **Reports & Exporting**: PDF and Excel report generation for analytics and OLAP cubes.

### Phase 8: Engineering Quality, Testing & Deployment (Step 8)
- [x] ESLint and Prettier configurations.
- [x] Pytest suite covering all modules, auth, prediction algorithms, ETL, and data mining.
- [x] Vitest / Testing Library tests for key React components.
- [x] Structured JSON logging middleware.
- [x] Operational `/health` and Prometheus-compatible `/metrics` endpoints.
- [x] 12-Month Realistic Synthetic Data Seed Script (20 pharmacies, 50-300 medicines, suppliers, seasonal demand, deliveries, stockouts).
- [x] Docker Compose environment (`docker-compose.yml`) + Dockerfile.
- [x] Deployment configurations and guides for Render/Railway (API) and Vercel/Netlify (Frontend).

### Phase 9: Documentation, Demonstration & Presentation Assets (Step 9)
- [x] Comprehensive `README.md` with system architecture, quickstart, and configuration.
- [x] `docs/DATA_WAREHOUSE.md` (completed with Star/Snowflake schemas, ETL, OLAP).
- [x] `docs/ARCHITECTURE.md` with end-to-end system and data flow diagrams.
- [x] `docs/MODEL_CARD.md` with ML methodologies, metrics, limitations, and ethical considerations.
- [x] `docs/DEMO_SCRIPT.md` with step-by-step walkthrough for project evaluation and viva demonstration.
