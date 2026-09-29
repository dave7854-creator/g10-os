/*
# Unified Customer/Vehicle Linking + Global Search

## Overview
This migration connects existing records across all business modules (Shop, Towing,
Parts, eBay, Salvage) so that a customer and vehicle remain the same record regardless
of which module handles the interaction. It also adds a server-side global search
function for the Manager portal.

## Changes

### 1. Cross-module foreign keys (nullable, additive)
- `towing_impounds.customer_id` (uuid, nullable, FK → shop_customers)
  Links a tow to a unified customer record. Existing rows have NULL — no data loss.
- `towing_impounds.shop_vehicle_id` (uuid, nullable, FK → shop_vehicles)
  Links a tow to a unified vehicle record (repair-shop vehicles, not salvage yard).
- `part_inquiries.customer_id` (uuid, nullable, FK → shop_customers)
  Links a parts request to a unified customer record.

These are all nullable so existing rows are unaffected. New records CAN be linked.
Historical records can be linked by managers via the UI.

### 2. Shop vehicle plate column
- `shop_vehicles.plate` (text, nullable)
  License plate for the vehicle. Not all vehicles have plates on file.

### 3. Search indexes
- `idx_shop_customers_phone` on shop_customers(phone)
- `idx_shop_customers_email` on shop_customers(email)
- `idx_shop_vehicles_vin` on shop_vehicles(vin) — already may exist from prior migration
- `idx_towing_impounds_vin` on towing_impounds(vin)
- `idx_towing_impounds_customer` on towing_impounds(customer_id)
- `idx_part_inquiries_customer` on part_inquiries(customer_id)

### 4. global_search SECURITY DEFINER function
A single Postgres function that searches across customers, vehicles, work orders,
towing records, parts, invoices, and salvage vehicles. Returns categorized results
with enough info to identify each record. Called by the edge function with the
service-role key. No client-side access (REVOKE from anon, authenticated).

### 5. customer_duplicate_check function
Checks for existing customers by normalized phone or email. Returns possible matches
so managers can choose to use an existing customer or create a new one. Prevents
duplicate customer creation.

## Security
- All new columns are nullable — no existing data is affected.
- RLS remains unchanged on all tables.
- The global_search and customer_duplicate_check functions are SECURITY DEFINER,
  callable only via the service-role key from the edge function. No anon/authenticated
  access.
*/