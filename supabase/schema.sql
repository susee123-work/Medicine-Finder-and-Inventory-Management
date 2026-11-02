-- ============================================================================
-- MediPulse AI: Unified Database Schema (OLTP + Star Schema + Snowflake Schema)
-- Engine: PostgreSQL 14+ / Supabase
-- Purpose: Real-time pharmacy inventory, multi-tenancy, predictive shortage intelligence,
--          dual data warehouse (Star and Snowflake schemas), OLAP aggregation,
--          and data mining models.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================================
-- 1. ENUMS & DOMAINS
-- ============================================================================
DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('pharmacy_staff', 'pharmacy_admin', 'health_official', 'patient');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE pharmacy_verification_status AS ENUM ('PENDING', 'VERIFIED', 'REJECTED', 'SUSPENDED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE sale_status AS ENUM ('COMPLETED', 'VOIDED', 'REFUNDED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE confirmation_status AS ENUM ('pending', 'available', 'unavailable', 'expired');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE delivery_status AS ENUM ('ORDERED', 'IN_TRANSIT', 'DELIVERED', 'DELAYED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE shortage_risk_level AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE outbreak_alert_level AS ENUM ('NORMAL', 'WATCH', 'WARNING', 'SURGE', 'OUTBREAK');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================================
-- 2. OPERATIONAL (OLTP) TABLES
-- ============================================================================

-- Pharmacies Table
CREATE TABLE IF NOT EXISTS pharmacies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(200) NOT NULL,
    license_number VARCHAR(100) UNIQUE,
    phone VARCHAR(32),
    email VARCHAR(254),
    address_line TEXT NOT NULL,
    locality VARCHAR(120),
    city VARCHAR(120) NOT NULL,
    district VARCHAR(120),
    state VARCHAR(120) NOT NULL DEFAULT 'Tamil Nadu',
    postal_code VARCHAR(12),
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    open_time TIME DEFAULT '08:00:00',
    close_time TIME DEFAULT '22:00:00',
    is_24_hours BOOLEAN DEFAULT FALSE,
    verification_status pharmacy_verification_status NOT NULL DEFAULT 'VERIFIED',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Users / Profiles (integrated with Supabase Auth or local auth)
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(254) NOT NULL UNIQUE,
    full_name VARCHAR(160) NOT NULL,
    role user_role NOT NULL DEFAULT 'patient',
    phone VARCHAR(32),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Pharmacy Membership (Multi-Tenancy mapping)
CREATE TABLE IF NOT EXISTS pharmacy_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    pharmacy_id UUID NOT NULL REFERENCES pharmacies(id) ON DELETE CASCADE,
    role user_role NOT NULL DEFAULT 'pharmacy_staff',
    is_primary BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_pharmacy_member UNIQUE (user_id, pharmacy_id)
);

-- Suppliers Table
CREATE TABLE IF NOT EXISTS suppliers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(200) NOT NULL,
    contact_name VARCHAR(160),
    phone VARCHAR(32),
    email VARCHAR(254),
    address TEXT,
    city VARCHAR(120),
    state VARCHAR(120) DEFAULT 'Tamil Nadu',
    typical_lead_time_days INTEGER NOT NULL DEFAULT 3 CHECK (typical_lead_time_days >= 0),
    reliability_score NUMERIC(5,2) DEFAULT 95.0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Medicines Catalogue
CREATE TABLE IF NOT EXISTS medicines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(240) NOT NULL,
    generic_name VARCHAR(240) NOT NULL,
    brand_name VARCHAR(240),
    strength VARCHAR(100),
    dosage_form VARCHAR(100),
    pack_size VARCHAR(100),
    manufacturer VARCHAR(240),
    therapeutic_category VARCHAR(160),
    atc_code VARCHAR(10),
    prescription_required BOOLEAN DEFAULT FALSE,
    supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
    default_price NUMERIC(12,2) DEFAULT 50.00,
    cluster_group INTEGER DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Inventory Batches (FEFO Tracking)
CREATE TABLE IF NOT EXISTS inventory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pharmacy_id UUID NOT NULL REFERENCES pharmacies(id) ON DELETE CASCADE,
    medicine_id UUID NOT NULL REFERENCES medicines(id) ON DELETE CASCADE,
    batch_no VARCHAR(120) NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
    expiry_date DATE NOT NULL,
    unit_cost NUMERIC(12,2) DEFAULT 0.0,
    selling_price NUMERIC(12,2) DEFAULT 0.0,
    supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
    verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_inventory_batch UNIQUE (pharmacy_id, medicine_id, batch_no)
);

