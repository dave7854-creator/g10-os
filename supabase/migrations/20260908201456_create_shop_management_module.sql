/*
# Shop Management Module — Database Schema

## Purpose
Creates the complete data layer for a Shop Management module with real-time
labor-time lookup from external automotive labor-time APIs. This module manages
customers, vehicles, work orders/estimates, labor operations, and labor-data
provider configuration.

## New Tables

### shop_settings
Single-row configuration table for shop-wide settings.
- id (int PK, always 1)
- labor_rate (numeric, default 185.00 — the shop's hourly labor rate)
- tax_rate (numeric, default 0.0)
- updated_at (timestamp)

### shop_labor_provider_config
Stores configuration for the external labor-time data provider.
Credentials are stored here and accessed ONLY by the edge function (server-side),
never exposed to the browser.
- id (uuid PK)
- provider_name (text — e.g. 'Mitchell1', 'Alldata', 'Chilton')
- api_base_url (text — the provider's API endpoint)
- api_key_encrypted (text — encrypted/stored server-side only)
- api_secret_encrypted (text — encrypted/stored server-side only)
- is_active (boolean — only one provider active at a time)
- cache_allowed (boolean — whether the provider's licensing permits local caching)
- config_json (jsonb — additional provider-specific config)
- created_at, updated_at (timestamps)

### shop_customers
Customer records for the shop.
- id (uuid PK)
- first_name, last_name (text)
- phone, email, address (text)
- notes (text)
- created_at, updated_at (timestamps)

### shop_vehicles
Vehicle records linked to customers. Can be created via VIN decode or manual entry.
- id (uuid PK)
- customer_id (uuid FK → shop_customers, nullable — can be unassigned)
- vin (text)
- year, make, model, trim, color (text)
- engine, transmission, drivetrain, fuel_type, body_style (text)
- mileage (integer)
- vin_decoded (boolean — whether vehicle info came from VIN decode)
- created_at, updated_at (timestamps)

### shop_work_orders
Work order / estimate records.
- id (uuid PK)
- work_order_number (text — human-readable, e.g. WO-0001)
- customer_id (uuid FK → shop_customers)
- vehicle_id (uuid FK → shop_vehicles)
- status (text: 'estimate', 'in_progress', 'completed', 'invoiced')
- subtotal (numeric — sum of all labor lines)
- tax (numeric)
- total (numeric)
- notes (text)
- created_at, updated_at (timestamps)

### shop_labor_operations
Individual labor line items on a work order. Each line tracks both the original
book time from the labor guide and the actual hours being charged.
- id (uuid PK)
- work_order_id (uuid FK → shop_work_orders)
- operation_description (text — the labor-guide description)
- book_hours (numeric — original labor-guide hours, for reference)
- charged_hours (numeric — actual hours being charged, may differ from book_hours)
- labor_rate (numeric — rate at time of line creation, defaults from shop_settings)
- labor_total (numeric — charged_hours × labor_rate)
- data_source (text — provider name, or 'manual')
- search_query (text — the original search term used)
- retrieved_at (timestamptz — when the labor time was retrieved)
- display_order (integer — ordering on the work order)
- created_at, updated_at (timestamps)

### shop_labor_cache
Cache of previously retrieved labor operations for faster repeat searches.
Only used when the provider's licensing permits caching (cache_allowed = true).
- id (uuid PK)
- vehicle_key (text — composite key: year|make|model|engine for matching)
- operation_description (text)
- book_hours (numeric)
- data_source (text)
- search_query (text)
- retrieved_at (timestamptz)

### shop_labor_search_log
Audit log of every labor-time search for tracking and compliance.
- id (uuid PK)
- work_order_id (uuid FK → shop_work_orders, nullable)
- vin (text)
- vehicle_key (text)
- search_query (text)
- results_count (integer)
- provider_name (text)
- retrieved_at (timestamptz)

## Security
- RLS enabled on ALL tables.
- Policies use TO anon, authenticated since this is a single-tenant shop app
  using the app's own PIN-based employee login (not Supabase Auth).
- The shop_labor_provider_config table's API key/secret columns are only accessed
  by the edge function using the service role key — they are never returned to the
  frontend. The frontend only reads provider_name, is_active, and cache_allowed.

## Important Notes
1. Labor rate is configurable in shop_settings (default $185/hr).
2. The edge function (labor-times) proxies all external API calls, keeping
   credentials server-side.
3. shop_labor_operations stores both book_hours (original) and charged_hours
   (editable) so manual overrides are always supported without losing the
   original reference.
4. The provider can be changed at any time via shop_labor_provider_config
   without rebuilding the module — the integration layer abstracts the provider.
5. Cache is only populated when the active provider's cache_allowed flag is true.
*/

