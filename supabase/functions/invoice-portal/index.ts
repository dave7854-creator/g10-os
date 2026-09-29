import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const path = url.pathname.replace(/^\/invoice-portal/, "");

    // GET /invoice-portal/:token — fetch invoice data by secure token
    if (req.method === "GET" && path && path !== "/") {
      const token = path.replace(/^\//, "");

      if (!token || token.length < 20) {
        return new Response(JSON.stringify({ error: "Invalid invoice link" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: tokenRow, error: tokenErr } = await supabase
        .from("shop_invoice_tokens")
        .select("work_order_id, revoked, expires_at")
        .eq("token", token)
        .maybeSingle();

      if (tokenErr || !tokenRow) {
        return new Response(JSON.stringify({ error: "Invoice not found" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (tokenRow.revoked) {
        return new Response(JSON.stringify({ error: "This invoice link has been revoked" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (tokenRow.expires_at && new Date(tokenRow.expires_at) < new Date()) {
        return new Response(JSON.stringify({ error: "This invoice link has expired" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Fetch work order
      const { data: wo, error: woErr } = await supabase
        .from("shop_work_orders")
        .select("id, work_order_number, status, payment_status, subtotal, tax, total, balance_due, shop_supplies, notes, created_at, invoice_date, customer_id, vehicle_id")
        .eq("id", tokenRow.work_order_id)
        .maybeSingle();

      if (woErr || !wo) {
        return new Response(JSON.stringify({ error: "Invoice not found" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Fetch customer
      let customer = null;
      if (wo.customer_id) {
        const { data: cust } = await supabase
          .from("shop_customers")
          .select("first_name, last_name, phone, email")
          .eq("id", wo.customer_id)
          .maybeSingle();
        customer = cust;
      }

      // Fetch vehicle
      let vehicle = null;
      if (wo.vehicle_id) {
        const { data: veh } = await supabase
          .from("shop_vehicles")
          .select("year, make, model, trim, engine, vin, mileage")
          .eq("id", wo.vehicle_id)
          .maybeSingle();
        vehicle = veh;
      }

      // Fetch labor operations — customer-facing, no cost/profit data
      const { data: operations } = await supabase
        .from("shop_labor_operations")
        .select("operation_description, charged_hours, labor_rate, labor_total")
        .eq("work_order_id", wo.id)
        .order("display_order", { ascending: true });

      // Fetch parts — customer-facing: description and sell_price only, NO cost/markup
      const { data: parts } = await supabase
        .from("shop_parts")
        .select("description, sell_price, core_charge")
        .eq("work_order_id", wo.id)
        .order("display_order", { ascending: true });

      // Fetch payments — customer-facing: date, amount, method only
      const { data: payments } = await supabase
        .from("shop_payments")
        .select("amount, method, created_at, payment_status")
        .eq("work_order_id", wo.id)
        .eq("payment_status", "completed")
        .order("created_at", { ascending: true });

      // Fetch payment config — only public fields (no secrets)
      const { data: config } = await supabase
        .from("shop_payment_config")
        .select("square_enabled, square_app_id, square_environment, square_location_id, square_display_name, paypal_enabled, paypal_client_id, paypal_display_name, venmo_enabled, venmo_link, venmo_display_name, cashapp_enabled, cashapp_link, cashapp_display_name, manual_link_enabled, manual_link_url, manual_link_display_name")
        .eq("id", 1)
        .maybeSingle();

      const laborSubtotal = (operations ?? []).reduce((s: number, o: any) => s + Number(o.labor_total), 0);
      const partsTotal = (parts ?? []).reduce((s: number, p: any) => s + Number(p.sell_price), 0);
      const coreChargeTotal = (parts ?? []).reduce((s: number, p: any) => s + Number(p.core_charge), 0);
      const totalPaid = (payments ?? []).reduce((s: number, p: any) => s + Number(p.amount), 0);

      return new Response(JSON.stringify({
        invoice: {
          number: wo.work_order_number,
          status: wo.status,
          payment_status: wo.payment_status,
          date: wo.invoice_date ?? wo.created_at,
          labor_subtotal: laborSubtotal,
          parts_subtotal: partsTotal,
          shop_supplies: Number(wo.shop_supplies),
          core_charges: coreChargeTotal,
          tax: Number(wo.tax),
          total: Number(wo.total),
          total_paid: totalPaid,
          balance_due: Number(wo.balance_due),
        },
        customer: customer ? {
          name: `${customer.first_name} ${customer.last_name}`.trim(),
        } : null,
        vehicle: vehicle ? {
          year: vehicle.year,
          make: vehicle.make,
          model: vehicle.model,
          trim: vehicle.trim,
          engine: vehicle.engine,
          vin: vehicle.vin,
        } : null,
        operations: (operations ?? []).map((o: any) => ({
          description: o.operation_description,
          hours: Number(o.charged_hours),
          rate: Number(o.labor_rate),
          total: Number(o.labor_total),
        })),
        parts: (parts ?? []).map((p: any) => ({
          description: p.description,
          price: Number(p.sell_price),
          core_charge: Number(p.core_charge),
        })),
        payments: (payments ?? []).map((p: any) => ({
          date: p.created_at,
          amount: Number(p.amount),
          method: p.method,
        })),
        payment_config: config ? {
          square_enabled: config.square_enabled,
          square_app_id: config.square_app_id,
          square_environment: config.square_environment,
          square_location_id: config.square_location_id,
          square_display_name: config.square_display_name,
          paypal_enabled: config.paypal_enabled,
          paypal_client_id: config.paypal_client_id,
          paypal_display_name: config.paypal_display_name,
          venmo_enabled: config.venmo_enabled,
          venmo_link: config.venmo_link,
          venmo_display_name: config.venmo_display_name,
          cashapp_enabled: config.cashapp_enabled,
          cashapp_link: config.cashapp_link,
          cashapp_display_name: config.cashapp_display_name,
          manual_link_enabled: config.manual_link_enabled,
          manual_link_url: config.manual_link_url,
          manual_link_display_name: config.manual_link_display_name,
        } : null,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // POST /invoice-portal — create a new invoice token for a work order
    if (req.method === "POST" && (!path || path === "/")) {
      const { work_order_id } = await req.json();

      if (!work_order_id) {
        return new Response(JSON.stringify({ error: "Work order ID required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Generate a secure random token
      const tokenBytes = crypto.getRandomValues(new Uint8Array(33));
      const token = btoa(String.fromCharCode(...tokenBytes))
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");

      const { data, error } = await supabase
        .from("shop_invoice_tokens")
        .insert({ work_order_id, token })
        .select("token")
        .single();

      if (error || !data) {
        return new Response(JSON.stringify({ error: "Failed to create invoice link" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ token: data.token }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Not found" }), {
      status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
