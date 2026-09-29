/*
# Add eBay listing defaults to ebay_config table

1. Changes
- Adds default_shipping_type, default_handling_days, default_ship_to_location
  columns to ebay_config so admins can later change defaults.
- Sets sensible defaults: buyer pays shipping, 3 business days, US only.

2. Non-destructive
- All columns are nullable with defaults, so existing rows are unaffected.
*/

ALTER TABLE ebay_config
  ADD COLUMN IF NOT EXISTS default_shipping_type text NOT NULL DEFAULT 'buyer_pays',
  ADD COLUMN IF NOT EXISTS default_handling_days int NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS default_ship_to_location text NOT NULL DEFAULT 'US';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'ebay_config' AND constraint_name = 'valid_shipping_type'
  ) THEN
    ALTER TABLE ebay_config ADD CONSTRAINT valid_shipping_type
      CHECK (default_shipping_type IN ('buyer_pays', 'free'));
  END IF;
END $$;
