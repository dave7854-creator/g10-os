import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: cfg } = await supabase
      .from("shop_payment_config")
      .select("paypal_enabled, paypal_client_id, paypal_client_secret")
      .eq("id", 1)
      .maybeSingle();

    if (!cfg) {
      return new Response(JSON.stringify({
        connected: false,
        error: "Payment configuration not found.",
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (!cfg.paypal_client_id || !cfg.paypal_client_secret) {
      return new Response(JSON.stringify({
        connected: false,
        error: "PayPal Client ID and Client Secret are required. Enter them in Payment Settings and click Save.",
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Step 1: Obtain OAuth access token from PayPal (LIVE)
    const tokenResp = await fetch("https://api-m.paypal.com/v1/oauth2/token", {
      method: "POST",
      headers: {
        "Authorization": "Basic " + btoa(`${cfg.paypal_client_id}:${cfg.paypal_client_secret}`),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "client_credentials",
      }),
    });

    const tokenData = await tokenResp.json();

    if (!tokenResp.ok || !tokenData.access_token) {
      const errMsg = tokenData.error_description || tokenData.error || `HTTP ${tokenResp.status}`;
      return new Response(JSON.stringify({
        connected: false,
        error: `PayPal authentication failed: ${errMsg}`,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const accessToken = tokenData.access_token;

    // Step 2: Retrieve the merchant/account identity from PayPal
    // The /v1/identity/oauth2/userinfo endpoint returns account details
    let accountName: string | null = null;
    let accountEmail: string | null = null;

    try {
      const userInfoResp = await fetch("https://api-m.paypal.com/v1/identity/oauth2/userinfo?schema=paypalv1.1", {
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      });

      if (userInfoResp.ok) {
        const userInfo = await userInfoResp.json();
        accountName = userInfo.name || userInfo.given_name || userInfo.family_name || null;
        accountEmail = userInfo.email || (userInfo.emails && userInfo.emails[0]?.value) || null;
      }
    } catch {
      // Identity API may not be available for all credential types
    }

    // Step 3: If identity endpoint didn't return account info, try the API credential info
    if (!accountName) {
      try {
        const credInfoResp = await fetch("https://api-m.paypal.com/v1/identity/api-credentials", {
          headers: {
            "Authorization": `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
        });
        if (credInfoResp.ok) {
          const credInfo = await credInfoResp.json();
          accountName = credInfo.client_id || credInfo.app_id || null;
        }
      } catch {
        // non-fatal
      }
    }

    // Determine the display string
    const verified = !!accessToken;
    let accountIdentity: string;
    if (accountName && accountEmail) {
      accountIdentity = `${accountName} (${accountEmail})`;
    } else if (accountName) {
      accountIdentity = accountName;
    } else if (accountEmail) {
      accountIdentity = accountEmail;
    } else {
      accountIdentity = "Not available from current API credentials";
    }

    return new Response(JSON.stringify({
      connected: true,
      verified,
      environment: "LIVE",
      account_name: accountName,
      account_email: accountEmail,
      account_identity: accountIdentity,
      app_id: tokenData.app_id || null,
      token_scope: tokenData.scope || null,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err) {
    return new Response(JSON.stringify({
      connected: false,
      error: err.message,
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
