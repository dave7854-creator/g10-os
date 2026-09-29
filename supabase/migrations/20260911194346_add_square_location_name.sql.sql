/*
# Add square_location_name column to shop_payment_config

1. Changes
   - Add `square_location_name` (text) to store the human-readable name of the
     selected Square location (e.g. "Fort Peck Auto, LLC — Fort Peck, MT").
     This lets the Payment Settings UI display the selected location name
     without making another API call on every page load.

2. Security
   No RLS changes — existing anon+authenticated CRUD policies still apply.
*/

ALTER TABLE shop_payment_config
  ADD COLUMN IF NOT EXISTS square_location_name text;
