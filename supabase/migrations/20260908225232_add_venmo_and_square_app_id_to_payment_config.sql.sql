/*
# Add Venmo, Square App ID, and display names to payment config

1. Modified Tables
- `shop_payment_config`
  - `square_app_id` (text, nullable) — Square application ID for Web Payments SDK (needed for customer-side card tokenization)
  - `square_environment` (text, default 'sandbox') — 'sandbox' or 'production'
  - `venmo_enabled` (boolean, default false) — whether Venmo payment option is shown
  - `venmo_link` (text, nullable) — Venmo payment link or profile URL
  - `cashapp_enabled` (boolean, default false) — whether Cash App payment option is shown
  - `venmo_display_name` (text, default 'Venmo') — display name shown on payment page
  - `cashapp_display_name` (text, default 'Cash App') — display name shown on payment page
  - `paypal_display_name` (text, default 'PayPal') — display name shown on payment page
  - `square_display_name` (text, default 'Credit/Debit Card') — display name shown on payment page
  - `manual_link_enabled` (boolean, default false) — whether manual payment link is shown
  - `manual_link_url` (text, nullable) — manual payment link URL
  - `manual_link_display_name` (text, default 'Pay Online') — display name for manual link

2. Security
- No changes to existing RLS policies. The table already has anon/authenticated access for the config row.
- Sensitive fields (square_access_token, paypal_client_secret) are never exposed to the frontend — the invoice-portal edge function only selects public fields.

3. Important Notes
- The Square App ID is required for the customer-facing Web Payments SDK to tokenize cards. It is a PUBLIC value (not secret) — it's safe to expose in the frontend, similar to the PayPal client ID.
- The Square Access Token remains server-side only and is never returned to the frontend.
- Venmo and Cash App are external link-based payments — clicking the button opens the payment URL in a new tab. These do NOT auto-confirm; staff must manually record the payment.
*/