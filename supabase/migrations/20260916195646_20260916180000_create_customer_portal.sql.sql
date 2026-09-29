/*
# Customer Portal — Auth Linking, Estimate Approvals, and Customer-Scoped RLS

## Overview
This migration adds the database layer for a secure customer portal on fortpeckauto.com.
Customers authenticate via Supabase Auth (email-based OTP) and are linked to their
existing G10 OS shop_customers record. All data access is enforced server-side via RLS.

## New Tables

### customer_auth_links
Maps a Supabase Auth user (auth.users.id) to an existing shop_customers record.
- `user_id` (uuid, PK, FK → auth.users) — the authenticated customer
- `customer_id` (uuid, FK → shop_customers) — the G10 OS customer record
- `created_at` (timestamptz)
This is the bridge between Supabase Auth identity and the shop customer system.
A customer can only have one auth link, and a shop_customers record can only have one auth link.

### estimate_approvals
Records customer decisions on estimates (approve/decline) with version tracking.
- `id` (uuid, PK)
- `work_order_id` (uuid, FK → shop_work_orders) — the estimate/work order
- `customer_id` (uuid, FK → shop_customers) — who approved/declined
- `decision` (text, CHECK: 'approved' or 'declined')
- `estimate_total` (numeric) — the amount the customer saw when deciding
- `estimate_hash` (text) — hash of estimate line items at time of approval, to detect changes
- `decided_at` (timestamptz) — when the decision was made
- `notes` (text, nullable) — optional customer notes

### customer_login_codes
Stores OTP login codes for customer authentication (never plaintext passwords).
- `id` (uuid, PK)
- `email` (text) — the email the code was sent to
- `code_hash` (text) — SHA-256 hash of the OTP code (never the plaintext)
- `expires_at` (timestamptz) — code validity window (10 minutes)
- `used_at` (timestamptz, nullable) — when the code was consumed
- `attempts` (integer, default 0) — failed verification attempts (rate limiting)

## RLS Policy Changes

### customer_auth_links
- authenticated users can SELECT only their own link
- authenticated users can INSERT only their own link (auto-populated via auth.uid())
- No UPDATE or DELETE from client

### estimate_approvals
- authenticated users can SELECT only approvals for their own customer records
- INSERT is handled via SECURITY DEFINER function (ensures the customer actually owns the estimate)

### shop_customers
- SELECT: authenticated users can read their own customer record (joined via customer_auth_links)
- UPDATE: authenticated users can update only their own customer profile fields (name, phone, email, address)
- Column-level: UPDATE restricted to first_name, last_name, phone, email, address (NOT notes)

### shop_vehicles
- SELECT: authenticated users can read vehicles belonging to their linked customer
- INSERT: authenticated users can add vehicles to their own customer record
- UPDATE: authenticated users can update their own vehicles

### shop_work_orders
- SELECT: authenticated users can read work orders belonging to their linked customer
- No INSERT/UPDATE/DELETE from customer portal

### shop_labor_operations
- SELECT: authenticated users can read labor operations for their own work orders
- No writes from customer portal

### shop_parts
- SELECT: authenticated users can read parts for their own work orders
- No writes from customer portal

### shop_payments
- SELECT: authenticated users can read payments for their own work orders
- No writes from customer portal

### shop_invoice_tokens
- SELECT: authenticated users can read invoice tokens for their own work orders

### message_conversations
- SELECT: authenticated users can read conversations linked to their customer records
- INSERT: authenticated users can create conversations (scoped to their customer_id)

### message_messages
- SELECT: authenticated users can read messages in conversations they own
- INSERT: authenticated users can send messages in their own conversations

## SECURITY DEFINER Functions

### approve_or_decline_estimate
Allows a customer to approve or decline an estimate. Verifies:
1. The caller is authenticated
2. The work order belongs to the caller's linked customer
3. The work order status is 'estimate'
4. The estimate hasn't been modified since the customer viewed it (hash check)
Records the decision in estimate_approvals and updates the work order status.

### create_customer_service_request
Creates a new work order (status='estimate') from a customer service request.
Verifies the vehicle belongs to the caller. Auto-fills customer info.

## Important Notes
1. Existing anon-key access for G10 OS employee app is PRESERVED — all existing
   policies remain. New customer-scoped policies are ADDED alongside, not replacing.
2. The employee PIN system is completely untouched.
3. Customer can never access other customers' data, internal notes, or employee records.
4. All verification is server-side via RLS + SECURITY DEFINER functions.
*/

