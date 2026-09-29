/*
# Shop Parts — Work Order Parts Line Items

## Purpose
Adds a dedicated parts table to the shop management module so work orders can
track individual parts with cost, markup, supplier, core charge, taxability,
and in-stock status. Parts costs and markups roll into the work order subtotal
alongside labor operations.

## New Tables

### shop_parts
Individual parts line items on a work order. Each part tracks cost, markup
percentage, supplier, core charge, taxability, and whether the part is in stock.
- id (uuid PK)
- work_order_id (uuid FK → shop_work_orders, ON DELETE CASCADE)
- part_number (text — manufacturer/SKU part number, nullable)
- description (text — human-readable part name)
- cost (numeric — what the shop pays for the part)
- markup_percent (numeric — markup percentage applied to cost, default 30%)
- sell_price (numeric — cost + markup, calculated: cost * (1 + markup_percent/100))
- supplier (text — where the part is sourced from, nullable)
- core_charge (numeric — refundable core charge, default 0)
- is_taxable (boolean — whether sales tax applies, default true)
- in_stock (boolean — whether the part is on hand, default false)
- is_ai_suggested (boolean — whether this part came from AI suggestions, default false)
- display_order (integer — ordering on the work order)
- created_at, updated_at (timestamps)

## Security
- RLS enabled on shop_parts.
- CRUD policies for anon, authenticated (single-tenant shop app, same pattern
  as existing shop tables).

## Important Notes
1. sell_price is calculated as cost * (1 + markup_percent/100) and stored
   for query simplicity. The frontend recalculates on any cost/markup change.
2. Core charges are tracked separately and added to totals but are typically
   non-taxable.
3. is_ai_suggested flags parts that originated from the AI suggestion feature
   so they can be visually distinguished. Manual override is always allowed.
4. Parts subtotal = sum(sell_price + core_charge) for all parts on a work order.
   The work order's subtotal = labor_subtotal + parts_subtotal, and tax applies
   to taxable items only.
*/

CREATE TABLE IF NOT EXISTS shop_parts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id uuid NOT NULL REFERENCES shop_work_orders(id) ON DELETE CASCADE,
  part_number text,
  description text NOT NULL DEFAULT '',
  cost numeric(10,2) NOT NULL DEFAULT 0,
  markup_percent numeric(5,2) NOT NULL DEFAULT 30.00,
  sell_price numeric(10,2) NOT NULL DEFAULT 0,
  supplier text,
  core_charge numeric(10,2) NOT NULL DEFAULT 0,
  is_taxable boolean NOT NULL DEFAULT true,
  in_stock boolean NOT NULL DEFAULT false,
  is_ai_suggested boolean NOT NULL DEFAULT false,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE shop_parts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "shop_parts_read" ON shop_parts;
CREATE POLICY "shop_parts_read" ON shop_parts FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "shop_parts_insert" ON shop_parts;
CREATE POLICY "shop_parts_insert" ON shop_parts FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "shop_parts_update" ON shop_parts;
CREATE POLICY "shop_parts_update" ON shop_parts FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "shop_parts_delete" ON shop_parts;
CREATE POLICY "shop_parts_delete" ON shop_parts FOR DELETE
  TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_shop_parts_wo ON shop_parts(work_order_id);
