/*
# Shop Work Order Workflow + Payments

## Purpose
1. Expands the work order status from a simple text field into a real workflow
   with defined stages: estimate → approved → in_progress → waiting_parts →
   completed → invoiced → paid.
2. Adds a payments table to track multiple payments per work order, with
   automatic balance_due calculation.
3. Adds balance_due column to shop_work_orders.

## Changes

### shop_work_orders
- status CHECK constraint updated to include: estimate, approved, in_progress,
  waiting_parts, completed, invoiced, paid
- balance_due numeric column added (total - sum of payments)

### shop_payments
- id (uuid PK)
- work_order_id (uuid FK → shop_work_orders, ON DELETE CASCADE)
- amount (numeric — payment amount)
- method (text: cash, card, check, transfer, other)
- reference (text — check number, transaction ID, etc., nullable)
- notes (text, nullable)
- created_at (timestamp)

## Security
- RLS enabled on shop_payments.
- CRUD policies for anon, authenticated (same pattern as existing shop tables).

## Important Notes
1. The status constraint is replaced (DROP + ADD) to allow the new workflow
   stages. Existing rows with 'estimate' or 'in_progress' remain valid.
2. balance_due is stored and kept in sync by the frontend: when a payment is
   added, balance_due = total - sum(payments.amount).
3. The 'invoiced' and 'paid' statuses are terminal workflow states. 'paid' is
   set automatically when balance_due reaches 0 (but can also be set manually).
*/

-- ===== UPDATE WORK ORDER STATUS CONSTRAINT =====
ALTER TABLE shop_work_orders DROP CONSTRAINT IF EXISTS shop_work_orders_status_check;
ALTER TABLE shop_work_orders ADD CONSTRAINT shop_work_orders_status_check
  CHECK (status IN ('estimate', 'approved', 'in_progress', 'waiting_parts', 'completed', 'invoiced', 'paid'));

-- ===== ADD BALANCE_DUE COLUMN =====
ALTER TABLE shop_work_orders ADD COLUMN IF NOT EXISTS balance_due numeric(10,2) NOT NULL DEFAULT 0;

-- ===== SHOP PAYMENTS TABLE =====
CREATE TABLE IF NOT EXISTS shop_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id uuid NOT NULL REFERENCES shop_work_orders(id) ON DELETE CASCADE,
  amount numeric(10,2) NOT NULL DEFAULT 0,
  method text NOT NULL DEFAULT 'cash' CHECK (method IN ('cash', 'card', 'check', 'transfer', 'other')),
  reference text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE shop_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "shop_payments_read" ON shop_payments;
CREATE POLICY "shop_payments_read" ON shop_payments FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "shop_payments_insert" ON shop_payments;
CREATE POLICY "shop_payments_insert" ON shop_payments FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "shop_payments_update" ON shop_payments;
CREATE POLICY "shop_payments_update" ON shop_payments FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "shop_payments_delete" ON shop_payments;
CREATE POLICY "shop_payments_delete" ON shop_payments FOR DELETE
  TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_shop_payments_wo ON shop_payments(work_order_id);
