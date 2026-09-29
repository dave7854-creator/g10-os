/*
# Add vehicle details, photo, and reply fields to part_inquiries

1. Modified Tables
- `part_inquiries` — add 5 new columns:
  - `trim` (text, nullable) — vehicle trim level (e.g. EX, LT, Limited)
  - `engine_size` (text, nullable) — engine displacement/size (e.g. 2.4L V6, 5.0L)
  - `drive_type` (text, nullable) — drivetrain (2WD, 4WD, AWD, FWD, RWD)
  - `photo_url` (text, nullable) — URL to uploaded part photo in Supabase Storage
  - `reply_message` (text, nullable) — staff's response message sent to customer
  - `reply_sent_at` (timestamptz, nullable) — timestamp when reply was sent

2. Security
- No policy changes needed. Existing anon/authenticated CRUD policies already cover new columns.
- Storage bucket `part-photos` will be created separately for photo uploads.
*/