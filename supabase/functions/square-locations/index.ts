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

const SQUARE_API_BASE = "https://connect.squareup.com";

interface SquareLocation {
  id: string;
  name: string;
  address?: {
    address_line_1?: string;
    locality?: string;
    administrative_district_level_1?: string;
    postal_code?: string;
    country?: string;
  };
  status: string;
  capabilities?: string[];
  business_hours?: { periods?: unknown[] };
  mcc?: string | null;
  type?: string;
}

interface SquareMerchant {
  id: string;
  business_name?: string;
  country?: string;
  language?: string;
  currency?: string;
  status?: string;
  main_location_id?: string;
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { data: config } = await supabase
      .from("shop_payment_config")
      .select("square_access_token, square_location_id, square_environment")
      .eq("id", 1)
      .maybeSingle();

    if (!config?.square_access_token) {
      return json({
        connected: false,
        error: "No Square access token configured. Save your Square Production access token first.",
      });
    }

    const accessToken = config.square_access_token;
    const savedLocationId = config.square_location_id;

    // --- ACTION: test | refresh | (default: both test + locations) ---
    const url = new URL(req.url);
    const action = url.searchParams.get("action") || "all";

    // 1. Verify the connected account via Merchants API
    const merchantResp = await fetch(`${SQUARE_API_BASE}/v2/merchants/me`, {
      headers: {
        "Square-Version": "2024-08-21",
        "Authorization": `Bearer ${accessToken}`,
      },
    });

    if (!merchantResp.ok) {
      const errBody = await merchantResp.text();
      return json({
        connected: false,
        error: `Square authentication failed (HTTP ${merchantResp.status}): ${errBody}`,
      });
    }

    const merchantData = await merchantResp.json();
    const merchant: SquareMerchant = merchantData.merchant || {};

    if (action === "test") {
      // Verify the selected location still exists and is ACTIVE
      let locationValid = false;
      let locationInfo: SquareLocation | null = null;

      if (savedLocationId) {
        const locResp = await fetch(`${SQUARE_API_BASE}/v2/locations/${savedLocationId}`, {
          headers: {
            "Square-Version": "2024-08-21",
            "Authorization": `Bearer ${accessToken}`,
          },
        });
        if (locResp.ok) {
          const locData = await locResp.json();
          locationInfo = locData.location || null;
          locationValid = locationInfo?.status === "ACTIVE";
        }
      }

      return json({
        connected: true,
        merchant_name: merchant.business_name || "Unknown",
        merchant_id: merchant.id,
        country: merchant.country || "US",
        currency: merchant.currency || "USD",
        environment: "production",
        selected_location_id: savedLocationId,
        selected_location_name: locationInfo?.name || null,
        selected_location_active: locationValid,
        selected_location_capabilities: locationInfo?.capabilities || [],
        card_processing_supported: locationInfo?.capabilities?.includes("CREDIT_CARD_PROCESSING") ?? false,
      });
    }

    // 2. Retrieve all locations
    const locationsResp = await fetch(`${SQUARE_API_BASE}/v2/locations`, {
      headers: {
        "Square-Version": "2024-08-21",
        "Authorization": `Bearer ${accessToken}`,
      },
    });

    if (!locationsResp.ok) {
      const errBody = await locationsResp.text();
      return json({
        connected: true,
        merchant_name: merchant.business_name || "Unknown",
        error: `Failed to retrieve locations (HTTP ${locationsResp.status}): ${errBody}`,
      });
    }

    const locationsData = await locationsResp.json();
    const allLocations: SquareLocation[] = locationsData.locations || [];

    // Format locations for dropdown — only ACTIVE ones
    const activeLocations = allLocations
      .filter((loc) => loc.status === "ACTIVE")
      .map((loc) => {
        const city = loc.address?.locality || "";
        const state = loc.address?.administrative_district_level_1 || "";
        const locationDesc = [city, state].filter(Boolean).join(", ");
        return {
          id: loc.id,
          name: loc.name,
          label: locationDesc ? `${loc.name} — ${locationDesc}` : loc.name,
          status: loc.status,
          capabilities: loc.capabilities || [],
          card_processing: loc.capabilities?.includes("CREDIT_CARD_PROCESSING") ?? false,
        };
      });

    // Check if the saved location still exists among active locations
    const savedLocationStillActive = savedLocationId
      ? activeLocations.some((loc) => loc.id === savedLocationId)
      : false;

    return json({
      connected: true,
      merchant_name: merchant.business_name || "Unknown",
      merchant_id: merchant.id,
      country: merchant.country || "US",
      currency: merchant.currency || "USD",
      environment: "production",
      locations: activeLocations,
      total_locations: allLocations.length,
      active_locations: activeLocations.length,
      selected_location_id: savedLocationId,
      selected_location_still_active: savedLocationStillActive,
    });
  } catch (err) {
    return json({ connected: false, error: err.message }, 500);
  }
});
