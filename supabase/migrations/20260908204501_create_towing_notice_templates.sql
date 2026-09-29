/*
# Create towing notice templates table

1. New Tables
- `towing_notice_templates`
  - `id` (uuid, primary key)
  - `template_name` (text, not null) — e.g. "Lien Notice", "Abandonment Notice"
  - `notice_type` (text, not null) — matches towing_notices.notice_type values: lien, abandonment, sale, other
  - `company_name` (text) — towing company name printed on the notice
  - `company_address` (text) — company address
  - `company_phone` (text) — company phone number
  - `company_license` (text) — company license number
  - `header_text` (text) — editable header/intro paragraph
  - `body_text` (text) — editable body paragraph with placeholder tokens like {{vehicle_year}}, {{vehicle_make}}, etc.
  - `footer_text` (text) — editable footer/sign-off paragraph
  - `is_default` (boolean, default false) — marks the default template
  - `created_by` (uuid) — towing user who created it
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)

2. Security
- Enable RLS on `towing_notice_templates`.
- The towing module uses its own PIN-based auth (not Supabase auth), so all access is via the anon key.
- Allow anon + authenticated full CRUD since the towing module manages its own access control.
*/

CREATE TABLE IF NOT EXISTS towing_notice_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_name text NOT NULL,
  notice_type text NOT NULL DEFAULT 'lien',
  company_name text DEFAULT '',
  company_address text DEFAULT '',
  company_phone text DEFAULT '',
  company_license text DEFAULT '',
  header_text text DEFAULT '',
  body_text text DEFAULT '',
  footer_text text DEFAULT '',
  is_default boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE towing_notice_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_notice_templates" ON towing_notice_templates;
CREATE POLICY "anon_select_notice_templates" ON towing_notice_templates FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_notice_templates" ON towing_notice_templates;
CREATE POLICY "anon_insert_notice_templates" ON towing_notice_templates FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_notice_templates" ON towing_notice_templates;
CREATE POLICY "anon_update_notice_templates" ON towing_notice_templates FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_notice_templates" ON towing_notice_templates;
CREATE POLICY "anon_delete_notice_templates" ON towing_notice_templates FOR DELETE
  TO anon, authenticated USING (true);
