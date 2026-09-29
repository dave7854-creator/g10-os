/* Add AI estimate metadata columns to shop_labor_operations */
ALTER TABLE shop_labor_operations
  ADD COLUMN IF NOT EXISTS is_ai_estimate boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS confidence text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS assumptions jsonb DEFAULT NULL;