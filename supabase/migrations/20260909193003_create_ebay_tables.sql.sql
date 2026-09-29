-- eBay Motors Integration — Config + Listings tables

-- 1. Config table (singleton row, id=1)
CREATE TABLE IF NOT EXISTS ebay_config (
  id integer PRIMARY KEY DEFAULT 1,
  client_id text,
  client_secret text,
  ru_name text,
  environment text DEFAULT 'sandbox',
  refresh_token text,
  user_token text,
  token_expires_at timestamptz,
  merchant_name text DEFAULT 'Fort Peck Auto',
  default_handling_time integer DEFAULT 2,
  default_return_policy text DEFAULT 'ReturnsNotAccepted',
  auto_publish boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT ebay_config_singleton CHECK (id = 1)
);

-- 2. Listings table
CREATE TABLE IF NOT EXISTS ebay_listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  part_id text NOT NULL,
  vehicle_id uuid NOT NULL,
  ebay_item_id text,
  ebay_offer_id text,
  title text NOT NULL,
  subtitle text,
  description text,
  category_id text,
  condition_id text,
  condition_description text,
  price numeric NOT NULL DEFAULT 0,
  quantity integer NOT NULL DEFAULT 1,
  listing_status text NOT NULL DEFAULT 'draft',
  listing_duration text NOT NULL DEFAULT 'GTC',
  start_price numeric,
  buy_it_now_price numeric,
  listing_type text NOT NULL DEFAULT 'FixedPrice',
  shipping_weight_lbs numeric,
  shipping_dimensions jsonb,
  shipping_cost numeric DEFAULT 0,
  shipping_type text DEFAULT 'Flat',
  payment_methods jsonb DEFAULT '[]',
  item_specifics jsonb DEFAULT '{}',
  photo_urls jsonb DEFAULT '[]',
  view_count integer DEFAULT 0,
  watch_count integer DEFAULT 0,
  sold_at timestamptz,
  ended_at timestamptz,
  listing_url text,
  published_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 3. RLS
ALTER TABLE ebay_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE ebay_listings ENABLE ROW LEVEL SECURITY;

-- 4. Policies for ebay_config
CREATE POLICY "anon_select_ebay_config" ON ebay_config FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "anon_insert_ebay_config" ON ebay_config FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "anon_update_ebay_config" ON ebay_config FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_delete_ebay_config" ON ebay_config FOR DELETE TO anon, authenticated USING (true);

-- 5. Policies for ebay_listings
CREATE POLICY "anon_select_ebay_listings" ON ebay_listings FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "anon_insert_ebay_listings" ON ebay_listings FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "anon_update_ebay_listings" ON ebay_listings FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_delete_ebay_listings" ON ebay_listings FOR DELETE TO anon, authenticated USING (true);

-- 6. Insert singleton config row
INSERT INTO ebay_config (id) VALUES (1) ON CONFLICT DO NOTHING;