-- Sales Headers & Items
CREATE TABLE IF NOT EXISTS sales (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pharmacy_id UUID NOT NULL REFERENCES pharmacies(id) ON DELETE RESTRICT,
    medicine_id UUID NOT NULL REFERENCES medicines(id) ON DELETE RESTRICT,
    batch_id UUID REFERENCES inventory(id) ON DELETE SET NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_price NUMERIC(12,2) DEFAULT 0.0,
    total_amount NUMERIC(14,2) DEFAULT 0.0,
    sold_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    status sale_status NOT NULL DEFAULT 'COMPLETED'
);

-- Multi-Item Sale Baskets for Association Rule Mining (Market Basket Analysis)
CREATE TABLE IF NOT EXISTS sale_baskets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    basket_code VARCHAR(64) NOT NULL,
    pharmacy_id UUID NOT NULL REFERENCES pharmacies(id) ON DELETE CASCADE,
    sold_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sale_basket_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    basket_id UUID NOT NULL REFERENCES sale_baskets(id) ON DELETE CASCADE,
    medicine_id UUID NOT NULL REFERENCES medicines(id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL DEFAULT 1,
    unit_price NUMERIC(12,2) NOT NULL DEFAULT 0.0
);

-- Deliveries / Purchase Orders
CREATE TABLE IF NOT EXISTS deliveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
    pharmacy_id UUID NOT NULL REFERENCES pharmacies(id) ON DELETE CASCADE,
    medicine_id UUID NOT NULL REFERENCES medicines(id) ON DELETE RESTRICT,
    ordered_on DATE NOT NULL,
    expected_on DATE NOT NULL,
    received_on DATE,
    quantity_ordered INTEGER NOT NULL CHECK (quantity_ordered > 0),
    quantity_received INTEGER DEFAULT 0 CHECK (quantity_received >= 0),
    status delivery_status NOT NULL DEFAULT 'ORDERED',
    lead_time_days INTEGER,
    delay_days INTEGER DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Patient Stock Confirmation Requests
CREATE TABLE IF NOT EXISTS confirmation_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pharmacy_id UUID NOT NULL REFERENCES pharmacies(id) ON DELETE CASCADE,
    medicine_id UUID NOT NULL REFERENCES medicines(id) ON DELETE CASCADE,
    patient_contact VARCHAR(100) NOT NULL,
    patient_name VARCHAR(160),
    status confirmation_status NOT NULL DEFAULT 'pending',
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    responded_at TIMESTAMPTZ
);

-- Restock Notification Subscriptions
CREATE TABLE IF NOT EXISTS restock_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    medicine_id UUID NOT NULL REFERENCES medicines(id) ON DELETE CASCADE,
    pharmacy_id UUID REFERENCES pharmacies(id) ON DELETE CASCADE,
    patient_email VARCHAR(254) NOT NULL,
    patient_phone VARCHAR(32),
    is_notified BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    notified_at TIMESTAMPTZ
);

-- Stock Change Audit Logs
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    pharmacy_id UUID REFERENCES pharmacies(id) ON DELETE CASCADE,
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(100) NOT NULL,
    entity_id VARCHAR(100),
    previous_state JSONB,
    new_state JSONB,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Model Registry Table (Tracks ML models, versions, training dates, and metrics)
CREATE TABLE IF NOT EXISTS model_registry (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    model_name VARCHAR(120) NOT NULL,
    version VARCHAR(40) NOT NULL,
    algorithm VARCHAR(120) NOT NULL,
    task_type VARCHAR(80) NOT NULL,
    metrics JSONB NOT NULL DEFAULT '{}'::JSONB,
    hyperparameters JSONB NOT NULL DEFAULT '{}'::JSONB,
    trained_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status VARCHAR(40) NOT NULL DEFAULT 'ACTIVE',
    artifacts_uri TEXT,
    notes TEXT
);

