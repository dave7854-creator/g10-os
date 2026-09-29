/*
# Create towing notice snapshots table

Stores a frozen copy of exactly what was on a printed towing notice at the moment
it was generated. This preserves the data even if the impound record, fees, owner,
or lienholder details change later.

1. New Tables
- `towing_notice_snapshots`
  - `id` (uuid, primary key)
  - `impound_id` (uuid, references towing_impounds)
  - `template_id` (uuid, references towing_notice_templates, nullable)
  - `template_name` (text) — frozen template name at time of print
  - `notice_type` (text) — frozen notice type
  - `printed_by` (uuid) — towing user who printed it
  - `printed_at` (timestamptz) — when the notice was generated
  - `snapshot_data` (jsonb) — full frozen context: all field values that populated the notice
  - `generated_text` (text) — the fully rendered notice text after token replacement, so the exact wording is preserved
  - `created_at` (timestamptz)

2. Security
- Enable RLS on `towing_notice_snapshots`.
- The towing module uses its own PIN-based auth (not Supabase auth), so all access is via the anon key.
- Allow anon + authenticated full CRUD.
*/

CREATE TABLE IF NOT EXISTS towing_notice_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  impound_id uuid REFERENCES towing_impounds(id) ON DELETE CASCADE,
  template_id uuid REFERENCES towing_notice_templates(id) ON DELETE SET NULL,
  template_name text NOT NULL DEFAULT '',
  notice_type text NOT NULL DEFAULT 'lien',
  printed_by uuid,
  printed_at timestamptz DEFAULT now(),
  snapshot_data jsonb NOT NULL DEFAULT '{}',
  generated_text text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE towing_notice_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_notice_snapshots" ON towing_notice_snapshots;
CREATE POLICY "anon_select_notice_snapshots" ON towing_notice_snapshots FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_notice_snapshots" ON towing_notice_snapshots;
CREATE POLICY "anon_insert_notice_snapshots" ON towing_notice_snapshots FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_notice_snapshots" ON towing_notice_snapshots;
CREATE POLICY "anon_update_notice_snapshots" ON towing_notice_snapshots FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_notice_snapshots" ON towing_notice_snapshots;
CREATE POLICY "anon_delete_notice_snapshots" ON towing_notice_snapshots FOR DELETE
  TO anon, authenticated USING (true);
