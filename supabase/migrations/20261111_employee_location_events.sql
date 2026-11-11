-- Run in Supabase SQL editor before deploying the GPS-enabled app.
-- IMPORTANT: Current G10 OS employee PIN authentication is implemented in the browser.
-- Do not enable broad anonymous SELECT access to precise employee coordinates.
-- A trusted backend / Supabase Auth integration is required to securely enforce
-- employee-specific inserts and manager-only reads. Until then, RLS blocks access.
create table if not exists public.employee_location_events (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id),
  time_clock_id uuid references public.time_clocks(id),
  event_type text not null check (event_type in ('login', 'clock_in', 'clock_out')),
  latitude double precision,
  longitude double precision,
  accuracy_meters double precision,
  status text not null check (status in ('granted', 'denied', 'unavailable', 'timeout')),
  created_at timestamptz not null default now(),
  constraint coordinates_together check ((latitude is null) = (longitude is null)),
  constraint coordinate_range check (
    (latitude is null or latitude between -90 and 90)
    and (longitude is null or longitude between -180 and 180)
  )
);
create index if not exists employee_location_events_employee_created_idx
  on public.employee_location_events (employee_id, created_at desc);
alter table public.employee_location_events enable row level security;
-- No anon policies deliberately: deploy secure backend policies before activating.
