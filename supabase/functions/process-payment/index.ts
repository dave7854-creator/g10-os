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
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { token, payment_token, amount_cents, processor } = await req.json();

    if (!token || !payment_token || !amount_cents) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1. Validate the invoice token
    const { data: tokenRow, error: tokenErr } = await supabase
      .from("shop_invoice_tokens")
      .select("work_order_id, revoked, expires_at")
      .eq("token", token)
      .maybeSingle();

    if (tokenErr || !tokenRow) {
      return new Response(JSON.stringify({ error: "Invalid invoice link" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (tokenRow.revoked || (tokenRow.expires_at && new Date(tokenRow.expires_at) < new Date())) {
      return new Response(JSON.stringify({ error: "Invoice link is no longer valid" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Fetch the work order
    const { data: wo, error: woErr } = await supabase
      .from("shop_work_orders")
      .select("id, work_order_number, total, balance_due, status, payment_status")
      .eq("id", tokenRow.work_order_id)
      .maybeSingle();

    if (woErr || !wo) {
      return new Response(JSON.stringify({ error: "Invoice not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3. Validate amount doesn't exceed balance
    const balanceDueCents = Math.round(Number(wo.balance_due) * 100);
    if (amount_cents > balanceDueCents) {
      return new Response(JSON.stringify({ error: "Payment amount exceeds balance due" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (amount_cents < 50) {
      return new Response(JSON.stringify({ error: "Minimum payment is $0.50" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 4. Fetch payment config
    const { data: config } = await supabase
      .from("shop_payment_config")
      .select("square_enabled, square_access_token, square_location_id, square_environment, paypal_enabled, paypal_client_id, paypal_client_secret")
      .eq("id", 1)
      .maybeSingle();

    if (!config) {
      return new Response(JSON.stringify({ error: "Payment system not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 5. Process based on processor type
    if (processor === "square") {
      if (!config.square_enabled || !config.square_access_token) {
        return new Response(JSON.stringify({ error: "Square payments are not enabled" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Call Square Payments API
      const squareEnv = config.square_environment || "production";
      const squareUrl = squareEnv === "sandbox"
        ? "https://connect.squareupsandbox.com/v2/payments"
        : "https://connect.squareup.com/v2/payments";
      const squareBody = {
        source_id: payment_token,
        idempotency_key: crypto.randomUUID(),
        amount_money: {
          amount: amount_cents,
          currency: "USD",
        },
        location_id: config.square_location_id || undefined,
        autocomplete: true,
      };

      const squareResp = await fetch(squareUrl, {
        method: "POST",
        headers: {
          "Square-Version": "2024-08-21",
          "Authorization": `Bearer ${config.square_access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(squareBody),
      });

      const squareData = await squareResp.json();

      if (!squareResp.ok || squareData.errors) {
        const errMsg = squareData.errors?.[0]?.detail ?? "Square payment failed";
        return new Response(JSON.stringify({ error: errMsg, square_errors: squareData.errors }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const paymentId = squareData.payment?.id;
      const paymentAmountCents = squareData.payment?.amount_money?.amount ?? amount_cents;
      const paymentAmount = paymentAmountCents / 100;

      // 6. Record the payment
      const { error: payErr } = await supabase
        .from("shop_payments")
        .insert({
          work_order_id: wo.id,
          amount: paymentAmount,
          method: "card",
          reference: paymentId,
          payment_status: "completed",
          processor: "square",
          square_transaction_id: paymentId,
        });

      if (payErr) {
        // Payment succeeded but recording failed — return success with warning
        return new Response(JSON.stringify({
          success: true,
          payment_id: paymentId,
          amount: paymentAmount,
          warning: "Payment processed but recording delayed",
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // 7. Update work order balance and status
      const newBalance = Math.max(0, Number(wo.balance_due) - paymentAmount);
      const newPaymentStatus = newBalance <= 0 ? "paid" : "partially_paid";
      const newWStatus = newBalance <= 0 ? "paid" : wo.status;

      await supabase
        .from("shop_work_orders")
        .update({
          balance_due: newBalance,
          payment_status: newPaymentStatus,
          status: newWStatus,
          updated_at: new Date().toISOString(),
        })
        .eq("id", wo.id);

      return new Response(JSON.stringify({
        success: true,
        payment_id: paymentId,
        amount: paymentAmount,
        remaining_balance: newBalance,
        payment_status: newPaymentStatus,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (processor === "paypal") {
      // PayPal — process via PayPal Orders API
      if (!config.paypal_enabled || !config.paypal_client_secret) {
        return new Response(JSON.stringify({ error: "PayPal payments are not enabled" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Get PayPal access token
      const tokenResp = await fetch("https://api-m.paypal.com/v1/oauth2/token", {
        method: "POST",
        headers: {
          "Authorization": "Basic " + btoa(`${config.paypal_client_id}:${config.paypal_client_secret}`),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: "grant_type=client_credentials",
      });

      const tokenData = await tokenResp.json();
      if (!tokenResp.ok || !tokenData.access_token) {
        return new Response(JSON.stringify({ error: "PayPal authentication failed" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Capture the PayPal payment
      const captureResp = await fetch(`https://api-m.paypal.com/v2/payments/captures/${payment_token}/capture`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${tokenData.access_token}`,
          "Content-Type": "application/json",
        },
      });

      const captureData = await captureResp.json();
      if (!captureResp.ok || captureData.status === "DECLINED") {
        const errMsg = captureData.error?.message ?? "PayPal payment failed";
        return new Response(JSON.stringify({ error: errMsg }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const paypalId = captureData.id;
      const paymentAmount = parseFloat(captureData.amount?.value ?? String(amount_cents / 100));

      // Record the payment
      await supabase.from("shop_payments").insert({
        work_order_id: wo.id,
        amount: paymentAmount,
        method: "paypal",
        reference: paypalId,
        payment_status: "completed",
        processor: "paypal",
      });

      // Update work order
      const newBalance = Math.max(0, Number(wo.balance_due) - paymentAmount);
      const newPaymentStatus = newBalance <= 0 ? "paid" : "partially_paid";
      const newWStatus = newBalance <= 0 ? "paid" : wo.status;

      await supabase
        .from("shop_work_orders")
        .update({
          balance_due: newBalance,
          payment_status: newPaymentStatus,
          status: newWStatus,
          updated_at: new Date().toISOString(),
        })
        .eq("id", wo.id);

      return new Response(JSON.stringify({
        success: true,
        payment_id: paypalId,
        amount: paymentAmount,
        remaining_balance: newBalance,
        payment_status: newPaymentStatus,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown payment processor" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
