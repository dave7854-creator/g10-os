/*
# Create part_statuses table

This migration creates a table to persist the status of each part in a vehicle's
dismantle plan. Part IDs are generated deterministically (e.g. `{vehicleId}-p1`)
so the same part can be tracked across reloads without a separate parts table.

## 1. New Table
### part_statuses
- part_id (text, primary key) — deterministic ID like `{vehicleId}-p1`
- vehicle_id (uuid, FK to vehicles) — which vehicle this part belongs to
- status (text) — one of: available, removed, cleaned, tested, listed, sold, scrapped
- updated_at (timestptz) — last status change

## 2. Security
- RLS enabled, anon + authenticated full CRUD (single-tenant, no auth, shared data).
*/

CREATE TABLE IF NOT EXISTS part_statuses (
  part_id text PRIMARY KEY,
  vehicle_id uuid NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'available',
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE part_statuses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_part_statuses" ON part_statuses;
CREATE POLICY "anon_select_part_statuses" ON part_statuses FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_part_statuses" ON part_statuses;
CREATE POLICY "anon_insert_part_statuses" ON part_statuses FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_part_statuses" ON part_statuses;
CREATE POLICY "anon_update_part_statuses" ON part_statuses FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_part_statuses" ON part_statuses;
CREATE POLICY "anon_delete_part_statuses" ON part_statuses FOR DELETE
  TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_part_statuses_vehicle_id ON part_statuses (vehicle_id);
CREATE INDEX IF NOT EXISTS idx_part_statuses_status ON part_statuses (status);
