import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface EbayConfig {
  id: number;
  client_id: string | null;
  client_secret: string | null;
  ru_name: string | null;
  environment: string | null;
  refresh_token: string | null;
  user_token: string | null;
  token_expires_at: string | null;
  merchant_name: string | null;
  default_handling_time: number | null;
  default_return_policy: string | null;
  default_fulfillment_policy_id: string | null;
  default_payment_policy_id: string | null;
  auto_publish: boolean | null;
  oauth_return_url: string | null;
  ebay_username: string | null;
}

function getSupabase() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

function getEbayBaseUrl(env: string | null): string {
  return env === "production"
    ? "https://api.ebay.com"
    : "https://api.sandbox.ebay.com";
}

function getEbayAuthUrl(env: string | null): string {
  return env === "production"
    ? "https://api.ebay.com/identity/v1/oauth2/token"
    : "https://api.sandbox.ebay.com/identity/v1/oauth2/token";
}

function getEbayAuthorizeUrl(env: string | null): string {
  return env === "production"
    ? "https://auth.ebay.com/oauth2/authorize"
    : "https://auth.sandbox.ebay.com/oauth2/authorize";
}

const SELL_SCOPES = [
  "https://api.ebay.com/oauth/api_scope",
  "https://api.ebay.com/oauth/api_scope/sell.inventory",
  "https://api.ebay.com/oauth/api_scope/sell.account",
  "https://api.ebay.com/oauth/api_scope/sell.fulfillment",
].join(" ");

// Browse API needs a client-credentials application token, NOT a user token.
// Application tokens are public-data tokens obtained with just client_id + client_secret.
const BROWSE_SCOPE = "https://api.ebay.com/oauth/api_scope";
// Comment: version 3 — fixed seller filter syntax with braces

let cachedAppToken: { token: string; expiresAt: number } | null = null;

async function getApplicationToken(): Promise<string> {
  if (cachedAppToken && cachedAppToken.expiresAt > Date.now() + 60000) {
    return cachedAppToken.token;
  }
  const supabase = getSupabase();
  const { data: cfg } = await supabase.from("ebay_config").select("client_id, client_secret, environment").eq("id", 1).maybeSingle();
  if (!cfg?.client_id || !cfg?.client_secret) throw new Error("eBay credentials not configured.");
  const authUrl = getEbayAuthUrl(cfg.environment);
  const creds = btoa(`${cfg.client_id}:${cfg.client_secret}`);
  const resp = await fetch(authUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Authorization": `Basic ${creds}`,
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      scope: BROWSE_SCOPE,
    }),
  });
  const data = await resp.json();
  if (!data.access_token) throw new Error(`eBay application token failed: ${data.error_description || data.error}`);
  cachedAppToken = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 60) * 1000,
  };
  return data.access_token;
}

async function refreshEbayToken(config: EbayConfig): Promise<{ token: string; expiresAt: string }> {
  const supabase = getSupabase();
  const authUrl = getEbayAuthUrl(config.environment);
  const creds = `${config.client_id}:${config.client_secret}`;
  const encodedCreds = btoa(creds);

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: config.refresh_token || "",
    scope: SELL_SCOPES,
  });

  const resp = await fetch(authUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Authorization": `Basic ${encodedCreds}`,
    },
    body,
  });

  const data = await resp.json();
  if (!data.access_token) throw new Error(`eBay token refresh failed: ${data.error_description || data.error}`);

  const expiresAt = new Date(Date.now() + (data.expires_in - 60) * 1000).toISOString();
  await supabase.from("ebay_config").update({
    user_token: data.access_token,
    token_expires_at: expiresAt,
  }).eq("id", 1);

  return { token: data.access_token, expiresAt };
}

async function getValidToken(): Promise<string> {
  const supabase = getSupabase();
  const { data: config } = await supabase.from("ebay_config").select("*").eq("id", 1).maybeSingle();
  if (!config) throw new Error("eBay not configured. Add credentials in Settings.");
  const cfg = config as EbayConfig;
  if (!cfg.client_id || !cfg.client_secret) throw new Error("eBay credentials not configured.");

  if (cfg.user_token && cfg.token_expires_at) {
    const expires = new Date(cfg.token_expires_at).getTime();
    if (expires > Date.now() + 60000) return cfg.user_token;
  }

  if (!cfg.refresh_token) throw new Error("eBay refresh token not set. Complete OAuth authorization first.");
  const { token } = await refreshEbayToken(cfg);
  return token;
}

interface PublishListingBody {
  listing_id?: string;
  sku?: string;
  title: string;
  description?: string;
  category_id?: string;
  condition_id?: string;
  condition_description?: string;
  price: number;
  quantity?: number;
  listing_type?: string;
  listing_duration?: string;
  shipping_type?: string;
  shipping_cost?: number;
  shipping_weight_lbs?: number;
  handling_time?: number;
  return_policy?: string;
  item_specifics?: Record<string, string>;
  photo_urls?: string[];
}

// Map part type/title keywords to eBay US category IDs (automotive parts)
// These are current eBay Motors category IDs for EBAY_US marketplace.
function suggestEbayCategoryId(title: string, itemSpecifics?: Record<string, string>): { categoryId: string; categoryName: string } | null {
  const t = (title || "").toUpperCase();
  const placement = (itemSpecifics?.Placement || itemSpecifics?.placement || "").toUpperCase();
  const combined = `${t} ${placement}`;

  // Engine computers / ECM / PCM / ECU
  if (combined.includes("ECM") || combined.includes("PCM") || combined.includes("ECU") || combined.includes("ENGINE COMPUTER") || combined.includes("ENGINE MODULE") || combined.includes("ENGINE CONTROL")) {
    return { categoryId: "33596", categoryName: "Engine Computers & Modules" };
  }
  // Headlight
  if (combined.includes("HEADLIGHT") || combined.includes("HEAD LAMP") || combined.includes("HEADLAMP")) {
    return { categoryId: "33706", categoryName: "Headlights" };
  }
  // Tail light
  if (combined.includes("TAIL LIGHT") || combined.includes("TAILLAMP") || combined.includes("TAIL LAMP") || combined.includes("TAILLIGHT")) {
    return { categoryId: "33716", categoryName: "Tail Lights" };
  }
  // Alternator
  if (combined.includes("ALTERNATOR")) {
    return { categoryId: "33586", categoryName: "Alternators & Generators" };
  }
  // Starter
  if (combined.includes("STARTER")) {
    return { categoryId: "33587", categoryName: "Starters" };
  }
  // Battery
  if (combined.includes("BATTERY")) {
    return { categoryId: "33762", categoryName: "Car & Truck Batteries" };
  }
  // Radiator
  if (combined.includes("RADIATOR")) {
    return { categoryId: "33602", categoryName: "Radiators" };
  }
  // Transmission
  if (combined.includes("TRANSMISSION")) {
    return { categoryId: "33731", categoryName: "Complete Auto Transmissions" };
  }
  // Brake
  if (combined.includes("BRAKE CALIPER")) {
    return { categoryId: "33568", categoryName: "Brake Calipers" };
  }
  if (combined.includes("BRAKE ROTOR") || combined.includes("BRAKE DISC")) {
    return { categoryId: "33569", categoryName: "Brake Rotors & Discs" };
  }
  if (combined.includes("BRAKE PAD")) {
    return { categoryId: "33567", categoryName: "Brake Pads" };
  }
  // Bumper
  if (combined.includes("BUMPER")) {
    return { categoryId: "33649", categoryName: "Bumpers" };
  }
  // Door
  if (combined.includes("DOOR")) {
    return { categoryId: "33657", categoryName: "Doors" };
  }
  // Fender
  if (combined.includes("FENDER")) {
    return { categoryId: "33660", categoryName: "Fenders" };
  }
  // Grille
  if (combined.includes("GRILLE")) {
    return { categoryId: "33665", categoryName: "Grilles" };
  }
  // Mirror
  if (combined.includes("MIRROR")) {
    return { categoryId: "33695", categoryName: "Mirrors" };
  }
  // Wiring harness
  if (combined.includes("WIRING HARNESS") || combined.includes("WIRE HARNESS")) {
    return { categoryId: "33597", categoryName: "Wiring & Harnesses" };
  }
  // Fuel pump
  if (combined.includes("FUEL PUMP")) {
    return { categoryId: "33747", categoryName: "Fuel Pumps" };
  }
  // Water pump
  if (combined.includes("WATER PUMP")) {
    return { categoryId: "33607", categoryName: "Water Pumps" };
  }
  // Power steering pump
  if (combined.includes("POWER STEERING PUMP") || combined.includes("STEERING PUMP")) {
    return { categoryId: "33614", categoryName: "Power Steering Pumps" };
  }
  // AC compressor
  if (combined.includes("AC COMPRESSOR") || combined.includes("A/C COMPRESSOR") || combined.includes("AIR CONDITIONING COMPRESSOR")) {
    return { categoryId: "33618", categoryName: "A/C Compressors" };
  }
  // Exhaust / catalytic converter
  if (combined.includes("CATALYTIC CONVERTER")) {
    return { categoryId: "33626", categoryName: "Catalytic Converters" };
  }
  if (combined.includes("EXHAUST")) {
    return { categoryId: "33627", categoryName: "Exhaust Systems" };
  }
  // Strut / shock
  if (combined.includes("STRUT") || combined.includes("SHOCK ABSORBER") || combined.includes("SHOCKS")) {
    return { categoryId: "33591", categoryName: "Struts & Shocks" };
  }
  // Control arm
  if (combined.includes("CONTROL ARM")) {
    return { categoryId: "33592", categoryName: "Control Arms" };
  }
  // Ignition coil / coil pack
  if (combined.includes("IGNITION COIL") || combined.includes("COIL PACK") || combined.includes("COIL ON PLUG")) {
    return { categoryId: "33588", categoryName: "Ignition Coils" };
  }
  // Throttle body
  if (combined.includes("THROTTLE BODY")) {
    return { categoryId: "33600", categoryName: "Throttle Bodies" };
  }
  // Mass air flow sensor
  if (combined.includes("MASS AIR FLOW") || combined.includes("MAF SENSOR")) {
    return { categoryId: "33598", categoryName: "Air Flow Sensors" };
  }
  // Oxygen / O2 sensor
  if (combined.includes("OXYGEN SENSOR") || combined.includes("O2 SENSOR")) {
    return { categoryId: "33599", categoryName: "Oxygen Sensors" };
  }
  // Window regulator / motor
  if (combined.includes("WINDOW REGULATOR") || combined.includes("WINDOW MOTOR")) {
    return { categoryId: "33703", categoryName: "Window Regulators & Motors" };
  }
  //仪表 cluster / gauge
  if (combined.includes("INSTRUMENT CLUSTER") || combined.includes("GAUGE CLUSTER") || combined.includes("DASH CLUSTER")) {
    return { categoryId: "33596", categoryName: "Engine Computers & Modules" };
  }
  // Fuse box / relay
  if (combined.includes("FUSE BOX") || combined.includes("RELAY")) {
    return { categoryId: "33597", categoryName: "Wiring & Harnesses" };
  }
  // Sensor (generic)
  if (combined.includes("SENSOR")) {
    return { categoryId: "33598", categoryName: "Air Flow Sensors" };
  }
  // Switch (generic)
  if (combined.includes("SWITCH")) {
    return { categoryId: "33701", categoryName: "Switches" };
  }
  // Pulley / belt
  if (combined.includes("PULLEY") || combined.includes("BELT TENSIONER")) {
    return { categoryId: "33608", categoryName: "Pulleys" };
  }
  // Default: Other Car & Truck Parts
  return null;
}

// Use eBay's live Taxonomy API to find a valid leaf category for EBAY_US.
// Uses the getCategorySuggestions endpoint which takes a query string and returns
// the best matching leaf categories. Falls back to hard-coded suggestion if the API fails.
// Revised: query uses the full part title for better matching accuracy. Fixed endpoint URL.
async function findValidEbayCategory(
  title: string,
  itemSpecifics: Record<string, string> | undefined,
  token: string,
  baseUrl: string,
  oldCategoryId: string | null,
): Promise<{ categoryId: string; categoryName: string; source: string; oldCategoryId: string | null; oldCategoryValid: boolean }> {
  const searchTerms = buildSearchTerms(title, itemSpecifics);
  console.log(`TAXONOMY: Search terms: ${searchTerms.join(', ')}`);

  try {
    // 1. Get the default category tree ID for EBAY_US
    const treeResp = await fetch(`${baseUrl}/commerce/taxonomy/v1/get_default_category_tree_id?marketplace_id=EBAY_US`, {
      headers: { "Authorization": `Bearer ${token}`, "Accept-Language": "en-US" },
    });
    if (!treeResp.ok) {
      console.log(`TAXONOMY: get_default_category_tree failed (HTTP ${treeResp.status})`);
      throw new Error(`Taxonomy API failed (HTTP ${treeResp.status})`);
    }
    const treeData = await treeResp.json();
    const categoryTreeId = treeData.categoryTreeId;
    console.log(`TAXONOMY: EBAY_US category tree ID = ${categoryTreeId}`);

    // 2. Use getCategorySuggestions to find the best matching leaf category
    // Build a query string from the part title keywords
    const query = searchTerms.length > 0 ? searchTerms.join(' ') : title;
    const suggestUrl = `${baseUrl}/commerce/taxonomy/v1/category_tree/${categoryTreeId}/get_category_suggestions?q=${encodeURIComponent(query)}`;
    console.log(`TAXONOMY: Calling getCategorySuggestions: ${suggestUrl}`);
    const suggestResp = await fetch(suggestUrl, {
      headers: { "Authorization": `Bearer ${token}`, "Accept-Language": "en-US" },
    });
    const suggestText = await suggestResp.text();
    console.log(`TAXONOMY: getCategorySuggestions HTTP ${suggestResp.status}, bodyLen=${suggestText.length}`);

    if (!suggestResp.ok) {
      console.log(`TAXONOMY: getCategorySuggestions failed: ${suggestText.slice(0, 500)}`);
      throw new Error(`getCategorySuggestions failed (HTTP ${suggestResp.status})`);
    }

    let suggestData: any;
    try { suggestData = JSON.parse(suggestText); } catch { throw new Error('Failed to parse taxonomy response'); }

    const suggestions = (suggestData.categorySuggestions || []) as Array<{
      category: { categoryId: string; categoryName: string };
      relitivePath?: Array<{ categoryName: string }>;
    }>;
    console.log(`TAXONOMY: Got ${suggestions.length} category suggestions`);

    if (suggestions.length > 0) {
      // If we have an old category ID, check if any suggestion matches it
      if (oldCategoryId) {
        const oldMatch = suggestions.find((s) => s.category.categoryId === oldCategoryId);
        if (oldMatch) {
          console.log(`TAXONOMY: Old category ${oldCategoryId} is valid (${oldMatch.category.categoryName})`);
          return {
            categoryId: oldCategoryId,
            categoryName: oldMatch.category.categoryName,
            source: "taxonomy_verified",
            oldCategoryId,
            oldCategoryValid: true,
          };
        }
        console.log(`TAXONOMY: Old category ${oldCategoryId} not in suggestions`);
      }

      // Use the first (best) suggestion
      const best = suggestions[0];
      console.log(`TAXONOMY: Best match: ${best.category.categoryName} (${best.category.categoryId})`);
      return {
        categoryId: best.category.categoryId,
        categoryName: best.category.categoryName,
        source: "taxonomy_suggest",
        oldCategoryId,
        oldCategoryValid: false,
      };
    }
  } catch (err) {
    console.log(`TAXONOMY: API call failed: ${err instanceof Error ? err.message : 'unknown'}`);
  }

  // Fallback to hard-coded suggestion
  const fallback = suggestEbayCategoryId(title, itemSpecifics);
  if (fallback) {
    return { categoryId: fallback.categoryId, categoryName: fallback.categoryName, source: "hardcoded_fallback", oldCategoryId, oldCategoryValid: false };
  }

  // Ultimate fallback: eBay Motors "Other Car & Truck Parts" category
  return { categoryId: "6030", categoryName: "Other Car & Truck Parts", source: "default_fallback", oldCategoryId, oldCategoryValid: false };
}