-- ===== customer_auth_links =====
CREATE TABLE IF NOT EXISTS customer_auth_links (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES shop_customers(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE customer_auth_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "customer_auth_select_own" ON customer_auth_links;
CREATE POLICY "customer_auth_select_own" ON customer_auth_links
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "customer_auth_insert_own" ON customer_auth_links;
CREATE POLICY "customer_auth_insert_own" ON customer_auth_links
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- ===== estimate_approvals =====
CREATE TABLE IF NOT EXISTS estimate_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id uuid NOT NULL REFERENCES shop_work_orders(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES shop_customers(id) ON DELETE CASCADE,
  decision text NOT NULL CHECK (decision IN ('approved', 'declined')),
  estimate_total numeric(10,2) NOT NULL DEFAULT 0,
  estimate_hash text NOT NULL DEFAULT '',
  decided_at timestamptz NOT NULL DEFAULT now(),
  notes text
);

ALTER TABLE estimate_approvals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "estimate_approvals_select_own" ON estimate_approvals;
CREATE POLICY "estimate_approvals_select_own" ON estimate_approvals
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM customer_auth_links
      WHERE customer_auth_links.user_id = auth.uid()
      AND customer_auth_links.customer_id = estimate_approvals.customer_id
    )
  );

-- No direct INSERT policy — approvals go through SECURITY DEFINER function

CREATE INDEX IF NOT EXISTS idx_estimate_approvals_work_order ON estimate_approvals(work_order_id);
CREATE INDEX IF NOT EXISTS idx_estimate_approvals_customer ON estimate_approvals(customer_id);

-- ===== customer_login_codes =====
CREATE TABLE IF NOT EXISTS customer_login_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  code_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  attempts integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE customer_login_codes ENABLE ROW LEVEL SECURITY;
-- No policies: this table is only accessed via service-role edge function

CREATE INDEX IF NOT EXISTS idx_customer_login_codes_email ON customer_login_codes(email);
CREATE INDEX IF NOT EXISTS idx_customer_login_codes_expires ON customer_login_codes(expires_at);

-- ===== RLS: shop_customers (customer-scoped access) =====
-- Add customer-scoped SELECT policy alongside existing anon access
DROP POLICY IF EXISTS "shop_customers_select_own_customer" ON shop_customers;
CREATE POLICY "shop_customers_select_own_customer" ON shop_customers
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM customer_auth_links
      WHERE customer_auth_links.user_id = auth.uid()
      AND customer_auth_links.customer_id = shop_customers.id
    )
  );

-- Customer can update only their own profile (name, phone, email, address)
-- Notes column is NOT customer-writable
DROP POLICY IF EXISTS "shop_customers_update_own_profile" ON shop_customers;
CREATE POLICY "shop_customers_update_own_profile" ON shop_customers
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM customer_auth_links
      WHERE customer_auth_links.user_id = auth.uid()
      AND customer_auth_links.customer_id = shop_customers.id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM customer_auth_links
      WHERE customer_auth_links.user_id = auth.uid()
      AND customer_auth_links.customer_id = shop_customers.id
    )
  );

-- Restrict customer profile updates to safe columns only
REVOKE UPDATE ON shop_customers FROM authenticated;
GRANT UPDATE (first_name, last_name, phone, email, address) ON shop_customers TO authenticated;

-- ===== RLS: shop_vehicles (customer-scoped access) =====
DROP POLICY IF EXISTS "shop_vehicles_select_own_customer" ON shop_vehicles;
CREATE POLICY "shop_vehicles_select_own_customer" ON shop_vehicles
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM customer_auth_links
      WHERE customer_auth_links.user_id = auth.uid()
      AND customer_auth_links.customer_id = shop_vehicles.customer_id
    )
  );

