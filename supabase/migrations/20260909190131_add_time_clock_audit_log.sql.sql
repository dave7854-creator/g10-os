/*
# Add time clock audit log and manager edit tracking

1. New Tables
- `time_clock_audit_log`
  - `id` (uuid, primary key)
  - `time_clock_id` (uuid, references time_clocks — what was changed)
  - `action` (text: 'created', 'updated', 'deleted')
  - `old_clock_in` (timestamptz, nullable — original value before edit)
  - `old_clock_out` (timestamptz, nullable — original value before edit)
  - `new_clock_in` (timestamptz, nullable — new value after edit)
  - `new_clock_out` (timestamptz, nullable — new value after edit)
  - `changed_by` (uuid, nullable — employee ID of the manager who made the change)
  - `changed_by_name` (text, nullable — manager name at time of change, for display)
  - `reason` (text, nullable — optional note from manager about why the change was made)
  - `created_at` (timestamptz, default now())

2. Modified Tables
- `time_clocks`
  - `edited_by` (uuid, nullable — employee ID of last manager to edit this entry)
  - `edited_at` (timestamptz, nullable — when the entry was last edited by a manager)

3. Security
- Enable RLS on `time_clock_audit_log`.
- Allow anon + authenticated full CRUD (single-tenant app, shared data, no sign-in screen for the DB layer).
- The audit log is only written from manager actions in the app UI.

4. Important Notes
- The audit log captures BEFORE and AFTER values so you can see exactly what changed.
- `changed_by_name` is stored at edit time so the audit trail remains readable even if the manager is later deleted.
- The 70-hour-per-day bug is caused by open clock entries (null clock_out) being calculated with Date.now(). The fix is in the application layer: prevent duplicate clock-ins and cap open entries at the current time, not end-of-day.
*/