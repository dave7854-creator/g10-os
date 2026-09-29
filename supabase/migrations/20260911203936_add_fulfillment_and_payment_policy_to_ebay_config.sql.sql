ALTER TABLE ebay_config
  ADD COLUMN IF NOT EXISTS default_fulfillment_policy_id text,
  ADD COLUMN IF NOT EXISTS default_payment_policy_id text;

-- Rename default_return_policy to clarify it stores a policy ID, not a text label
-- (keeping the column name for backwards compat, just changing what it stores)
