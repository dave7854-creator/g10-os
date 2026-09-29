const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface ConfigRequest {
  vin?: string;
  year: number;
  make: string;
  model: string;
  trim?: string;
  engine?: string;
  bodyStyle?: string;
}

interface ConfigResponse {
  exteriorColors: string[];
  interiorColors: string[];
  cabConfigs: string[];
  bedLengths: string[];
  trimLevels: string[];
  infotainmentSystems: string[];
  lightingOptions: string[];
  seatConfigs: string[];
  decodedExtras: Record<string, string>;
}

async function fetchWithTimeout(url: string, timeoutMs = 10000): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: controller.signal,
    });
    return await resp.text();
  } catch {
    return "";
  } finally {
    clearTimeout(timeout);
  }
}

async function decodeVinFull(vin: string): Promise<Record<string, string>> {
  const url = `https://vpic.nhtsa.dot.gov/api/vehicles/decodevin/${encodeURIComponent(vin)}?format=json`;
  const html = await fetchWithTimeout(url);
  if (!html) return {};
  try {
    const data = JSON.parse(html);
    const result: Record<string, string> = {};
    if (data.Results && Array.isArray(data.Results)) {
      for (const r of data.Results) {
        if (r.Variable && r.Value && r.Value !== "null" && r.Value !== "Not Applicable") {
          result[r.Variable] = String(r.Value);
        }
      }
    }
    return result;
  } catch {
    return {};
  }
}

function extractColors(html: string, section: string): string[] {
  const colors = new Set<string>();
  const lower = html.toLowerCase();
  const idx = lower.indexOf(section.toLowerCase());
  if (idx === -1) return [];
  const chunk = html.slice(idx, idx + 5000);
  const colorRegex = /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s*(?:\/|,|\||<br|<li|<td|<p|$)/g;
  let m: RegExpExecArray | null;
  while ((m = colorRegex.exec(chunk)) !== null && colors.size < 12) {
    const color = m[1].trim();
    if (color.length > 2 && color.length < 30 && !/^(the|this|that|with|from|color|paint|interior|seat|trim|option|package|includes?|available|standard)$/i.test(color)) {
      colors.add(color);
    }
  }
  return Array.from(colors);
}