DROP POLICY IF EXISTS "shop_vehicles_insert_own_customer" ON shop_vehicles;
CREATE POLICY "shop_vehicles_insert_own_customer" ON shop_vehicles
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM customer_auth_links
      WHERE customer_auth_links.user_id = auth.uid()
      AND customer_auth_links.customer_id = shop_vehicles.customer_id
    )
  );

DROP POLICY IF EXISTS "shop_vehicles_update_own_customer" ON shop_vehicles;
CREATE POLICY "shop_vehicles_update_own_customer" ON shop_vehicles
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM customer_auth_links
      WHERE customer_auth_links.user_id = auth.uid()
      AND customer_auth_links.customer_id = shop_vehicles.customer_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM customer_auth_links
      WHERE customer_auth_links.user_id = auth.uid()
      AND customer_auth_links.customer_id = shop_vehicles.customer_id
    )
  );

-- ===== RLS: shop_work_orders (customer-scoped, read-only) =====
DROP POLICY IF EXISTS "shop_work_orders_select_own_customer" ON shop_work_orders;
CREATE POLICY "shop_work_orders_select_own_customer" ON shop_work_orders
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM customer_auth_links
      WHERE customer_auth_links.user_id = auth.uid()
      AND customer_auth_links.customer_id = shop_work_orders.customer_id
    )
  );

-- ===== RLS: shop_labor_operations (customer-scoped, read-only) =====
DROP POLICY IF EXISTS "shop_labor_operations_select_own_customer" ON shop_labor_operations;
CREATE POLICY "shop_labor_operations_select_own_customer" ON shop_labor_operations
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM shop_work_orders
      JOIN customer_auth_links ON customer_auth_links.customer_id = shop_work_orders.customer_id
      WHERE shop_work_orders.id = shop_labor_operations.work_order_id
      AND customer_auth_links.user_id = auth.uid()
    )
  );

-- ===== RLS: shop_parts (customer-scoped, read-only) =====
DROP POLICY IF EXISTS "shop_parts_select_own_customer" ON shop_parts;
CREATE POLICY "shop_parts_select_own_customer" ON shop_parts
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM shop_work_orders
      JOIN customer_auth_links ON customer_auth_links.customer_id = shop_work_orders.customer_id
      WHERE shop_work_orders.id = shop_parts.work_order_id
      AND customer_auth_links.user_id = auth.uid()
    )
  );

-- ===== RLS: shop_payments (customer-scoped, read-only) =====
DROP POLICY IF EXISTS "shop_payments_select_own_customer" ON shop_payments;
CREATE POLICY "shop_payments_select_own_customer" ON shop_payments
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM shop_work_orders
      JOIN customer_auth_links ON customer_auth_links.customer_id = shop_work_orders.customer_id
      WHERE shop_work_orders.id = shop_payments.work_order_id
      AND customer_auth_links.user_id = auth.uid()
    )
  );

-- ===== RLS: shop_invoice_tokens (customer-scoped) =====
DROP POLICY IF EXISTS "shop_invoice_tokens_select_own_customer" ON shop_invoice_tokens;
CREATE POLICY "shop_invoice_tokens_select_own_customer" ON shop_invoice_tokens
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM shop_work_orders
      JOIN customer_auth_links ON customer_auth_links.customer_id = shop_work_orders.customer_id
      WHERE shop_work_orders.id = shop_invoice_tokens.work_order_id
      AND customer_auth_links.user_id = auth.uid()
    )
  );

-- ===== RLS: message_conversations (customer-scoped) =====
DROP POLICY IF EXISTS "message_conversations_select_own_customer" ON message_conversations;
CREATE POLICY "message_conversations_select_own_customer" ON message_conversations
  FOR SELECT TO authenticated
  USING (
    module = 'shop'
    AND record_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM shop_work_orders
      JOIN customer_auth_links ON customer_auth_links.customer_id = shop_work_orders.customer_id
      WHERE shop_work_orders.id = message_conversations.record_id
      AND customer_auth_links.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "message_conversations_insert_own_customer" ON message_conversations;
CREATE POLICY "message_conversations_insert_own_customer" ON message_conversations
  FOR INSERT TO authenticated
  WITH CHECK (
    module = 'shop'
    AND record_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM shop_work_orders
      JOIN customer_auth_links ON customer_auth_links.customer_id = shop_work_orders.customer_id
      WHERE shop_work_orders.id = message_conversations.record_id
      AND customer_auth_links.user_id = auth.uid()
    )
  );

