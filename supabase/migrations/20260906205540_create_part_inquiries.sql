/*
# Create part_inquiries table

1. New Tables
- `part_inquiries` — stores customer part requests submitted from the public "Find a Part" web app.
  - id (uuid, primary key)
  - vin (text, nullable — optional VIN)
  - year (int, nullable — used when no VIN)
  - make (text, nullable)
  - model (text, nullable)
  - part_needed (text, not null — the part the customer is looking for)
  - part_preference (text — 'oem' or 'aftermarket' or 'either')
  - condition_preference (text — 'new' or 'used' or 'either')
  - customer_name (text, not null)
  - phone (text, not null)
  - email (text, nullable — optional)
  - city (text, not null)
  - state (text, not null)
  - notes (text, nullable — additional details)
  - status (text, not null, default 'new' — visible inside G10OS)
  - created_at (timestamptz, default now())

2. Security
- Enable RLS on `part_inquiries`.
- Allow anon + authenticated INSERT (public form has no login).
- Allow anon + authenticated SELECT/UPDATE/DELETE so G10OS (anon key) can manage inquiries.
- This is intentionally public/shared data — no user_id or ownership scoping.

3. Important Notes
- This table is shared between two apps: the public "Find a Part" form (insert only) and G10OS (full CRUD to manage inquiries).
- Both apps use the anon key, so all policies list `anon, authenticated`.
*/

CREATE TABLE IF NOT EXISTS part_inquiries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vin text,
  year integer,
  make text,
  model text,
  part_needed text NOT NULL,
  part_preference text NOT NULL DEFAULT 'either',
  condition_preference text NOT NULL DEFAULT 'either',
  customer_name text NOT NULL,
  phone text NOT NULL,
  email text,
  city text NOT NULL,
  state text NOT NULL,
  notes text,
  status text NOT NULL DEFAULT 'new',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE part_inquiries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_inquiries" ON part_inquiries;
CREATE POLICY "anon_select_inquiries"
ON part_inquiries FOR SELECT
TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_inquiries" ON part_inquiries;
CREATE POLICY "anon_insert_inquiries"
ON part_inquiries FOR INSERT
TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_inquiries" ON part_inquiries;
CREATE POLICY "anon_update_inquiries"
ON part_inquiries FOR UPDATE
TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_inquiries" ON part_inquiries;
CREATE POLICY "anon_delete_inquiries"
ON part_inquiries FOR DELETE
TO anon, authenticated USING (true);
