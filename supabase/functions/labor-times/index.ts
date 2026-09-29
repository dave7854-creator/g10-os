// Edge function: labor-times
// Proxies labor-time search requests to an external automotive labor-time API,
// OR generates an AI-based estimate when no licensed provider is connected.
//
// All provider credentials stay server-side — never exposed to the browser.
//
// Labor source modes:
//   1. Licensed provider connected → official book times from external API
//   2. No provider → AI-generated estimate (not labeled as "book time")
//      Includes confidence level and assumptions list.
//
// Both modes return the same standardized LaborResult shape, with optional
// estimate metadata fields. The frontend renders them differently.
//
// The integration layer is provider-agnostic and pluggable:
//   - To add a licensed provider, add a handler in PROVIDER_HANDLERS
//   - To swap the AI estimator, replace the generateAIEstimate function
//
// Request body:
//   { query: string, vehicle: { vin?, year, make, model, engine?, drivetrain? }, workOrderId?: string }
//
// Response (connected provider):
//   { connected: boolean, provider: string, results: LaborResult[], cached?: boolean, source: "book" }
// Response (no provider, AI estimate):
//   { connected: false, results: LaborResult[], source: "ai_estimate", confidence: string, assumptions: string[] }
// Response (error):
//   { connected: boolean, provider?: string, results: [], error: string, source: "book"|"ai_estimate" }

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface LaborResult {
  description: string;
  bookHours: number;
  confidence?: "high" | "medium" | "low";
  assumptions?: string[];
}

interface VehicleInfo {
  vin?: string;
  year: string;
  make: string;
  model: string;
  engine?: string;
  drivetrain?: string;
}

interface SearchRequest {
  query: string;
  vehicle: VehicleInfo;
  workOrderId?: string;
}

interface ProviderConfig {
  id: string;
  provider_name: string;
  api_base_url: string | null;
  api_key_encrypted: string | null;
  api_secret_encrypted: string | null;
  is_active: boolean;
  cache_allowed: boolean;
  config_json: Record<string, unknown> | null;
}

// ===== PROVIDER HANDLERS =====
type ProviderHandler = (
  query: string,
  vehicle: VehicleInfo,
  config: ProviderConfig,
) => Promise<LaborResult[]>;