async function searchVehicleConfig(req: ConfigRequest): Promise<ConfigResponse> {
  const vehicleStr = `${req.year} ${req.make} ${req.model}`.trim();
  const decodedExtras: Record<string, string> = {};

  // If VIN provided, get full decode
  if (req.vin && req.vin.length >= 17) {
    const fullDecode = await decodeVinFull(req.vin);
    const interestingFields = [
      "Trim", "Trim2", "Series", "Vehicle Type", "Body Class", "Cab Type",
      "Bed Length", "Bed Type", "Drive Type", "Plant State", "Plant Country",
      "Engine Model", "Engine Configuration", "Valve Train Design",
      "Engine Brake (hp)", "Displacement (L)", "Displacement (cc)",
      "Turbo", "Fuel Type - Primary", "Fuel Type - Secondary",
      "Transmission Style", "Transmission Speeds",
    ];
    for (const f of interestingFields) {
      if (fullDecode[f]) decodedExtras[f] = fullDecode[f];
    }
  }

  // Search for factory color/options info
  const searchQuery = encodeURIComponent(`${vehicleStr} factory color options trim`);
  const searchUrl = `https://www.cars.com/research/${req.make}-${req.model}-${req.year()}/`;

  // Try to fetch general info — use multiple sources
  const [carsComHtml, edmundsHtml] = await Promise.allSettled([
    fetchWithTimeout(`https://www.edmunds.com/${req.make.toLowerCase()}/${req.model.toLowerCase().replace(/\s+/g, "-")}/${req.year}/review/`),
    fetchWithTimeout(`https://www.kbb.com/${req.make.toLowerCase()}/${req.model.toLowerCase().replace(/\s+/g, "-")}/${req.year}/`),
  ]);

  let exteriorColors: string[] = [];
  let interiorColors: string[] = [];

  if (carsComHtml.status === "fulfilled" && carsComHtml.value) {
    exteriorColors.push(...extractColors(carsComHtml.value, "exterior color"));
    interiorColors.push(...extractColors(carsComHtml.value, "interior color"));
  }
  if (edmundsHtml.status === "fulfilled" && edmundsHtml.value) {
    exteriorColors.push(...extractColors(edmundsHtml.value, "exterior"));
    interiorColors.push(...extractColors(edmundsHtml.value, "interior"));
  }

  // Deduplicate
  exteriorColors = [...new Set(exteriorColors)].slice(0, 12);
  interiorColors = [...new Set(interiorColors)].slice(0, 12);

  // Common cab configs for trucks
  const cabConfigs: string[] = [];
  if (req.bodyStyle && /truck|pickup/i.test(req.bodyStyle)) {
    cabConfigs.push("Regular Cab", "Extended Cab", "Crew Cab", "CrewMax", "Double Cab", "Quad Cab", "SuperCab", "SuperCrew");
  }

  // Common bed lengths for trucks
  const bedLengths: string[] = [];
  if (req.bodyStyle && /truck|pickup/i.test(req.bodyStyle)) {
    bedLengths.push("Short Bed (5.5-6 ft)", "Standard Bed (6.5 ft)", "Long Bed (8 ft)");
  }

  // Trim levels — common patterns
  const trimLevels: string[] = [];
  const commonTrims: Record<string, string[]> = {
    ford: ["XL", "XLT", "Lariat", "King Ranch", "Platinum", "Limited"],
    chevrolet: ["LS", "LT", "LTZ", "Premier", "High Country", "TrailBoss", "Z71"],
    gmc: ["SL", "SLE", "SLT", "Denali", "AT4"],
    ram: ["Tradesman", "Big Horn", "Lone Star", "Sport", "Laramie", "Limited", "Rebel"],
    toyota: ["SR", "SR5", "TRD Sport", "TRD Off-Road", "Limited", "Platinum", "1794"],
    honda: ["LX", "EX", "EX-L", "Touring", "Elite"],
    nissan: ["S", "SV", "SL", "PRO-4X", "Platinum"],
    bmw: ["325i", "328i", "330i", "335i", "M3", "xDrive", "330e"],
    mercedes: ["C300", "C43", "C63", "S450", "S500", "AMG"],
    audi: ["Premium", "Premium Plus", "Prestige", "S-Line", "RS"],
  };
  const makeLower = req.make.toLowerCase();
  if (commonTrims[makeLower]) {
    trimLevels.push(...commonTrims[makeLower]);
  }

  // Infotainment options
  const infotainmentSystems: string[] = [];
  if (req.year >= 2014) {
    infotainmentSystems.push("Base Radio (No Navigation)", "Infotainment with Navigation", "Premium Audio System");
  }
  if (req.make.toLowerCase() === "gmc" || req.make.toLowerCase() === "chevrolet") {
    infotainmentSystems.length = 0;
    infotainmentSystems.push("IO5 (8-inch No Nav)", "IO6 (8-inch with Nav)", "IOT (7-inch No Nav)", "IOR (7-inch with Nav)");
  }

  // Lighting options
  const lightingOptions: string[] = [];
  lightingOptions.push("Halogen Headlights", "LED Headlights", "HID/Xenon Headlights");
  if (req.make.toLowerCase() === "ford" && req.year >= 2015) {
    lightingOptions.push("Ford LED Signature Lighting");
  }

  // Seat configs
  const seatConfigs: string[] = [];
  if (req.bodyStyle && /truck|pickup/i.test(req.bodyStyle)) {
    seatConfigs.push("Bench Seat", "40/20/40 Split Bench", "Bucket Seats with Console");
  } else {
    seatConfigs.push("Cloth Seats", "Leather Seats", "Heated Seats", "Ventilated Seats");
  }

  return {
    exteriorColors,
    interiorColors,
    cabConfigs,
    bedLengths,
    trimLevels,
    infotainmentSystems,
    lightingOptions,
    seatConfigs,
    decodedExtras,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const body = (await req.json()) as ConfigRequest;
    if (!body.year || !body.make || !body.model) {
      return new Response(
        JSON.stringify({ error: "Year, make, and model are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const config = await searchVehicleConfig(body);

    return new Response(
      JSON.stringify(config),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