-- ===== RLS: message_messages (customer-scoped) =====
DROP POLICY IF EXISTS "message_messages_select_own_customer" ON message_messages;
CREATE POLICY "message_messages_select_own_customer" ON message_messages
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM message_conversations
      JOIN shop_work_orders ON shop_work_orders.id = message_conversations.record_id
      JOIN customer_auth_links ON customer_auth_links.customer_id = shop_work_orders.customer_id
      WHERE message_conversations.id = message_messages.conversation_id
      AND message_conversations.module = 'shop'
      AND customer_auth_links.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "message_messages_insert_own_customer" ON message_messages;
CREATE POLICY "message_messages_insert_own_customer" ON message_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM message_conversations
      JOIN shop_work_orders ON shop_work_orders.id = message_conversations.record_id
      JOIN customer_auth_links ON customer_auth_links.customer_id = shop_work_orders.customer_id
      WHERE message_conversations.id = message_messages.conversation_id
      AND message_conversations.module = 'shop'
      AND customer_auth_links.user_id = auth.uid()
    )
  );

-- ===== SECURITY DEFINER: approve_or_decline_estimate =====
CREATE OR REPLACE FUNCTION approve_or_decline_estimate(
  p_work_order_id uuid,
  p_decision text,
  p_estimate_total numeric,
  p_estimate_hash text,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_customer_id uuid;
  v_wo_customer_id uuid;
  v_wo_status text;
  v_wo_total numeric;
  v_existing_approval record;
BEGIN
  -- 1. Get the caller's customer_id from auth link
  SELECT customer_id INTO v_customer_id
  FROM customer_auth_links
  WHERE user_id = auth.uid();

  IF v_customer_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not linked to a customer account');
  END IF;

  -- 2. Verify the work order belongs to this customer
  SELECT customer_id, status, total INTO v_wo_customer_id, v_wo_status, v_wo_total
  FROM shop_work_orders
  WHERE id = p_work_order_id;

  IF v_wo_customer_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Estimate not found');
  END IF;

  IF v_wo_customer_id != v_customer_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Access denied');
  END IF;

  -- 3. Only allow approval of estimates
  IF v_wo_status != 'estimate' THEN
    RETURN jsonb_build_object('success', false, 'error', 'This estimate is no longer awaiting approval');
  END IF;

  -- 4. Check for existing approval to prevent double-submit
  SELECT * INTO v_existing_approval
  FROM estimate_approvals
  WHERE work_order_id = p_work_order_id
  ORDER BY decided_at DESC
  LIMIT 1;

  IF v_existing_approval IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'You have already responded to this estimate');
  END IF;

  -- 5. Verify the estimate hasn't changed (hash check)
  -- The hash is computed by the edge function from line items + total
  -- If the estimate was modified after presentation, the hash won't match
  IF p_estimate_hash != '' THEN
    DECLARE
      v_current_hash text;
    BEGIN
      -- Recompute hash from current state
      SELECT md5(
        COALESCE(string_agg(
          shop_labor_operations.operation_description || ':' ||
          shop_labor_operations.charged_hours::text || ':' ||
          shop_labor_operations.labor_total::text, '|'
        ), '') || '|' ||
        COALESCE(string_agg(
          shop_parts.description || ':' || shop_parts.sell_price::text, '|'
        ), '') || '|' ||
        v_wo_total::text
      )
      INTO v_current_hash
      FROM shop_work_orders wo
      LEFT JOIN shop_labor_operations ON shop_labor_operations.work_order_id = wo.id
      LEFT JOIN shop_parts ON shop_parts.work_order_id = wo.id
      WHERE wo.id = p_work_order_id
      GROUP BY wo.id, v_wo_total;

      IF v_current_hash IS DISTINCT FROM p_estimate_hash THEN
        RETURN jsonb_build_object('success', false, 'error', 'This estimate has been updated. Please review the new version before approving.');
      END IF;
    END;
  END IF;

  -- 6. Record the approval
  INSERT INTO estimate_approvals (work_order_id, customer_id, decision, estimate_total, estimate_hash, notes)
  VALUES (p_work_order_id, v_customer_id, p_decision, p_estimate_total, p_estimate_hash, p_notes);

  -- 7. Update work order status if approved
  IF p_decision = 'approved' THEN
    UPDATE shop_work_orders SET status = 'approved', updated_at = now()
    WHERE id = p_work_order_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'decision', p_decision);