const PROVIDER_HANDLERS: Record<string, ProviderHandler> = {
  async mitchell1(query, vehicle, config) {
    const baseUrl = config.api_base_url;
    const apiKey = config.api_key_encrypted;
    if (!baseUrl || !apiKey) return [];
    const vehicleStr = `${vehicle.year}:${vehicle.make}:${vehicle.model}:${vehicle.engine ?? ""}`;
    const url = `${baseUrl}/labor/search?vehicle=${encodeURIComponent(vehicleStr)}&query=${encodeURIComponent(query)}`;
    const resp = await fetch(url, { headers: { "Authorization": `Bearer ${apiKey}`, "Accept": "application/json" } });
    if (!resp.ok) throw new Error(`Labor API returned ${resp.status}`);
    const data = await resp.json();
    const operations: unknown[] = Array.isArray(data.operations) ? data.operations : [];
    return operations.map((op): LaborResult => {
      const o = op as Record<string, unknown>;
      return { description: String(o.description ?? o.operation ?? ""), bookHours: Number(o.hours ?? o.laborHours ?? o.bookTime ?? 0) };
    });
  },

  async alldata(query, vehicle, config) {
    const baseUrl = config.api_base_url;
    const apiKey = config.api_key_encrypted;
    const apiSecret = config.api_secret_encrypted;
    if (!baseUrl || !apiKey) return [];
    const url = `${baseUrl}/v1/labor-times`;
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "X-API-Secret": apiSecret ?? "", "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify({ vehicle: { year: vehicle.year, make: vehicle.make, model: vehicle.model, engine: vehicle.engine }, searchQuery: query }),
    });
    if (!resp.ok) throw new Error(`Alldata API returned ${resp.status}`);
    const data = await resp.json();
    const operations: unknown[] = Array.isArray(data.results) ? data.results : [];
    return operations.map((op): LaborResult => {
      const o = op as Record<string, unknown>;
      return { description: String(o.description ?? o.title ?? ""), bookHours: Number(o.laborHours ?? o.bookTime ?? 0) };
    });
  },

  async chilton(query, vehicle, config) {
    const baseUrl = config.api_base_url;
    const apiKey = config.api_key_encrypted;
    if (!baseUrl || !apiKey) return [];
    const url = `${baseUrl}/api/labor?q=${encodeURIComponent(query)}&vehicle=${encodeURIComponent(`${vehicle.year} ${vehicle.make} ${vehicle.model}`)}`;
    const resp = await fetch(url, { headers: { "X-API-Key": apiKey, "Accept": "application/json" } });
    if (!resp.ok) throw new Error(`Chilton API returned ${resp.status}`);
    const data = await resp.json();
    const operations: unknown[] = Array.isArray(data.items) ? data.items : [];
    return operations.map((op): LaborResult => {
      const o = op as Record<string, unknown>;
      return { description: String(o.text ?? o.description ?? ""), bookHours: Number(o.hours ?? 0) };
    });
  },

  async custom(query, vehicle, config) {
    const baseUrl = config.api_base_url;
    const apiKey = config.api_key_encrypted;
    if (!baseUrl || !apiKey) return [];
    const cfg = config.config_json ?? {};
    const method = String(cfg.method ?? "GET").toUpperCase();
    const pathTemplate = String(cfg.path ?? "/labor/search");
    const url = `${baseUrl}${pathTemplate}?query=${encodeURIComponent(query)}&year=${encodeURIComponent(vehicle.year)}&make=${encodeURIComponent(vehicle.make)}&model=${encodeURIComponent(vehicle.model)}&engine=${encodeURIComponent(vehicle.engine ?? "")}`;
    const resp = await fetch(url, { method, headers: { "Authorization": `Bearer ${apiKey}`, "Accept": "application/json" } });
    if (!resp.ok) throw new Error(`Custom labor API returned ${resp.status}`);
    const data = await resp.json();
    const operations: unknown[] = Array.isArray(data.results) ? data.results : Array.isArray(data.operations) ? data.operations : [];
    return operations.map((op): LaborResult => {
      const o = op as Record<string, unknown>;
      return { description: String(o.description ?? o.operation ?? o.title ?? ""), bookHours: Number(o.hours ?? o.laborHours ?? o.bookTime ?? 0) };
    });
  },
};

function getProviderHandler(name: string): ProviderHandler {
  const key = name.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (key.includes("mitchell")) return PROVIDER_HANDLERS.mitchell1;
  if (key.includes("alldata")) return PROVIDER_HANDLERS.alldata;
  if (key.includes("chilton")) return PROVIDER_HANDLERS.chilton;
  return PROVIDER_HANDLERS.custom;
}

function makeVehicleKey(vehicle: VehicleInfo): string {
  return [vehicle.year, vehicle.make, vehicle.model, vehicle.engine ?? ""]
    .map((s) => s.toLowerCase().trim())
    .join("|");
}

// ===== AI ESTIMATE GENERATOR =====
// Pluggable: replace this function to swap the AI estimation engine.
// Generates a best-effort labor estimate with confidence and assumptions.
// This is NOT labeled as "book time" — it is an AI-generated estimate.

interface EstimateEntry {
  description: string;
  bookHours: number;
  confidence: "high" | "medium" | "low";
  assumptions: string[];
}

