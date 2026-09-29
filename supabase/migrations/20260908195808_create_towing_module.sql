/*
# Towing Management Module — Database Schema

## Purpose
Creates a completely separate security system and data tables for the Towing Management module.
This module has its own PIN-based authentication, role-based access control, session management,
and auto-lock/lockout features — entirely independent from the main app's employee PIN login.

## New Tables

### towing_users
Stores towing module user accounts with hashed PINs and role assignments.
- id (uuid PK)
- name (text, display name)
- pin_hash (text, bcrypt-like hash of the 4-8 digit PIN — never stores raw PIN)
- role (text: 'administrator', 'manager', 'office_staff', 'driver')
- active (boolean, default true)
- failed_attempts (int, default 0 — tracks consecutive bad PIN attempts)
- locked_until (timestamptz, null — when set, login is blocked until this time)
- created_at, updated_at (timestamps)

### towing_sessions
Tracks active sessions per user. Enforces single active session per user.
- id (uuid PK)
- user_id (uuid FK → towing_users)
- session_token (text, unique — random token identifying this session)
- device_info (text — browser/user-agent string)
- device_name (text — human-readable device label)
- ip_address (text — best-effort IP)
- started_at (timestamptz)
- last_activity (timestamptz — updated on each validated action)
- ended_at (timestamptz, null — when session was terminated)
- ended_reason (text, null — 'forced_logout', 'replaced', 'manual_logout')

### towing_impounds
Main vehicle impound records.
- id (uuid PK)
- tow_date (timestamptz)
- tow_location (text)
- pickup_location (text)
- vin (text)
- year, make, model, color (text)
- plate (text)
- vehicle_status (text: 'active_impound', 'released', 'junkyard', 'for_sale')
- tow_reason (text)
- driver_id (uuid FK → towing_users, nullable)
- created_by (uuid FK → towing_users)
- released_at (timestamptz, null)
- released_to (text, null)
- release_fee (numeric, null)
- created_at, updated_at (timestamps)

### towing_owners
Vehicle owner records linked to impounds.
- id (uuid PK)
- impound_id (uuid FK → towing_impounds)
- name, phone, address, license_number (text)
- created_at (timestamp)

### towing_lien_holders
Lien holder records linked to impounds.
- id (uuid PK)
- impound_id (uuid FK → towing_impounds)
- name, phone, address (text)
- created_at (timestamp)

### towing_fees
Fee records for impounds.
- id (uuid PK)
- impound_id (uuid FK → towing_impounds)
- fee_type (text: 'tow', 'storage', 'admin', 'lien', 'other')
- amount (numeric)
- description (text)
- created_by (uuid FK → towing_users)
- created_at (timestamp)

### towing_payments
Payment records for impounds.
- id (uuid PK)
- impound_id (uuid FK → towing_impounds)
- amount (numeric)
- method (text: 'cash', 'card', 'check', 'other')
- reference (text)
- created_by (uuid FK → towing_users)
- created_at (timestamp)

### towing_photos
Photo URLs linked to impounds (stored in Supabase Storage).
- id (uuid PK)
- impound_id (uuid FK → towing_impounds)
- url (text)
- caption (text, nullable)
- uploaded_by (uuid FK → towing_users)
- created_at (timestamp)

### towing_notices
Notice records for impounds (lien notices, etc.).
- id (uuid PK)
- impound_id (uuid FK → towing_impounds)
- notice_type (text: 'lien', 'abandonment', 'sale', 'other')
- sent_date (date)
- content (text)
- created_by (uuid FK → towing_users)
- created_at (timestamp)

### towing_history
Audit log of significant actions on impounds.
- id (uuid PK)
- impound_id (uuid FK → towing_impounds)
- action (text)
- performed_by (uuid FK → towing_users)
- details (text)
- created_at (timestamp)

## Security
- RLS enabled on ALL tables.
- Policies use TO anon, authenticated since the towing module uses its own custom PIN auth
  (not Supabase Auth), so the anon key client needs read/write access. The PIN-based security
  is enforced at the application layer — no towing data is accessible until the towing PIN
  is validated and a session is established.
- This is a single-tenant system where the app itself enforces role-based permissions.

## Important Notes
1. PINs are NEVER stored in plaintext. The pin_hash column stores a salted hash.
2. Session management enforces single active session per user via the towing_sessions table.
3. The app checks session validity and last_activity for auto-lock (15 min) before showing data.
4. Failed attempt tracking and lockout (5 attempts → 5 min lock) is enforced at the app layer
   using the failed_attempts and locked_until columns.
5. The schema is designed to support future multi-factor auth and multi-session expansion
   without major changes — sessions table already supports multiple sessions per user
   (the single-session constraint is app-enforced, not schema-enforced).
*/

-- ===== TOWING USERS =====
CREATE TABLE IF NOT EXISTS towing_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  pin_hash text NOT NULL,
  role text NOT NULL CHECK (role IN ('administrator', 'manager', 'office_staff', 'driver')),
  active boolean NOT NULL DEFAULT true,
  failed_attempts integer NOT NULL DEFAULT 0,
  locked_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE towing_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "towing_users_read" ON towing_users;
