# MediPulse AI: Architecture & System Design Specification

This document provides a comprehensive technical reference for the architecture, component interaction, data flow, and security model of **MediPulse AI**.

---

## 1. System Overview

MediPulse AI is an enterprise-grade healthcare analytics and supply-chain intelligence platform designed to eliminate localized medicine shortages through real-time inventory tracking, multi-dimensional OLAP analytics, and predictive data mining.

### Architectural Philosophy
1. **Decoupled OLTP and OLAP**: Operational transactions (FEFO sales, batch arrivals) are isolated from analytical queries through an incremental ETL pipeline that feeds dual Star and Snowflake warehouse schemas.
2. **Multi-Tenancy by Design**: Strict tenant isolation ensures pharmacies can only view and modify their own stock levels, while designated public health authorities receive aggregated regional intelligence without cross-tenant leakage.
3. **Defense-in-Depth Security**: Layered security encompassing JWT claims validation, role-based access control (RBAC), PostgreSQL Row-Level Security (RLS) policies, sliding-window rate limiting, and immutable audit logs.
4. **Resilient Local & Cloud Execution**: A dual-mode repository layer transparently switches between live PostgreSQL/Supabase and an in-memory PostgREST emulator, enabling full offline development, testing, and continuous integration without cloud dependencies.

---

## 2. High-Level Component Topology

```mermaid
flowchart TB
    subgraph ClientTier["Client / Presentation Tier"]
        Browser["Modern Web Browsers (Desktop & Mobile)"]
        SPA["React 18 Single-Page Application (Vite 5)"]
        Browser --> SPA
    end

    subgraph APITier["Application / Gateway Tier (FastAPI)"]
        Router["FastAPI Application Router"]
        CorsMW["CORS & Request Latency Middleware"]
        AuthMW["JWT Bearer Authentication & RBAC Guard"]
        RateLimiter["Sliding-Window In-Memory Rate Limiter"]
        AuditSvc["Immutable Audit Logging Service"]
        
        Router --> CorsMW
        CorsMW --> RateLimiter
        RateLimiter --> AuthMW
        AuthMW --> AuditSvc
    end

    subgraph ServiceTier["Domain & Analytics Engines"]
        InvSvc["Inventory & FEFO Allocation Engine"]
        ForecastSvc["Time-Series Forecasting Engine (Holt-Winters / Ridge)"]
        MiningSvc["Data Mining Engine (FP-Growth, CUSUM, Random Forest, K-Means)"]
        ETLSvc["Incremental ETL & SCD Type 2 Engine"]
        OLAPSvc["Multidimensional OLAP Aggregation Engine"]
        FinderSvc["Geolocation Medicine Finder & Matching Engine"]
        NotifSvc["Notification Dispatcher (Twilio / Resend / Stubs)"]
    end

    subgraph DataTier["Data Persistence Tier (Supabase / PostgreSQL)"]
        OLTP_DB[("Operational Database (OLTP)\n- pharmacies\n- inventory_batches\n- sales\n- deliveries")]
        DW_DB[("Data Warehouse (OLAP)\n- Star Schema (Denormalized)\n- Snowflake Schema (Normalized)\n- SCD Type 2 Dims\n- etl_runs")]
        Registry_DB[("Model Registry & Audit Log\n- model_registry\n- audit_logs\n- restock_subscriptions")]
    end

    SPA -->|HTTPS / REST API| Router
    AuthMW --> InvSvc
    AuthMW --> ForecastSvc
    AuthMW --> MiningSvc
    AuthMW --> ETLSvc
    AuthMW --> OLAPSvc
    AuthMW --> FinderSvc
    AuthMW --> NotifSvc

    InvSvc --> OLTP_DB
    FinderSvc --> OLTP_DB
    ETLSvc -->|Extract & Transform| OLTP_DB
    ETLSvc -->|Load SCD2 & Facts| DW_DB
    OLAPSvc --> DW_DB
    ForecastSvc --> OLTP_DB
    MiningSvc --> OLTP_DB
    MiningSvc --> Registry_DB
    AuditSvc --> Registry_DB
    NotifSvc --> Registry_DB
```

---

## 3. Core Component Specifications

### 3.1 Authentication, RBAC, and Multi-Tenancy

Every API request undergoes strict authorization checks based on user identity, assigned role, and pharmacy affiliation:

```mermaid
sequenceDiagram
    autonumber
    actor User as Pharmacy Staff / Official
    participant Client as React SPA
    participant API as FastAPI Backend
    participant Auth as Auth / RBAC Guard
    participant DB as Supabase PostgreSQL

    User->>Client: Enters credentials / Selects Role
    Client->>API: POST /api/v1/auth/token
    API->>DB: Query pharmacy_members & users
    DB-->>API: User record (role, pharmacy_id, password_hash)
    API->>API: Verify PBKDF2 HMAC-SHA256 signature
    API-->>Client: Return JWT {sub, role, pharmacy_id, exp}
    
    Note over Client,API: Subsequent Authenticated Requests
    Client->>API: POST /api/v1/sales (with Bearer Token)
    API->>Auth: Extract & Validate JWT
    Auth->>Auth: Check require_roles(['pharmacy_staff', 'pharmacy_admin'])
    Auth->>Auth: Enforce tenant match: token.pharmacy_id == payload.pharmacy_id
    alt Unauthorized Tenant Access
        Auth-->>Client: 403 Forbidden ("Cross-tenant mutation denied")
    else Authorized
        Auth->>API: Proceed with request execution
        API->>DB: Execute FEFO stock deduction
        DB-->>API: Success
        API-->>Client: 200 OK (Batch allocations)
    end
```

