/*
# Add shipping and listing fields to ebay_listings

1. Changes
- Adds shipping_type, handling_time, ship_to_location columns
  to ebay_listings so listing defaults are stored per-listing.
- All columns are nullable to preserve existing rows.

2. Non-destructive
*/

ALTER TABLE ebay_listings
  ADD COLUMN IF NOT EXISTS shipping_type text DEFAULT 'buyer_pays',
  ADD COLUMN IF NOT EXISTS handling_time int DEFAULT 3,
  ADD COLUMN IF NOT EXISTS ship_to_location text DEFAULT 'US';
