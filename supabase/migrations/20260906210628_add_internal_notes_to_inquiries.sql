/*
# Add internal_notes column to part_inquiries

1. Modified Tables
- `part_inquiries` — add `internal_notes` (text, nullable) for G10OS staff to add private notes not visible to the customer.

2. Security
- No policy changes. Existing anon/authenticated UPDATE policy already covers the new column.
*/

ALTER TABLE part_inquiries ADD COLUMN IF NOT EXISTS internal_notes text;
