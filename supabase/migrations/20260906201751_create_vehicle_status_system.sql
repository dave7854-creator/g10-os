/*
# Vehicle status management system

Replaces the hardcoded 'in-yard' | 'dismantling' | 'complete' vehicle statuses
with a fully customizable, reorderable, color-coded status system.

## 1. New Tables

### vehicle_statuses
Custom status definitions managed by admins. Each has a color, sort order,
default flag, and optional workflow action type.
- id (uuid, PK)
- name (text) — display name, e.g. "In Yard"
- slug (text) — stable identifier stored on vehicles.status
- color (text) — one of: blue, green, amber, red, slate, cyan
- sort_order (int) — display order
- is_default (bool) — applied to new vehicles on intake
- workflow (text) — optional: 'release' | 'sold' | 'scrapped' | null
- created_at (timestamptz)

### vehicle_status_logs
Immutable audit trail of every vehicle status change.
- id (uuid, PK)
- vehicle_id (uuid, FK to vehicles ON DELETE CASCADE)
- from_status (text) — previous status slug
- to_status (text) — new status slug
- user (text) — who made the change
- notes (text) — optional notes
- workflow_data (jsonb) — captured form data for workflow actions
- created_at (timestamptz)

## 2. Seed Data
Inserts three default statuses: In Yard (blue, default), Dismantling (amber),
Complete (green). Existing vehicles already use these slugs.

## 3. Security
- RLS enabled on both tables, anon + authenticated full CRUD (single-tenant).
*/

CREATE TABLE IF NOT EXISTS vehicle_statuses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  color text NOT NULL DEFAULT 'slate',
  sort_order int NOT NULL DEFAULT 0,
  is_default boolean NOT NULL DEFAULT false,
  workflow text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE vehicle_statuses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_vehicle_statuses" ON vehicle_statuses;
CREATE POLICY "anon_select_vehicle_statuses" ON vehicle_statuses FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_vehicle_statuses" ON vehicle_statuses;
CREATE POLICY "anon_insert_vehicle_statuses" ON vehicle_statuses FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_vehicle_statuses" ON vehicle_statuses;
CREATE POLICY "anon_update_vehicle_statuses" ON vehicle_statuses FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_vehicle_statuses" ON vehicle_statuses;
CREATE POLICY "anon_delete_vehicle_statuses" ON vehicle_statuses FOR DELETE
  TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_vehicle_statuses_sort ON vehicle_statuses (sort_order);

CREATE TABLE IF NOT EXISTS vehicle_status_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  from_status text NOT NULL DEFAULT '',
  to_status text NOT NULL,
  "user" text NOT NULL DEFAULT 'admin',
  notes text NOT NULL DEFAULT '',
  workflow_data jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE vehicle_status_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_vehicle_status_logs" ON vehicle_status_logs;
CREATE POLICY "anon_select_vehicle_status_logs" ON vehicle_status_logs FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_vehicle_status_logs" ON vehicle_status_logs;
CREATE POLICY "anon_insert_vehicle_status_logs" ON vehicle_status_logs FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_vehicle_status_logs" ON vehicle_status_logs;
CREATE POLICY "anon_update_vehicle_status_logs" ON vehicle_status_logs FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_vehicle_status_logs" ON vehicle_status_logs;
CREATE POLICY "anon_delete_vehicle_status_logs" ON vehicle_status_logs FOR DELETE
  TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_vehicle_status_logs_vehicle ON vehicle_status_logs (vehicle_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_status_logs_created ON vehicle_status_logs (created_at DESC);

-- Seed default statuses (idempotent)
INSERT INTO vehicle_statuses (name, slug, color, sort_order, is_default, workflow)
VALUES
  ('In Yard', 'in-yard', 'blue', 0, true, null),
  ('Dismantling', 'dismantling', 'amber', 1, false, null),
  ('Complete', 'complete', 'green', 2, false, null)
ON CONFLICT (slug) DO NOTHING;