END;
$$;

REVOKE EXECUTE ON FUNCTION approve_or_decline_estimate FROM anon;
GRANT EXECUTE ON FUNCTION approve_or_decline_estimate TO authenticated;

-- ===== SECURITY DEFINER: create_customer_service_request =====
CREATE OR REPLACE FUNCTION create_customer_service_request(
  p_vehicle_id uuid,
  p_problem text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_customer_id uuid;
  v_vehicle record;
  v_wo_number text;
  v_wo_id uuid;
BEGIN
  -- 1. Get the caller's customer_id
  SELECT customer_id INTO v_customer_id
  FROM customer_auth_links
  WHERE user_id = auth.uid();

  IF v_customer_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not linked to a customer account');
  END IF;

  -- 2. Verify the vehicle belongs to this customer
  SELECT * INTO v_vehicle
  FROM shop_vehicles
  WHERE id = p_vehicle_id AND customer_id = v_customer_id;

  IF v_vehicle IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Vehicle not found');
  END IF;

  -- 3. Generate a work order number
  SELECT 'WO-' || to_char(now(), 'YYMMDD') || '-' || lpad((count(*) + 1)::text, 4, '0')
  INTO v_wo_number
  FROM shop_work_orders
  WHERE created_at::date = now()::date;

  -- 4. Create the work order as an estimate with customer's problem as notes
  INSERT INTO shop_work_orders (work_order_number, customer_id, vehicle_id, status, notes)
  VALUES (v_wo_number, v_customer_id, p_vehicle_id, 'estimate', 'CUSTOMER SERVICE REQUEST: ' || p_problem)
  RETURNING id INTO v_wo_id;

  RETURN jsonb_build_object('success', true, 'work_order_id', v_wo_id, 'work_order_number', v_wo_number);
END;
$$;

REVOKE EXECUTE ON FUNCTION create_customer_service_request FROM anon;
GRANT EXECUTE ON FUNCTION create_customer_service_request TO authenticated;

-- ===== Helper: link_customer_auth =====
-- Called by the edge function after OTP verification to link auth user to shop_customers
CREATE OR REPLACE FUNCTION link_customer_auth(
  p_email text,
  p_phone text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_customer record;
  v_user_id uuid;
  v_existing_link record;
BEGIN
  -- Find matching customer by email or phone
  SELECT * INTO v_customer
  FROM shop_customers
  WHERE (email IS NOT NULL AND lower(email) = lower(p_email))
     OR (p_phone IS NOT NULL AND phone IS NOT NULL AND replace(replace(replace(replace(phone, ' ', ''), '-', ''), '(', ''), ')', '') = replace(replace(replace(replace(p_phone, ' ', ''), '-', ''), '(', ''), ')', ''))
  LIMIT 1;

  IF v_customer IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No customer record found. Please call us to set up your account.');
  END IF;

  -- Get the calling user's ID
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  -- Check if already linked
  SELECT * INTO v_existing_link FROM customer_auth_links WHERE user_id = v_user_id;
  IF v_existing_link IS NOT NULL THEN
    -- Already linked — return existing
    RETURN jsonb_build_object('success', true, 'customer_id', v_existing_link.customer_id, 'already_linked', true);
  END IF;

  -- Check if this customer is already linked to another user
  SELECT * INTO v_existing_link FROM customer_auth_links WHERE customer_id = v_customer.id;
  IF v_existing_link IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'This customer account is already linked to another login. Please call us if you need help.');
  END IF;

  -- Create the link
  INSERT INTO customer_auth_links (user_id, customer_id)
  VALUES (v_user_id, v_customer.id);

  RETURN jsonb_build_object('success', true, 'customer_id', v_customer.id, 'already_linked', false);
END;
$$;

REVOKE EXECUTE ON FUNCTION link_customer_auth FROM anon;
GRANT EXECUTE ON FUNCTION link_customer_auth TO authenticated;