function buildSearchTerms(title: string, itemSpecifics?: Record<string, string>): string[] {
  const t = (title || "").toUpperCase();
  const terms: string[] = [];
  // Extract key part names from title
  const partKeywords = [
    "ECM", "PCM", "ECU", "ENGINE COMPUTER", "ENGINE MODULE", "ENGINE CONTROL",
    "HEADLIGHT", "HEADLAMP", "HEAD LAMP",
    "TAILLIGHT", "TAIL LIGHT", "TAILLAMP", "TAIL LAMP",
    "ALTERNATOR", "STARTER", "BATTERY", "RADIATOR",
    "TRANSMISSION", "BRAKE CALIPER", "BRAKE ROTOR", "BRAKE DISC", "BRAKE PAD",
    "BUMPER", "DOOR", "FENDER", "GRILLE", "MIRROR",
    "WIRING HARNESS", "WIRE HARNESS", "FUEL PUMP", "WATER PUMP",
    "POWER STEERING PUMP", "STEERING PUMP", "AC COMPRESSOR", "A/C COMPRESSOR",
    "CATALYTIC CONVERTER", "EXHAUST", "STRUT", "SHOCK",
    "CONTROL ARM", "IGNITION COIL", "COIL PACK", "THROTTLE BODY",
    "MASS AIR FLOW", "MAF SENSOR", "OXYGEN SENSOR", "O2 SENSOR",
    "WINDOW REGULATOR", "WINDOW MOTOR", "INSTRUMENT CLUSTER", "GAUGE CLUSTER",
    "FUSE BOX", "RELAY", "SENSOR", "SWITCH", "PULLEY", "BELT TENSIONER",
  ];
  for (const kw of partKeywords) {
    if (t.includes(kw)) terms.push(kw);
  }
  if (itemSpecifics?.Placement) terms.push(itemSpecifics.Placement.toUpperCase());
  if (itemSpecifics?.Brand) terms.push(itemSpecifics.Brand.toUpperCase());
  return terms;
}

// Map internal/Trading API condition IDs to eBay Sell Inventory API ConditionEnum values
function mapConditionToEbayEnum(condition: string): string {
  const c = (condition || "").toUpperCase().trim();
  // Already a valid Sell Inventory enum
  const validEnums = [
    "NEW", "LIKE_NEW", "NEW_OTHER", "NEW_WITH_TAGS", "NEW_WITHOUT_TAGS",
    "NEW_WITH_DEFECTS", "MANUFACTURER_REFURBISHED", "SELLER_REFURBISHED",
    "USED_EXCELLENT", "USED_VERY_GOOD", "USED_GOOD", "USED_ACCEPTABLE",
    "USED_FOR_PARTS", "NOT_SPECIFIED", "PRE_OWNED_EXCELLENT", "PRE_OWNED_VERY_GOOD",
    "PRE_OWNED_GOOD", "REFURBISHED",
  ];
  if (validEnums.includes(c)) return c;
  // Map Trading API condition IDs / common labels to Sell Inventory enums
  const idMap: Record<string, string> = {
    "1000": "NEW",
    "1500": "NEW_OTHER",
    "1750": "NEW_WITH_DEFECTS",
    "2000": "MANUFACTURER_REFURBISHED",
    "2500": "SELLER_REFURBISHED",
    "2750": "LIKE_NEW",
    "3000": "USED_GOOD",
    "4000": "USED_VERY_GOOD",
    "5000": "USED_ACCEPTABLE",
    "6000": "USED_FOR_PARTS",
    "7000": "NOT_SPECIFIED",
  };
  if (idMap[c]) return idMap[c];
  // Map common text labels
  const labelMap: Record<string, string> = {
    "NEW": "NEW",
    "USED": "USED_GOOD",
    "USED EXCELLENT": "USED_EXCELLENT",
    "USED VERY GOOD": "USED_VERY_GOOD",
    "USED GOOD": "USED_GOOD",
    "USED ACCEPTABLE": "USED_ACCEPTABLE",
    "FOR PARTS": "USED_FOR_PARTS",
    "PARTS ONLY": "USED_FOR_PARTS",
    "REMANUFACTURED": "MANUFACTURER_REFURBISHED",
    "REMAN": "MANUFACTURER_REFURBISHED",
    "REFURBISHED": "SELLER_REFURBISHED",
  };
  if (labelMap[c]) return labelMap[c];
  // Default: used auto parts → USED_GOOD
  return "USED_GOOD";
}