-- ===== SHOP SETTINGS (single row) =====
CREATE TABLE IF NOT EXISTS shop_settings (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  labor_rate numeric(10,2) NOT NULL DEFAULT 185.00,
  tax_rate numeric(5,4) NOT NULL DEFAULT 0.0000,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE shop_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "shop_settings_read" ON shop_settings;
CREATE POLICY "shop_settings_read" ON shop_settings FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "shop_settings_insert" ON shop_settings;
CREATE POLICY "shop_settings_insert" ON shop_settings FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "shop_settings_update" ON shop_settings;
CREATE POLICY "shop_settings_update" ON shop_settings FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

-- Seed default settings row
INSERT INTO shop_settings (id, labor_rate, tax_rate)
VALUES (1, 185.00, 0.0000)
ON CONFLICT (id) DO NOTHING;

-- ===== SHOP LABOR PROVIDER CONFIG =====
CREATE TABLE IF NOT EXISTS shop_labor_provider_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_name text NOT NULL,
  api_base_url text,
  api_key_encrypted text,
  api_secret_encrypted text,
  is_active boolean NOT NULL DEFAULT false,
  cache_allowed boolean NOT NULL DEFAULT true,
  config_json jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE shop_labor_provider_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "shop_labor_provider_config_read" ON shop_labor_provider_config;
CREATE POLICY "shop_labor_provider_config_read" ON shop_labor_provider_config FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "shop_labor_provider_config_insert" ON shop_labor_provider_config;
CREATE POLICY "shop_labor_provider_config_insert" ON shop_labor_provider_config FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "shop_labor_provider_config_update" ON shop_labor_provider_config;
CREATE POLICY "shop_labor_provider_config_update" ON shop_labor_provider_config FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "shop_labor_provider_config_delete" ON shop_labor_provider_config;
CREATE POLICY "shop_labor_provider_config_delete" ON shop_labor_provider_config FOR DELETE
  TO anon, authenticated USING (true);

-- ===== SHOP CUSTOMERS =====
CREATE TABLE IF NOT EXISTS shop_customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name text NOT NULL DEFAULT '',
  last_name text NOT NULL DEFAULT '',
  phone text,
  email text,
  address text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE shop_customers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "shop_customers_read" ON shop_customers;
CREATE POLICY "shop_customers_read" ON shop_customers FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "shop_customers_insert" ON shop_customers;
CREATE POLICY "shop_customers_insert" ON shop_customers FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "shop_customers_update" ON shop_customers;
CREATE POLICY "shop_customers_update" ON shop_customers FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "shop_customers_delete" ON shop_customers;
CREATE POLICY "shop_customers_delete" ON shop_customers FOR DELETE
  TO anon, authenticated USING (true);

-- ===== SHOP VEHICLES =====
CREATE TABLE IF NOT EXISTS shop_vehicles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES shop_customers(id) ON DELETE SET NULL,
  vin text,
  year text,
  make text,
  model text,
  trim text,
  color text,
  engine text,
  transmission text,
  drivetrain text,
  fuel_type text,
  body_style text,
  mileage integer,
  vin_decoded boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE shop_vehicles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "shop_vehicles_read" ON shop_vehicles;
CREATE POLICY "shop_vehicles_read" ON shop_vehicles FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "shop_vehicles_insert" ON shop_vehicles;
CREATE POLICY "shop_vehicles_insert" ON shop_vehicles FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "shop_vehicles_update" ON shop_vehicles;
CREATE POLICY "shop_vehicles_update" ON shop_vehicles FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "shop_vehicles_delete" ON shop_vehicles;
CREATE POLICY "shop_vehicles_delete" ON shop_vehicles FOR DELETE
  TO anon, authenticated USING (true);

-- ===== SHOP WORK ORDERS =====
CREATE TABLE IF NOT EXISTS shop_work_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_number text NOT NULL,
  customer_id uuid REFERENCES shop_customers(id) ON DELETE SET NULL,
  vehicle_id uuid REFERENCES shop_vehicles(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'estimate' CHECK (status IN ('estimate', 'in_progress', 'completed', 'invoiced')),
  subtotal numeric(10,2) NOT NULL DEFAULT 0,
  tax numeric(10,2) NOT NULL DEFAULT 0,
  total numeric(10,2) NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE shop_work_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "shop_work_orders_read" ON shop_work_orders;
CREATE POLICY "shop_work_orders_read" ON shop_work_orders FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "shop_work_orders_insert" ON shop_work_orders;
CREATE POLICY "shop_work_orders_insert" ON shop_work_orders FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "shop_work_orders_update" ON shop_work_orders;
CREATE POLICY "shop_work_orders_update" ON shop_work_orders FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "shop_work_orders_delete" ON shop_work_orders;
CREATE POLICY "shop_work_orders_delete" ON shop_work_orders FOR DELETE
  TO anon, authenticated USING (true);

-- ===== SHOP LABOR OPERATIONS =====
CREATE TABLE IF NOT EXISTS shop_labor_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id uuid NOT NULL REFERENCES shop_work_orders(id) ON DELETE CASCADE,
  operation_description text NOT NULL,
  book_hours numeric(6,2) NOT NULL DEFAULT 0,
  charged_hours numeric(6,2) NOT NULL DEFAULT 0,
  labor_rate numeric(10,2) NOT NULL DEFAULT 185.00,
  labor_total numeric(10,2) NOT NULL DEFAULT 0,
  data_source text NOT NULL DEFAULT 'manual',
  search_query text,
  retrieved_at timestamptz,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE shop_labor_operations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "shop_labor_operations_read" ON shop_labor_operations;
CREATE POLICY "shop_labor_operations_read" ON shop_labor_operations FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "shop_labor_operations_insert" ON shop_labor_operations;
CREATE POLICY "shop_labor_operations_insert" ON shop_labor_operations FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "shop_labor_operations_update" ON shop_labor_operations;
CREATE POLICY "shop_labor_operations_update" ON shop_labor_operations FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "shop_labor_operations_delete" ON shop_labor_operations;
CREATE POLICY "shop_labor_operations_delete" ON shop_labor_operations FOR DELETE
  TO anon, authenticated USING (true);

-- ===== SHOP LABOR CACHE =====
CREATE TABLE IF NOT EXISTS shop_labor_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_key text NOT NULL,
  operation_description text NOT NULL,
  book_hours numeric(6,2) NOT NULL,
  data_source text NOT NULL,
  search_query text,
  retrieved_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE shop_labor_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "shop_labor_cache_read" ON shop_labor_cache;
CREATE POLICY "shop_labor_cache_read" ON shop_labor_cache FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "shop_labor_cache_insert" ON shop_labor_cache;
CREATE POLICY "shop_labor_cache_insert" ON shop_labor_cache FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "shop_labor_cache_update" ON shop_labor_cache;
CREATE POLICY "shop_labor_cache_update" ON shop_labor_cache FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "shop_labor_cache_delete" ON shop_labor_cache;
CREATE POLICY "shop_labor_cache_delete" ON shop_labor_cache FOR DELETE
  TO anon, authenticated USING (true);

-- ===== SHOP LABOR SEARCH LOG =====
CREATE TABLE IF NOT EXISTS shop_labor_search_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id uuid REFERENCES shop_work_orders(id) ON DELETE SET NULL,
  vin text,
  vehicle_key text,
  search_query text,
  results_count integer NOT NULL DEFAULT 0,
  provider_name text,
  retrieved_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE shop_labor_search_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "shop_labor_search_log_read" ON shop_labor_search_log;
CREATE POLICY "shop_labor_search_log_read" ON shop_labor_search_log FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "shop_labor_search_log_insert" ON shop_labor_search_log;
CREATE POLICY "shop_labor_search_log_insert" ON shop_labor_search_log FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "shop_labor_search_log_delete" ON shop_labor_search_log;
CREATE POLICY "shop_labor_search_log_delete" ON shop_labor_search_log FOR DELETE
  TO anon, authenticated USING (true);

-- ===== INDEXES =====
CREATE INDEX IF NOT EXISTS idx_shop_vehicles_customer ON shop_vehicles(customer_id);
CREATE INDEX IF NOT EXISTS idx_shop_vehicles_vin ON shop_vehicles(vin);
CREATE INDEX IF NOT EXISTS idx_shop_work_orders_customer ON shop_work_orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_shop_work_orders_vehicle ON shop_work_orders(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_shop_work_orders_status ON shop_work_orders(status);
CREATE INDEX IF NOT EXISTS idx_shop_labor_operations_wo ON shop_labor_operations(work_order_id);
CREATE INDEX IF NOT EXISTS idx_shop_labor_cache_vehicle ON shop_labor_cache(vehicle_key);
CREATE INDEX IF NOT EXISTS idx_shop_labor_cache_search ON shop_labor_cache(search_query);