-- ============================================================================
-- 3. STAR SCHEMA (ANALYTICAL DATA WAREHOUSE)
-- ============================================================================

-- Dim Date (Standard Conformed Dimension)
CREATE TABLE IF NOT EXISTS star_dim_date (
    date_key INTEGER PRIMARY KEY, -- e.g. 20261102
    full_date DATE NOT NULL UNIQUE,
    day_of_week INTEGER NOT NULL, -- 0-6 or 1-7
    day_name VARCHAR(20) NOT NULL,
    day_of_month INTEGER NOT NULL,
    week_of_year INTEGER NOT NULL,
    month INTEGER NOT NULL,
    month_name VARCHAR(20) NOT NULL,
    quarter INTEGER NOT NULL,
    quarter_name VARCHAR(10) NOT NULL,
    year INTEGER NOT NULL,
    is_weekend BOOLEAN NOT NULL,
    is_holiday BOOLEAN DEFAULT FALSE
);

-- Dim Time of Day
CREATE TABLE IF NOT EXISTS star_dim_time_of_day (
    time_key INTEGER PRIMARY KEY, -- e.g. 1430 for 14:30
    hour_24 INTEGER NOT NULL,
    minute INTEGER NOT NULL,
    time_bucket VARCHAR(30) NOT NULL -- 'Morning (06-12)', 'Afternoon (12-17)', 'Evening (17-21)', 'Night (21-06)'
);

-- Dim Area (Geographical Conformed Dimension)
CREATE TABLE IF NOT EXISTS star_dim_area (
    area_key SERIAL PRIMARY KEY,
    locality VARCHAR(120),
    city VARCHAR(120) NOT NULL,
    district VARCHAR(120),
    state VARCHAR(120) NOT NULL DEFAULT 'Tamil Nadu',
    postal_code VARCHAR(12),
    zone VARCHAR(60),
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION
);

-- Dim Pharmacy (SCD Type 2 Dimension)
CREATE TABLE IF NOT EXISTS star_dim_pharmacy (
    pharmacy_key SERIAL PRIMARY KEY,
    pharmacy_id UUID NOT NULL,
    name VARCHAR(200) NOT NULL,
    license_number VARCHAR(100),
    address_line TEXT,
    locality VARCHAR(120),
    city VARCHAR(120),
    district VARCHAR(120),
    state VARCHAR(120),
    postal_code VARCHAR(12),
    phone VARCHAR(32),
    verification_status VARCHAR(40),
    is_24_hours BOOLEAN,
    row_effective_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    row_expiration_date TIMESTAMPTZ NOT NULL DEFAULT '9999-12-31 23:59:59+00',
    is_current BOOLEAN NOT NULL DEFAULT TRUE
);

-- Dim Medicine (SCD Type 2 Dimension)
CREATE TABLE IF NOT EXISTS star_dim_medicine (
    medicine_key SERIAL PRIMARY KEY,
    medicine_id UUID NOT NULL,
    name VARCHAR(240) NOT NULL,
    generic_name VARCHAR(240) NOT NULL,
    brand_name VARCHAR(240),
    strength VARCHAR(100),
    dosage_form VARCHAR(100),
    manufacturer VARCHAR(240),
    therapeutic_category VARCHAR(160),
    atc_code VARCHAR(10),
    atc_level1 VARCHAR(100),
    atc_level2 VARCHAR(100),
    atc_level3 VARCHAR(100),
    prescription_required BOOLEAN,
    default_price NUMERIC(12,2),
    cluster_group INTEGER DEFAULT 0,
    row_effective_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    row_expiration_date TIMESTAMPTZ NOT NULL DEFAULT '9999-12-31 23:59:59+00',
    is_current BOOLEAN NOT NULL DEFAULT TRUE
);

-- Dim Supplier
CREATE TABLE IF NOT EXISTS star_dim_supplier (
    supplier_key SERIAL PRIMARY KEY,
    supplier_id UUID NOT NULL,
    name VARCHAR(200) NOT NULL,
    contact_name VARCHAR(160),
    phone VARCHAR(32),
    email VARCHAR(254),
    city VARCHAR(120),
    state VARCHAR(120),
    typical_lead_time_days INTEGER,
    reliability_rating VARCHAR(30)
);

