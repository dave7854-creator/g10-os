CREATE TABLE IF NOT EXISTS employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  pin_code text NOT NULL,
  role text NOT NULL DEFAULT 'employee',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE employees ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_employees" ON employees;
CREATE POLICY "anon_select_employees"
ON employees FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_employees" ON employees;
CREATE POLICY "anon_insert_employees"
ON employees FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_employees" ON employees;
CREATE POLICY "anon_update_employees"
ON employees FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_employees" ON employees;
CREATE POLICY "anon_delete_employees"
ON employees FOR DELETE TO anon, authenticated USING (true);

CREATE TABLE IF NOT EXISTS time_clocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  clock_in timestamptz NOT NULL DEFAULT now(),
  clock_out timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE time_clocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_time_clocks" ON time_clocks;
CREATE POLICY "anon_select_time_clocks"
ON time_clocks FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_time_clocks" ON time_clocks;
CREATE POLICY "anon_insert_time_clocks"
ON time_clocks FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_time_clocks" ON time_clocks;
CREATE POLICY "anon_update_time_clocks"
ON time_clocks FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_time_clocks" ON time_clocks;
CREATE POLICY "anon_delete_time_clocks"
ON time_clocks FOR DELETE TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_time_clocks_employee ON time_clocks(employee_id);
CREATE INDEX IF NOT EXISTS idx_time_clocks_clock_in ON time_clocks(clock_in);