#### Role Permission Matrix

| Role | Operational Scope | Allowed Capabilities |
|---|---|---|
| `pharmacy_staff` | Single Tenant | View batch stock, record FEFO sales, record physical stock verification. |
| `pharmacy_admin` | Single Tenant | All staff capabilities + bulk CSV/Excel import, purchase order deliveries, member audit logs. |
| `health_official` | Multi-Tenant / Regional | Read-only access to all pharmacy stocks, community shortage analytics, OLAP explorer, epidemiological surge alerts, and retrain ML models. |
| `patient` | Public / Anonymized | Search medicine availability, view distance/freshness, view generic substitutes, submit reservation confirmation requests, subscribe to restock alerts. |

---

## 4. Operational to Analytical Data Pipeline (ETL & OLAP)

### 4.1 Incremental ETL & Slowly Changing Dimensions (SCD Type 2)

The ETL process runs incrementally using high-watermark timestamps to prevent full table reloads, minimizing database I/O while guaranteeing consistency:

```mermaid
flowchart TD
    Start([ETL Trigger: Manual or Scheduled]) --> ReadWM[Read High Watermark from etl_runs]
    ReadWM --> Extract[Extract delta records: created_at > watermark]
    
    subgraph QualityGates["Data Quality Gate Assertions"]
        Extract --> QC1{Missing FKs?}
        QC1 -->|Yes| Fail1[Log to etl_runs with status: FAILED]
        QC1 -->|No| QC2{Negative Quantities or Prices?}
        QC2 -->|Yes| Fail2[Log to etl_runs with status: FAILED]
        QC2 -->|No| QC3{Invalid ATC Codes?}
        QC3 -->|Yes| Fail3[Log to etl_runs with status: FAILED]
        QC3 -->|No| Passed[Quality Assertions Verified]
    end

    subgraph SCD2["SCD Type 2 Processing"]
        Passed --> CheckSCD{Attribute Changed in Pharmacy or Medicine?}
        CheckSCD -->|Yes| ExpireOld[Set is_current=False, effective_to=NOW on existing surrogate key]
        ExpireOld --> InsertNew[Insert new row with new surrogate key, is_current=True, effective_from=NOW]
        CheckSCD -->|No| RetainDim[Retain existing surrogate key]
    end

    subgraph FactLoad["Fact Table Transformations & Ingestion"]
        InsertNew --> TransformFacts[Transform Sales, Deliveries, Stockouts with Surrogate Keys]
        RetainDim --> TransformFacts
        TransformFacts --> LoadStar[Upsert into Star Schema Fact Tables]
        TransformFacts --> LoadSnow[Upsert into Snowflake Schema Fact Tables]
    end

    LoadSnow --> UpdateWM[Update High Watermark in etl_runs]
    UpdateWM --> Finish([ETL Run Logged: SUCCESS])
```

### 4.2 Dual Data Warehouse Topology: Star vs. Snowflake

MediPulse AI offers dual-schema querying to demonstrate multidimensional data warehousing paradigms:

```mermaid
classDiagram
    direction LR

    class DimDate {
        int date_key PK
        date full_date
        int year
        int quarter
        int month
        int day_of_week
        bool is_weekend
    }

    class DimPharmacy {
        int pharmacy_key PK
        uuid pharmacy_id
        string name
        string locality
        string city
        string district
        string state
        bool is_current
        timestamp effective_from
        timestamp effective_to
    }

    class DimMedicine {
        int medicine_key PK
        uuid medicine_id
        string brand_name
        string generic_name
        string atc_code
        string atc_level1_name
        string atc_level2_name
        bool is_current
        timestamp effective_from
        timestamp effective_to
    }

    class FactDailySales {
        int date_key FK
        int pharmacy_key FK
        int medicine_key FK
        int units_sold
        float gross_revenue
        float net_revenue
        int transaction_count
    }

    FactDailySales --> DimDate : sold_date_key
    FactDailySales --> DimPharmacy : pharmacy_key
    FactDailySales --> DimMedicine : medicine_key
```

*In the Snowflake schema, `DimMedicine` normalizes into `DimATCTier1`, `DimATCTier2`, and `DimDosageForm`, while `DimPharmacy` normalizes into `DimDistrict`, `DimCity`, and `DimLocality`.*

---

## 5. Machine Learning & Data Mining Architecture