-- Fact Daily Sales (Star Schema Fact Table)
CREATE TABLE IF NOT EXISTS star_fact_daily_sales (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    date_key INTEGER NOT NULL REFERENCES star_dim_date(date_key),
    pharmacy_key INTEGER NOT NULL REFERENCES star_dim_pharmacy(pharmacy_key),
    medicine_key INTEGER NOT NULL REFERENCES star_dim_medicine(medicine_key),
    area_key INTEGER REFERENCES star_dim_area(area_key),
    units_sold INTEGER NOT NULL DEFAULT 0,
    gross_revenue NUMERIC(14,2) NOT NULL DEFAULT 0.0,
    discount_amount NUMERIC(14,2) NOT NULL DEFAULT 0.0,
    net_revenue NUMERIC(14,2) NOT NULL DEFAULT 0.0,
    transaction_count INTEGER NOT NULL DEFAULT 0
);

-- Fact Deliveries (Star Schema Fact Table)
CREATE TABLE IF NOT EXISTS star_fact_deliveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ordered_date_key INTEGER NOT NULL REFERENCES star_dim_date(date_key),
    received_date_key INTEGER REFERENCES star_dim_date(date_key),
    supplier_key INTEGER NOT NULL REFERENCES star_dim_supplier(supplier_key),
    pharmacy_key INTEGER NOT NULL REFERENCES star_dim_pharmacy(pharmacy_key),
    medicine_key INTEGER NOT NULL REFERENCES star_dim_medicine(medicine_key),
    quantity_ordered INTEGER NOT NULL,
    quantity_received INTEGER NOT NULL,
    lead_time_days INTEGER,
    delay_days INTEGER DEFAULT 0,
    fill_rate_pct NUMERIC(5,2) DEFAULT 100.0,
    is_delayed BOOLEAN DEFAULT FALSE
);

-- Fact Stockouts (Star Schema Fact Table)
CREATE TABLE IF NOT EXISTS star_fact_stockouts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    date_key INTEGER NOT NULL REFERENCES star_dim_date(date_key),
    pharmacy_key INTEGER NOT NULL REFERENCES star_dim_pharmacy(pharmacy_key),
    medicine_key INTEGER NOT NULL REFERENCES star_dim_medicine(medicine_key),
    area_key INTEGER REFERENCES star_dim_area(area_key),
    duration_hours NUMERIC(8,2) DEFAULT 24.0,
    estimated_lost_sales_units NUMERIC(10,2) DEFAULT 0.0,
    estimated_lost_revenue NUMERIC(12,2) DEFAULT 0.0,
    severity VARCHAR(30) DEFAULT 'HIGH'
);

-- Fact Inventory Snapshot (Star Schema Fact Table)
CREATE TABLE IF NOT EXISTS star_fact_inventory_snapshot (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    snapshot_date_key INTEGER NOT NULL REFERENCES star_dim_date(date_key),
    pharmacy_key INTEGER NOT NULL REFERENCES star_dim_pharmacy(pharmacy_key),
    medicine_key INTEGER NOT NULL REFERENCES star_dim_medicine(medicine_key),
    quantity_on_hand INTEGER NOT NULL,
    expiring_within_30d_qty INTEGER DEFAULT 0,
    days_of_cover NUMERIC(8,2),
    safety_stock_level INTEGER,
    stockout_risk_score NUMERIC(5,2) -- 0 to 100
);

-- ============================================================================
-- 4. SNOWFLAKE SCHEMA (NORMALIZED MULTIDIMENSIONAL WAREHOUSE)
-- ============================================================================

-- Normalized Geographic Hierarchy
CREATE TABLE IF NOT EXISTS snow_dim_state (
    state_id SERIAL PRIMARY KEY,
    state_name VARCHAR(120) NOT NULL UNIQUE,
    country VARCHAR(100) NOT NULL DEFAULT 'India'
);

CREATE TABLE IF NOT EXISTS snow_dim_district (
    district_id SERIAL PRIMARY KEY,
    state_id INTEGER NOT NULL REFERENCES snow_dim_state(state_id),
    district_name VARCHAR(120) NOT NULL,
    CONSTRAINT uq_snow_district UNIQUE (state_id, district_name)
);

