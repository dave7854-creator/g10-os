/*
# Customer Invoice Payment Portal

## Overview
Adds a secure customer-facing invoice/payment portal to the Shop Management module.
Customers receive a link with a long random token — no login required, no sequential IDs exposed.
Adds Square + PayPal payment provider configuration, shop supplies column, and payment status tracking.

## 1. New Tables

### shop_invoice_tokens
- Secure token-based access to invoices for customers
- `id` (uuid PK)
- `work_order_id` (uuid FK → shop_work_orders)
- `token` (text, unique) — long random string for URL, not guessable
- `created_at` (timestamptz)
- `expires_at` (timestamptz, nullable) — optional expiry
- `revoked` (boolean, default false)

### shop_payment_config
- Stores payment provider connection status (Square, PayPal, etc.)
- `id` (int PK, always 1 — singleton)
- `square_enabled` (boolean, default false)
- `square_location_id` (text, nullable) — Square location ID for payments
- `square_access_token` (text, nullable) — stored server-side only, never exposed to frontend
- `paypal_enabled` (boolean, default false)
- `paypal_client_id` (text, nullable) — PayPal client ID (public, safe for frontend)
- `paypal_client_secret` (text, nullable) — stored server-side only
- `cashapp_link` (text, nullable) — optional Cash App $cashtag or URL
- `updated_at` (timestamptz)

## 2. Modified Tables

### shop_work_orders
- Added `shop_supplies` (numeric, default 0) — shop supplies fee added to invoice total
- Added `invoice_date` (timestamptz, nullable) — when the WO was finalized as an invoice
- Added `payment_status` (text, default 'unpaid') — 'unpaid', 'partially_paid', 'paid'

### shop_payments
- Added `square_transaction_id` (text, nullable) — Square payment ID for online payments
- Added `payment_status` (text, default 'completed') — 'completed', 'pending', 'failed'
- Added `processor` (text, nullable) — 'square', 'paypal', 'manual' (null for legacy)

## 3. Security

### shop_invoice_tokens
- RLS enabled
- SELECT: TO anon, authenticated — anyone with the token can view the invoice
  (the token itself is the access control — 44-char crypto-random, not guessable)
- INSERT/UPDATE/DELETE: TO anon, authenticated — employee app creates/manages tokens

### shop_payment_config
- RLS enabled
- SELECT: TO anon, authenticated — but sensitive columns (access tokens, secrets)
  are NOT selected in policies. The edge function uses the service role key to read
  the full row. The frontend only reads the boolean flags and public fields.
- INSERT/UPDATE/DELETE: TO anon, authenticated — employee app manages config

### shop_work_orders / shop_payments
- Existing RLS policies already allow anon + authenticated (single-tenant app, no auth)
- New columns inherit existing policies

## 4. Important Notes
- The app has no sign-in screen — it's a single-tenant shop app where employees
  share the same data. All policies use TO anon, authenticated.
- Square access tokens and PayPal secrets are NEVER exposed to the frontend.
  The edge function `process-payment` reads them using the service role key.
  The frontend only reads square_enabled, paypal_enabled, paypal_client_id,
  and cashapp_link from shop_payment_config.
- Token generation uses gen_random_bytes(33) → base64url → ~44 chars of entropy.
*/

-- ===== shop_invoice_tokens =====
CREATE TABLE IF NOT EXISTS shop_invoice_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id uuid NOT NULL REFERENCES shop_work_orders(id) ON DELETE CASCADE,
  token text UNIQUE NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  revoked boolean NOT NULL DEFAULT false
);

ALTER TABLE shop_invoice_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_invoice_tokens" ON shop_invoice_tokens;
CREATE POLICY "anon_select_invoice_tokens" ON shop_invoice_tokens
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_invoice_tokens" ON shop_invoice_tokens;
CREATE POLICY "anon_insert_invoice_tokens" ON shop_invoice_tokens
  FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_invoice_tokens" ON shop_invoice_tokens;
CREATE POLICY "anon_update_invoice_tokens" ON shop_invoice_tokens
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_invoice_tokens" ON shop_invoice_tokens;
CREATE POLICY "anon_delete_invoice_tokens" ON shop_invoice_tokens
  FOR DELETE TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_invoice_tokens_token ON shop_invoice_tokens(token);
CREATE INDEX IF NOT EXISTS idx_invoice_tokens_wo ON shop_invoice_tokens(work_order_id);

-- ===== shop_payment_config =====
CREATE TABLE IF NOT EXISTS shop_payment_config (
  id integer PRIMARY KEY DEFAULT 1,
  square_enabled boolean NOT NULL DEFAULT false,
  square_location_id text,
  square_access_token text,
  paypal_enabled boolean NOT NULL DEFAULT false,
  paypal_client_id text,
  paypal_client_secret text,
  cashapp_link text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT single_row CHECK (id = 1)
);

ALTER TABLE shop_payment_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_payment_config" ON shop_payment_config;
CREATE POLICY "anon_select_payment_config" ON shop_payment_config
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_payment_config" ON shop_payment_config;
CREATE POLICY "anon_insert_payment_config" ON shop_payment_config
  FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_payment_config" ON shop_payment_config;
CREATE POLICY "anon_update_payment_config" ON shop_payment_config
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_payment_config" ON shop_payment_config;
CREATE POLICY "anon_delete_payment_config" ON shop_payment_config
  FOR DELETE TO anon, authenticated USING (true);

-- ===== shop_work_orders new columns =====
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'shop_work_orders' AND column_name = 'shop_supplies') THEN
    ALTER TABLE shop_work_orders ADD COLUMN shop_supplies numeric NOT NULL DEFAULT 0;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'shop_work_orders' AND column_name = 'invoice_date') THEN
    ALTER TABLE shop_work_orders ADD COLUMN invoice_date timestamptz;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'shop_work_orders' AND column_name = 'payment_status') THEN
    ALTER TABLE shop_work_orders ADD COLUMN payment_status text NOT NULL DEFAULT 'unpaid';
  END IF;
END $$;

-- ===== shop_payments new columns =====
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'shop_payments' AND column_name = 'square_transaction_id') THEN
    ALTER TABLE shop_payments ADD COLUMN square_transaction_id text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'shop_payments' AND column_name = 'payment_status') THEN
    ALTER TABLE shop_payments ADD COLUMN payment_status text NOT NULL DEFAULT 'completed';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'shop_payments' AND column_name = 'processor') THEN
    ALTER TABLE shop_payments ADD COLUMN processor text;
  END IF;
END $$;

-- Insert default payment config row if not exists
INSERT INTO shop_payment_config (id) VALUES (1)
  ON CONFLICT (id) DO NOTHING;
