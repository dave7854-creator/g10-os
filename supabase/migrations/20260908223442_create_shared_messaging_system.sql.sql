/*
# Create Shared Messaging System

A single messaging backend used across Shop Management, Towing, and Parts modules.

## New Tables

### message_conversations
- id (uuid PK)
- module (text: 'shop' | 'towing' | 'parts') — which business module this conversation belongs to
- contact_name (text) — customer/owner/lienholder name
- contact_phone (text) — phone number for SMS
- contact_email (text, nullable) — email if available
- record_id (uuid, nullable) — FK to the related record (work order, impound, or inquiry)
- record_type (text, nullable) — 'work_order' | 'impound' | 'inquiry'
- record_label (text, nullable) — human-readable label (e.g. "WO-001", "2024 Ford F-150")
- vehicle_label (text, nullable) — vehicle description when applicable
- unread_count (int, default 0) — cached unread count for badge display
- last_message_preview (text, nullable) — truncated last message text
- last_message_at (timestamptz, nullable) — timestamp of most recent message
- is_unassigned (boolean, default false) — true for incoming messages that haven't been routed yet
- created_at (timestamptz)
- updated_at (timestamptz)

### message_messages
- id (uuid PK)
- conversation_id (uuid FK → message_conversations)
- direction (text: 'incoming' | 'outgoing')
- body (text) — message content
- is_read (boolean, default false)
- delivery_status (text, default 'pending') — 'pending' | 'sent' | 'delivered' | 'failed'
- provider_message_id (text, nullable) — ID from Telnyx/Twilio
- sent_by (text, nullable) — employee name who sent the message
- created_at (timestamptz)

### messaging_config
- id (int PK, default 1)
- provider (text, default 'telnyx') — 'telnyx' | 'twilio'
- phone_number (text, nullable) — business SMS number
- api_key (text, nullable) — provider API key (stored server-side, frontend shows connection status only)
- api_secret (text, nullable) — provider API secret/token
- is_active (boolean, default false)
- webhook_url (text, nullable)

## Security
- RLS enabled on all tables
- TO anon, authenticated policies (app uses custom PIN auth, not Supabase auth)
- All data is intentionally shared among authenticated app users
*/

CREATE TABLE IF NOT EXISTS message_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module text NOT NULL DEFAULT 'shop',
  contact_name text NOT NULL DEFAULT '',
  contact_phone text NOT NULL DEFAULT '',
  contact_email text,
  record_id uuid,
  record_type text,
  record_label text,
  vehicle_label text,
  unread_count integer NOT NULL DEFAULT 0,
  last_message_preview text,
  last_message_at timestamptz,
  is_unassigned boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE message_conversations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_conversations" ON message_conversations;
CREATE POLICY "anon_select_conversations" ON message_conversations FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_conversations" ON message_conversations;
CREATE POLICY "anon_insert_conversations" ON message_conversations FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_conversations" ON message_conversations;
CREATE POLICY "anon_update_conversations" ON message_conversations FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_conversations" ON message_conversations;
CREATE POLICY "anon_delete_conversations" ON message_conversations FOR DELETE
  TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_conversations_module ON message_conversations(module);
CREATE INDEX IF NOT EXISTS idx_conversations_phone ON message_conversations(contact_phone);
CREATE INDEX IF NOT EXISTS idx_conversations_record ON message_conversations(record_id, record_type);
CREATE INDEX IF NOT EXISTS idx_conversations_unread ON message_conversations(unread_count) WHERE unread_count > 0;

CREATE TABLE IF NOT EXISTS message_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES message_conversations(id) ON DELETE CASCADE,
  direction text NOT NULL DEFAULT 'outgoing',
  body text NOT NULL DEFAULT '',
  is_read boolean NOT NULL DEFAULT false,
  delivery_status text NOT NULL DEFAULT 'pending',
  provider_message_id text,
  sent_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE message_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_messages" ON message_messages;
CREATE POLICY "anon_select_messages" ON message_messages FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_messages" ON message_messages;
CREATE POLICY "anon_insert_messages" ON message_messages FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_messages" ON message_messages;
CREATE POLICY "anon_update_messages" ON message_messages FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_messages" ON message_messages;
CREATE POLICY "anon_delete_messages" ON message_messages FOR DELETE
  TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_messages_conversation ON message_messages(conversation_id, created_at);

CREATE TABLE IF NOT EXISTS messaging_config (
  id integer PRIMARY KEY DEFAULT 1,
  provider text NOT NULL DEFAULT 'telnyx',
  phone_number text,
  api_key text,
  api_secret text,
  is_active boolean NOT NULL DEFAULT false,
  webhook_url text,
  CONSTRAINT single_row CHECK (id = 1)
);

ALTER TABLE messaging_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_messaging_config" ON messaging_config;
CREATE POLICY "anon_select_messaging_config" ON messaging_config FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_messaging_config" ON messaging_config;
CREATE POLICY "anon_insert_messaging_config" ON messaging_config FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_messaging_config" ON messaging_config;
CREATE POLICY "anon_update_messaging_config" ON messaging_config FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

INSERT INTO messaging_config (id, provider, is_active) VALUES (1, 'telnyx', false)
  ON CONFLICT (id) DO NOTHING;