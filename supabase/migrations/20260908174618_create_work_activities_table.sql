/*
# Create work_activities table for tracking employee work

1. New Tables
- `work_activities` — log of tasks/work performed by employees during shifts.
  - id (uuid, primary key)
  - employee_id (uuid, references employees, cascade delete)
  - description (text, not null) — what the employee worked on
  - clock_id (uuid, nullable, references time_clocks) — optional link to the clock entry it happened during
  - created_at (timestamptz, default now())

2. Security
- Enable RLS on work_activities.
- Allow anon + authenticated full CRUD (single-tenant app, no login required).
*/

CREATE TABLE IF NOT EXISTS work_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  description text NOT NULL,
  clock_id uuid REFERENCES time_clocks(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE work_activities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_work_activities" ON work_activities;
CREATE POLICY "anon_select_work_activities"
ON work_activities FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_work_activities" ON work_activities;
CREATE POLICY "anon_insert_work_activities"
ON work_activities FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_work_activities" ON work_activities;
CREATE POLICY "anon_update_work_activities"
ON work_activities FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_work_activities" ON work_activities;
CREATE POLICY "anon_delete_work_activities"
ON work_activities FOR DELETE TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_work_activities_employee ON work_activities(employee_id);
CREATE INDEX IF NOT EXISTS idx_work_activities_created ON work_activities(created_at);