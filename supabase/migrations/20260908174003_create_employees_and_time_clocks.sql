/*
# Create employees and time_clocks tables

1. New Tables
- `employees` — staff members who can clock in and out.
  - id (uuid, primary key)
  - name (text, not null) — employee full name
  - pin_code (text, not null) — simple 4-digit PIN for clocking in/out
  - role (text, default 'employee') — 'employee' or 'manager'
  - active (boolean, default true) — inactive employees hidden from clock-in
  - created_at (timestamptz, default now())

- `time_clocks` — individual clock in/out events.
  - id (uuid, primary key)
  - employee_id (uuid, references employees, cascade delete)
  - clock_in (timestamptz, not null) — when the employee clocked in
  - clock_out (timestamptz, nullable) — when the employee clocked out (null = still clocked in)
  - created_at (timestamptz, default now())

2. Security
- Enable RLS on both tables.
- Allow anon + authenticated full CRUD (single-tenant app, no login required).
- All data is intentionally shared/public within the organization.

3. Important Notes
- This is a no-auth app, so policies use `TO anon, authenticated` with `USING (true)`.
- Weekly totals are computed client-side: Monday 00:00 to Sunday 23:59:59.
- Employees clock in/out using a PIN code to identify themselves.
*/