/*
# Update ebay_status constraint with new workflow values

1. Changes
- Drops the old `valid_ebay_status` constraint on `part_statuses` first.
- Updates existing 'not_listed' rows to 'not_prepared'.
- Adds a new constraint with updated eBay status values.

2. New eBay status values
- not_prepared — default for new parts (replaces 'not_listed')
- preparing — part is in the Prepare for Listing screen
- draft — eBay draft has been created
- needs_review — draft needs review
- ready — ready to list on eBay
- active — listing is live on eBay
- sold — listing sold
- ended — listing ended
- error — listing error

3. Data migration
- Existing rows with 'not_listed' are updated to 'not_prepared'.
- All other existing values remain valid and unchanged.

4. Important notes
- The default for new rows changes from 'not_listed' to 'not_prepared'.
- Non-destructive — no data is lost.
*/

-- Step 1: Drop old constraint first
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'part_statuses' AND constraint_name = 'valid_ebay_status'
  ) THEN
    ALTER TABLE part_statuses DROP CONSTRAINT valid_ebay_status;
  END IF;
END $$;

-- Step 2: Update existing 'not_listed' rows to 'not_prepared'
UPDATE part_statuses SET ebay_status = 'not_prepared' WHERE ebay_status = 'not_listed';

-- Step 3: Add new constraint with updated values
ALTER TABLE part_statuses ADD CONSTRAINT valid_ebay_status
  CHECK (ebay_status IN ('not_prepared', 'preparing', 'draft', 'needs_review', 'ready', 'active', 'sold', 'ended', 'error'));

-- Step 4: Update default
ALTER TABLE part_statuses ALTER COLUMN ebay_status SET DEFAULT 'not_prepared';