```mermaid
flowchart TD
    subgraph DataSources["Feature Data Sources"]
        SalesHist["12-Month Daily Sales Series"]
        DelivHist["Supplier Delivery Receipts & Delays"]
        Baskets["Multi-Item Prescription Baskets"]
        Inventory["Active Batch Expiry & Stock Levels"]
    end

    subgraph Pipelines["Mining & Forecasting Pipelines"]
        F1["Forecasting: Seasonality Decomposition + Holt-Winters / Ridge"]
        F2["Epidemic Surveillance: CUSUM Control Charts + Z-Score"]
        F3["Affinity Mining: FP-Growth Frequent Itemsets & Rules"]
        F4["Risk Classifier: Random Forest (Gini Importance)"]
        F5["Clustering: K-Means Pharmacy Behavioral Archetypes"]
        F6["Supplier Scoring: Composite Reliability Index"]
    end

    subgraph Registry["Model Registry & Storage"]
        MR[("model_registry\n- model_name\n- version\n- hyperparameters\n- metrics (MAPE, F1, Silhouette)\n- trained_at")]
    end

    subgraph Inference["Online Inference & Intelligence"]
        PredAPI["/predictions/shortages"]
        MiningAPI["/analytics/mining/all"]
        SurgeAPI["/analytics/mining/outbreaks"]
    end

    DataSources --> Pipelines
    Pipelines --> MR
    MR --> Inference
```

### 5.1 Forecasting Engine
- **Methodology**: Additive day-of-week seasonality decomposition combined with Holt-Winters triple exponential smoothing and Ridge regression.
- **Safety Stock Optimization**:
  $$SS = Z \times \sqrt{L \cdot \sigma_D^2 + D^2 \cdot \sigma_L^2}$$
  Where $Z = 1.65$ (95% service level), $L$ is expected supplier lead time, $\sigma_D$ is demand variance, and $\sigma_L$ is delivery lead time variance.
- **Confidence Intervals**: $\hat{y}_t \pm 1.96 \cdot \hat{\sigma}_{\text{residuals}}$.
- **Cold-Start Strategy**: Unobserved or newly registered medicines inherit demand distribution vectors from their corresponding therapeutic ATC cluster.

---

## 6. Real-Time Patient Finder & Geolocation Matching

```mermaid
flowchart LR
    PatientReq["Patient Query:\n- Medicine Name\n- Patient Lat/Lng\n- Max Radius (km)"] --> GeoMatch["Haversine Geolocation Engine\nCompute Great-Circle Distance"]
    GeoMatch --> FreshFilter["Stock Freshness Filter\nCompute Hours Since Last Verified"]
    FreshFilter --> StockCheck{"Is Stock Available?"}
    
    StockCheck -->|Yes| RankedList["Ranked Pharmacy List:\n1. Distance (km)\n2. Stock Units\n3. Freshness Age"]
    StockCheck -->|No| SubstEngine["Chemical Substitution Engine\nLookup Identical Generic Molecule"]
    SubstEngine --> AltList["Alternative Generic Brands In Stock"]

    RankedList --> Output["Patient Response View"]
    AltList --> Output
```

---

## 7. Security, Tenancy, and Compliance Model

1. **Authentication Token Lifecycle**:
   - Access tokens are HMAC-SHA256 signed JSON Web Tokens (JWT) expiring in 24 hours.
   - Tokens encapsulate claims: `{ "sub": user_id, "role": user_role, "pharmacy_id": tenant_id }`.
2. **PostgreSQL Row-Level Security (RLS)**:
   - For all tenant-scoped tables (`inventory_batches`, `sales`, `deliveries`), PostgreSQL RLS policies enforce `auth.uid() IN (SELECT user_id FROM pharmacy_members WHERE pharmacy_id = table.pharmacy_id)`.
3. **Audit Immutability**:
   - Stock adjustments, manual count overrides, and batch additions generate records in `audit_logs` capturing `user_id`, `pharmacy_id`, `action`, `resource_id`, `before_state`, `after_state`, and `timestamp`.
4. **Public Endpoint Rate Limiting**:
   - Patient search and restock alert endpoints are protected by an in-memory sliding-window limiter enforcing a strict maximum of 60 requests per minute per IP address.

---

## 8. Deployment Topology

```mermaid
flowchart TB
    subgraph Edge["Edge / CDN Tier"]
        Vercel["Vercel / Netlify Edge Network\n- Global CDN Caching\n- HTTPS Termination\n- Single Page App Hosting"]
    end

    subgraph Compute["Application Cloud Compute"]
        Railway["Railway / Render Container Runtime\n- FastAPI Uvicorn Server\n- Auto-scaling Workers\n- Health Check: /health\n- Prometheus: /metrics"]
    end

    subgraph DataPlatform["Database Cloud Platform"]
        SupabaseCloud["Supabase Managed PostgreSQL 15\n- Connection Pooling (PgBouncer)\n- Row Level Security (RLS)\n- Automated Backups"]
    end

    Edge -->|REST API Proxy| Compute
    Compute -->|PostgreSQL Wire Protocol| DataPlatform
```

- **Containerization**: Both frontend and backend feature multi-stage production Dockerfiles with a unifying `docker-compose.yml` for unified one-command local orchestration.
- **Observability**: Real-time health probes at `/health` and native Prometheus metric scrapers at `/metrics` exporting request counts, latencies, and active model versions.