// Curated baseline estimates for common automotive operations.
// These are approximate ranges synthesized from general industry knowledge,
// not from any licensed labor-time database.
const BASELINE_ESTIMATES: Record<string, { hours: [number, number]; confidence: "high" | "medium" | "low" }> = {
  "front brake": { hours: [0.8, 1.5], confidence: "high" },
  "rear brake": { hours: [0.8, 1.5], confidence: "high" },
  "brake pads": { hours: [0.8, 1.5], confidence: "high" },
  "brake rotor": { hours: [1.0, 2.0], confidence: "high" },
  "brake caliper": { hours: [1.0, 1.8], confidence: "high" },
  "alternator": { hours: [1.0, 2.5], confidence: "medium" },
  "starter": { hours: [1.0, 2.5], confidence: "medium" },
  "water pump": { hours: [1.5, 4.0], confidence: "medium" },
  "radiator": { hours: [1.5, 3.0], confidence: "medium" },
  "thermostat": { hours: [0.5, 1.5], confidence: "medium" },
  "wheel bearing": { hours: [1.0, 2.5], confidence: "medium" },
  "front wheel bearing": { hours: [1.0, 2.5], confidence: "medium" },
  "rear wheel bearing": { hours: [1.0, 2.5], confidence: "medium" },
  "ball joint": { hours: [1.0, 2.5], confidence: "medium" },
  "upper control arm": { hours: [0.8, 2.0], confidence: "medium" },
  "lower control arm": { hours: [1.0, 2.5], confidence: "medium" },
  "tie rod": { hours: [0.5, 1.5], confidence: "medium" },
  "outer tie rod": { hours: [0.5, 1.0], confidence: "medium" },
  "inner tie rod": { hours: [1.0, 2.0], confidence: "medium" },
  "strut": { hours: [1.5, 3.0], confidence: "medium" },
  "shock": { hours: [1.0, 2.0], confidence: "medium" },
  "shock absorber": { hours: [1.0, 2.0], confidence: "medium" },
  "coil spring": { hours: [1.0, 2.5], confidence: "medium" },
  "transmission": { hours: [4.0, 8.0], confidence: "low" },
  "transmission r&r": { hours: [4.0, 8.0], confidence: "low" },
  "transmission remove": { hours: [4.0, 8.0], confidence: "low" },
  "transmission replace": { hours: [5.0, 9.0], confidence: "low" },
  "engine r&r": { hours: [8.0, 16.0], confidence: "low" },
  "engine replace": { hours: [8.0, 16.0], confidence: "low" },
  "engine remove": { hours: [6.0, 12.0], confidence: "low" },
  "timing belt": { hours: [2.5, 5.0], confidence: "medium" },
  "timing chain": { hours: [4.0, 8.0], confidence: "low" },
  "spark plug": { hours: [0.5, 2.0], confidence: "medium" },
  "spark plugs": { hours: [0.5, 2.0], confidence: "medium" },
  "ignition coil": { hours: [0.3, 1.0], confidence: "medium" },
  "fuel pump": { hours: [1.5, 4.0], confidence: "low" },
  "fuel filter": { hours: [0.3, 1.0], confidence: "high" },
  "air filter": { hours: [0.1, 0.3], confidence: "high" },
  "cabin filter": { hours: [0.1, 0.3], confidence: "high" },
  "battery": { hours: [0.2, 0.5], confidence: "high" },
  "oil change": { hours: [0.3, 0.5], confidence: "high" },
  "oxygen sensor": { hours: [0.5, 1.5], confidence: "medium" },
  "o2 sensor": { hours: [0.5, 1.5], confidence: "medium" },
  "mass air flow": { hours: [0.3, 1.0], confidence: "medium" },
  "maf sensor": { hours: [0.3, 1.0], confidence: "medium" },
  "throttle body": { hours: [0.5, 1.5], confidence: "medium" },
  "cv axle": { hours: [0.8, 2.0], confidence: "medium" },
  "axle shaft": { hours: [0.8, 2.0], confidence: "medium" },
  "drive belt": { hours: [0.3, 1.0], confidence: "high" },
  "serpentine belt": { hours: [0.3, 1.0], confidence: "high" },
  "hose": { hours: [0.3, 1.0], confidence: "medium" },
  "coolant flush": { hours: [0.5, 1.0], confidence: "high" },
  "power steering pump": { hours: [1.0, 2.5], confidence: "medium" },
  "power steering rack": { hours: [2.0, 4.0], confidence: "low" },
  "steering rack": { hours: [2.0, 4.0], confidence: "low" },
  "exhaust": { hours: [1.0, 3.0], confidence: "low" },
  "muffler": { hours: [0.5, 1.5], confidence: "medium" },
  "catalytic converter": { hours: [1.0, 2.5], confidence: "medium" },
  "head gasket": { hours: [4.0, 10.0], confidence: "low" },
  "valve cover gasket": { hours: [0.5, 2.0], confidence: "medium" },
  "oil pan gasket": { hours: [1.0, 3.0], confidence: "medium" },
  "differential": { hours: [1.5, 4.0], confidence: "low" },
  "u-joint": { hours: [0.5, 1.5], confidence: "medium" },
  "transfer case": { hours: [2.0, 5.0], confidence: "low" },
};

