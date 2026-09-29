-- 1. Add manager edit tracking columns to time_clocks
ALTER TABLE time_clocks ADD COLUMN IF NOT EXISTS edited_by uuid;
ALTER TABLE time_clocks ADD COLUMN IF NOT EXISTS edited_at timestamptz;

-- 2. Drop the empty broken audit table and recreate properly
DROP TABLE IF EXISTS audit_log_entries;

-- 3. Create the time clock audit log table
CREATE TABLE IF NOT EXISTS time_clock_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  time_clock_id uuid,
  employee_id uuid,
  employee_name text,
  action text NOT NULL,
  old_clock_in timestamptz,
  old_clock_out timestamptz,
  new_clock_in timestamptz,
  new_clock_out timestamptz,
  changed_by uuid,
  changed_by_name text,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 4. Enable RLS and allow access (single-tenant app)
ALTER TABLE time_clock_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_select_audit" ON time_clock_audit_log FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "anon_insert_audit" ON time_clock_audit_log FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "anon_update_audit" ON time_clock_audit_log FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_delete_audit" ON time_clock_audit_log FOR DELETE TO anon, authenticated USING (true);
