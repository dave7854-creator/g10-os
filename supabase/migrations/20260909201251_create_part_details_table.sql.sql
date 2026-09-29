/*
# Create part_details table for editable part information

1. New Table
- `part_details` — stores manager-editable information about each part that is not
  captured by the in-memory generation system. Part IDs are deterministic
  (e.g. `{vehicleId}-p1`), matching the `part_statuses` table.
  Columns:
  - part_id (text, PRIMARY KEY) — deterministic part ID, same as part_statuses
  - vehicle_id (uuid, FK to vehicles ON DELETE CASCADE)
  - part_name (text) — overrides generated part name
  - category (text) — overrides generated category
  - sku (text) — stock number / SKU
  - tote_id (text) — shelf / bin / tote location
  - condition (text) — overrides generated condition
  - pulled_status (text, NOT NULL, DEFAULT 'not_pulled') — 'not_pulled' or 'pulled'
  - quantity (int, NOT NULL, DEFAULT 1) — current stock / quantity
  - pre_buyers (text) — pre-buyer notes
  - price (numeric) — overrides generated asking price
  - oem_part_number (text) — OEM part number
  - manufacturer_part_number (text) — manufacturer part number
  - interchange_number (text) — interchange number
  - notes (text) — general notes
  - side (text) — left / right / front / rear / etc.
  - color (text) — part color
  - weight_lbs (numeric) — shipping weight
  - dimensions (text) — dimensions string
  - photos (text[]) — array of photo URLs (our actual photos of the physical part)
  - created_at (timestamptz)
  - updated_at (timestamptz)

2. Modified Tables
- None. This is a new table that supplements part_statuses and part_valuations.

3. Security
- RLS enabled, anon + authenticated full CRUD (single-tenant, no auth, shared data).
- Same pattern as part_statuses.

4. Important Notes
- Part IDs are deterministic (e.g. `{vehicleId}-p1`) and shared across part_statuses,
  part_valuations, and part_details. No duplicate part records are created.
- The part_details table is optional — if no row exists for a part, the in-memory
  generated defaults are used. When a manager edits a field, a row is upserted.
- The photos column stores URLs to actual photos of the physical part (uploaded
  to the part-photos storage bucket), NOT internet/eBay stock photos.
*/
CREATE TABLE IF NOT EXISTS part_details (
  part_id text PRIMARY KEY,
  vehicle_id uuid NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  part_name text,
  category text,
  sku text,
  tote_id text,
  condition text,
  pulled_status text NOT NULL DEFAULT 'not_pulled',
  quantity int NOT NULL DEFAULT 1,
  pre_buyers text,
  price numeric,
  oem_part_number text,
  manufacturer_part_number text,
  interchange_number text,
  notes text,
  side text,
  color text,
  weight_lbs numeric,
  dimensions text,
  photos text[] DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE part_details ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_part_details" ON part_details;
CREATE POLICY "anon_select_part_details" ON part_details FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_part_details" ON part_details;
CREATE POLICY "anon_insert_part_details" ON part_details FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_part_details" ON part_details;
CREATE POLICY "anon_update_part_details" ON part_details FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_part_details" ON part_details;
CREATE POLICY "anon_delete_part_details" ON part_details FOR DELETE
  TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_part_details_vehicle_id ON part_details (vehicle_id);
CREATE INDEX IF NOT EXISTS idx_part_details_pulled_status ON part_details (pulled_status);

-- Add constraint for pulled_status values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'part_details' AND constraint_name = 'valid_pulled_status'
  ) THEN
    ALTER TABLE part_details ADD CONSTRAINT valid_pulled_status
      CHECK (pulled_status IN ('not_pulled', 'pulled'));
  END IF;
END $$;