CREATE TABLE IF NOT EXISTS snow_dim_city (
    city_id SERIAL PRIMARY KEY,
    district_id INTEGER NOT NULL REFERENCES snow_dim_district(district_id),
    city_name VARCHAR(120) NOT NULL,
    postal_code VARCHAR(12)
);

CREATE TABLE IF NOT EXISTS snow_dim_locality (
    locality_id SERIAL PRIMARY KEY,
    city_id INTEGER NOT NULL REFERENCES snow_dim_city(city_id),
    locality_name VARCHAR(120) NOT NULL
);

CREATE TABLE IF NOT EXISTS snow_dim_pharmacy (
    pharmacy_key SERIAL PRIMARY KEY,
    pharmacy_id UUID NOT NULL,
    locality_id INTEGER NOT NULL REFERENCES snow_dim_locality(locality_id),
    name VARCHAR(200) NOT NULL,
    license_number VARCHAR(100),
    address_line TEXT,
    phone VARCHAR(32),
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    is_24_hours BOOLEAN DEFAULT FALSE,
    is_current BOOLEAN DEFAULT TRUE
);

-- Normalized ATC Medicine Hierarchy
CREATE TABLE IF NOT EXISTS snow_dim_atc_level1 (
    atc_level1_id VARCHAR(2) PRIMARY KEY, -- e.g. 'A', 'J', 'C', 'N'
    anatomical_main_group VARCHAR(160) NOT NULL
);

CREATE TABLE IF NOT EXISTS snow_dim_atc_level2 (
    atc_level2_id VARCHAR(5) PRIMARY KEY, -- e.g. 'J01', 'A02'
    atc_level1_id VARCHAR(2) NOT NULL REFERENCES snow_dim_atc_level1(atc_level1_id),
    therapeutic_subgroup VARCHAR(200) NOT NULL
);

CREATE TABLE IF NOT EXISTS snow_dim_atc_level3 (
    atc_level3_id VARCHAR(8) PRIMARY KEY, -- e.g. 'J01C'
    atc_level2_id VARCHAR(5) NOT NULL REFERENCES snow_dim_atc_level2(atc_level2_id),
    pharmacological_subgroup VARCHAR(200) NOT NULL
);

CREATE TABLE IF NOT EXISTS snow_dim_atc_level4 (
    atc_level4_id VARCHAR(12) PRIMARY KEY, -- e.g. 'J01CA'
    atc_level3_id VARCHAR(8) NOT NULL REFERENCES snow_dim_atc_level3(atc_level3_id),
    chemical_subgroup VARCHAR(200) NOT NULL
);

CREATE TABLE IF NOT EXISTS snow_dim_medicine (
    medicine_key SERIAL PRIMARY KEY,
    medicine_id UUID NOT NULL,
    atc_level4_id VARCHAR(12) REFERENCES snow_dim_atc_level4(atc_level4_id),
    name VARCHAR(240) NOT NULL,
    generic_name VARCHAR(240) NOT NULL,
    strength VARCHAR(100),
    dosage_form VARCHAR(100),
    manufacturer VARCHAR(240),
    default_price NUMERIC(12,2),
    cluster_group INTEGER DEFAULT 0,
    is_current BOOLEAN DEFAULT TRUE
);

-- Normalized Date Hierarchy
CREATE TABLE IF NOT EXISTS snow_dim_year (
    year_id INTEGER PRIMARY KEY,
    year_label VARCHAR(10) NOT NULL
);

CREATE TABLE IF NOT EXISTS snow_dim_quarter (
    quarter_id INTEGER PRIMARY KEY, -- e.g. 20261 for 2026 Q1
    year_id INTEGER NOT NULL REFERENCES snow_dim_year(year_id),
    quarter_number INTEGER NOT NULL,
    quarter_label VARCHAR(10) NOT NULL
);

CREATE TABLE IF NOT EXISTS snow_dim_month (
    month_id INTEGER PRIMARY KEY, -- e.g. 202611
    quarter_id INTEGER NOT NULL REFERENCES snow_dim_quarter(quarter_id),
    month_number INTEGER NOT NULL,
    month_name VARCHAR(20) NOT NULL
);

