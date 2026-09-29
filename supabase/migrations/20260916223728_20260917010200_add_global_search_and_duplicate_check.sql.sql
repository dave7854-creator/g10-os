-- ===== 4. global_search function =====
-- Searches across all business modules. Returns categorized JSON results.
-- Called via service-role key from the edge function.

CREATE OR REPLACE FUNCTION global_search(p_query text, p_limit int DEFAULT 20)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_query text := lower(trim(p_query));
  v_results jsonb := '{}'::jsonb;
BEGIN
  IF v_query = '' OR length(v_query) < 2 THEN
    RETURN jsonb_build_object('success', true, 'results', '{}'::jsonb);
  END IF;

  -- CUSTOMERS: search by name, phone (normalized), email
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'type', 'customer',
    'id', id,
    'label', first_name || ' ' || last_name,
    'sublabel', COALESCE(phone, 'No phone') || ' · ' || COALESCE(email, 'No email'),
    'phone', phone,
    'email', email
  )), '[]'::jsonb) INTO v_results
  FROM shop_customers
  WHERE lower(first_name || ' ' || last_name) LIKE '%' || v_query || '%'
     OR lower(COALESCE(email, '')) LIKE '%' || v_query || '%'
     OR replace(replace(replace(replace(COALESCE(phone, ''), ' ', ''), '-', ''), '(', ''), ')', '') LIKE '%' || replace(replace(replace(replace(v_query, ' ', ''), '-', ''), '(', ''), ')', '') || '%'
  LIMIT p_limit;

  v_results := jsonb_build_object('customers', v_results);

  -- VEHICLES (shop_vehicles — customer repair vehicles): search by VIN, year, make, model, plate
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'type', 'vehicle',
    'id', id,
    'label', COALESCE(year::text, '') || ' ' || COALESCE(make, '') || ' ' || COALESCE(model, ''),
    'sublabel', 'VIN: ' || COALESCE(vin, '—') || COALESCE(' · Plate: ' || plate, ''),
    'vin', vin,
    'customer_id', customer_id
  )), '[]'::jsonb) INTO v_results
  FROM shop_vehicles
  WHERE lower(COALESCE(vin, '')) LIKE '%' || v_query || '%'
     OR lower(COALESCE(make, '')) LIKE '%' || v_query || '%'
     OR lower(COALESCE(model, '')) LIKE '%' || v_query || '%'
     OR COALESCE(year::text, '') LIKE '%' || v_query || '%'
     OR lower(COALESCE(plate, '')) LIKE '%' || v_query || '%'
  LIMIT p_limit;

  v_results := jsonb_build_object('vehicles', v_results) || v_results;

  -- WORK ORDERS: search by WO number, customer name (via join), vehicle info
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'type', 'work_order',
    'id', wo.id,
    'label', wo.work_order_number,
    'sublabel', COALESCE(c.first_name || ' ' || c.last_name, '—') || ' · $' || wo.total::text || ' · ' || wo.status,
    'status', wo.status,
    'customer_id', wo.customer_id
  )), '[]'::jsonb) INTO v_results
  FROM shop_work_orders wo
  LEFT JOIN shop_customers c ON c.id = wo.customer_id
  WHERE lower(wo.work_order_number) LIKE '%' || v_query || '%'
     OR lower(COALESCE(c.first_name || ' ' || c.last_name, '')) LIKE '%' || v_query || '%'
     OR lower(COALESCE(wo.notes, '')) LIKE '%' || v_query || '%'
  LIMIT p_limit;

  v_results := jsonb_build_object('work_orders', v_results) || v_results;

  -- TOWING: search by VIN, make, model, plate, tow location
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'type', 'towing',
    'id', id,
    'label', COALESCE(year::text, '') || ' ' || COALESCE(make, '') || ' ' || COALESCE(model, 'Vehicle'),
    'sublabel', 'VIN: ' || COALESCE(vin, '—') || COALESCE(' · Plate: ' || plate, '') || ' · ' || COALESCE(tow_location, ''),
    'vin', vin,
    'plate', plate,
    'customer_id', customer_id,
    'tow_date', tow_date
  )), '[]'::jsonb) INTO v_results
  FROM towing_impounds
  WHERE lower(COALESCE(vin, '')) LIKE '%' || v_query || '%'
     OR lower(COALESCE(make, '')) LIKE '%' || v_query || '%'
     OR lower(COALESCE(model, '')) LIKE '%' || v_query || '%'
     OR lower(COALESCE(plate, '')) LIKE '%' || v_query || '%'
     OR lower(COALESCE(tow_location, '')) LIKE '%' || v_query || '%'
  LIMIT p_limit;

  v_results := jsonb_build_object('towing', v_results) || v_results;

  -- PARTS (shop_parts): search by description, part number
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'type', 'part',
    'id', sp.id,
    'label', sp.description,
    'sublabel', 'Part #: ' || COALESCE(sp.part_number, '—') || ' · $' || sp.sell_price::text,
    'part_number', sp.part_number,
    'work_order_id', sp.work_order_id
  )), '[]'::jsonb) INTO v_results
  FROM shop_parts sp
  WHERE lower(COALESCE(sp.description, '')) LIKE '%' || v_query || '%'
     OR lower(COALESCE(sp.part_number, '')) LIKE '%' || v_query || '%'
  LIMIT p_limit;

  v_results := jsonb_build_object('parts', v_results) || v_results;

  -- SALVAGE PARTS (part_details): search by part name, OEM, interchange, SKU
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'type', 'salvage_part',
    'id', pd.part_id,
    'vehicle_id', pd.vehicle_id,
    'label', COALESCE(pd.part_name, 'Part'),
    'sublabel', 'OEM: ' || COALESCE(pd.oem_part_number, '—') || COALESCE(' · Interchange: ' || pd.interchange_number, '') || COALESCE(' · SKU: ' || pd.sku, ''),
    'oem_part_number', pd.oem_part_number,
    'interchange_number', pd.interchange_number,
    'sku', pd.sku
  )), '[]'::jsonb) INTO v_results
  FROM part_details pd
  WHERE lower(COALESCE(pd.part_name, '')) LIKE '%' || v_query || '%'
     OR lower(COALESCE(pd.oem_part_number, '')) LIKE '%' || v_query || '%'
     OR lower(COALESCE(pd.interchange_number, '')) LIKE '%' || v_query || '%'
     OR lower(COALESCE(pd.sku, '')) LIKE '%' || v_query || '%'
  LIMIT p_limit;

  v_results := jsonb_build_object('salvage_parts', v_results) || v_results;

  -- SALVAGE VEHICLES (vehicles table): search by VIN, year, make, model
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'type', 'salvage_vehicle',
    'id', v.id,
    'label', COALESCE(v.year::text, '') || ' ' || COALESCE(v.make, '') || ' ' || COALESCE(v.model, ''),
    'sublabel', 'VIN: ' || COALESCE(v.vin, '—') || ' · Status: ' || v.status,
    'vin', v.vin,
    'status', v.status
  )), '[]'::jsonb) INTO v_results
  FROM vehicles v
  WHERE lower(COALESCE(v.vin, '')) LIKE '%' || v_query || '%'
     OR lower(COALESCE(v.make, '')) LIKE '%' || v_query || '%'
     OR lower(COALESCE(v.model, '')) LIKE '%' || v_query || '%'
     OR COALESCE(v.year::text, '') LIKE '%' || v_query || '%'
  LIMIT p_limit;

  v_results := jsonb_build_object('salvage_vehicles', v_results) || v_results;

  -- PART INQUIRIES: search by customer name, part needed, VIN
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'type', 'inquiry',
    'id', pi.id,
    'label', COALESCE(pi.part_needed, 'Inquiry'),
    'sublabel', COALESCE(pi.customer_name, '—') || ' · ' || COALESCE(pi.phone, '') || ' · ' || pi.status,
    'customer_name', pi.customer_name,
    'customer_id', pi.customer_id
  )), '[]'::jsonb) INTO v_results
  FROM part_inquiries pi
  WHERE lower(COALESCE(pi.customer_name, '')) LIKE '%' || v_query || '%'
     OR lower(COALESCE(pi.part_needed, '')) LIKE '%' || v_query || '%'
     OR lower(COALESCE(pi.vin, '')) LIKE '%' || v_query || '%'
     OR lower(COALESCE(pi.phone, '')) LIKE '%' || v_query || '%'
  LIMIT p_limit;

  v_results := jsonb_build_object('inquiries', v_results) || v_results;

  -- EBAY LISTINGS: search by title, SKU
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'type', 'ebay_listing',
    'id', el.id,
    'label', el.title,
    'sublabel', '$' || el.price::text || COALESCE(' · ' || el.listing_status, '') || COALESCE(' · SKU: ' || el.sku, ''),
    'part_id', el.part_id,
    'vehicle_id', el.vehicle_id,
    'ebay_item_id', el.ebay_item_id
  )), '[]'::jsonb) INTO v_results
  FROM ebay_listings el
  WHERE lower(COALESCE(el.title, '')) LIKE '%' || v_query || '%'
     OR lower(COALESCE(el.sku, '')) LIKE '%' || v_query || '%'
  LIMIT p_limit;

  v_results := jsonb_build_object('ebay_listings', v_results) || v_results;

  RETURN jsonb_build_object('success', true, 'results', v_results);
