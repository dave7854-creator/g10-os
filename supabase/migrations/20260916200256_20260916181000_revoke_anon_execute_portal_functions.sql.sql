/*
# Fix: Revoke EXECUTE on SECURITY DEFINER functions from anon

The SECURITY DEFINER functions for the customer portal were still callable by the anon role
because Postgres grants EXECUTE on functions to PUBLIC by default. This migration explicitly
revokes that grant and ensures only authenticated users can call these functions.

## Functions affected:
- approve_or_decline_estimate
- create_customer_service_request
- link_customer_auth

## Security change:
- REVOKE EXECUTE ... FROM PUBLIC, anon
- GRANT EXECUTE ... TO authenticated only
*/

REVOKE EXECUTE ON FUNCTION approve_or_decline_estimate(uuid, text, numeric, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION approve_or_decline_estimate(uuid, text, numeric, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION approve_or_decline_estimate(uuid, text, numeric, text, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION create_customer_service_request(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION create_customer_service_request(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION create_customer_service_request(uuid, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION link_customer_auth(text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION link_customer_auth(text, text) FROM anon;