CREATE TABLE IF NOT EXISTS snow_dim_day (
    date_key INTEGER PRIMARY KEY, -- e.g. 20261102
    month_id INTEGER NOT NULL REFERENCES snow_dim_month(month_id),
    day_number INTEGER NOT NULL,
    full_date DATE NOT NULL UNIQUE,
    day_name VARCHAR(20) NOT NULL,
    is_weekend BOOLEAN NOT NULL
);

-- ============================================================================
-- 5. ETL PIPELINE AUDIT LOG & QUALITY TRACKING
-- ============================================================================
CREATE TABLE IF NOT EXISTS etl_runs (
    run_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pipeline_name VARCHAR(120) NOT NULL,
    status VARCHAR(40) NOT NULL DEFAULT 'RUNNING',
    rows_extracted INTEGER DEFAULT 0,
    rows_transformed INTEGER DEFAULT 0,
    rows_loaded INTEGER DEFAULT 0,
    rows_rejected INTEGER DEFAULT 0,
    quality_checks_passed INTEGER DEFAULT 0,
    quality_checks_failed INTEGER DEFAULT 0,
    error_summary TEXT,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS etl_watermarks (
    table_name VARCHAR(120) PRIMARY KEY,
    last_watermark_at TIMESTAMPTZ NOT NULL DEFAULT '1970-01-01 00:00:00+00',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 6. INDEXES FOR OLAP & QUERY OPTIMIZATION
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_inventory_pharm_med ON inventory (pharmacy_id, medicine_id);
CREATE INDEX IF NOT EXISTS idx_inventory_expiry ON inventory (expiry_date);
CREATE INDEX IF NOT EXISTS idx_sales_pharm_date ON sales (pharmacy_id, sold_at);
CREATE INDEX IF NOT EXISTS idx_sales_med_date ON sales (medicine_id, sold_at);
CREATE INDEX IF NOT EXISTS idx_deliveries_supp_status ON deliveries (supplier_id, status);
CREATE INDEX IF NOT EXISTS idx_confirm_pharm_status ON confirmation_requests (pharmacy_id, status);

CREATE INDEX IF NOT EXISTS idx_star_sales_date ON star_fact_daily_sales (date_key);
CREATE INDEX IF NOT EXISTS idx_star_sales_pharm ON star_fact_daily_sales (pharmacy_key);
CREATE INDEX IF NOT EXISTS idx_star_sales_med ON star_fact_daily_sales (medicine_key);
CREATE INDEX IF NOT EXISTS idx_star_deliveries_supp ON star_fact_deliveries (supplier_key);
CREATE INDEX IF NOT EXISTS idx_star_stockouts_date ON star_fact_stockouts (date_key);

-- ============================================================================
-- 7. ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================
ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE confirmation_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Helper function: get the authenticated user's pharmacy_id
CREATE OR REPLACE FUNCTION get_auth_user_pharmacy_id()
RETURNS UUID
LANGUAGE sql
STABLE
AS $$
    SELECT pharmacy_id
    FROM pharmacy_members
    WHERE user_id = auth.uid()
    LIMIT 1;
$$;

-- Helper function: check if user is health official or platform admin
CREATE OR REPLACE FUNCTION is_health_official_or_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
    SELECT EXISTS (
        SELECT 1 FROM users
        WHERE id = auth.uid()
          AND role IN ('health_official', 'pharmacy_admin')
    );
$$;

-- RLS: Inventory policy - pharmacy staff can only manage their pharmacy's stock;
-- Health officials and patients can view available non-expired stock.
DROP POLICY IF EXISTS p_inventory_select ON inventory;
CREATE POLICY p_inventory_select ON inventory FOR SELECT USING (
    pharmacy_id = get_auth_user_pharmacy_id()
    OR is_health_official_or_admin()
    OR (quantity > 0 AND expiry_date >= CURRENT_DATE)
);

DROP POLICY IF EXISTS p_inventory_modify ON inventory;
CREATE POLICY p_inventory_modify ON inventory FOR ALL USING (
    pharmacy_id = get_auth_user_pharmacy_id()
);

-- RLS: Sales policy - pharmacy can only insert/view its own sales
DROP POLICY IF EXISTS p_sales_pharmacy ON sales;
CREATE POLICY p_sales_pharmacy ON sales FOR ALL USING (
    pharmacy_id = get_auth_user_pharmacy_id()
    OR is_health_official_or_admin()
);
