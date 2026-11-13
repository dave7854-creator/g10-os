-- Apply in Supabase SQL editor before deploying the frontend changes.
-- Location is captured only on explicit clock-in / clock-out, never continuously.
alter table public.time_clocks
  add column if not exists clock_in_latitude double precision,
  add column if not exists clock_in_longitude double precision,
  add column if not exists clock_in_accuracy_m double precision,
  add column if not exists clock_in_location_status text,
  add column if not exists clock_out_latitude double precision,
  add column if not exists clock_out_longitude double precision,
  add column if not exists clock_out_accuracy_m double precision,
  add column if not exists clock_out_location_status text;
-- IMPORTANT: GPS fields are sensitive employee data.
-- Verify RLS policies restrict read access to the employee and authorized managers,
-- and restrict clock updates to authorized users, before enabling in production.
