-- ===== Add portal management columns to customer_auth_links =====
ALTER TABLE customer_auth_links
  ADD COLUMN IF NOT EXISTS portal_status text NOT NULL DEFAULT 'active'
    CHECK (portal_status IN ('active', 'disabled')),
  ADD COLUMN IF NOT EXISTS setup_complete boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_login_at timestamptz;

-- Backfill setup_complete for existing links (they were created before this column)
UPDATE customer_auth_links SET setup_complete = true WHERE setup_complete = false AND created_at < now() - interval '1 minute';

-- ===== SECURITY DEFINER: Manager portal management =====
-- Called from the customer-portal edge function using service role key.
-- The edge function verifies the caller is a manager before invoking this.
CREATE OR REPLACE FUNCTION manager_enable_portal(
  p_customer_id uuid,
  p_email text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_customer record;
  v_existing_link record;
  v_user_id uuid;
BEGIN
  SELECT * INTO v_customer FROM shop_customers WHERE id = p_customer_id;
  IF v_customer IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Customer not found');
  END IF;

  -- Check if already linked
  SELECT * INTO v_existing_link FROM customer_auth_links WHERE customer_id = p_customer_id;
  IF v_existing_link IS NOT NULL THEN
    -- If disabled, re-enable
    IF v_existing_link.portal_status = 'disabled' THEN
      UPDATE customer_auth_links SET portal_status = 'active' WHERE customer_id = p_customer_id;
      RETURN jsonb_build_object('success', true, 'action', 're-enabled');
    END IF;
    RETURN jsonb_build_object('success', true, 'action', 'already_active');
  END IF;

  -- Update customer email if provided and different
  IF p_email IS NOT NULL AND p_email != COALESCE(v_customer.email, '') THEN
    UPDATE shop_customers SET email = p_email, updated_at = now() WHERE id = p_customer_id;
  END IF;

  -- We don't create the auth user here — the edge function sends the OTP invite.
  -- The link row is created when the customer completes setup via link-account/create-account.
  -- But we create a placeholder link with setup_complete=false to track the invite.
  -- Actually, we can't create a link without a user_id. So we just return success
  -- and the edge function sends the invite. The link gets created on first login.

  RETURN jsonb_build_object('success', true, 'action', 'invite_needed');
END;
$$;

CREATE OR REPLACE FUNCTION manager_disable_portal(
  p_customer_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_link record;
BEGIN
  SELECT * INTO v_link FROM customer_auth_links WHERE customer_id = p_customer_id;
  IF v_link IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No portal account for this customer');
  END IF;

  UPDATE customer_auth_links SET portal_status = 'disabled' WHERE customer_id = p_customer_id;
  RETURN jsonb_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION manager_relink_portal(
  p_customer_id uuid,
  p_new_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_old_link record;
  v_other_link record;
BEGIN
  -- Check existing link on this customer
  SELECT * INTO v_old_link FROM customer_auth_links WHERE customer_id = p_customer_id;

  -- Check if the new user_id is already linked to a different customer
  SELECT * INTO v_other_link FROM customer_auth_links WHERE user_id = p_new_user_id AND customer_id != p_customer_id;
  IF v_other_link IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'This auth user is linked to another customer');
  END IF;

  -- Delete old link if exists
  DELETE FROM customer_auth_links WHERE customer_id = p_customer_id;

  -- Insert new link
  INSERT INTO customer_auth_links (user_id, customer_id, portal_status, setup_complete)
  VALUES (p_new_user_id, p_customer_id, 'active', true);

  RETURN jsonb_build_object('success', true);
END;
$$;

-- Manager functions are called via service role from edge function, so no anon/auth grants needed.
REVOKE EXECUTE ON FUNCTION manager_enable_portal FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION manager_disable_portal FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION manager_relink_portal FROM anon, authenticated;

-- ===== Allow service role to update portal_status and setup_complete =====
-- The service role already has full access, but make sure RLS doesn't block edge function
-- (service role bypasses RLS, so this is just for completeness)