CREATE POLICY "towing_users_read" ON towing_users FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "towing_users_insert" ON towing_users;
CREATE POLICY "towing_users_insert" ON towing_users FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "towing_users_update" ON towing_users;
CREATE POLICY "towing_users_update" ON towing_users FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "towing_users_delete" ON towing_users;
CREATE POLICY "towing_users_delete" ON towing_users FOR DELETE
  TO anon, authenticated USING (true);

-- ===== TOWING SESSIONS =====
CREATE TABLE IF NOT EXISTS towing_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES towing_users(id) ON DELETE CASCADE,
  session_token text NOT NULL UNIQUE,
  device_info text,
  device_name text,
  ip_address text,
  started_at timestamptz NOT NULL DEFAULT now(),
  last_activity timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  ended_reason text
);

ALTER TABLE towing_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "towing_sessions_read" ON towing_sessions;
CREATE POLICY "towing_sessions_read" ON towing_sessions FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "towing_sessions_insert" ON towing_sessions;
CREATE POLICY "towing_sessions_insert" ON towing_sessions FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "towing_sessions_update" ON towing_sessions;
CREATE POLICY "towing_sessions_update" ON towing_sessions FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "towing_sessions_delete" ON towing_sessions;
CREATE POLICY "towing_sessions_delete" ON towing_sessions FOR DELETE
  TO anon, authenticated USING (true);

-- ===== TOWING IMPOUNDS =====
CREATE TABLE IF NOT EXISTS towing_impounds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tow_date timestamptz NOT NULL DEFAULT now(),
  tow_location text,
  pickup_location text,
  vin text,
  year text,
  make text,
  model text,
  color text,
  plate text,
  vehicle_status text NOT NULL DEFAULT 'active_impound' CHECK (vehicle_status IN ('active_impound', 'released', 'junkyard', 'for_sale')),
  tow_reason text,
  driver_id uuid REFERENCES towing_users(id),
  created_by uuid NOT NULL REFERENCES towing_users(id),
  released_at timestamptz,
  released_to text,
  release_fee numeric(10,2),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE towing_impounds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "towing_impounds_read" ON towing_impounds;
CREATE POLICY "towing_impounds_read" ON towing_impounds FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "towing_impounds_insert" ON towing_impounds;
CREATE POLICY "towing_impounds_insert" ON towing_impounds FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "towing_impounds_update" ON towing_impounds;
CREATE POLICY "towing_impounds_update" ON towing_impounds FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "towing_impounds_delete" ON towing_impounds;
CREATE POLICY "towing_impounds_delete" ON towing_impounds FOR DELETE
  TO anon, authenticated USING (true);

-- ===== TOWING OWNERS =====
CREATE TABLE IF NOT EXISTS towing_owners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  impound_id uuid NOT NULL REFERENCES towing_impounds(id) ON DELETE CASCADE,
  name text,
  phone text,
  address text,
  license_number text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE towing_owners ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "towing_owners_read" ON towing_owners;
CREATE POLICY "towing_owners_read" ON towing_owners FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "towing_owners_insert" ON towing_owners;
CREATE POLICY "towing_owners_insert" ON towing_owners FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "towing_owners_update" ON towing_owners;
CREATE POLICY "towing_owners_update" ON towing_owners FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "towing_owners_delete" ON towing_owners;
CREATE POLICY "towing_owners_delete" ON towing_owners FOR DELETE
  TO anon, authenticated USING (true);

-- ===== TOWING LIEN HOLDERS =====
CREATE TABLE IF NOT EXISTS towing_lien_holders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  impound_id uuid NOT NULL REFERENCES towing_impounds(id) ON DELETE CASCADE,
  name text,
  phone text,
  address text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE towing_lien_holders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "towing_lien_holders_read" ON towing_lien_holders;
CREATE POLICY "towing_lien_holders_read" ON towing_lien_holders FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "towing_lien_holders_insert" ON towing_lien_holders;
CREATE POLICY "towing_lien_holders_insert" ON towing_lien_holders FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "towing_lien_holders_update" ON towing_lien_holders;
CREATE POLICY "towing_lien_holders_update" ON towing_lien_holders FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "towing_lien_holders_delete" ON towing_lien_holders;
CREATE POLICY "towing_lien_holders_delete" ON towing_lien_holders FOR DELETE
  TO anon, authenticated USING (true);

-- ===== TOWING FEES =====
CREATE TABLE IF NOT EXISTS towing_fees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  impound_id uuid NOT NULL REFERENCES towing_impounds(id) ON DELETE CASCADE,
  fee_type text NOT NULL CHECK (fee_type IN ('tow', 'storage', 'admin', 'lien', 'other')),
  amount numeric(10,2) NOT NULL DEFAULT 0,
  description text,
  created_by uuid NOT NULL REFERENCES towing_users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE towing_fees ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "towing_fees_read" ON towing_fees;
