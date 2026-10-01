/*
  TRACS one-time migration support.

  Goals:
  - preserve original TRACS IDs for idempotent imports
  - keep all unmapped source fields in jsonb metadata
  - preserve every work-order line, including notes/charges/tires/wheels
  - archive secondary TRACS tables without forcing them into the live G10 schema
*/

ALTER TABLE shop_customers
  ADD COLUMN IF NOT EXISTS tracs_customer_id integer,
  ADD COLUMN IF NOT EXISTS tracs_old_customer_id integer,
  ADD COLUMN IF NOT EXISTS tracs_metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS uq_shop_customers_tracs_customer_id
  ON shop_customers(tracs_customer_id)
  WHERE tracs_customer_id IS NOT NULL;

ALTER TABLE shop_vehicles
  ADD COLUMN IF NOT EXISTS tracs_vehicle_id integer,
  ADD COLUMN IF NOT EXISTS tracs_old_vehicle_id integer,
  ADD COLUMN IF NOT EXISTS tracs_metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS uq_shop_vehicles_tracs_vehicle_id
  ON shop_vehicles(tracs_vehicle_id)
  WHERE tracs_vehicle_id IS NOT NULL;

ALTER TABLE shop_work_orders
  ADD COLUMN IF NOT EXISTS tracs_work_order_id integer,
  ADD COLUMN IF NOT EXISTS tracs_old_ro_id integer,
  ADD COLUMN IF NOT EXISTS tracs_wo_number integer,
  ADD COLUMN IF NOT EXISTS tracs_metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS uq_shop_work_orders_tracs_work_order_id
  ON shop_work_orders(tracs_work_order_id)
  WHERE tracs_work_order_id IS NOT NULL;

ALTER TABLE shop_work_orders DROP CONSTRAINT IF EXISTS shop_work_orders_status_check;
ALTER TABLE shop_work_orders ADD CONSTRAINT shop_work_orders_status_check
  CHECK (status IN (
    'estimate',
    'approved',
    'in_progress',
    'waiting_parts',
    'completed',
    'invoiced',
    'paid',
    'cancelled'
  ));

ALTER TABLE shop_labor_operations
  ADD COLUMN IF NOT EXISTS tracs_line_item_id integer,
  ADD COLUMN IF NOT EXISTS tracs_metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS uq_shop_labor_operations_tracs_line_item_id
  ON shop_labor_operations(tracs_line_item_id)
  WHERE tracs_line_item_id IS NOT NULL;

ALTER TABLE shop_parts
  ADD COLUMN IF NOT EXISTS tracs_line_item_id integer,
  ADD COLUMN IF NOT EXISTS tracs_metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS uq_shop_parts_tracs_line_item_id
  ON shop_parts(tracs_line_item_id)
  WHERE tracs_line_item_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS tracs_import_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_label text NOT NULL DEFAULT 'TRACS',
  source_version text,
  status text NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'completed', 'failed', 'dry_run')),
  customers_count integer NOT NULL DEFAULT 0,
  vehicles_count integer NOT NULL DEFAULT 0,
  work_orders_count integer NOT NULL DEFAULT 0,
  line_items_count integer NOT NULL DEFAULT 0,
  secondary_rows_count integer NOT NULL DEFAULT 0,
  notes text,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

ALTER TABLE tracs_import_batches ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS tracs_raw_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_batch_id uuid REFERENCES tracs_import_batches(id) ON DELETE SET NULL,
  source_table text NOT NULL,
  source_key text NOT NULL,
  payload jsonb NOT NULL,
  imported_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_table, source_key)
);

CREATE INDEX IF NOT EXISTS idx_tracs_raw_records_table
  ON tracs_raw_records(source_table);

ALTER TABLE tracs_raw_records ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS tracs_work_order_line_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id uuid NOT NULL REFERENCES shop_work_orders(id) ON DELETE CASCADE,
  tracs_line_item_id integer NOT NULL UNIQUE,
  line_type text,
  description text,
  part_number text,
  manufacturer text,
  quantity numeric,
  cost numeric,
  list_price numeric,
  sale_price numeric,
  tax_amount numeric,
  total numeric,
  billed_hours numeric,
  actual_hours numeric,
  technician text,
  display_order integer,
  note text,
  tracs_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tracs_wo_lines_work_order
  ON tracs_work_order_line_items(work_order_id);

ALTER TABLE tracs_work_order_line_items ENABLE ROW LEVEL SECURITY;

-- No anon/authenticated policies are created for the import/archive tables.
-- The one-time importer uses the Supabase service-role key server-side/local only.
