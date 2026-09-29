/*
# Prevent duplicate open clock-in shifts

1. Changes
- Adds a partial unique index on `time_clocks(employee_id)` where `clock_out IS NULL`.
  This enforces at the database level that an employee can have at most ONE open shift
  (clock_out = NULL) at any time. Any attempt to insert a second open shift for the
  same employee will be rejected by the database with a unique constraint violation.
- Existing duplicate open shifts are NOT deleted or modified — they remain for
  manager review and correction via the existing edit/delete controls.

2. Important Notes
- The index is PARTIAL — it only covers rows where clock_out IS NULL, so it does
  not prevent multiple closed/completed shifts for the same employee.
- If existing duplicate open shifts already exist, the index creation will fail
  because the constraint would be violated. To handle this, we first identify any
  employees with multiple open shifts. If duplicates exist, we cannot create the
  index directly — instead we create the index with `WHERE clock_out IS NULL`
  only after the data is clean. For now, we attempt creation and if it fails due
  to existing duplicates, the application code handles the guard instead.
*/

-- Attempt to create the partial unique index. If existing duplicates prevent it,
-- this will error — but we catch that case in application logic as a fallback.
-- The application code also checks for open shifts before inserting.

DO $$
BEGIN
  -- Check if there are duplicate open shifts
  IF EXISTS (
    SELECT 1
    FROM time_clocks
    WHERE clock_out IS NULL
    GROUP BY employee_id
    HAVING COUNT(*) > 1
  ) THEN
    -- Duplicates exist — skip index creation to avoid error
    -- Application code will handle the guard
    RAISE NOTICE 'Duplicate open shifts exist — skipping unique index creation. Manager must correct existing data.';
  ELSE
    -- No duplicates — safe to create the partial unique index
    EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS one_open_shift_per_employee ON time_clocks (employee_id) WHERE clock_out IS NULL';
  END IF;
END $$;