// eBay Sell Inventory API expects product.aspects values as arrays of strings.
// Also fixes taxonomy endpoint URL (get_default_category_tree_id, not get_default_category_tree).
function normalizeAspects(specifics: Record<string, string> | undefined): Record<string, string[]> {
  if (!specifics) return {};
  const result: Record<string, string[]> = {};
  for (const [key, value] of Object.entries(specifics)) {
    if (value !== null && value !== undefined && value !== "") {
      result[key] = Array.isArray(value) ? value.map(String) : [String(value)];
    }
  }
  return result;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const supabase = getSupabase();
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/ebay-api\/?/, "");

  try {
    // ===== GET CONFIG (public fields only) =====
    if (path === "config" && req.method === "GET") {
      const { data } = await supabase
        .from("ebay_config")
        .select("id, environment, merchant_name, default_handling_time, default_return_policy, default_fulfillment_policy_id, default_payment_policy_id, auto_publish")
        .eq("id", 1)
        .maybeSingle();
      return new Response(JSON.stringify({ config: data || null }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ===== PUBLIC INVENTORY: search live eBay listings for our seller =====
    if (path === "public/inventory" && req.method === "GET") {
      const { data: cfg } = await supabase.from("ebay_config").select("environment, ebay_username").eq("id", 1).maybeSingle();
      if (!cfg) {
        return new Response(JSON.stringify({ error: "Parts store not available" }), {
          status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const seller = cfg.ebay_username || "fortpeckautollc";
      const browseBase = cfg.environment === "production"
        ? "https://api.ebay.com"
        : "https://api.sandbox.ebay.com";

      const q = url.searchParams.get("q") || "";
      const sort = url.searchParams.get("sort") || "BEST_MATCH";
      const limit = Math.min(parseInt(url.searchParams.get("limit") || "24", 10), 100);
      const offset = parseInt(url.searchParams.get("offset") || "0", 10);
      const categoryId = url.searchParams.get("category_id") || "";
      const condition = url.searchParams.get("condition") || "";

      // Browse API requires a q param. "OEM" is broad enough to match most auto parts listings.
      // filter=sellers:{username} uses curly-brace syntax per eBay docs.
      const filterStr = `sellers:{${seller}}`;
      let qs = `q=${encodeURIComponent(q || "OEM")}`;
      qs += `&limit=${limit}`;
      qs += `&offset=${offset}`;
      if (sort) qs += `&sort=${encodeURIComponent(sort)}`;
      if (categoryId) qs += `&category_ids=${encodeURIComponent(categoryId)}`;
      if (condition) qs += `&buying_option=FIXED_PRICE`;
      qs += `&filter=${filterStr}`;

      const token = await getApplicationToken();
      const searchUrl = `${browseBase}/buy/browse/v1/item_summary/search?${qs}`;
      console.log(`BROWSE: GET ${searchUrl}`);

      const resp = await fetch(searchUrl, {
        headers: { "Authorization": `Bearer ${token}`, "Accept-Language": "en-US", "X-EBAY-C-MARKETPLACE-ID": "EBAY_US" },
      });
      const respText = await resp.text();
      let data: any;
      try { data = JSON.parse(respText); } catch { data = { raw: respText }; }

      if (!resp.ok) {
        console.log(`BROWSE: HTTP ${resp.status} — ${JSON.stringify(data?.errors || data).slice(0, 500)}`);
        return new Response(JSON.stringify({ error: "Failed to fetch inventory", details: data?.errors?.[0]?.message || "Unknown" }), {
          status: resp.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      console.log(`BROWSE: HTTP ${resp.status}, ${data.itemSummaries?.length || 0} items, total=${data.total}`);

      const items = (data.itemSummaries || []).map((item: any) => ({
        itemId: item.itemId,
        title: item.title,
        price: item.price?.value || null,
        currency: item.price?.currency || "USD",
        image: item.image?.imageUrl || null,
        condition: item.condition || "Used",
        category: item.categories?.[0]?.categoryName || null,
        categoryId: item.categories?.[0]?.categoryId || null,
        itemWebUrl: item.itemWebUrl || null,
        shippingOptions: item.shippingOptions || [],
        buyingOptions: item.buyingOptions || [],
        itemLocation: item.itemLocation || null,
        estimatedAvailabilities: item.estimatedAvailabilities || [],
      }));

      return new Response(JSON.stringify({
        items,
        total: data.total || 0,
        limit,
        offset,
        hasNext: !!data.next,
        seller,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ===== PUBLIC ITEM: get single eBay listing detail =====
    if (path === "public/item" && req.method === "GET") {
      const itemId = url.searchParams.get("item_id");
      if (!itemId) {
        return new Response(JSON.stringify({ error: "item_id required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: cfg } = await supabase.from("ebay_config").select("environment").eq("id", 1).maybeSingle();
      if (!cfg) {
        return new Response(JSON.stringify({ error: "Not available" }), {
          status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const browseBase = cfg.environment === "production"
        ? "https://api.ebay.com"
        : "https://api.sandbox.ebay.com";

      const token = await getApplicationToken();
      const resp = await fetch(`${browseBase}/buy/browse/v1/item/${encodeURIComponent(itemId)}?fieldgroups=PRODUCT`, {
        headers: { "Authorization": `Bearer ${token}`, "Accept-Language": "en-US", "X-EBAY-C-MARKETPLACE-ID": "EBAY_US" },
      });
      const respText = await resp.text();
      let data: any;
      try { data = JSON.parse(respText); } catch { data = { raw: respText }; }

      if (!resp.ok) {
        console.log(`BROWSE getItem: HTTP ${resp.status} for item ${itemId} — ${JSON.stringify(data?.errors || data).slice(0, 500)}`);
        return new Response(JSON.stringify({ error: "Failed to fetch item", details: data?.errors?.[0]?.message || "Unknown" }), {
          status: resp.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const item: any = {
        itemId: data.itemId,
        title: data.title,
        price: data.price?.value || null,
        currency: data.price?.currency || "USD",
        images: (data.images || []).map((img: any) => img.imageUrl).filter(Boolean),
        condition: data.condition || "Used",
        conditionDescription: data.conditionDescription || null,
        category: data.categories?.[0]?.categoryName || null,
        categoryId: data.categories?.[0]?.categoryId || null,
        itemWebUrl: data.itemWebUrl || null,
        shortDescription: data.shortDescription || null,
        description: data.description || null,
        itemLocation: data.itemLocation || null,
        shippingOptions: data.shippingOptions || [],
        estimatedAvailabilities: data.estimatedAvailabilities || [],
        buyingOptions: data.buyingOptions || [],
        brand: data.brand || null,
        mpn: data.mpn || null,
        sku: data.sku || null,
        productId: data.productId?.value || null,
        product: data.product || null,
        aspects: data.itemAspects || [],
        compatibleVehicles: data.compatibility || [],
      };

      return new Response(JSON.stringify({ item }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ===== PUBLIC CATEGORIES: get category facets for filtering =====
    if (path === "public/categories" && req.method === "GET") {
      const { data: cfg } = await supabase.from("ebay_config").select("environment, ebay_username").eq("id", 1).maybeSingle();
      if (!cfg) {
        return new Response(JSON.stringify({ categories: [] }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const seller = cfg.ebay_username || "fortpeckautollc";
      const browseBase = cfg.environment === "production"
        ? "https://api.ebay.com"
        : "https://api.sandbox.ebay.com";

      const token = await getApplicationToken();
      const params = new URLSearchParams();
      params.set("q", "OEM");
      params.set("limit", "100");
      params.set("fieldgroups", "CATEGORY");

      const resp = await fetch(`${browseBase}/buy/browse/v1/item_summary/search?${params.toString()}&filter=sellers:{${seller}}`, {
        headers: { "Authorization": `Bearer ${token}`, "Accept-Language": "en-US", "X-EBAY-C-MARKETPLACE-ID": "EBAY_US" },
      });
      const data = await resp.json();

      const categories = (data.refinement || [])?.categoryDistributions || [];
      return new Response(JSON.stringify({ categories }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ===== INSPECT OFFERS (read-only diagnostic) =====
    if (path === "inspect-offers" && req.method === "GET") {
      const token = await getValidToken();
      const { data: cfg } = await supabase.from("ebay_config").select("environment").eq("id", 1).maybeSingle();
      const baseUrl = getEbayBaseUrl(cfg?.environment);

      const results: any[] = [];
      for (const sku of ["091126JJ", "6ffd54be-a57f-410f-ac27-999933a99cd6", "95a52612-b3c8-4863-bfc0-25a3fcdbb52e"]) {
        const offerResp = await fetch(`${baseUrl}/sell/inventory/v1/offer?sku=${encodeURIComponent(sku)}`, {
          headers: { "Authorization": `Bearer ${token}`, "Accept-Language": "en-US" },
        });
        const offerText = await offerResp.text();
        let offerJson: any;
        try { offerJson = JSON.parse(offerText); } catch { offerJson = { raw: offerText }; }

        if (offerResp.ok) {
          const offers = offerJson.offers || [];
          for (const o of offers) {
            results.push({
              sku,
              offerId: o.offerId,
              status: o.status,
              categoryId: o.categoryId || "N/A",
              format: o.format,
              price: o.pricingSummary?.price?.value,
              listingPolicies: o.listingPolicies || {},
            });
          }
          if (offers.length === 0) {
            results.push({ sku, offerId: null, status: "NO OFFER EXISTS", categoryId: "N/A" });
          }
        } else {
          results.push({ sku, error: offerJson.errors?.[0]?.message || offerText.slice(0, 200) });
        }
      }

      return new Response(JSON.stringify({ offers: results }, null, 2), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ===== SAVE CONFIG =====
    if (path === "config" && req.method === "POST") {
      const body = await req.json();
      const { client_id, client_secret, ru_name, environment, merchant_name, default_handling_time, default_return_policy, default_fulfillment_policy_id, default_payment_policy_id, auto_publish } = body;
      const updates: Record<string, unknown> = {
        id: 1,
        environment: environment || "sandbox",
        merchant_name: merchant_name || "Fort Peck Auto",
        default_handling_time: default_handling_time ?? 2,
        default_return_policy: default_return_policy || null,
        default_fulfillment_policy_id: default_fulfillment_policy_id || null,
        default_payment_policy_id: default_payment_policy_id || null,
        auto_publish: auto_publish ?? false,
        updated_at: new Date().toISOString(),
      };
      if (client_id !== undefined) updates.client_id = client_id;
      if (client_secret !== undefined) updates.client_secret = client_secret;
      if (ru_name !== undefined) updates.ru_name = ru_name;

      await supabase.from("ebay_config").upsert(updates);
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ===== OAUTH INIT: return authorization URL + state =====
    if (path === "oauth/init" && req.method === "GET") {
      const returnTo = url.searchParams.get("return_to") || "";
      const { data: cfg } = await supabase.from("ebay_config").select("client_id, ru_name, environment").eq("id", 1).maybeSingle();
      if (!cfg?.client_id || !cfg?.ru_name) {
        throw new Error("eBay client_id and ru_name must be configured first.");
      }
      const state = crypto.randomUUID();
      const authorizeUrl = getEbayAuthorizeUrl(cfg.environment);
      const params = new URLSearchParams({
        client_id: cfg.client_id,
        redirect_uri: cfg.ru_name,
        response_type: "code",
        scope: SELL_SCOPES,
        state,
      });
      // Store return URL for the callback redirect
      if (returnTo) {
        await supabase.from("ebay_config").update({ oauth_return_url: returnTo }).eq("id", 1);
      }
      return new Response(JSON.stringify({
        authUrl: `${authorizeUrl}?${params.toString()}`,
        state,
        environment: cfg.environment,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ===== OAUTH CALLBACK (GET): eBay redirects here with code — exchange + redirect to app =====
    if (path === "oauth/callback" && req.method === "GET") {
      const code = url.searchParams.get("code");
      const oauthError = url.searchParams.get("error");

      const { data: cfg } = await supabase.from("ebay_config").select("*").eq("id", 1).maybeSingle();
      if (!cfg) throw new Error("eBay not configured");
      const config = cfg as EbayConfig;
      const returnTo = config.oauth_return_url || "";

      if (oauthError || !code) {
        const errParams = new URLSearchParams({ error: oauthError || "no_code" });
        const redirectTarget = returnTo ? `${returnTo}?${errParams.toString()}` : `${returnTo}`;
        return new Response(null, {
          status: 302,
          headers: { Location: redirectTarget || "/", ...corsHeaders },
        });
      }

      if (!config.client_id || !config.client_secret || !config.ru_name) {
        throw new Error("eBay client_id, client_secret, and ru_name must be configured first.");
      }

      const authUrl = getEbayAuthUrl(config.environment);
      const creds = btoa(`${config.client_id}:${config.client_secret}`);

      const tokenResp = await fetch(authUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Authorization": `Basic ${creds}`,
        },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          redirect_uri: config.ru_name,
        }),
      });

      const tokenData = await tokenResp.json();
      if (!tokenData.access_token || !tokenData.refresh_token) {
        const errParams = new URLSearchParams({
          error: "token_exchange_failed",
          error_description: (tokenData.error_description || tokenData.error || "unknown").slice(0, 200),
        });
        const redirectTarget = returnTo ? `${returnTo}?${errParams.toString()}` : `${returnTo}`;
        return new Response(null, {
          status: 302,
          headers: { Location: redirectTarget || "/", ...corsHeaders },
        });
      }

      const expiresAt = new Date(Date.now() + (tokenData.expires_in - 60) * 1000).toISOString();
      await supabase.from("ebay_config").update({
        user_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        token_expires_at: expiresAt,
        ebay_username: null,
        updated_at: new Date().toISOString(),
      }).eq("id", 1);

      const successParams = new URLSearchParams({ connected: "true" });
      const redirectTarget = returnTo ? `${returnTo}?${successParams.toString()}` : `${returnTo}`;
      return new Response(null, {
        status: 302,
        headers: { Location: redirectTarget || "/", ...corsHeaders },
      });
    }

    // ===== OAUTH CALLBACK (POST): exchange auth code for tokens (called by frontend) =====
    if (path === "oauth/callback" && req.method === "POST") {
      const body = await req.json();
      const { code, state } = body;
      if (!code) throw new Error("Authorization code is required");

      const { data: cfg } = await supabase.from("ebay_config").select("*").eq("id", 1).maybeSingle();
      if (!cfg) throw new Error("eBay not configured");
      const config = cfg as EbayConfig;
      if (!config.client_id || !config.client_secret || !config.ru_name) {
        throw new Error("eBay client_id, client_secret, and ru_name must be configured first.");
      }

      const authUrl = getEbayAuthUrl(config.environment);
      const creds = btoa(`${config.client_id}:${config.client_secret}`);

      const tokenResp = await fetch(authUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Authorization": `Basic ${creds}`,
        },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          redirect_uri: config.ru_name,
        }),
      });

      const tokenData = await tokenResp.json();
      if (!tokenData.access_token || !tokenData.refresh_token) {
        throw new Error(`OAuth token exchange failed: ${tokenData.error_description || tokenData.error || JSON.stringify(tokenData).slice(0, 200)}`);
      }

      const expiresAt = new Date(Date.now() + (tokenData.expires_in - 60) * 1000).toISOString();
      await supabase.from("ebay_config").update({
        user_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        token_expires_at: expiresAt,
        ebay_username: null,
        updated_at: new Date().toISOString(),
      }).eq("id", 1);

      return new Response(JSON.stringify({
        success: true,
        refresh_token_received: !!tokenData.refresh_token,
        access_token_received: !!tokenData.access_token,
        expires_in: tokenData.expires_in,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ===== OAUTH TEST: verify the stored refresh token works =====
    if (path === "oauth/test" && req.method === "GET") {
      const { data: cfg } = await supabase.from("ebay_config").select("*").eq("id", 1).maybeSingle();
      if (!cfg) throw new Error("eBay not configured");
      const config = cfg as EbayConfig;
      if (!config.refresh_token) {
        return new Response(JSON.stringify({
          oauth_authorized: false,
          refresh_token_present: false,
          access_token_test: "FAILED",
          message: "No refresh token stored. Click Connect eBay Account first.",
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      try {
        const { token } = await refreshEbayToken(config);
        return new Response(JSON.stringify({
          oauth_authorized: true,
          refresh_token_present: true,
          access_token_test: "SUCCESS",
          environment: config.environment,
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      } catch (err) {
        return new Response(JSON.stringify({
          oauth_authorized: false,
          refresh_token_present: true,
          access_token_test: "FAILED",
          error: err.message,
          environment: config.environment,
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    // ===== OAUTH IDENTITY: retrieve eBay username from authenticated user token =====
    if (path === "oauth/identity" && req.method === "GET") {
      const { data: cfg } = await supabase.from("ebay_config").select("*").eq("id", 1).maybeSingle();
      if (!cfg) throw new Error("eBay not configured");
      const config = cfg as EbayConfig;
      if (!config.refresh_token) {
        return new Response(JSON.stringify({
          connected: false,
          username: null,
          message: "No refresh token stored.",
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      try {
        const token = await getValidToken();
        const baseUrl = getEbayBaseUrl(config.environment);
        let username: string | null = null;

        // Try 1: Fulfillment API — orders contain sellerId (the eBay username)
        try {
          const orderResp = await fetch(`${baseUrl}/sell/fulfillment/v1/order?limit=1`, {
            headers: { "Authorization": `Bearer ${token}` },
          });
          if (orderResp.ok) {
            const orderData = await orderResp.json();
            username = orderData.orders?.[0]?.sellerId || null;
          }
        } catch { /* try next */ }

        // Try 2: Commerce Identity API — returns the authenticated user's profile
        if (!username) {
          try {
            const idResp = await fetch(`${baseUrl}/commerce/identity/v1/user/`, {
              headers: { "Authorization": `Bearer ${token}` },
            });
            if (idResp.ok) {
              const idData = await idResp.json();
              username = idData.username || idData.userId || null;
            }
          } catch { /* try next */ }
        }

        // Try 3: Account API — privilege endpoint
        if (!username) {
          try {
            const acctResp = await fetch(`${baseUrl}/sell/account/v1/privilege`, {
              headers: { "Authorization": `Bearer ${token}` },
            });
            if (acctResp.ok) {
              const acctData = await acctResp.json();
              username = acctData.sellerAccountInfo?.username || null;
            }
          } catch { /* try next */ }
        }

        if (username) {
          await supabase.from("ebay_config").update({ ebay_username: username }).eq("id", 1);
        }

        // Use stored username as fallback
        if (!username && config.ebay_username) {
          username = config.ebay_username;
        }

        return new Response(JSON.stringify({
          connected: true,
          username,
          environment: config.environment,
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      } catch (err) {
        return new Response(JSON.stringify({
          connected: false,
          username: null,
          error: err.message,
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    // ===== SAVE REFRESH TOKEN (from manual entry — kept for backward compat) =====
    if (path === "save-token" && req.method === "POST") {
      const body = await req.json();
      const { refresh_token } = body;
      if (!refresh_token) throw new Error("refresh_token is required");
      await supabase.from("ebay_config").update({
        refresh_token,
        updated_at: new Date().toISOString(),
      }).eq("id", 1);
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ===== TEST INVENTORY ITEM CREATION (debug — no offer/publish) =====
    if (path === "test-inventory" && req.method === "POST") {
      const body = await req.json();
      const token = await getValidToken();
      const { data: cfg } = await supabase.from("ebay_config").select("*").eq("id", 1).maybeSingle();
      const config = cfg as EbayConfig;
      const baseUrl = getEbayBaseUrl(config.environment);

      const rawCondition = body.condition_id || "3000";
      const ebayCondition = mapConditionToEbayEnum(rawCondition);
      console.log(`INTERNAL CONDITION: ${rawCondition}`);
      console.log(`EBAY CONDITION SENT: ${ebayCondition}`);

      const sku = body.sku || `DEBUG-${Date.now()}`;
      const inventoryItem = {
        sku,
        product: {
          title: body.title || "Test Inventory Item",
          description: body.description || "Test",
          aspects: body.item_specifics || {},
          brand: body.item_specifics?.Brand || "OEM",
          mpn: body.item_specifics?.MPN || "Does Not Apply",
        },
        condition: ebayCondition,
        conditionDescription: body.condition_description || "Used OEM part, tested and inspected.",
        availability: {
          shipToLocationAvailability: {
            quantity: body.quantity || 1,
          },
        },
        packageWeightAndSize: {
          weight: { value: body.shipping_weight_lbs || 10, unit: "POUND" },
        },
      };

      const invResp = await fetch(`${baseUrl}/sell/inventory/v1/inventory_item/${sku}`, {
        method: "PUT",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
          "Content-Language": "en-US",
          "Accept-Language": "en-US",
        },
        body: JSON.stringify(inventoryItem),
      });

      const invText = await invResp.text();
      return new Response(JSON.stringify({
        success: invResp.ok,
        http_status: invResp.status,
        condition_sent: ebayCondition,
        internal_condition: rawCondition,
        sku,
        endpoint: `${baseUrl}/sell/inventory/v1/inventory_item/${sku}`,
        request_body: inventoryItem,
        ebay_response: invText || (invResp.ok ? "(empty — success)" : "(empty)"),
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ===== TEST OFFER CREATION (debug — no publish) =====
    if (path === "test-offer" && req.method === "POST") {
      const body = await req.json();
      const token = await getValidToken();
      const { data: cfg } = await supabase.from("ebay_config").select("*").eq("id", 1).maybeSingle();
      const config = cfg as EbayConfig;
      const baseUrl = getEbayBaseUrl(config.environment);

      const sku = body.sku || "DEBUG-COND-TEST-002";
      const offerData: Record<string, unknown> = {
        sku,
        marketplaceId: "EBAY_US",
        format: "FIXED_PRICE",
        pricingSummary: {
          price: { value: (body.price || 49.99).toFixed(2), currency: "USD" },
        },
        listingDuration: "GTC",
      };

      // Only add listingPolicies if we have a real policy ID
      if (body.return_policy && body.return_policy !== "NONE" && body.return_policy !== "ReturnsNotAccepted") {
        offerData.listingPolicies = { returnPolicyId: body.return_policy };
      }

      // Only add merchantLocationKey if provided
      if (body.merchant_location_key) {
        offerData.merchantLocationKey = body.merchant_location_key;
      }
      console.log(`OFFER JSON: ${JSON.stringify(offerData)}`);

      const offerResp = await fetch(`${baseUrl}/sell/inventory/v1/offer`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
          "Content-Language": "en-US",
          "Accept-Language": "en-US",
        },
        body: JSON.stringify(offerData),
      });

      const offerText = await offerResp.text();
      return new Response(JSON.stringify({
        success: offerResp.ok,
        http_status: offerResp.status,
        marketplace_id_sent: "EBAY_US",
        category_id_sent: body.category_id || null,
        offer_json: offerData,
        ebay_response: offerText || (offerResp.ok ? "(empty — success)" : "(empty)"),
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ===== PUBLISH / UPDATE LISTING =====
    if (path === "publish" && req.method === "POST") {
      const body = (await req.json()) as PublishListingBody;
      const token = await getValidToken();
      const { data: cfg } = await supabase.from("ebay_config").select("*").eq("id", 1).maybeSingle();
      const config = cfg as EbayConfig;
      const baseUrl = getEbayBaseUrl(config.environment);

      // Use eBay Sell Inventory API (createOrReplaceInventoryItem + createOffer + publishOffer)
      const sku = body.sku || body.listing_id || `FP-${Date.now()}`;
      const rawCondition = body.condition_id || "3000";
      const ebayCondition = mapConditionToEbayEnum(rawCondition);
      console.log(`INTERNAL CONDITION: ${rawCondition}`);
      console.log(`EBAY CONDITION SENT: ${ebayCondition}`);

      const inventoryItem = {
        sku,
        product: {
          title: body.title,
          description: body.description || body.title,
          aspects: normalizeAspects(body.item_specifics),
          brand: body.item_specifics?.Brand || "OEM",
          mpn: body.item_specifics?.MPN || body.item_specifics?.["Manufacturer Part Number"] || "Does Not Apply",
        },
        condition: ebayCondition,
        conditionDescription: body.condition_description || "Used OEM part, tested and inspected.",
        availability: {
          shipToLocationAvailability: {
            quantity: body.quantity || 1,
          },
        },
        packageWeightAndSize: {
          weight: { value: body.shipping_weight_lbs || 10, unit: "POUND" },
        },
      };

      // 1. Create/Replace inventory item
      const invResp = await fetch(`${baseUrl}/sell/inventory/v1/inventory_item/${sku}`, {
        method: "PUT",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
          "Content-Language": "en-US",
          "Accept-Language": "en-US",
        },
        body: JSON.stringify(inventoryItem),
      });

      if (!invResp.ok) {
        const errText = await invResp.text();
        throw new Error(`eBay inventory item failed (HTTP ${invResp.status}): ${errText}`);
      }

      // Determine the eBay category for this part
      let categoryId: string | null = body.category_id || null;
      let categoryName: string | null = null;
      let categorySource: string | null = null;

      if (!categoryId) {
        // Use eBay's live Taxonomy API to find a valid leaf category
        const catResult = await findValidEbayCategory(body.title, body.item_specifics, token, baseUrl, null);
        categoryId = catResult.categoryId;
        categoryName = catResult.categoryName;
        categorySource = catResult.source;
        console.log(`PUBLISH: Category from ${catResult.source}: ${categoryName} (${categoryId})`);
      } else {
        // Validate the provided category ID against eBay's taxonomy
        const catResult = await findValidEbayCategory(body.title, body.item_specifics, token, baseUrl, categoryId);
        if (!catResult.oldCategoryValid) {
          categoryId = catResult.categoryId;
          categoryName = catResult.categoryName;
          categorySource = catResult.source;
          console.log(`PUBLISH: Provided category ${body.category_id} invalid, replaced with ${categoryName} (${categoryId})`);
        } else {
          categorySource = catResult.source;
        }
      }

      if (!categoryId) {
        return new Response(JSON.stringify({
          success: false,
          error: "eBay category needs review",
          message: `Could not determine an eBay category for part: "${body.title}". Please specify a category ID before publishing.`,
        }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      console.log(`PART: ${body.title}`);
      console.log(`EBAY CATEGORY: ${categoryName || 'unknown'}`);
      console.log(`CATEGORY ID: ${categoryId}`);

      // 2. Create offer
      const offerData: Record<string, unknown> = {
        sku,
        marketplaceId: "EBAY_US",
        format: body.listing_type === "Auction" ? "AUCTION" : "FIXED_PRICE",
        pricingSummary: {
          price: { value: body.price.toFixed(2), currency: "USD" },
        },
        listingDuration: body.listing_duration || "GTC",
        categoryId,
      };

      // Build listingPolicies from saved real eBay policy IDs
      const listingPolicies: Record<string, string> = {};

      // Return policy — must be a real eBay policy ID (not a text label)
      const returnPolicyId = body.return_policy || config.default_return_policy;
      if (returnPolicyId && !["ReturnsNotAccepted", "ReturnsAccepted", "ReturnsAccepted30", "NONE", ""].includes(returnPolicyId)) {
        listingPolicies.returnPolicyId = returnPolicyId;
      }

      // Fulfillment/shipping policy — always include if saved
      if (config.default_fulfillment_policy_id) {
        listingPolicies.fulfillmentPolicyId = config.default_fulfillment_policy_id;
      }

      // Payment policy — always include if saved
      if (config.default_payment_policy_id) {
        listingPolicies.paymentPolicyId = config.default_payment_policy_id;
      }

      if (Object.keys(listingPolicies).length > 0) {
        offerData.listingPolicies = listingPolicies;
      }

      // If no return policy ID saved, try to fetch one from eBay account
      if (!listingPolicies.returnPolicyId) {
        try {
          const policyResp = await fetch(`${baseUrl}/sell/account/v1/return_policy?marketplace_id=EBAY_US`, {
            headers: { "Authorization": `Bearer ${token}`, "Accept-Language": "en-US" },
          });
          console.log(`PUBLISH: Fetched return policies HTTP ${policyResp.status}`);
          if (policyResp.ok) {
            const policyData = await policyResp.json();
            const policies = policyData.returnPolicies as Array<{ returnPolicyId: string }> | undefined;
            if (policies && policies.length > 0) {
              listingPolicies.returnPolicyId = policies[0].returnPolicyId;
              offerData.listingPolicies = listingPolicies;
              console.log(`PUBLISH: Using returnPolicyId=${policies[0].returnPolicyId} from eBay account`);
            }
          }
        } catch { /* non-fatal */ }
      }

      // Fetch merchant location key from eBay inventory locations
      // Required for publish — eBay needs a country from the merchant location
      let merchantLocationKey: string | null = null;
      const locResp = await fetch(`${baseUrl}/sell/inventory/v1/location`, {
        headers: {
          "Authorization": `Bearer ${token}`,
          "Accept-Language": "en-US",
        },
      });
      if (locResp.ok) {
        const locData = await locResp.json();
        const locations = locData.locations as Array<{ merchantLocationKey: string; location?: { address?: { country?: string } } }> | undefined;
        if (locations && locations.length > 0) {
          merchantLocationKey = locations[0].merchantLocationKey;
          console.log(`MERCHANT LOCATION KEY: ${merchantLocationKey}`);
        }
      }

      // If no merchant location exists, create a default US one
      if (!merchantLocationKey) {
        merchantLocationKey = "default-location";
        const createLocResp = await fetch(`${baseUrl}/sell/inventory/v1/location/${merchantLocationKey}`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json",
            "Content-Language": "en-US",
            "Accept-Language": "en-US",
          },
          body: JSON.stringify({
            location: {
              address: {
                country: "US",
                city: "Wolf Point",
                stateOrProvince: "MT",
                postalCode: "59201",
                addressLine1: "100 Main St",
              },
            },
            merchantLocationKey: merchantLocationKey,
            name: "Fort Peck Auto Default Location",
          }),
        });
        if (createLocResp.ok || createLocResp.status === 409) {
          console.log(`CREATED DEFAULT MERCHANT LOCATION: ${merchantLocationKey}`);
        } else {
          const locErr = await createLocResp.text();
          console.log(`FAILED TO CREATE MERCHANT LOCATION: ${locErr}`);
          merchantLocationKey = null;
        }
      }
      if (merchantLocationKey) {
        offerData.merchantLocationKey = merchantLocationKey;
      }

      console.log(`OFFER JSON: ${JSON.stringify(offerData)}`);

      // 2. Check for existing offer for this SKU (idempotent — avoid duplicates)
      let offerId: string | null = null;

      const existingOffersResp = await fetch(`${baseUrl}/sell/inventory/v1/offer?sku=${encodeURIComponent(sku)}`, {
        headers: {
          "Authorization": `Bearer ${token}`,
          "Accept-Language": "en-US",
        },
      });
      if (existingOffersResp.ok) {
        const existingOffersData = await existingOffersResp.json();
        const existingOffers = existingOffersData.offers as Array<{ offerId: string; status: string }> | undefined;
        if (existingOffers && existingOffers.length > 0) {
          offerId = existingOffers[0].offerId;
          console.log(`REUSING EXISTING OFFER: ${offerId} for SKU ${sku}`);
        }
      }

      // 2a. If no existing offer, create one
      if (!offerId) {
        const offerResp = await fetch(`${baseUrl}/sell/inventory/v1/offer`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json",
            "Content-Language": "en-US",
            "Accept-Language": "en-US",
          },
          body: JSON.stringify(offerData),
        });

        const offerText = await offerResp.text();
        let offerJson: Record<string, unknown> = {};
        try { offerJson = JSON.parse(offerText); } catch { offerJson = { raw: offerText }; }

        if (!offerResp.ok) {
          // Check for "Offer entity already exists" (errorId 25002) — extract and reuse the existing offerId
          const errors = (offerJson as Record<string, unknown>).errors as Array<Record<string, unknown>> | undefined;
          const duplicateError = errors?.find((e) => e.errorId === 25002);
          if (duplicateError) {
            // The existing offerId is in the error response's parameters
            const params = duplicateError.parameters as Array<Record<string, string>> | undefined;
            const offerParam = params?.find((p) => p.name === "offerId");
            if (offerParam?.value) {
              offerId = offerParam.value;
              console.log(`OFFER ALREADY EXISTS — reusing offerId: ${offerId}`);
            }
          }
          if (!offerId) {
            throw new Error(`eBay offer creation failed (HTTP ${offerResp.status}): ${JSON.stringify(offerJson)}`);
          }
        } else {
          offerId = (offerJson as Record<string, unknown>).offerId as string;
        }
      }

      if (!offerId) {
        throw new Error("Failed to obtain an offer ID from eBay");
      }

      // 2b. GET the existing offer, strip returnTerms, set real returnPolicyId, then PUT
      // This fixes error 25009: ReturnsAcceptedOption missing/invalid.
      // returnTerms must NOT be sent alongside listingPolicies.returnPolicyId.
      let selectedReturnPolicyName: string | null = null;
      let finalReturnPolicyId: string | null = listingPolicies.returnPolicyId || null;

      const getExistingResp = await fetch(`${baseUrl}/sell/inventory/v1/offer/${offerId}`, {
        headers: { "Authorization": `Bearer ${token}`, "Accept-Language": "en-US" },
      });
      if (getExistingResp.ok) {
        const existingOffer = await getExistingResp.json() as Record<string, unknown>;

        // Replace the offer's categoryId with the validated one.
        // Without this, a stale/invalid categoryId on a reused offer causes publish error 25005.
        existingOffer.categoryId = categoryId;

        // Remove any stale returnTerms — eBay rejects offers that have both
        // returnTerms (without ReturnsAcceptedOption) and a return policy.
        delete existingOffer.returnTerms;

        // If we still don't have a returnPolicyId, fetch one from the seller's account
        if (!finalReturnPolicyId) {
          try {
            const policyResp = await fetch(`${baseUrl}/sell/account/v1/return_policy?marketplace_id=EBAY_US`, {
              headers: { "Authorization": `Bearer ${token}`, "Accept-Language": "en-US" },
            });
            if (policyResp.ok) {
              const policyData = await policyResp.json();
              const policies = policyData.returnPolicies as Array<{ returnPolicyId: string; name: string }> | undefined;
              if (policies && policies.length > 0) {
                finalReturnPolicyId = policies[0].returnPolicyId;
                selectedReturnPolicyName = policies[0].name;
                console.log(`PUBLISH: Fetched returnPolicyId=${finalReturnPolicyId} (${selectedReturnPolicyName}) from eBay account`);
              }
            }
          } catch { /* non-fatal — will surface in diagnostics */ }
        }

        // Look up the policy name for diagnostics if we have an ID but no name yet
        if (finalReturnPolicyId && !selectedReturnPolicyName) {
          try {
            const pnResp = await fetch(`${baseUrl}/sell/account/v1/return_policy/${finalReturnPolicyId}`, {
              headers: { "Authorization": `Bearer ${token}`, "Accept-Language": "en-US" },
            });
            if (pnResp.ok) {
              const pnData = await pnResp.json();
              selectedReturnPolicyName = pnData.name || null;
            }
          } catch { /* non-fatal */ }
        }

        // Ensure listingPolicies has the real returnPolicyId AND fulfillment/payment policy IDs
        // Always re-attach listingPolicies so fulfillmentPolicyId is never lost
        const lp = (existingOffer.listingPolicies || {}) as Record<string, string>;
        if (finalReturnPolicyId) {
          lp.returnPolicyId = finalReturnPolicyId;
        }
        if (config.default_fulfillment_policy_id) {
          lp.fulfillmentPolicyId = config.default_fulfillment_policy_id;
        }
        if (config.default_payment_policy_id) {
          lp.paymentPolicyId = config.default_payment_policy_id;
        }

        if (finalReturnPolicyId || config.default_fulfillment_policy_id || config.default_payment_policy_id) {
          existingOffer.listingPolicies = lp;
        } else {
          // No policies available — use inline returnTerms returnsAccepted=false
          existingOffer.returnTerms = { returnsAccepted: false };
          delete existingOffer.listingPolicies;
          selectedReturnPolicyName = "No Returns (inline)";
          console.log("PUBLISH: No policy IDs available — using inline returnTerms returnsAccepted=false");
        }

        // Ensure merchantLocationKey
        if (merchantLocationKey) {
          existingOffer.merchantLocationKey = merchantLocationKey;
        }

        const updateResp = await fetch(`${baseUrl}/sell/inventory/v1/offer/${offerId}`, {
          method: "PUT",
          headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json",
            "Content-Language": "en-US",
            "Accept-Language": "en-US",
          },
          body: JSON.stringify(existingOffer),
        });
        console.log(`UPDATED OFFER ${offerId}: returnPolicyId=${finalReturnPolicyId}, fulfillmentPolicyId=${config.default_fulfillment_policy_id || 'none'}, paymentPolicyId=${config.default_payment_policy_id || 'none'} (HTTP ${updateResp.status})`);

        // 2c. GET the offer again to verify fulfillmentPolicyId actually changed
        let offerVerified = false;
        let verifiedFulfillmentPolicyId: string | null = null;
        if (updateResp.ok) {
          const verifyResp = await fetch(`${baseUrl}/sell/inventory/v1/offer/${offerId}`, {
            headers: { "Authorization": `Bearer ${token}`, "Accept-Language": "en-US" },
          });
          if (verifyResp.ok) {
            const verifiedOffer = await verifyResp.json() as Record<string, unknown>;
            verifiedFulfillmentPolicyId = (verifiedOffer.listingPolicies as Record<string, string>)?.fulfillmentPolicyId || null;
            offerVerified = verifiedFulfillmentPolicyId === config.default_fulfillment_policy_id;
            console.log(`VERIFY OFFER: fulfillmentPolicyId=${verifiedFulfillmentPolicyId || 'MISSING'}, expected=${config.default_fulfillment_policy_id || 'none'}, verified=${offerVerified}`);
          }
        }

        // Store verification data for error diagnostics
        (existingOffer as Record<string, unknown>).__offerVerified = offerVerified;
        (existingOffer as Record<string, unknown>).__verifiedFulfillmentPolicyId = verifiedFulfillmentPolicyId;
      }

      // 3. Publish offer
      const publishResp = await fetch(baseUrl + "/sell/inventory/v1/offer/" + offerId + "/publish", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
          "Content-Language": "en-US",
          "Accept-Language": "en-US",
        },
      });

      const publishText = await publishResp.text();
      let publishJson: Record<string, unknown> = {};
      try { publishJson = JSON.parse(publishText); } catch { publishJson = { raw: publishText }; }

      if (!publishResp.ok) {
        // Fetch fulfillment policy details for diagnostics
        let fulfillmentPolicyName: string | null = null;
        let fulfillmentShippingServices: string | null = null;
        let offerVerified = false;
        let verifiedFulfillmentPolicyId: string | null = null;

        if (config.default_fulfillment_policy_id) {
          try {
            const fpResp = await fetch(`${baseUrl}/sell/account/v1/fulfillment_policy/${config.default_fulfillment_policy_id}`, {
              headers: { "Authorization": `Bearer ${token}`, "Accept-Language": "en-US" },
            });
            if (fpResp.ok) {
              const fpData = await fpResp.json();
              fulfillmentPolicyName = fpData.name || null;
              const services = fpData.shippingServices as Array<Record<string, unknown>> | undefined;
              if (services && services.length > 0) {
                fulfillmentShippingServices = services.map((s) =>
                  `${s.shippingServiceType || 'unknown'}:${s.shippingServiceCode || ''}(${s.shippingCost?.value || '0'})`
                ).join(', ');
              } else {
                fulfillmentShippingServices = 'none';
              }
            }
          } catch { /* non-fatal */ }

          // Verify the offer's fulfillmentPolicyId
          try {
            const verifyResp = await fetch(`${baseUrl}/sell/inventory/v1/offer/${offerId}`, {
              headers: { "Authorization": `Bearer ${token}`, "Accept-Language": "en-US" },
            });
            if (verifyResp.ok) {
              const verifiedOffer = await verifyResp.json() as Record<string, unknown>;
              verifiedFulfillmentPolicyId = (verifiedOffer.listingPolicies as Record<string, string>)?.fulfillmentPolicyId || null;
              offerVerified = verifiedFulfillmentPolicyId === config.default_fulfillment_policy_id;
            }
          } catch { /* non-fatal */ }
        }

        const summary = [
          `MARKETPLACE: EBAY_US`,
          `CATEGORY NAME: ${categoryName ?? 'N/A'}`,
          `CATEGORY ID: ${categoryId ?? 'N/A'}`,
          `CATEGORY SOURCE: ${categorySource ?? 'N/A'}`,
          `CATEGORY VALIDATED: YES`,
          `OFFER CATEGORY ID: ${categoryId ?? 'N/A'}`,
          `CATEGORY MATCHES OFFER: YES`,
          `FULFILLMENT POLICY NAME: ${fulfillmentPolicyName ?? 'N/A'}`,
          `FULFILLMENT POLICY ID: ${config.default_fulfillment_policy_id || 'N/A'}`,
          `SHIPPING SERVICES: ${fulfillmentShippingServices ?? 'N/A'}`,
          `OFFER VERIFIED: ${offerVerified ? 'YES' : 'NO'}` + (verifiedFulfillmentPolicyId ? ` (offer has: ${verifiedFulfillmentPolicyId})` : ''),
          `FULL EBAY ERROR: ${JSON.stringify(publishJson, null, 2)}`,
        ].join('\n');

        return new Response(JSON.stringify({
          success: false,
          error: `eBay publish failed (HTTP ${publishResp.status})`,
          summary,
          diagnostics: {
            selected_return_policy_name: selectedReturnPolicyName,
            return_policy_id_sent: finalReturnPolicyId,
            fulfillment_policy_name: fulfillmentPolicyName,
            fulfillment_policy_id: config.default_fulfillment_policy_id || null,
            fulfillment_policy_id_on_offer: verifiedFulfillmentPolicyId,
            offer_verified: offerVerified,
            shipping_services: fulfillmentShippingServices,
            offer_id: offerId,
            ebay_response: publishJson,
          },
        }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const ebayItemId = publishJson.listingId;

      // Update our DB
      await supabase.from("ebay_listings").update({
        ebay_item_id: ebayItemId,
        ebay_offer_id: offerId,
        category_id: categoryId,
        ebay_category_name: categoryName,
        listing_status: "active",
        updated_at: new Date().toISOString(),
      }).eq("id", body.listing_id);

      return new Response(JSON.stringify({
        success: true,
        ebay_item_id: ebayItemId,
        offer_id: offerId,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ===== TEST PUBLISH (debug — publish existing offer only, updated) =====
    if (path === "test-publish" && req.method === "POST") {
      const body = await req.json();
      const offerId = body.offer_id;
      if (!offerId) throw new Error("offer_id is required");
      const token = await getValidToken();
      const { data: cfg } = await supabase.from("ebay_config").select("environment").eq("id", 1).maybeSingle();
      const baseUrl = getEbayBaseUrl(cfg?.environment);
      let tpReturnPolicyId: string | null = null;
      let currentOffer: any = null;

      // Fetch merchant location key
      let merchantLocationKey: string | null = null;
      const locResp = await fetch(`${baseUrl}/sell/inventory/v1/location`, {
        headers: { "Authorization": `Bearer ${token}`, "Accept-Language": "en-US" },
      });
      if (locResp.ok) {
        const locData = await locResp.json();
        const locations = locData.locations as Array<{ merchantLocationKey: string }> | undefined;
        if (locations && locations.length > 0) {
          merchantLocationKey = locations[0].merchantLocationKey;
        }
      }

      // If no merchant location exists, create a default US one
      if (!merchantLocationKey) {
        merchantLocationKey = "default-location";
        const createLocResp = await fetch(`${baseUrl}/sell/inventory/v1/location/${merchantLocationKey}`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json",
            "Content-Language": "en-US",
            "Accept-Language": "en-US",
          },
          body: JSON.stringify({
            location: {
              address: {
                country: "US",
                city: "Wolf Point",
                stateOrProvince: "MT",
                postalCode: "59201",
                addressLine1: "100 Main St",
              },
            },
            merchantLocationKey: merchantLocationKey,
            name: "Fort Peck Auto Default Location",
          }),
        });
        if (!createLocResp.ok && createLocResp.status !== 409) {
          merchantLocationKey = null;
        }
      }

      // Update offer with merchant location key and categoryId if we have one
      if (merchantLocationKey) {
        // Get current offer data first
        const getOfferResp = await fetch(`${baseUrl}/sell/inventory/v1/offer/${offerId}`, {
          headers: { "Authorization": `Bearer ${token}`, "Accept-Language": "en-US" },
        });
        if (getOfferResp.ok) {
          currentOffer = await getOfferResp.json();
          currentOffer.merchantLocationKey = merchantLocationKey;

          // Determine category for this offer's inventory item
          const sku = currentOffer.sku;
          if (sku) {
            // Look up listing from our DB by SKU (listing_id)
            const { data: listing } = await supabase
              .from("ebay_listings")
              .select("title, category_id, item_specifics")
              .eq("id", sku)
              .maybeSingle();

            let categoryId: string | null = null;
            let categoryName: string | null = null;

            if (listing?.category_id) {
              const catResult = await findValidEbayCategory(listing.title, listing.item_specifics || undefined, token, baseUrl, listing.category_id);
              categoryId = catResult.categoryId;
              categoryName = catResult.categoryName;
            } else if (listing?.title) {
              const catResult = await findValidEbayCategory(listing.title, listing.item_specifics || undefined, token, baseUrl, null);
              categoryId = catResult.categoryId;
              categoryName = catResult.categoryName;
            }

            if (categoryId) {
              currentOffer.categoryId = categoryId;
              console.log("TEST-PUBLISH: Setting categoryId=" + categoryId + " (" + (categoryName || 'unknown') + ") for offer " + offerId);
              // Save to DB
              await supabase.from("ebay_listings").update({
                category_id: categoryId,
                ebay_category_name: categoryName,
              }).eq("id", sku);
            }

            // Strip returnTerms and set real returnPolicyId (fixes error 25009)
            delete currentOffer.returnTerms;

            // Fetch saved return policy from config
            const { data: tpCfg } = await supabase.from("ebay_config").select("default_return_policy, default_fulfillment_policy_id, default_payment_policy_id").eq("id", 1).maybeSingle();
            const rawReturnPolicy = tpCfg?.default_return_policy || null;
            // Filter out known text labels that aren't real eBay policy IDs
            const invalidLabels = ["ReturnsNotAccepted", "ReturnsAccepted", "ReturnsAccepted30", "NONE", ""];
            tpReturnPolicyId = (rawReturnPolicy && !invalidLabels.includes(rawReturnPolicy)) ? rawReturnPolicy : null;

            if (tpReturnPolicyId) {
              const existingPolicies = currentOffer.listingPolicies || {};
              currentOffer.listingPolicies = Object.assign({}, existingPolicies, { returnPolicyId: tpReturnPolicyId });
              console.log("TEST-PUBLISH: Set returnPolicyId=" + tpReturnPolicyId + " from eBay Settings");
            } else if (!currentOffer.listingPolicies || !currentOffer.listingPolicies.returnPolicyId) {
              // No saved policy — fetch first one from eBay account
              try {
                const policyResp = await fetch(`${baseUrl}/sell/account/v1/return_policy?marketplace_id=EBAY_US`, {
                  headers: { "Authorization": `Bearer ${token}`, "Accept-Language": "en-US" },
                });
                if (policyResp.ok) {
                  const policyData = await policyResp.json();
                  const policies = policyData.returnPolicies as Array<{ returnPolicyId: string }> | undefined;
                  if (policies && policies.length > 0) {
                    const existingPolicies = currentOffer.listingPolicies || {};
                    currentOffer.listingPolicies = Object.assign({}, existingPolicies, { returnPolicyId: policies[0].returnPolicyId });
                    tpReturnPolicyId = policies[0].returnPolicyId;
                    console.log("TEST-PUBLISH: Set returnPolicyId=" + policies[0].returnPolicyId + " from eBay account");
                  }
                }
              } catch { /* non-fatal */ }
            }

            // If still no return policy, use inline returnTerms returnsAccepted=false
            if (!tpReturnPolicyId) {
              currentOffer.returnTerms = { returnsAccepted: false };
              delete currentOffer.listingPolicies;
              console.log("TEST-PUBLISH: No return policy available — using inline returnTerms returnsAccepted=false");
            }

            // Also update the inventory item with brand/MPN if missing
            const getInvResp = await fetch(baseUrl + "/sell/inventory/v1/inventory_item/" + sku, {
              headers: { "Authorization": `Bearer ${token}`, "Accept-Language": "en-US" },
            });
            if (getInvResp.ok) {
              const invItem = await getInvResp.json();
              let needsUpdate = false;
              if (!invItem.product?.brand || invItem.product.brand === "") {
                invItem.product = invItem.product || {};
                invItem.product.brand = "OEM";
                needsUpdate = true;
              }
              if (!invItem.product?.mpn || invItem.product.mpn === "") {
                invItem.product = invItem.product || {};
                invItem.product.mpn = "Does Not Apply";
                needsUpdate = true;
              }
              if (needsUpdate) {
                await fetch(baseUrl + "/sell/inventory/v1/inventory_item/" + sku, {
                  method: "PUT",
                  headers: {
                    "Authorization": `Bearer ${token}`,
                    "Content-Type": "application/json",
                    "Content-Language": "en-US",
                    "Accept-Language": "en-US",
                  },
                  body: JSON.stringify(invItem),
                });
                console.log("TEST-PUBLISH: Updated inventory item " + sku + " with brand/MPN");
              }
            }
          }

          await fetch(baseUrl + "/sell/inventory/v1/offer/" + offerId, {
            method: "PUT",
            headers: {
              "Authorization": `Bearer ${token}`,
              "Content-Type": "application/json",
              "Content-Language": "en-US",
              "Accept-Language": "en-US",
            },
            body: JSON.stringify(currentOffer),
          });
          console.log("TEST-PUBLISH: Updated offer " + offerId + " with merchantLocationKey + categoryId");
        }
      }

      console.log("PUBLISH OFFER ID: " + offerId);
      console.log("ACCEPT-LANGUAGE: en-US");
      console.log("MERCHANT LOCATION KEY: " + (merchantLocationKey || 'none'));

      const publishResp = await fetch(baseUrl + "/sell/inventory/v1/offer/" + offerId + "/publish", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
          "Content-Language": "en-US",
          "Accept-Language": "en-US",
        },
      });

      const publishText = await publishResp.text();
      let publishJson: Record<string, unknown> = {};
      try { publishJson = JSON.parse(publishText); } catch (e) { publishJson = { raw: publishText }; }

      return new Response(JSON.stringify({
        success: publishResp.ok,
        http_status: publishResp.status,
        accept_language_sent: "en-US",
        offer_id: offerId,
        merchant_location_key: merchantLocationKey,
        publish_response: publishJson,
        diagnostics: {
          return_policy_id_sent: tpReturnPolicyId || (currentOffer?.listingPolicies?.returnPolicyId || null),
          note: "returnTerms stripped; using real returnPolicyId from eBay Settings",
        },
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ===== DIAGNOSE & FIX RETURN POLICY ON EXISTING OFFER =====
    // Reads the existing offer, inspects its returnPolicyId, validates the policy
    // against the seller's eBay account, replaces it with the G10 OS-selected policy
    // if needed, strips returnTerms, then retries publish. Does NOT create anything new.
    if (path === "diagnose-return" && req.method === "POST") {
      const body = await req.json() as { offer_id: string };
      const offerId = body.offer_id;
      if (!offerId) throw new Error("offer_id is required");

      const token = await getValidToken();
      const supabase = getSupabase();
      const { data: cfg } = await supabase.from("ebay_config").select("environment, default_return_policy, default_fulfillment_policy_id, default_payment_policy_id").eq("id", 1).maybeSingle();
      const baseUrl = getEbayBaseUrl(cfg?.environment);
      const g10ReturnPolicyIdRaw = cfg?.default_return_policy || null;
      const invalidLabels = ["ReturnsNotAccepted", "ReturnsAccepted", "ReturnsAccepted30", "NONE", ""];
      const g10ReturnPolicyId = (g10ReturnPolicyIdRaw && !invalidLabels.includes(g10ReturnPolicyIdRaw)) ? g10ReturnPolicyIdRaw : null;

      const report: Record<string, unknown> = {};

      // 1. Read the EXISTING offer from eBay
      const offerResp = await fetch(`${baseUrl}/sell/inventory/v1/offer/${offerId}`, {
        headers: { "Authorization": `Bearer ${token}`, "Accept-Language": "en-US" },
      });
      const offerText = await offerResp.text();
      let existingOffer: any;
      try { existingOffer = JSON.parse(offerText); } catch { existingOffer = { raw: offerText }; }

      if (!offerResp.ok) {
        return new Response(JSON.stringify({
          success: false,
          step: "read_offer",
          error: `Failed to read offer ${offerId} (HTTP ${offerResp.status})`,
          offer_response: existingOffer,
        }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const attachedReturnPolicyId = existingOffer.listingPolicies?.returnPolicyId || null;
      report.offer_id = offerId;
      report.attached_return_policy_id = attachedReturnPolicyId;
      report.has_return_terms = !!existingOffer.returnTerms;
      report.g10_selected_return_policy_id = g10ReturnPolicyId;

      // 2. Show the returnPolicyId currently attached (done above)
      // 3. Retrieve that exact policy from the connected eBay seller account
      let attachedPolicyDetails: any = null;
      if (attachedReturnPolicyId) {
        const apResp = await fetch(`${baseUrl}/sell/account/v1/return_policy/${attachedReturnPolicyId}`, {
          headers: { "Authorization": `Bearer ${token}`, "Accept-Language": "en-US" },
        });
        if (apResp.ok) {
          attachedPolicyDetails = await apResp.json();
        } else {
          attachedPolicyDetails = { error: `HTTP ${apResp.status}`, policyId: attachedReturnPolicyId };
        }
      }

      report.attached_policy_details = attachedPolicyDetails ? {
        name: attachedPolicyDetails.name || null,
        returnPolicyId: attachedPolicyDetails.returnPolicyId || null,
        marketplaceId: attachedPolicyDetails.marketplaceId || null,
        returnsAccepted: attachedPolicyDetails.returnsAccepted ?? null,
        returnPeriod: attachedPolicyDetails.returnPeriod || null,
        refundMethod: attachedPolicyDetails.refundMethod || null,
        returnShippingCostPayer: attachedPolicyDetails.returnShippingCostPayer || null,
        extendedHolidayReturnsOffered: attachedPolicyDetails.extendedHolidayReturnsOffered ?? null,
      } : null;

      // 4. Verify the attached policy is valid for EBAY_US and has returnsAccepted
      let attachedPolicyValid = false;
      if (attachedPolicyDetails) {
        const isEbayUs = attachedPolicyDetails.marketplaceId === "EBAY_US";
        const hasReturnsAccepted = typeof attachedPolicyDetails.returnsAccepted === "boolean";
        attachedPolicyValid = isEbayUs && hasReturnsAccepted;
      }
      report.attached_policy_valid_for_ebay_us = attachedPolicyValid;

      // Also fetch the G10-selected policy details for comparison
      let g10PolicyDetails: any = null;
      if (g10ReturnPolicyId) {
        const g10Resp = await fetch(`${baseUrl}/sell/account/v1/return_policy/${g10ReturnPolicyId}`, {
          headers: { "Authorization": `Bearer ${token}`, "Accept-Language": "en-US" },
        });
        if (g10Resp.ok) {
          g10PolicyDetails = await g10Resp.json();
        } else {
          g10PolicyDetails = { error: `HTTP ${g10Resp.status}`, policyId: g10ReturnPolicyId };
        }
      }

      report.g10_policy_details = g10PolicyDetails ? {
        name: g10PolicyDetails.name || null,
        returnPolicyId: g10PolicyDetails.returnPolicyId || null,
        marketplaceId: g10PolicyDetails.marketplaceId || null,
        returnsAccepted: g10PolicyDetails.returnsAccepted ?? null,
        returnPeriod: g10PolicyDetails.returnPeriod || null,
        refundMethod: g10PolicyDetails.refundMethod || null,
        returnShippingCostPayer: g10PolicyDetails.returnShippingCostPayer || null,
      } : null;

      let g10PolicyValid = false;
      if (g10PolicyDetails) {
        g10PolicyValid = g10PolicyDetails.marketplaceId === "EBAY_US" && typeof g10PolicyDetails.returnsAccepted === "boolean";
      }
      report.g10_policy_valid_for_ebay_us = g10PolicyValid;

      // 5. Decide which policy to use: prefer G10-selected if it's valid and different
      let policyToUse = attachedReturnPolicyId;
      let replaced = false;
      let replaceReason = "";

      if (g10ReturnPolicyId && g10PolicyValid && g10ReturnPolicyId !== attachedReturnPolicyId) {
        policyToUse = g10ReturnPolicyId;
        replaced = true;
        replaceReason = `Replaced attached policy "${attachedPolicyDetails?.name || attachedReturnPolicyId}" with G10-selected policy "${g10PolicyDetails?.name || g10ReturnPolicyId}"`;
      } else if (!attachedPolicyValid && g10ReturnPolicyId && g10PolicyValid) {
        policyToUse = g10ReturnPolicyId;
        replaced = true;
        replaceReason = `Attached policy invalid for EBAY_US; replaced with G10-selected policy "${g10PolicyDetails?.name || g10ReturnPolicyId}"`;
      } else if (!attachedPolicyValid && !g10ReturnPolicyId) {
        // No G10 policy saved — try fetching first valid one from eBay account
        const allPoliciesResp = await fetch(`${baseUrl}/sell/account/v1/return_policy?marketplace_id=EBAY_US`, {
          headers: { "Authorization": `Bearer ${token}`, "Accept-Language": "en-US" },
        });
        if (allPoliciesResp.ok) {
          const allData = await allPoliciesResp.json();
          const policies = allData.returnPolicies || [];
          const valid = policies.find((p: any) => p.marketplaceId === "EBAY_US" && typeof p.returnsAccepted === "boolean");
          if (valid) {
            policyToUse = valid.returnPolicyId;
            replaced = true;
            replaceReason = `No G10 policy saved and attached policy invalid; using first valid EBAY_US policy "${valid.name}"`;
          }
        }
      }

      report.policy_to_use = policyToUse;
      report.policy_replaced = replaced;
      report.replace_reason = replaceReason || null;

      // 6. Update the EXISTING offer: strip returnTerms, set the correct returnPolicyId
      delete existingOffer.returnTerms;

      if (policyToUse) {
        const lp = existingOffer.listingPolicies || {};
        lp.returnPolicyId = policyToUse;
        if (cfg?.default_fulfillment_policy_id) {
          lp.fulfillmentPolicyId = cfg.default_fulfillment_policy_id;
        }
        if (cfg?.default_payment_policy_id) {
          lp.paymentPolicyId = cfg.default_payment_policy_id;
        }
        existingOffer.listingPolicies = lp;
      } else {
        // No valid return policy available — use inline returnTerms returnsAccepted=false
        existingOffer.returnTerms = { returnsAccepted: false };
        delete existingOffer.listingPolicies;
        report.using_inline_return_terms = true;
        console.log("DIAGNOSE: No return policy available — using inline returnTerms returnsAccepted=false");
      }

      const updateResp = await fetch(`${baseUrl}/sell/inventory/v1/offer/${offerId}`, {
        method: "PUT",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
          "Content-Language": "en-US",
          "Accept-Language": "en-US",
        },
        body: JSON.stringify(existingOffer),
      });

      const updateText = await updateResp.text();
      let updateJson: any;
      try { updateJson = JSON.parse(updateText); } catch { updateJson = { raw: updateText }; }

      report.offer_updated = updateResp.ok;
      report.offer_update_http_status = updateResp.status;
      report.offer_update_response = updateJson;

      if (!updateResp.ok) {
        return new Response(JSON.stringify({
          success: false,
          step: "update_offer",
          error: `Failed to update offer (HTTP ${updateResp.status})`,
          report,
        }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Now publish the offer
      const publishResp = await fetch(`${baseUrl}/sell/inventory/v1/offer/${offerId}/publish`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
          "Content-Language": "en-US",
          "Accept-Language": "en-US",
        },
      });

      const publishText = await publishResp.text();
      let publishJson: any;
      try { publishJson = JSON.parse(publishText); } catch { publishJson = { raw: publishText }; }

      report.publish_result = publishResp.ok ? "success" : "failed";
      report.publish_http_status = publishResp.status;
      report.publish_response = publishJson;

      // Build the requested plain-text summary
      const summaryPolicyName = (replaced ? g10PolicyDetails : attachedPolicyDetails)?.name || null;
      const summaryReturnsAccepted = (replaced ? g10PolicyDetails : attachedPolicyDetails)?.returnsAccepted ?? null;

      const summary = [
        `RETURN POLICY NAME: ${summaryPolicyName ?? "N/A"}`,
        `RETURN POLICY ID: ${policyToUse ?? "N/A"}`,
        `RETURNS ACCEPTED: ${summaryReturnsAccepted === null ? "N/A" : String(summaryReturnsAccepted)}`,
        `OFFER UPDATED: ${report.offer_updated ? "YES" : "NO"}`,
        `PUBLISH RESULT: ${publishResp.ok ? "SUCCESS" : `FAILED (HTTP ${publishResp.status})`}`,
        publishResp.ok ? "" : `FULL ERROR: ${JSON.stringify(publishJson, null, 2)}`,
      ].join("\n");

      if (publishResp.ok) {
        // Update DB with eBay item ID
        const ebayItemId = publishJson.listingId;
        await supabase.from("ebay_listings").update({
          ebay_item_id: ebayItemId,
          ebay_offer_id: offerId,
          listing_status: "active",
          published_at: new Date().toISOString(),
        }).eq("ebay_offer_id", offerId);
      }

      return new Response(JSON.stringify({
        success: publishResp.ok,
        summary,
        report,
      }), {
        status: publishResp.ok ? 200 : 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ===== SYNC LISTING STATUS FROM EBAY =====
    if (path === "sync" && req.method === "POST") {
      const body = await req.json();
      const { listing_id, ebay_item_id } = body;
      if (!ebay_item_id) throw new Error("ebay_item_id is required");
      const token = await getValidToken();
      const { data: cfg } = await supabase.from("ebay_config").select("environment").eq("id", 1).maybeSingle();
      const baseUrl = getEbayBaseUrl(cfg?.environment);

      const resp = await fetch(`${baseUrl}/sell/inventory/v1/inventory_item/${ebay_item_id}`, {
        headers: { "Authorization": `Bearer ${token}` },
      });
      const itemData = await resp.json();

      if (resp.ok) {
        const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
        if (itemData.availability?.shipToLocationAvailability?.quantity === 0) {
          updates.listing_status = "sold";
          updates.sold_at = new Date().toISOString();
        }
        await supabase.from("ebay_listings").update(updates).eq("id", listing_id);
      }

      return new Response(JSON.stringify({ success: true, data: itemData }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ===== END LISTING =====
    if (path === "end" && req.method === "POST") {
      const body = await req.json();
      const { listing_id, ebay_item_id } = body;
      if (!ebay_item_id) throw new Error("ebay_item_id is required");
      const token = await getValidToken();
      const { data: cfg } = await supabase.from("ebay_config").select("environment").eq("id", 1).maybeSingle();
      const baseUrl = getEbayBaseUrl(cfg?.environment);

      await fetch(`${baseUrl}/sell/inventory/v1/offer/${ebay_item_id}/withdraw`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      await supabase.from("ebay_listings").update({
        listing_status: "ended",
        ended_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", listing_id);

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ===== SEARCH EBAY MOTORS FOR COMPS =====
    if (path === "search-comps" && req.method === "POST") {
      const body = await req.json();
      const { query } = body;
      if (!query) throw new Error("query is required");

      // Use the Browse API (public, needs app token — not user token)
      const { data: cfg } = await supabase.from("ebay_config").select("client_id, client_secret, environment").eq("id", 1).maybeSingle();
      const config = cfg as Pick<EbayConfig, "client_id" | "client_secret" | "environment">;
      if (!config?.client_id) throw new Error("eBay not configured");

      const authUrl = config.environment === "production"
        ? "https://api.ebay.com/identity/v1/oauth2/token"
        : "https://api.sandbox.ebay.com/identity/v1/oauth2/token";

      const appTokenResp = await fetch(authUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Authorization": `Basic ${btoa(`${config.client_id}:${config.client_secret}`)}`,
        },
        body: new URLSearchParams({
          grant_type: "client_credentials",
          scope: "https://api.ebay.com/oauth/api_scope",
        }),
      });
      const appTokenData = await appTokenResp.json();
      if (!appTokenData.access_token) throw new Error("Failed to get eBay app token");

      const baseUrl = getEbayBaseUrl(config.environment);
      const searchResp = await fetch(
        `${baseUrl}/buy/browse/v1/item_summary/search?q=${encodeURIComponent(query)}&limit=10&filter=conditionIds:{3000}`,
        { headers: { "Authorization": `Bearer ${appTokenData.access_token}` } },
      );
      const searchResults = await searchResp.json();

      const comps = (searchResults.itemSummaries || []).map((item: any) => ({
        title: item.title,
        price: parseFloat(item.price?.value || "0"),
        condition: item.condition || "Used",
        url: item.itemWebUrl,
        image: item.image?.imageUrl,
        itemId: item.itemId,
      }));

      return new Response(JSON.stringify({ comps }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ===== SUGGEST CATEGORY =====
    if (path === "suggest-category" && req.method === "POST") {
      const body = await req.json() as { title: string; item_specifics?: Record<string, string> };
      const suggestion = suggestEbayCategoryId(body.title, body.item_specifics);
      return new Response(JSON.stringify({
        success: true,
        category_id: suggestion?.categoryId || null,
        category_name: suggestion?.categoryName || null,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ===== GET SELLER'S BUSINESS POLICIES (return, fulfillment, payment) =====
    // ===== CREATE RETURN POLICY =====
    if (path === "create-return-policy" && req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const policyName = (body.name as string) || "No Returns";
      const returnsAccepted = (body.returns_accepted as boolean) ?? false;

      const token = await getValidToken();
      const { data: cfg } = await supabase.from("ebay_config").select("environment").eq("id", 1).maybeSingle();
      const baseUrl = getEbayBaseUrl(cfg?.environment);

      const policyPayload: Record<string, unknown> = {
        name: policyName,
        marketplaceId: "EBAY_US",
        returnsAccepted,
      };

      if (!returnsAccepted) {
        policyPayload.returnPolicyDescription = "No returns accepted.";
      } else {
        policyPayload.returnPeriod = { value: 30, unit: "DAY" };
        policyPayload.returnMethod = "REPLACEMENT";
        policyPayload.returnShippingCostPayer = "BUYER";
      }

      const createResp = await fetch(`${baseUrl}/sell/account/v1/return_policy`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
          "Content-Language": "en-US",
          "Accept-Language": "en-US",
        },
        body: JSON.stringify(policyPayload),
      });

      const createText = await createResp.text();
      let createJson: Record<string, unknown> = {};
      try { createJson = JSON.parse(createText); } catch { createJson = { raw: createText }; }

      if (!createResp.ok) {
        return new Response(JSON.stringify({
          success: false,
          error: `Failed to create return policy (HTTP ${createResp.status})`,
          ebay_response: createJson,
        }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const policyId = createJson.returnPolicyId as string;

      // Save as default return policy in ebay_config
      await supabase.from("ebay_config").update({
        default_return_policy: policyId,
        updated_at: new Date().toISOString(),
      }).eq("id", 1);

      return new Response(JSON.stringify({
        success: true,
        returnPolicyId: policyId,
        name: createJson.name || policyName,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (path === "policies" && req.method === "GET") {
      const token = await getValidToken();
      const { data: cfg } = await supabase.from("ebay_config").select("environment").eq("id", 1).maybeSingle();
      const baseUrl = getEbayBaseUrl(cfg?.environment);
      const marketplaceId = "EBAY_US";

      const reqHeaders = {
        "Authorization": `Bearer ${token}`,
        "Accept-Language": "en-US",
        "Content-Language": "en-US",
      };

      const endpoints = [
        { type: "return", url: `${baseUrl}/sell/account/v1/return_policy?marketplace_id=${marketplaceId}` },
        { type: "fulfillment", url: `${baseUrl}/sell/account/v1/fulfillment_policy?marketplace_id=${marketplaceId}` },
        { type: "payment", url: `${baseUrl}/sell/account/v1/payment_policy?marketplace_id=${marketplaceId}` },
      ];

      const results = await Promise.all(
        endpoints.map(async (ep) => {
          console.log(`POLICIES: GET ${ep.url} | marketplace=${marketplaceId}`);
          try {
            const resp = await fetch(ep.url, { headers: reqHeaders });
            const text = await resp.text();
            console.log(`POLICIES [${ep.type}]: HTTP ${resp.status} | marketplace=${marketplaceId} | bodyLen=${text.length}`);
            let json: Record<string, unknown> = {};
            try { json = JSON.parse(text); } catch { json = { raw: text.slice(0, 500) }; }

            if (!resp.ok) {
              console.log(`POLICIES [${ep.type}] ERROR: ${text.slice(0, 1000)}`);
              return { type: ep.type, ok: false, status: resp.status, error: json, policies: [] };
            }

            const arr = (json.returnPolicies || json.fulfillmentPolicies || json.paymentPolicies || []) as Array<Record<string, unknown>>;
            console.log(`POLICIES [${ep.type}]: ${arr.length} policies returned`);
            return { type: ep.type, ok: true, status: resp.status, error: null, policies: arr };
          } catch (err) {
            console.log(`POLICIES [${ep.type}] EXCEPTION: ${err.message}`);
            return { type: ep.type, ok: false, status: 0, error: { message: err.message }, policies: [] };
          }
        })
      );

      const returnResult = results.find(r => r.type === "return");
      const fulfillmentResult = results.find(r => r.type === "fulfillment");
      const paymentResult = results.find(r => r.type === "payment");

      const returnPolicies = (returnResult?.policies || []).map((p: Record<string, unknown>) => ({
        returnPolicyId: p.returnPolicyId as string,
        name: (p.name as string) || "Unnamed Return Policy",
      }));
      const fulfillmentPolicies = (fulfillmentResult?.policies || []).map((p: Record<string, unknown>) => ({
        fulfillmentPolicyId: p.fulfillmentPolicyId as string,
        name: (p.name as string) || "Unnamed Shipping Policy",
      }));
      const paymentPolicies = (paymentResult?.policies || []).map((p: Record<string, unknown>) => ({
        paymentPolicyId: p.paymentPolicyId as string,
        name: (p.name as string) || "Unnamed Payment Policy",
      }));

      const errors: Record<string, unknown> = {};
      if (returnResult && !returnResult.ok) errors.return = returnResult.error;
      if (fulfillmentResult && !fulfillmentResult.ok) errors.fulfillment = fulfillmentResult.error;
      if (paymentResult && !paymentResult.ok) errors.payment = paymentResult.error;

      return new Response(JSON.stringify({
        returnPolicies,
        fulfillmentPolicies,
        paymentPolicies,
        errors: Object.keys(errors).length > 0 ? errors : undefined,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ===== GET POLICY DETAILS (by type + ID) =====
    if (path === "policy-details" && req.method === "GET") {
      const policyType = url.searchParams.get("type") || "";
      const policyId = url.searchParams.get("id") || "";
      if (!policyId || !policyType) throw new Error("type and id query params are required");

      const token = await getValidToken();
      const { data: cfg } = await supabase.from("ebay_config").select("environment").eq("id", 1).maybeSingle();
      const baseUrl = getEbayBaseUrl(cfg?.environment);

      const typeMap: Record<string, string> = {
        return: "return_policy",
        fulfillment: "fulfillment_policy",
        payment: "payment_policy",
      };
      const apiPath = typeMap[policyType];
      if (!apiPath) throw new Error(`Invalid policy type: ${policyType}`);

      console.log(`POLICY DETAILS: GET ${baseUrl}/sell/account/v1/${apiPath}/${policyId}`);
      const resp = await fetch(`${baseUrl}/sell/account/v1/${apiPath}/${policyId}`, {
        headers: { "Authorization": `Bearer ${token}`, "Accept-Language": "en-US" },
      });
      const text = await resp.text();
      console.log(`POLICY DETAILS [${policyType}]: HTTP ${resp.status}`);

      let json: Record<string, unknown> = {};
      try { json = JSON.parse(text); } catch { json = { raw: text }; }

      if (!resp.ok) {
        return new Response(JSON.stringify({
          success: false,
          error: `eBay returned HTTP ${resp.status}`,
          ebay_response: json,
        }), { status: resp.status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      return new Response(JSON.stringify({
        success: true,
        policy: json,
        policyType,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ===== CREATE FULFILLMENT POLICY =====
    if (path === "create-fulfillment-policy" && req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const policyName = (body.name as string) || "Standard Shipping";

      const token = await getValidToken();
      const { data: cfg } = await supabase.from("ebay_config").select("environment").eq("id", 1).maybeSingle();
      const baseUrl = getEbayBaseUrl(cfg?.environment);

      const policyPayload: Record<string, unknown> = {
        name: policyName,
        marketplaceId: "EBAY_US",
        handTime: 2,
        shippingCostType: "FLAT_RATE",
        shippingOptions: [{
          optionType: "DOMESTIC",
          cost: { value: "25.00", currency: "USD" },
        }],
      };

      console.log(`CREATE FULFILLMENT POLICY: ${policyName}`);
      const createResp = await fetch(`${baseUrl}/sell/account/v1/fulfillment_policy`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
          "Content-Language": "en-US",
          "Accept-Language": "en-US",
        },
        body: JSON.stringify(policyPayload),
      });

      const createText = await createResp.text();
      let createJson: Record<string, unknown> = {};
      try { createJson = JSON.parse(createText); } catch { createJson = { raw: createText }; }

      if (!createResp.ok) {
        console.log(`CREATE FULFILLMENT POLICY ERROR: HTTP ${createResp.status} — ${createText.slice(0, 500)}`);
        return new Response(JSON.stringify({
          success: false,
          error: `Failed to create fulfillment policy (HTTP ${createResp.status})`,
          ebay_response: createJson,
        }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      return new Response(JSON.stringify({
        success: true,
        fulfillmentPolicyId: createJson.fulfillmentPolicyId,
        name: createJson.name || policyName,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ===== CREATE PAYMENT POLICY =====
    if (path === "create-payment-policy" && req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const policyName = (body.name as string) || "Immediate Payment";

      const token = await getValidToken();
      const { data: cfg } = await supabase.from("ebay_config").select("environment").eq("id", 1).maybeSingle();
      const baseUrl = getEbayBaseUrl(cfg?.environment);

      const policyPayload: Record<string, unknown> = {
        name: policyName,
        marketplaceId: "EBAY_US",
        paymentMethods: [{ paymentMethodType: "PAYPAL" }],
        immediatePay: true,
      };

      console.log(`CREATE PAYMENT POLICY: ${policyName}`);
      const createResp = await fetch(`${baseUrl}/sell/account/v1/payment_policy`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
          "Content-Language": "en-US",
          "Accept-Language": "en-US",
        },
        body: JSON.stringify(policyPayload),
      });

      const createText = await createResp.text();
      let createJson: Record<string, unknown> = {};
      try { createJson = JSON.parse(createText); } catch { createJson = { raw: createText }; }

      if (!createResp.ok) {
        console.log(`CREATE PAYMENT POLICY ERROR: HTTP ${createResp.status} — ${createText.slice(0, 500)}`);
        return new Response(JSON.stringify({
          success: false,
          error: `Failed to create payment policy (HTTP ${createResp.status})`,
          ebay_response: createJson,
        }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      return new Response(JSON.stringify({
        success: true,
        paymentPolicyId: createJson.paymentPolicyId,
        name: createJson.name || policyName,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ===== FIX FULFILLMENT POLICY =====
    // Retrieves the fulfillment policy named "shipping policy" from the connected eBay account,
    // saves its ID as the default in ebay_config, then updates any existing unpublished offer
    // with that fulfillmentPolicyId, verifies it, and retries publish.
    // Does NOT create a new policy, offer, or inventory item.
    if (path === "fix-fulfillment" && req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const offerId = (body.offer_id as string) || null;
      const targetPolicyName = "shipping policy";

      const token = await getValidToken();
      const supabase = getSupabase();
      const { data: cfg } = await supabase.from("ebay_config").select("environment, default_return_policy, default_fulfillment_policy_id, default_payment_policy_id").eq("id", 1).maybeSingle();
      const baseUrl = getEbayBaseUrl(cfg?.environment);

      // 1. Fetch all fulfillment policies from eBay account
      const fpListResp = await fetch(`${baseUrl}/sell/account/v1/fulfillment_policy?marketplace_id=EBAY_US`, {
        headers: { "Authorization": `Bearer ${token}`, "Accept-Language": "en-US" },
      });
      const fpListText = await fpListResp.text();
      let fpListJson: any;
      try { fpListJson = JSON.parse(fpListText); } catch { fpListJson = { raw: fpListText }; }

      if (!fpListResp.ok) {
        return new Response(JSON.stringify({
          success: false,
          step: "fetch_fulfillment_policies",
          summary: `POLICY FOUND: NO\nPOLICY ID: N/A\nOFFER UPDATED: NO\nPUBLISH: FAILED\nFULL ERROR: Failed to fetch fulfillment policies (HTTP ${fpListResp.status}): ${JSON.stringify(fpListJson)}`,
        }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const fulfillmentPolicies = (fpListJson.fulfillmentPolicies || []) as Array<{ fulfillmentPolicyId: string; name: string }>;
      const targetPolicy = fulfillmentPolicies.find((p) => p.name.toLowerCase() === targetPolicyName.toLowerCase());

      if (!targetPolicy) {
        const availableNames = fulfillmentPolicies.map((p) => `"${p.name}"`).join(", ");
        return new Response(JSON.stringify({
          success: false,
          step: "find_policy",
          summary: `POLICY FOUND: NO\nPOLICY ID: N/A\nOFFER UPDATED: NO\nPUBLISH: FAILED\nFULL ERROR: No fulfillment policy named "${targetPolicyName}" found on eBay account. Available policies: ${availableNames || 'none'}`,
        }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const fulfillmentPolicyId = targetPolicy.fulfillmentPolicyId;
      console.log(`FIX-FULFILLMENT: Found policy "${targetPolicy.name}" with ID ${fulfillmentPolicyId}`);

      // 2. Save as default fulfillment policy in ebay_config
      await supabase.from("ebay_config").update({
        default_fulfillment_policy_id: fulfillmentPolicyId,
        updated_at: new Date().toISOString(),
      }).eq("id", 1);
      console.log(`FIX-FULFILLMENT: Saved default_fulfillment_policy_id=${fulfillmentPolicyId} to ebay_config`);

      // 3. If no offerId provided, nothing more to do — just report the policy was found and saved
      if (!offerId) {
        return new Response(JSON.stringify({
          success: true,
          summary: `POLICY FOUND: YES\nPOLICY ID: ${fulfillmentPolicyId}\nOFFER UPDATED: N/A (no offer_id provided — policy saved as default, will be used on next publish)\nPUBLISH: N/A`,
          fulfillmentPolicyId,
          fulfillmentPolicyName: targetPolicy.name,
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // 4. GET the existing offer
      const getResp = await fetch(`${baseUrl}/sell/inventory/v1/offer/${offerId}`, {
        headers: { "Authorization": `Bearer ${token}`, "Accept-Language": "en-US" },
      });
      const getRespText = await getResp.text();
      let existingOffer: any;
      try { existingOffer = JSON.parse(getRespText); } catch { existingOffer = { raw: getRespText }; }

      if (!getResp.ok) {
        return new Response(JSON.stringify({
          success: false,
          step: "get_offer",
          summary: `POLICY FOUND: YES\nPOLICY ID: ${fulfillmentPolicyId}\nOFFER UPDATED: NO\nPUBLISH: FAILED\nFULL ERROR: Failed to read offer ${offerId} (HTTP ${getResp.status}): ${JSON.stringify(existingOffer)}`,
        }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // 5. Update listingPolicies.fulfillmentPolicyId on the existing offer
      const lp = (existingOffer.listingPolicies || {}) as Record<string, string>;
      lp.fulfillmentPolicyId = fulfillmentPolicyId;
      existingOffer.listingPolicies = lp;

      const updateResp = await fetch(`${baseUrl}/sell/inventory/v1/offer/${offerId}`, {
        method: "PUT",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
          "Content-Language": "en-US",
          "Accept-Language": "en-US",
        },
        body: JSON.stringify(existingOffer),
      });
      const updateText = await updateResp.text();
      let updateJson: any;
      try { updateJson = JSON.parse(updateText); } catch { updateJson = { raw: updateText }; }

      if (!updateResp.ok) {
        return new Response(JSON.stringify({
          success: false,
          step: "update_offer",
          summary: `POLICY FOUND: YES\nPOLICY ID: ${fulfillmentPolicyId}\nOFFER UPDATED: NO\nPUBLISH: FAILED\nFULL ERROR: Failed to update offer (HTTP ${updateResp.status}): ${JSON.stringify(updateJson)}`,
        }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // 6. GET the offer again to verify fulfillmentPolicyId is attached
      const verifyResp = await fetch(`${baseUrl}/sell/inventory/v1/offer/${offerId}`, {
        headers: { "Authorization": `Bearer ${token}`, "Accept-Language": "en-US" },
      });
      let verifiedFulfillmentPolicyId: string | null = null;
      if (verifyResp.ok) {
        const verifiedOffer = await verifyResp.json() as Record<string, unknown>;
        verifiedFulfillmentPolicyId = (verifiedOffer.listingPolicies as Record<string, string>)?.fulfillmentPolicyId || null;
      }
      const offerVerified = verifiedFulfillmentPolicyId === fulfillmentPolicyId;
      console.log(`FIX-FULFILLMENT: Verified offer fulfillmentPolicyId=${verifiedFulfillmentPolicyId}, expected=${fulfillmentPolicyId}, verified=${offerVerified}`);

      // 7. Publish the offer
      const publishResp = await fetch(`${baseUrl}/sell/inventory/v1/offer/${offerId}/publish`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
          "Content-Language": "en-US",
          "Accept-Language": "en-US",
        },
      });
      const publishText = await publishResp.text();
      let publishJson: any;
      try { publishJson = JSON.parse(publishText); } catch { publishJson = { raw: publishText }; }

      const summary = [
        `POLICY FOUND: YES`,
        `POLICY ID: ${fulfillmentPolicyId}`,
        `OFFER UPDATED: ${offerVerified ? "YES" : "NO"}`,
        `PUBLISH: ${publishResp.ok ? "SUCCESS" : `FAILED (HTTP ${publishResp.status})`}`,
        publishResp.ok ? "" : `FULL ERROR: ${JSON.stringify(publishJson, null, 2)}`,
      ].join("\n");

      if (publishResp.ok) {
        const ebayItemId = publishJson.listingId;
        await supabase.from("ebay_listings").update({
          ebay_item_id: ebayItemId,
          ebay_offer_id: offerId,
          listing_status: "active",
          published_at: new Date().toISOString(),
        }).eq("ebay_offer_id", offerId);
      }

      return new Response(JSON.stringify({
        success: publishResp.ok,
        summary,
        fulfillmentPolicyId,
        fulfillmentPolicyName: targetPolicy.name,
        offerVerified,
        verifiedFulfillmentPolicyId,
        publish_response: publishJson,
      }), {
        status: publishResp.ok ? 200 : 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ===== FIX CATEGORY (error 25005) =====
    // Finds a valid leaf category using eBay's live Taxonomy API for EBAY_US,
    // updates the EXISTING offer with that categoryId, verifies it, and retries publish.
    // Does NOT create a new offer or inventory item.
    if (path === "fix-category" && req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const offerId = (body.offer_id as string) || null;
      const listingId = (body.listing_id as string) || null;
      const partTitle = (body.title as string) || null;
      const itemSpecifics = (body.item_specifics as Record<string, string>) || undefined;

      const token = await getValidToken();
      const supabase = getSupabase();
      const { data: cfg } = await supabase.from("ebay_config").select("environment").eq("id", 1).maybeSingle();
      const baseUrl = getEbayBaseUrl(cfg?.environment);

      // If listing_id provided, fetch from DB
      let dbListing: any = null;
      if (listingId) {
        const { data } = await supabase
          .from("ebay_listings")
          .select("id, title, category_id, ebay_category_name, sku, ebay_offer_id, item_specifics")
          .eq("id", listingId)
          .maybeSingle();
        dbListing = data;
      }

      const title = partTitle || dbListing?.title || "";
      const oldCategoryId = dbListing?.category_id || null;
      const dbOfferId = offerId || dbListing?.ebay_offer_id || null;
      const dbSku = dbListing?.sku || null;
      const dbItemSpecifics = itemSpecifics || (dbListing?.item_specifics as Record<string, string>) || undefined;

      if (!title) {
        return new Response(JSON.stringify({
          success: false,
          summary: `PART: N/A\nOLD CATEGORY ID: N/A\nNEW CATEGORY NAME: N/A\nNEW CATEGORY ID: N/A\nCATEGORY VERIFIED: NO\nPUBLISH: FAILED\nFULL ERROR: No part title provided and no listing_id to look up.`,
        }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // 1. Find a valid category using eBay's Taxonomy API
      const categoryResult = await findValidEbayCategory(title, dbItemSpecifics, token, baseUrl, oldCategoryId);
      console.log(`FIX-CATEGORY: Part "${title}" | Old: ${oldCategoryId} (valid: ${categoryResult.oldCategoryValid}) | New: ${categoryResult.categoryId} (${categoryResult.categoryName}) | Source: ${categoryResult.source}`);

      // 2. Save the new category to the DB listing
      if (dbListing) {
        await supabase.from("ebay_listings").update({
          category_id: categoryResult.categoryId,
          ebay_category_name: categoryResult.categoryName,
          updated_at: new Date().toISOString(),
        }).eq("id", dbListing.id);
      }

      // 3. If no offer exists yet, just report the category was found and saved
      if (!dbOfferId) {
        return new Response(JSON.stringify({
          success: true,
          summary: `PART: ${title}\nOLD CATEGORY ID: ${oldCategoryId || 'N/A'}\nNEW CATEGORY NAME: ${categoryResult.categoryName}\nNEW CATEGORY ID: ${categoryResult.categoryId}\nCATEGORY VERIFIED: N/A (no offer yet — category saved, will be used on next publish)\nPUBLISH: N/A`,
          category: categoryResult,
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // 4. GET the existing offer
      const getResp = await fetch(`${baseUrl}/sell/inventory/v1/offer/${dbOfferId}`, {
        headers: { "Authorization": `Bearer ${token}`, "Accept-Language": "en-US" },
      });
      const getRespText = await getResp.text();
      let existingOffer: any;
      try { existingOffer = JSON.parse(getRespText); } catch { existingOffer = { raw: getRespText }; }

      if (!getResp.ok) {
        return new Response(JSON.stringify({
          success: false,
          summary: `PART: ${title}\nOLD CATEGORY ID: ${oldCategoryId || 'N/A'}\nNEW CATEGORY NAME: ${categoryResult.categoryName}\nNEW CATEGORY ID: ${categoryResult.categoryId}\nCATEGORY VERIFIED: NO\nPUBLISH: FAILED\nFULL ERROR: Failed to read offer ${dbOfferId} (HTTP ${getResp.status}): ${JSON.stringify(existingOffer)}`,
        }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // 5. Update categoryId on the existing offer
      existingOffer.categoryId = categoryResult.categoryId;

      const updateResp = await fetch(`${baseUrl}/sell/inventory/v1/offer/${dbOfferId}`, {
        method: "PUT",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
          "Content-Language": "en-US",
          "Accept-Language": "en-US",
        },
        body: JSON.stringify(existingOffer),
      });
      const updateText = await updateResp.text();
      let updateJson: any;
      try { updateJson = JSON.parse(updateText); } catch { updateJson = { raw: updateText }; }

      if (!updateResp.ok) {
        return new Response(JSON.stringify({
          success: false,
          summary: `PART: ${title}\nOLD CATEGORY ID: ${oldCategoryId || 'N/A'}\nNEW CATEGORY NAME: ${categoryResult.categoryName}\nNEW CATEGORY ID: ${categoryResult.categoryId}\nCATEGORY VERIFIED: NO\nPUBLISH: FAILED\nFULL ERROR: Failed to update offer (HTTP ${updateResp.status}): ${JSON.stringify(updateJson)}`,
        }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // 6. GET the offer again to verify categoryId
      const verifyResp = await fetch(`${baseUrl}/sell/inventory/v1/offer/${dbOfferId}`, {
        headers: { "Authorization": `Bearer ${token}`, "Accept-Language": "en-US" },
      });
      let verifiedCategoryId: string | null = null;
      if (verifyResp.ok) {
        const verifiedOffer = await verifyResp.json() as Record<string, unknown>;
        verifiedCategoryId = (verifiedOffer.categoryId as string) || null;
      }
      const categoryVerified = verifiedCategoryId === categoryResult.categoryId;
      console.log(`FIX-CATEGORY: Verified offer categoryId=${verifiedCategoryId}, expected=${categoryResult.categoryId}, verified=${categoryVerified}`);

      // 7. Publish the offer
      const publishResp = await fetch(`${baseUrl}/sell/inventory/v1/offer/${dbOfferId}/publish`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
          "Content-Language": "en-US",
          "Accept-Language": "en-US",
        },
      });
      const publishText = await publishResp.text();
      let publishJson: any;
      try { publishJson = JSON.parse(publishText); } catch { publishJson = { raw: publishText }; }

      const summary = [
        `PART: ${title}`,
        `OLD CATEGORY ID: ${oldCategoryId || 'N/A'}`,
        `NEW CATEGORY NAME: ${categoryResult.categoryName}`,
        `NEW CATEGORY ID: ${categoryResult.categoryId}`,
        `CATEGORY VERIFIED: ${categoryVerified ? 'YES' : 'NO'}`,
        `PUBLISH: ${publishResp.ok ? 'SUCCESS' : `FAILED (HTTP ${publishResp.status})`}`,
        publishResp.ok ? "" : `FULL ERROR: ${JSON.stringify(publishJson, null, 2)}`,
      ].join("\n");

      if (publishResp.ok) {
        const ebayItemId = publishJson.listingId;
        await supabase.from("ebay_listings").update({
          ebay_item_id: ebayItemId,
          ebay_offer_id: dbOfferId,
          listing_status: "active",
          published_at: new Date().toISOString(),
        }).eq("ebay_offer_id", dbOfferId);
      }

      return new Response(JSON.stringify({
        success: publishResp.ok,
        summary,
        category: categoryResult,
        categoryVerified,
        publish_response: publishJson,
      }), {
        status: publishResp.ok ? 200 : 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Not found" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

