/*
# Add eBay status to part_statuses

1. Changes
- Adds `ebay_status` column to the `part_statuses` table. This tracks the eBay
  listing lifecycle for each part independently from the pull/work status.
- Defaults to 'not_listed' for all existing and new rows.
- Adds a CHECK constraint to ensure only valid eBay statuses are stored.

2. New column
- `ebay_status` (text, NOT NULL, DEFAULT 'not_listed')
  Valid values: not_listed, draft, needs_review, ready, active, sold, ended, error

3. Important notes
- Existing part_statuses rows get 'not_listed' automatically via the DEFAULT.
- The part_statuses table already exists and stores pull/work status (available,
  removed, cleaned, tested, listed, sold, scrapped). This new column is separate
  and tracks the eBay listing lifecycle specifically.
- No data is lost or modified — only a new column is added.
*/

ALTER TABLE part_statuses ADD COLUMN IF NOT EXISTS ebay_status text NOT NULL DEFAULT 'not_listed';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'part_statuses' AND constraint_name = 'valid_ebay_status'
  ) THEN
    ALTER TABLE part_statuses ADD CONSTRAINT valid_ebay_status
      CHECK (ebay_status IN ('not_listed', 'draft', 'needs_review', 'ready', 'active', 'sold', 'ended', 'error'));
  END IF;
END $$;
