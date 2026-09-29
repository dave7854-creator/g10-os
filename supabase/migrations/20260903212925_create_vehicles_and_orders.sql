/*
# Create vehicles and orders tables for G10 OS

This migration sets up the core data model for the G10 OS dismantling intelligence app.
No authentication is used — this is a single-tenant app where all data is shared/public.

## 1. New Tables

### vehicles
Stores every vehicle intake record. Each vehicle has a unique UUID id.
- vin (text) — the VIN or 'MANUAL-ENTRY' for manual vehicles
- year (int) — model year
- make (text) — manufacturer
- model (text) — model name
- trim (text) — trim level
- color (text) — exterior color
- status (text) — 'in-yard', 'dismantling', or 'complete'
- location (text) — yard location
- intake_date (date) — when the vehicle was added
- estimated_value (numeric) — estimated total parts value
- mileage (int) — odometer reading
- engine (text) — engine description
- transmission (text) — transmission type
- body_style (text) — body class
- drive_type (text) — drive type
- fuel_type (text) — fuel type
- plant (text) — assembly plant
- condition (text) — vehicle condition rating
- parts_total (int) — total parts in dismantle plan
- parts_pulled (int) — parts already pulled
- data_source (text) — 'nhtsa' or 'manual' to track where specs came from
- created_at (timestamptz) — record creation time

### orders
Stores sales orders linked to vehicles by vehicle_id.
- vehicle_id (uuid, FK to vehicles) — which vehicle the part came from
- order_number (text) — eBay or platform order number
- buyer (text) — buyer username
- buyer_location (text) — buyer city/state
- part_name (text) — part sold
- sale_price (numeric) — sale amount
- shipping_cost (numeric) — shipping cost
- status (text) — 'to-ship', 'shipped', or 'delivered'
- carrier (text) — shipping carrier
- tracking_number (text) — tracking number
- order_date (date) — order date
- tote_id (text) — storage tote reference

## 2. Security
- RLS enabled on both tables.
- Policies allow anon + authenticated full CRUD (single-tenant, no auth, data is intentionally shared).
- USING (true) is acceptable here because there is no sign-in and all data is public/shared.

## 3. Indexes
- Index on vehicles.status for filtering by yard status.
- Index on orders.vehicle_id for filtering orders by vehicle.
- Index on orders.status for filtering by shipping status.
*/

CREATE TABLE IF NOT EXISTS vehicles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vin text NOT NULL DEFAULT '',
  year int NOT NULL DEFAULT 0,
  make text NOT NULL DEFAULT '',
  model text NOT NULL DEFAULT '',
  trim text NOT NULL DEFAULT '',
  color text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'in-yard',
  location text NOT NULL DEFAULT '',
  intake_date date,
  estimated_value numeric NOT NULL DEFAULT 0,
  mileage int NOT NULL DEFAULT 0,
  engine text NOT NULL DEFAULT '',
  transmission text NOT NULL DEFAULT '',
  body_style text NOT NULL DEFAULT '',
  drive_type text NOT NULL DEFAULT '',
  fuel_type text NOT NULL DEFAULT '',
  plant text NOT NULL DEFAULT '',
  condition text NOT NULL DEFAULT 'Good',
  parts_total int NOT NULL DEFAULT 0,
  parts_pulled int NOT NULL DEFAULT 0,
  data_source text NOT NULL DEFAULT 'manual',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_vehicles" ON vehicles;
CREATE POLICY "anon_select_vehicles" ON vehicles FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_vehicles" ON vehicles;
CREATE POLICY "anon_insert_vehicles" ON vehicles FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_vehicles" ON vehicles;
CREATE POLICY "anon_update_vehicles" ON vehicles FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_vehicles" ON vehicles;
CREATE POLICY "anon_delete_vehicles" ON vehicles FOR DELETE
  TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_vehicles_status ON vehicles (status);

CREATE TABLE IF NOT EXISTS orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid REFERENCES vehicles(id) ON DELETE CASCADE,
  order_number text NOT NULL DEFAULT '',
  buyer text NOT NULL DEFAULT '',
  buyer_location text NOT NULL DEFAULT '',
  part_name text NOT NULL DEFAULT '',
  sale_price numeric NOT NULL DEFAULT 0,
  shipping_cost numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'to-ship',
  carrier text NOT NULL DEFAULT '',
  tracking_number text NOT NULL DEFAULT '',
  order_date date,
  tote_id text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_orders" ON orders;
CREATE POLICY "anon_select_orders" ON orders FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_orders" ON orders;
CREATE POLICY "anon_insert_orders" ON orders FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_orders" ON orders;
CREATE POLICY "anon_update_orders" ON orders FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_orders" ON orders;
CREATE POLICY "anon_delete_orders" ON orders FOR DELETE
  TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_orders_vehicle_id ON orders (vehicle_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders (status);
