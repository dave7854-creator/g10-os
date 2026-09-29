/*
# Create Shop Repair Information tables

1. New Tables
- `shop_repair_knowledge` — Saved shop knowledge from completed repairs (technician notes, actual times, tips, recommended videos, tools used, problems encountered). Associated with vehicle/engine/repair/DTC.
- `shop_repair_videos` — YouTube/third-party videos marked as shop-recommended, linked to repair type and vehicle.
- `shop_repair_provider_config` — Configuration for OEM repair information provider (MOTOR, direct OEM, etc). Single-row config like shop_settings.

2. Security
- Enable RLS on all tables.
- Allow anon + authenticated CRUD (single-tenant PIN-based app, same pattern as existing shop tables).

3. Notes
- shop_repair_knowledge stores technician experience data that accumulates over time.
- shop_repair_videos stores video URLs that authorized users mark as shop-recommended.
- shop_repair_provider_config stores connection details for a future licensed OEM data provider.
*/

-- ===== SHOP REPAIR KNOWLEDGE =====
CREATE TABLE IF NOT EXISTS shop_repair_knowledge (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  repair_query text NOT NULL,
  vehicle_key text,
  vin text,
  year text,
  make text,
  model text,
  engine text,
  technician_notes text,
  actual_repair_time_minutes integer,
  parts_used text,
  problems_encountered text,
  special_tools text,
  tips text,
  recommended_video_url text,
  recommended_video_title text,
  dtc_code text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE shop_repair_knowledge ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_repair_knowledge" ON shop_repair_knowledge;
CREATE POLICY "anon_select_repair_knowledge" ON shop_repair_knowledge
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_repair_knowledge" ON shop_repair_knowledge;
CREATE POLICY "anon_insert_repair_knowledge" ON shop_repair_knowledge
  FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_repair_knowledge" ON shop_repair_knowledge;
CREATE POLICY "anon_update_repair_knowledge" ON shop_repair_knowledge
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_repair_knowledge" ON shop_repair_knowledge;
CREATE POLICY "anon_delete_repair_knowledge" ON shop_repair_knowledge
  FOR DELETE TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_shop_repair_knowledge_query ON shop_repair_knowledge (repair_query);
CREATE INDEX IF NOT EXISTS idx_shop_repair_knowledge_vehicle ON shop_repair_knowledge (vehicle_key);
CREATE INDEX IF NOT EXISTS idx_shop_repair_knowledge_dtc ON shop_repair_knowledge (dtc_code);

-- ===== SHOP REPAIR VIDEOS =====
CREATE TABLE IF NOT EXISTS shop_repair_videos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_url text NOT NULL,
  video_title text NOT NULL,
  channel_name text,
  duration text,
  thumbnail_url text,
  repair_query text NOT NULL,
  vehicle_key text,
  year text,
  make text,
  model text,
  engine text,
  is_shop_recommended boolean NOT NULL DEFAULT false,
  match_reason text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE shop_repair_videos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_repair_videos" ON shop_repair_videos;
CREATE POLICY "anon_select_repair_videos" ON shop_repair_videos
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_repair_videos" ON shop_repair_videos;
CREATE POLICY "anon_insert_repair_videos" ON shop_repair_videos
  FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_repair_videos" ON shop_repair_videos;
CREATE POLICY "anon_update_repair_videos" ON shop_repair_videos
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_repair_videos" ON shop_repair_videos;
CREATE POLICY "anon_delete_repair_videos" ON shop_repair_videos
  FOR DELETE TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_shop_repair_videos_query ON shop_repair_videos (repair_query);
CREATE INDEX IF NOT EXISTS idx_shop_repair_videos_recommended ON shop_repair_videos (is_shop_recommended);

-- ===== SHOP REPAIR PROVIDER CONFIG =====
CREATE TABLE IF NOT EXISTS shop_repair_provider_config (
  id integer PRIMARY KEY DEFAULT 1,
  provider_name text,
  api_base_url text,
  api_key_encrypted text,
  config_json jsonb,
  is_active boolean NOT NULL DEFAULT false,
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT repair_provider_single_row CHECK (id = 1)
);

ALTER TABLE shop_repair_provider_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_repair_provider_config" ON shop_repair_provider_config;
CREATE POLICY "anon_select_repair_provider_config" ON shop_repair_provider_config
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_update_repair_provider_config" ON shop_repair_provider_config;
CREATE POLICY "anon_update_repair_provider_config" ON shop_repair_provider_config
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_insert_repair_provider_config" ON shop_repair_provider_config;
CREATE POLICY "anon_insert_repair_provider_config" ON shop_repair_provider_config
  FOR INSERT TO anon, authenticated WITH CHECK (true);
