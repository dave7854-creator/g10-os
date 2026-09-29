/*
# Add username to customer_auth_links

1. Changes
- Adds `username` column (text, nullable) to `customer_auth_links`
- Adds a unique index on lower(username) to enforce case-insensitive uniqueness
- Only non-null usernames participate in the index (so multiple nulls are allowed)

2. Security
- No RLS changes. The table already has RLS enabled.
- Username is set only by manager (server-side via edge function with service role key).

3. Notes
- Username is optional. Customers without a username sign in with email.
- Username lookups go through the edge function (service role), never client-side.
*/

ALTER TABLE customer_auth_links
  ADD COLUMN IF NOT EXISTS username text;

-- Case-insensitive unique username, allowing multiple NULLs
CREATE UNIQUE INDEX IF NOT EXISTS customer_auth_links_username_unique_idx
  ON customer_auth_links (lower(username))
  WHERE username IS NOT NULL;