function generateAIEstimate(query: string, vehicle: VehicleInfo): { results: EstimateEntry[]; confidence: "high" | "medium" | "low"; assumptions: string[] } {
  const q = query.toLowerCase().trim();
  const assumptions: string[] = [];

  // Vehicle-based assumptions
  const vehicleDesc = `${vehicle.year} ${vehicle.make} ${vehicle.model}`;
  assumptions.push(`Estimate based on general labor patterns for a ${vehicleDesc}`);
  if (vehicle.engine) assumptions.push(`Engine: ${vehicle.engine}`);
  if (vehicle.drivetrain) assumptions.push(`Drivetrain: ${vehicle.drivetrain}`);

  // Age-based complexity factor
  const year = parseInt(vehicle.year);
  if (!isNaN(year) && year > 0) {
    const age = new Date().getFullYear() - year;
    if (age > 15) {
      assumptions.push("Vehicle age >15 years may increase labor time due to seized/fastener corrosion");
    } else if (age < 5) {
      assumptions.push("Late-model vehicle; some operations may require diagnostic/calibration time");
    }
  }

  // Find matching baseline entries
  const results: EstimateEntry[] = [];
  const matched = new Set<string>();

  for (const [key, entry] of Object.entries(BASELINE_ESTIMATES)) {
    if (q.includes(key) || key.includes(q)) {
      if (matched.has(key)) continue;
      matched.add(key);
      const [minH, maxH] = entry.hours;
      const avgH = (minH + maxH) / 2;

      // Adjust for vehicle age
      let adjusted = avgH;
      const yr = parseInt(vehicle.year);
      if (!isNaN(yr) && new Date().getFullYear() - yr > 15) {
        adjusted *= 1.15;
      }

      // Adjust for AWD/4WD if drivetrain suggests it
      if (vehicle.drivetrain && /awd|4wd|four.?wheel/i.test(vehicle.drivetrain) && /wheel bearing|axle|strut|shock|control arm|ball joint|tie rod/i.test(key)) {
        adjusted *= 1.2;
        assumptions.push("AWD/4WD drivetrain adds complexity for suspension/axle work (+20%)");
      }

      const opAssumptions = [...assumptions];
      opAssumptions.push(`Baseline range: ${minH.toFixed(1)}–${maxH.toFixed(1)} hrs (industry average)`);
      if (entry.confidence === "low") {
        opAssumptions.push("Low confidence: significant variation expected based on specific vehicle configuration");
      } else if (entry.confidence === "medium") {
        opAssumptions.push("Medium confidence: actual time may vary by ±30%");
      }

      results.push({
        description: key.replace(/\b\w/g, (c) => c.toUpperCase()).replace(/ R&r/i, " R&R"),
        bookHours: Math.round(adjusted * 100) / 100,
        confidence: entry.confidence,
        assumptions: opAssumptions,
      });
    }
  }

  // If no direct match, generate a generic estimate
  if (results.length === 0) {
    assumptions.push("No exact match in baseline data; providing a general estimate");
    assumptions.push("Actual labor time may vary significantly — verify with a licensed provider for official book times");
    results.push({
      description: query.replace(/\b\w/g, (c) => c.toUpperCase()),
      bookHours: 2.0,
      confidence: "low",
      assumptions,
    });
  }

  // Overall confidence = lowest among results
  const confidence = results.some((r) => r.confidence === "low")
    ? "low"
    : results.some((r) => r.confidence === "medium")
      ? "medium"
      : "high";

  return { results, confidence, assumptions };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    // Read active provider config
    const configResp = await fetch(`${supabaseUrl}/rest/v1/shop_labor_provider_config?is_active=eq.true&select=*`, {
      headers: { "apikey": serviceRoleKey, "Authorization": `Bearer ${serviceRoleKey}`, "Accept": "application/json" },
    });

    const configs: ProviderConfig[] = configResp.ok ? await configResp.json() : [];
    const providerConfig = configs.length > 0 ? configs[0] : null;

    const body = await req.json() as SearchRequest;
    if (!body.query || !body.vehicle) {
      return new Response(
        JSON.stringify({ error: "Missing query or vehicle" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const vehicleKey = makeVehicleKey(body.vehicle);

    // === NO PROVIDER CONNECTED → AI ESTIMATE ===
    if (!providerConfig) {
      const estimate = generateAIEstimate(body.query, body.vehicle);

      // Log the search
      await fetch(`${supabaseUrl}/rest/v1/shop_labor_search_log`, {
        method: "POST",
        headers: { "apikey": serviceRoleKey, "Authorization": `Bearer ${serviceRoleKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          work_order_id: body.workOrderId ?? null,
          vin: body.vehicle.vin ?? null,
          vehicle_key: vehicleKey,
          search_query: body.query,
          results_count: estimate.results.length,
          provider_name: "AI Estimate",
        }),
      });

      return new Response(
        JSON.stringify({
          connected: false,
          results: estimate.results,
          source: "ai_estimate",
          confidence: estimate.confidence,
          assumptions: estimate.assumptions,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // === PROVIDER CONNECTED → BOOK TIMES ===
    // Check cache first
    if (providerConfig.cache_allowed) {
      const cacheResp = await fetch(
        `${supabaseUrl}/rest/v1/shop_labor_cache?vehicle_key=eq.${encodeURIComponent(vehicleKey)}&search_query=ilike.${encodeURIComponent(body.query)}&select=*`,
        { headers: { "apikey": serviceRoleKey, "Authorization": `Bearer ${serviceRoleKey}`, "Accept": "application/json" } },
      );
      if (cacheResp.ok) {
        const cached = await cacheResp.json() as Array<{ operation_description: string; book_hours: number; data_source: string }>;
        if (cached && cached.length > 0) {
          await fetch(`${supabaseUrl}/rest/v1/shop_labor_search_log`, {
            method: "POST",
            headers: { "apikey": serviceRoleKey, "Authorization": `Bearer ${serviceRoleKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({ work_order_id: body.workOrderId ?? null, vin: body.vehicle.vin ?? null, vehicle_key: vehicleKey, search_query: body.query, results_count: cached.length, provider_name: providerConfig.provider_name }),
          });
          return new Response(
            JSON.stringify({ connected: true, provider: providerConfig.provider_name, results: cached.map((c) => ({ description: c.operation_description, bookHours: Number(c.book_hours) })), cached: true, source: "book" }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
      }
    }

    // Call external provider
    const handler = getProviderHandler(providerConfig.provider_name);
    let results: LaborResult[] = [];
    try {
      results = await handler(body.query, body.vehicle, providerConfig);
    } catch (apiError) {
      const message = apiError instanceof Error ? apiError.message : "Provider API error";
      return new Response(
        JSON.stringify({ connected: true, provider: providerConfig.provider_name, results: [], error: message, source: "book" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Cache results
    if (providerConfig.cache_allowed && results.length > 0) {
      const cacheInserts = results.map((r) => ({ vehicle_key: vehicleKey, operation_description: r.description, book_hours: r.bookHours, data_source: providerConfig.provider_name, search_query: body.query }));
      await fetch(`${supabaseUrl}/rest/v1/shop_labor_cache`, {
        method: "POST",
        headers: { "apikey": serviceRoleKey, "Authorization": `Bearer ${serviceRoleKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(cacheInserts),
      });
    }

    // Log search
    await fetch(`${supabaseUrl}/rest/v1/shop_labor_search_log`, {
      method: "POST",
      headers: { "apikey": serviceRoleKey, "Authorization": `Bearer ${serviceRoleKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ work_order_id: body.workOrderId ?? null, vin: body.vehicle.vin ?? null, vehicle_key: vehicleKey, search_query: body.query, results_count: results.length, provider_name: providerConfig.provider_name }),
    });

    return new Response(
      JSON.stringify({ connected: true, provider: providerConfig.provider_name, results, cached: false, source: "book" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