END;
$$;

REVOKE EXECUTE ON FUNCTION global_search FROM anon, authenticated;

-- ===== 5. customer_duplicate_check function =====

CREATE OR REPLACE FUNCTION customer_duplicate_check(
  p_phone text DEFAULT NULL,
  p_email text DEFAULT NULL,
  p_first_name text DEFAULT NULL,
  p_last_name text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_matches jsonb;
  v_normalized_phone text;
BEGIN
  v_normalized_phone := replace(replace(replace(replace(COALESCE(p_phone, ''), ' ', ''), '-', ''), '(', ''), ')', '');

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', id,
    'first_name', first_name,
    'last_name', last_name,
    'phone', phone,
    'email', email,
    'match_type', CASE
      WHEN p_email IS NOT NULL AND lower(email) = lower(p_email) THEN 'email_exact'
      WHEN v_normalized_phone != '' AND replace(replace(replace(replace(COALESCE(phone, ''), ' ', ''), '-', ''), '(', ''), ')', '') = v_normalized_phone THEN 'phone_exact'
      ELSE 'name_similar'
    END
  )), '[]'::jsonb) INTO v_matches
  FROM shop_customers
  WHERE
    -- Exact phone match (normalized)
    (v_normalized_phone != '' AND replace(replace(replace(replace(COALESCE(phone, ''), ' ', ''), '-', ''), '(', ''), ')', '') = v_normalized_phone)
    -- Exact email match (case-insensitive)
    OR (p_email IS NOT NULL AND email IS NOT NULL AND lower(email) = lower(p_email))
    -- Similar name match (both first and last name match case-insensitive)
    OR (p_first_name IS NOT NULL AND p_last_name IS NOT NULL
        AND lower(first_name) = lower(p_first_name)
        AND lower(last_name) = lower(p_last_name))
  LIMIT 10;

  RETURN jsonb_build_object('success', true, 'matches', v_matches);
END;
$$;

REVOKE EXECUTE ON FUNCTION customer_duplicate_check FROM anon, authenticated;

-- ===== 6. link_towing_to_customer function =====
-- Manager can link a towing record to a customer (and optionally a shop vehicle)

CREATE OR REPLACE FUNCTION link_towing_to_customer(
  p_impound_id uuid,
  p_customer_id uuid,
  p_shop_vehicle_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  UPDATE towing_impounds
  SET customer_id = p_customer_id,
      shop_vehicle_id = p_shop_vehicle_id,
      updated_at = now()
  WHERE id = p_impound_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE EXECUTE ON FUNCTION link_towing_to_customer FROM anon, authenticated;

-- ===== 7. link_inquiry_to_customer function =====

CREATE OR REPLACE FUNCTION link_inquiry_to_customer(
  p_inquiry_id uuid,
  p_customer_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  UPDATE part_inquiries
  SET customer_id = p_customer_id
  WHERE id = p_inquiry_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE EXECUTE ON FUNCTION link_inquiry_to_customer FROM anon, authenticated;