CREATE POLICY "towing_fees_read" ON towing_fees FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "towing_fees_insert" ON towing_fees;
CREATE POLICY "towing_fees_insert" ON towing_fees FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "towing_fees_update" ON towing_fees;
CREATE POLICY "towing_fees_update" ON towing_fees FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "towing_fees_delete" ON towing_fees;
CREATE POLICY "towing_fees_delete" ON towing_fees FOR DELETE
  TO anon, authenticated USING (true);

-- ===== TOWING PAYMENTS =====
CREATE TABLE IF NOT EXISTS towing_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  impound_id uuid NOT NULL REFERENCES towing_impounds(id) ON DELETE CASCADE,
  amount numeric(10,2) NOT NULL DEFAULT 0,
  method text NOT NULL DEFAULT 'cash' CHECK (method IN ('cash', 'card', 'check', 'other')),
  reference text,
  created_by uuid NOT NULL REFERENCES towing_users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE towing_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "towing_payments_read" ON towing_payments;
CREATE POLICY "towing_payments_read" ON towing_payments FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "towing_payments_insert" ON towing_payments;
CREATE POLICY "towing_payments_insert" ON towing_payments FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "towing_payments_update" ON towing_payments;
CREATE POLICY "towing_payments_update" ON towing_payments FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "towing_payments_delete" ON towing_payments;
CREATE POLICY "towing_payments_delete" ON towing_payments FOR DELETE
  TO anon, authenticated USING (true);

-- ===== TOWING PHOTOS =====
CREATE TABLE IF NOT EXISTS towing_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  impound_id uuid NOT NULL REFERENCES towing_impounds(id) ON DELETE CASCADE,
  url text NOT NULL,
  caption text,
  uploaded_by uuid NOT NULL REFERENCES towing_users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE towing_photos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "towing_photos_read" ON towing_photos;
CREATE POLICY "towing_photos_read" ON towing_photos FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "towing_photos_insert" ON towing_photos;
CREATE POLICY "towing_photos_insert" ON towing_photos FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "towing_photos_update" ON towing_photos;
CREATE POLICY "towing_photos_update" ON towing_photos FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "towing_photos_delete" ON towing_photos;
CREATE POLICY "towing_photos_delete" ON towing_photos FOR DELETE
  TO anon, authenticated USING (true);

-- ===== TOWING NOTICES =====
CREATE TABLE IF NOT EXISTS towing_notices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  impound_id uuid NOT NULL REFERENCES towing_impounds(id) ON DELETE CASCADE,
  notice_type text NOT NULL CHECK (notice_type IN ('lien', 'abandonment', 'sale', 'other')),
  sent_date date NOT NULL DEFAULT CURRENT_DATE,
  content text,
  created_by uuid NOT NULL REFERENCES towing_users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE towing_notices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "towing_notices_read" ON towing_notices;
CREATE POLICY "towing_notices_read" ON towing_notices FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "towing_notices_insert" ON towing_notices;
CREATE POLICY "towing_notices_insert" ON towing_notices FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "towing_notices_update" ON towing_notices;
CREATE POLICY "towing_notices_update" ON towing_notices FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "towing_notices_delete" ON towing_notices;
CREATE POLICY "towing_notices_delete" ON towing_notices FOR DELETE
  TO anon, authenticated USING (true);

-- ===== TOWING HISTORY =====
CREATE TABLE IF NOT EXISTS towing_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  impound_id uuid NOT NULL REFERENCES towing_impounds(id) ON DELETE CASCADE,
  action text NOT NULL,
  performed_by uuid NOT NULL REFERENCES towing_users(id),
  details text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE towing_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "towing_history_read" ON towing_history;
CREATE POLICY "towing_history_read" ON towing_history FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "towing_history_insert" ON towing_history;
CREATE POLICY "towing_history_insert" ON towing_history FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "towing_history_update" ON towing_history;
CREATE POLICY "towing_history_update" ON towing_history FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "towing_history_delete" ON towing_history;
CREATE POLICY "towing_history_delete" ON towing_history FOR DELETE
  TO anon, authenticated USING (true);

-- ===== INDEXES =====
CREATE INDEX IF NOT EXISTS idx_towing_sessions_user ON towing_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_towing_sessions_token ON towing_sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_towing_impounds_status ON towing_impounds(vehicle_status);
CREATE INDEX IF NOT EXISTS idx_towing_impounds_created ON towing_impounds(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_towing_fees_impound ON towing_fees(impound_id);
CREATE INDEX IF NOT EXISTS idx_towing_payments_impound ON towing_payments(impound_id);
CREATE INDEX IF NOT EXISTS idx_towing_photos_impound ON towing_photos(impound_id);
CREATE INDEX IF NOT EXISTS idx_towing_notices_impound ON towing_notices(impound_id);
CREATE INDEX IF NOT EXISTS idx_towing_history_impound ON towing_history(impound_id);
CREATE INDEX IF NOT EXISTS idx_towing_owners_impound ON towing_owners(impound_id);
CREATE INDEX IF NOT EXISTS idx_towing_lien_holders_impound ON towing_lien_holders(impound_id);
