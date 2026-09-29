-- ===== 1. Cross-module foreign keys (nullable, additive) =====

ALTER TABLE towing_impounds
  ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES shop_customers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS shop_vehicle_id uuid REFERENCES shop_vehicles(id) ON DELETE SET NULL;

ALTER TABLE part_inquiries
  ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES shop_customers(id) ON DELETE SET NULL;

-- ===== 2. Shop vehicle plate column =====

ALTER TABLE shop_vehicles
  ADD COLUMN IF NOT EXISTS plate text;

-- ===== 3. Search indexes =====

CREATE INDEX IF NOT EXISTS idx_shop_customers_phone ON shop_customers(phone);
CREATE INDEX IF NOT EXISTS idx_shop_customers_email ON shop_customers(email);
CREATE INDEX IF NOT EXISTS idx_shop_vehicles_vin ON shop_vehicles(vin);
CREATE INDEX IF NOT EXISTS idx_towing_impounds_vin ON towing_impounds(vin);
CREATE INDEX IF NOT EXISTS idx_towing_impounds_customer ON towing_impounds(customer_id);
CREATE INDEX IF NOT EXISTS idx_part_inquiries_customer ON part_inquiries(customer_id);
CREATE INDEX IF NOT EXISTS idx_shop_work_orders_number ON shop_work_orders(work_order_number);
CREATE INDEX IF NOT EXISTS idx_shop_parts_desc ON shop_parts(description);
CREATE INDEX IF NOT EXISTS idx_part_details_oem ON part_details(oem_part_number);
CREATE INDEX IF NOT EXISTS idx_part_details_interchange ON part_details(interchange_number);
CREATE INDEX IF NOT EXISTS idx_part_details_sku ON part_details(sku);