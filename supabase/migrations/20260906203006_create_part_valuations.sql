/*
# Part valuation overrides table

Stores manual price overrides and notes for individual parts, keyed by
the same deterministic part_id used in part_statuses.

## 1. New Table
### part_valuations
- part_id (text, PK) — deterministic ID like `{vehicleId}-p1`
- vehicle_id (uuid, FK to vehicles ON DELETE CASCADE)
- adjusted_value (numeric, nullable) — null means use auto-calculated asking price
- notes (text) — user notes about the adjustment
- updated_at (timestamptz)

## 2. Security
- RLS enabled, anon + authenticated full CRUD (single-tenant, no auth).
*/

CREATE TABLE IF NOT EXISTS part_valuations (
  part_id text PRIMARY KEY,
  vehicle_id uuid NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  adjusted_value numeric,
  notes text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE part_valuations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_part_valuations" ON part_valuations;
CREATE POLICY "anon_select_part_valuations" ON part_valuations FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_part_valuations" ON part_valuations;
CREATE POLICY "anon_insert_part_valuations" ON part_valuations FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_part_valuations" ON part_valuations;
CREATE POLICY "anon_update_part_valuations" ON part_valuations FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_part_valuations" ON part_valuations;
CREATE POLICY "anon_delete_part_valuations" ON part_valuations FOR DELETE
  TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_part_valuations_vehicle ON part_valuations (vehicle_id);
