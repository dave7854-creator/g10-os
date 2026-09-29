/*
# Add missing columns to shop_payment_config

1. Problem
   The Payment Settings UI saves fields like venmo_enabled, cashapp_enabled,
   venmo_link, cashapp_link, display names, square_app_id, square_environment,
   paypal_display_name, and manual_link_* — but these columns do not exist
   in the shop_payment_config table. The Supabase upsert silently fails,
   so nothing persists across page reloads.

2. Changes
   Add the following columns to shop_payment_config (all optional / nullable
   or with safe defaults so existing rows are unaffected):
   - square_app_id (text)
   - square_environment (text, default 'sandbox')
   - square_display_name (text, default 'Credit/Debit Card')
   - paypal_display_name (text, default 'PayPal')
   - venmo_enabled (boolean, default false)
   - venmo_link (text)
   - venmo_display_name (text, default 'Venmo')
   - cashapp_enabled (boolean, default false)
   - cashapp_display_name (text, default 'Cash App')
   - manual_link_enabled (boolean, default false)
   - manual_link_url (text)
   - manual_link_display_name (text, default 'Pay Online')

3. Security
   No RLS changes — the table already has anon+authenticated CRUD policies
   (single-tenant app, intentionally shared config row).
*/

ALTER TABLE shop_payment_config
  ADD COLUMN IF NOT EXISTS square_app_id text,
  ADD COLUMN IF NOT EXISTS square_environment text DEFAULT 'sandbox',
  ADD COLUMN IF NOT EXISTS square_display_name text DEFAULT 'Credit/Debit Card',
  ADD COLUMN IF NOT EXISTS paypal_display_name text DEFAULT 'PayPal',
  ADD COLUMN IF NOT EXISTS venmo_enabled boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS venmo_link text,
  ADD COLUMN IF NOT EXISTS venmo_display_name text DEFAULT 'Venmo',
  ADD COLUMN IF NOT EXISTS cashapp_enabled boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS cashapp_display_name text DEFAULT 'Cash App',
  ADD COLUMN IF NOT EXISTS manual_link_enabled boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS manual_link_url text,
  ADD COLUMN IF NOT EXISTS manual_link_display_name text DEFAULT 'Pay Online';
