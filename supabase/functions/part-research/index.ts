const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface PartResearchRequest {
  vehicle: {
    year: number;
    make: string;
    model: string;
    trim?: string;
    engine?: string;
    transmission?: string;
    driveType?: string;
    bodyStyle?: string;
    cabConfig?: string;
    interiorColor?: string;
    exteriorColor?: string;
    infotainmentSystem?: string;
    lightingOptions?: string;
    seatConfig?: string;
    rpoCodes?: string;
    factoryOptions?: string;
    vin?: string;
  };
  partName: string;
  partCategory: string;
  side?: string;
}

interface OemNumberSource {
  partNumber: string;
  sourceName: string;
  sourceUrl: string;
  context: string;
  dateChecked: string;
  numberType: "oem" | "original" | "superseded" | "interchange" | "aftermarket" | "unknown";
}

interface OemCandidate {
  partNumber: string;
  context: string;
  numberType: "oem" | "original" | "superseded" | "interchange" | "aftermarket" | "unknown";
}

interface OemCandidateDetail {
  partNumber: string;
  manufacturerDescription?: string;
  fitmentInfo?: string;
  sourceName: string;
  sourceUrl: string;
  numberType: "oem" | "original" | "superseded" | "interchange" | "aftermarket" | "unknown";
}

interface OemSearchDebugEntry {
  sourceName: string;
  sourceUrl: string;
  resultSnippet: string;
  candidateNumbers: OemCandidate[];
  accepted: boolean;
  reason: string;
}

interface OemDebugSummary {
  vehicleDataUsed: string;
  oldOemNumber: string;
  oldNumberVerified: string;
  oldNumberExcluded: string;
  primaryOemSource: string;
  vehicleSelectionMethod: string;
  partSearch: string;
  oemResults: string;
  webFallbackUsed: string;
  webSearchProvider: string;
  organicResults: string;
  candidateOemNumbers: string[];
  sourceUrl: string;
  confirmationStatus: string;
}

type PartNumberState = "none" | "suggested" | "confirmed";

interface PartResearchResult {
  oemPartNumber: string;
  originalPartNumber?: string;
  supersededPartNumber?: string;
  interchangeNumbers: string[];
  partName: string;
  side: string;
  confidence: "high" | "medium" | "low";
  verified: boolean;
  needsManualReview: boolean;
  partNumberState: PartNumberState;
  manufacturerDescription?: string;
  fitmentInfo?: string;
  questionPrompt?: string;
  questionOptions?: string[];
  notes: string;
  sources: OemNumberSource[];
  allCandidates: OemCandidateDetail[];
  debug: OemSearchDebugEntry[];
  debugSummary?: OemDebugSummary;
}

async function fetchWithTimeout(url: string, timeoutMs = 15000): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
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

function determineSide(partName: string, side?: string): string {
  if (side) return side;
  const lower = partName.toLowerCase();
  if (lower.includes("left") || lower.includes("driver")) return "Left/Driver";
  if (lower.includes("right") || lower.includes("passenger")) return "Right/Passenger";
  if (lower.includes("front")) return "Front";
  if (lower.includes("rear")) return "Rear";
  return "";
}

function simplifyPartName(partName: string): string {
  const lower = partName.toLowerCase();
  const mappings: { match: RegExp; simple: string }[] = [
    { match: /tail\s*lamp|tail\s*light|taillight/i, simple: "Tail Lamp" },
    { match: /head\s*lamp|head\s*light|headlight/i, simple: "Headlamp" },
    { match: /instrument\s*cluster|gauge\s*cluster|dash\s*cluster/i, simple: "Instrument Cluster" },
    { match: /radio|stereo|head\s*unit/i, simple: "Radio" },
    { match: /grille/i, simple: "Grille" },
    { match: /pcm|ecm|engine\s*computer|engine\s*control\s*module/i, simple: "PCM" },
    { match: /shifter/i, simple: "Shifter" },
    { match: /door\s*panel/i, simple: "Door Panel" },
    { match: /glove\s*box/i, simple: "Glove Box" },
    { match: /mirror/i, simple: "Mirror" },
    { match: /seat/i, simple: "Seat" },
    { match: /bumper/i, simple: "Bumper" },
    { match: /fender/i, simple: "Fender" },
    { match: /hood/i, simple: "Hood" },
    { match: /alternator/i, simple: "Alternator" },
    { match: /starter/i, simple: "Starter" },
    { match: /compressor|a\/c\s*compressor/i, simple: "A/C Compressor" },
    { match: /radiator/i, simple: "Radiator" },
    { match: /condenser/i, simple: "Condenser" },
    { match: /wheel/i, simple: "Wheel" },
  ];
  for (const m of mappings) {
    if (m.match.test(partName)) return m.simple;
  }
  return partName;
}

function vehicleShort(v: PartResearchRequest["vehicle"]): string {
  return `${v.year} ${v.make} ${v.model}`.trim();
}

function needsConfigQuestion(
  partName: string,
  vehicle: PartResearchRequest["vehicle"],
): { prompt: string; options: string[] } | null {
  const lower = partName.toLowerCase();

  if (lower.includes("headlight") || lower.includes("head lamp") || lower.includes("headlamp")) {
    if (!vehicle.lightingOptions) {
      return {
        prompt: "What type of headlights does this vehicle have?",
        options: ["Halogen", "HID/Xenon", "LED", "Quad", "Dual", "Unknown"],
      };
    }
  }

  if (lower.includes("infotainment") || lower.includes("navigation") || lower.includes("radio") || lower.includes("hmi") || lower.includes("instrument cluster") || lower.includes("gauge cluster")) {
    if (!vehicle.infotainmentSystem) {
      return {
        prompt: "Does this vehicle have the information center / EVIC display or the basic cluster?",
        options: ["EVIC / Information Center", "Basic Cluster (No Info Center)", "Unknown"],
      };
    }
  }

  if (lower.includes("seat")) {
    if (!vehicle.seatConfig) {
      return {
        prompt: "What seat options does this vehicle have?",
        options: ["Manual / Non-Heated", "Power / Non-Heated", "Power / Heated", "Power / Heated / Ventilated", "Unknown"],
      };
    }
  }

  if (lower.includes("glove box") || lower.includes("dash") || lower.includes("door panel") || lower.includes("console")) {
    if (!vehicle.interiorColor) {
      return {
        prompt: "What is the interior color/trim?",
        options: ["Black", "Gray", "Beige/Tan", "Brown", "Unknown"],
      };
    }
  }

  if (lower.includes("mirror")) {
    return {
      prompt: "What mirror options does this vehicle have?",
      options: ["Manual", "Power", "Power + Heated", "Power + Heated + Signal", "Power + Heated + Signal + Memory", "Unknown"],
    };
  }

  if (lower.includes("ecm") || lower.includes("hmi") || lower.includes("computer") || lower.includes("module") || lower.includes("pcm")) {
    if (vehicle.make.toLowerCase() === "gmc" || vehicle.make.toLowerCase() === "chevrolet") {
      if (!vehicle.rpoCodes) {
        return {
          prompt: "Does the RPO code label indicate IO5 or IO6 for the infotainment system?",
          options: ["IO5 (8-inch, No Nav)", "IO6 (8-inch, Nav)", "Unknown / Not Listed"],
        };
      }
    }
  }

  return null;
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#\d+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Check whether a fetched page is a Google support/help/feedback page (not a real result)
function isGoogleInternalPage(url: string, text: string): boolean {
  const lowerUrl = url.toLowerCase();
  if (lowerUrl.includes("support.google.com") || lowerUrl.includes("google.com/help") || lowerUrl.includes("google.com/feedback") || lowerUrl.includes("google.com/settings") || lowerUrl.includes("google.com/account")) {
    return true;
  }
  const lowerText = text.toLowerCase();
  if (lowerText.includes("google help center") && lowerText.includes("google support")) return true;
  return false;
}

// Extract part-number candidates from a text snippet
function extractCandidatesFromSnippet(snippet: string): OemCandidate[] {
  const candidates: OemCandidate[] = [];
  const lower = snippet.toLowerCase();

  const labelPatterns = [
    "part number", "part no", "part #", "part no.", "oem number", "oem no",
    "oem #", "oem part number", "oem part no", "p/n", "p/n:", "oem ref",
    "genuine part number", "factory part number", "mopar #", "mopar part",
    "part #:", "item number", "item no", "genuine oem", "oem:",
    "part number:", "mopar #:", "part no:",
    "the part number", "number is", "part number for",
    "uses part", "oem part number for",
  ];
  const hasLabel = labelPatterns.some((lp) => lower.includes(lp));
  if (!hasLabel) return [];

  const partNumberRegexes: RegExp[] = [
    /\b(\d{8}[A-Z]{1,2})\b/g,
    /\b(\d{8})\b/g,
    /\b([A-Z]\d[A-Z]{2}[-]?\d{4,6}[-]?[A-Z])\b/g,
    /\b(\d{2}-\d{2}-\d-\d{3}-\d{3})\b/g,
    /\b(\d{5,6}-[A-Z]{1,3}\d{0,3})\b/g,
    /\b(\d{7,10}[A-Z]{0,2})\b/g,
  ];

  const found = new Set<string>();
  for (const regex of partNumberRegexes) {
    let m: RegExpExecArray | null;
    while ((m = regex.exec(snippet)) !== null) {
      const num = m[1].toUpperCase().replace(/\s+/g, "");
      if (found.has(num)) continue;
      if (isFalsePositive(num)) continue;

      const start = Math.max(0, m.index - 80);
      const end = Math.min(snippet.length, m.index + num.length + 80);
      const context = snippet.slice(start, end).trim();
      const numberType = classifyNumber(context);

      found.add(num);
      candidates.push({ partNumber: num, context, numberType });
    }
  }

  return candidates;
}

function extractDescription(snippet: string, partNumber: string): string {
  const idx = snippet.toUpperCase().indexOf(partNumber);
  if (idx < 0) return "";
  const start = Math.max(0, idx - 120);
  const end = Math.min(snippet.length, idx + partNumber.length + 120);
  return snippet.slice(start, end).trim();
}

function extractFitment(snippet: string): string {
  const fitmentPatterns = [
    /fits\s+(.+?)(?:\.|;|$)/i,
    /for\s+(\d{4}[-\s]\w+.+?)(?:\.|;|$)/i,
    /application[s]?:\s*(.+?)(?:\.|;|$)/i,
    /(?:year|model|trim):\s*(.+?)(?:\.|;|$)/i,
  ];
  for (const p of fitmentPatterns) {
    const m = snippet.match(p);
    if (m && m[1]) return m[1].trim().slice(0, 200);
  }
  return "";
}

function isFalsePositive(num: string): boolean {
  if (/^(19|20)\d{2}$/.test(num)) return true;
  if (/^\d{1,5}$/.test(num)) return true;
  if (/^\d{10,}$/.test(num)) return true;
  if (/^(\d)\1{5,}$/.test(num)) return true;
  const digits = num.replace(/[^0-9]/g, "");
  if (digits.length < 6) return true;
  const unique = new Set(digits.split(""));
  if (unique.size < 2) return true;
  return false;
}

function classifyNumber(context: string): OemCandidate["numberType"] {
  const lower = context.toLowerCase();
  if (lower.includes("supersede") || lower.includes("superced") || lower.includes("replaced by") || lower.includes("replaces")) return "superseded";
  if (lower.includes("original")) return "original";
  if (lower.includes("interchange") || lower.includes("cross-reference") || lower.includes("cross reference") || lower.includes("alternate")) return "interchange";
  if (lower.includes("aftermarket") || lower.includes("reproduction") || lower.includes("replacement brand") || lower.includes("non-oem")) return "aftermarket";
  return "oem";
}

function isEbayUrl(url: string): boolean {
  return /ebay\.com|ebay\.ca|ebay\.co\.uk/i.test(url);
}

function isOemCatalogSource(sourceName: string): boolean {
  return /oem|mopar|gm parts|ford parts|toyota parts|honda parts|nissan parts|dealer|catalog|mymoparparts|partsouq|oempartsonline|moparpartsgiant|fordpartsgiant|hondapartsnow|toyotapartsdeal|bmwpartsdeal|parts\.ford|parts\.nissan|gmpartsdirect/i.test(sourceName);
}

function describeVehicleData(v: PartResearchRequest["vehicle"]): string {
  const parts: string[] = [`${v.year} ${v.make} ${v.model}`];
  if (v.vin) parts.push(`VIN: ${v.vin}`);
  if (v.trim && v.trim !== "N/A" && v.trim !== "Base") parts.push(`Trim: ${v.trim}`);
  if (v.engine && v.engine !== "N/A") parts.push(`Engine: ${v.engine}`);
  if (v.transmission && v.transmission !== "N/A") parts.push(`Trans: ${v.transmission}`);
  if (v.driveType && v.driveType !== "N/A") parts.push(`Drive: ${v.driveType}`);
  if (v.bodyStyle && v.bodyStyle !== "N/A") parts.push(`Body: ${v.bodyStyle}`);
  if (v.cabConfig && v.cabConfig !== "N/A") parts.push(`Cab: ${v.cabConfig}`);
  if (v.interiorColor && v.interiorColor !== "N/A") parts.push(`Interior: ${v.interiorColor}`);
  if (v.exteriorColor && v.exteriorColor !== "N/A") parts.push(`Exterior: ${v.exteriorColor}`);
  if (v.infotainmentSystem && v.infotainmentSystem !== "N/A") parts.push(`Info: ${v.infotainmentSystem}`);
  if (v.lightingOptions && v.lightingOptions !== "N/A") parts.push(`Lights: ${v.lightingOptions}`);
  if (v.seatConfig && v.seatConfig !== "N/A") parts.push(`Seats: ${v.seatConfig}`);
  if (v.rpoCodes && v.rpoCodes !== "N/A") parts.push(`RPO: ${v.rpoCodes}`);
  if (v.factoryOptions && v.factoryOptions !== "N/A") parts.push(`Options: ${v.factoryOptions}`);
  return parts.join(" | ");
}

// Get OEM catalog URLs for the manufacturer.
// These are the actual catalog search URLs that accept a simple part name query.
function getOemCatalogUrls(v: PartResearchRequest["vehicle"], simplePartName: string, side: string): { name: string; url: string }[] {
  const make = v.make.toLowerCase();
  const vehStr = vehicleShort(v);
  const partWithSide = side ? `${side.toLowerCase()} ${simplePartName.toLowerCase()}` : simplePartName.toLowerCase();
  const catalogs: { name: string; url: string }[] = [];

  if (make === "dodge" || make === "ram" || make === "chrysler" || make === "jeep") {
    catalogs.push({ name: "MoparPartsGiant", url: `https://www.moparpartsgiant.com/search?q=${encodeURIComponent(`${vehStr} ${partWithSide}`)}` });
    catalogs.push({ name: "MyMoparParts", url: `https://www.mymoparparts.com/search?q=${encodeURIComponent(`${vehStr} ${partWithSide}`)}` });
    catalogs.push({ name: "MoparPartsAmerica", url: `https://www.moparpartsamerica.com/search?q=${encodeURIComponent(`${vehStr} ${partWithSide}`)}` });
  } else if (make === "gmc" || make === "chevrolet" || make === "cadillac" || make === "buick") {
    catalogs.push({ name: "GMPartsDirect", url: `https://www.gmpartsdirect.com/search?q=${encodeURIComponent(`${vehStr} ${partWithSide}`)}` });
    catalogs.push({ name: "GMPartsGiant", url: `https://www.gmpartsgiant.com/search?q=${encodeURIComponent(`${vehStr} ${partWithSide}`)}` });
  } else if (make === "ford" || make === "lincoln") {
    catalogs.push({ name: "FordPartsGiant", url: `https://www.fordpartsgiant.com/search?q=${encodeURIComponent(`${vehStr} ${partWithSide}`)}` });
    catalogs.push({ name: "TousleyFordParts", url: `https://www.tousleyfordparts.com/search?q=${encodeURIComponent(`${vehStr} ${partWithSide}`)}` });
  } else if (make === "toyota" || make === "lexus") {
    catalogs.push({ name: "ToyotaPartsDeal", url: `https://www.toyotapartsdeal.com/search?q=${encodeURIComponent(`${vehStr} ${partWithSide}`)}` });
  } else if (make === "honda" || make === "acura") {
    catalogs.push({ name: "HondaPartsNow", url: `https://www.hondapartsnow.com/search?q=${encodeURIComponent(`${vehStr} ${partWithSide}`)}` });
  } else if (make === "bmw") {
    catalogs.push({ name: "BMWPartsDeal", url: `https://www.bmwpartsdeal.com/search?q=${encodeURIComponent(`${vehStr} ${partWithSide}`)}` });
  }

  return catalogs;
}

interface CatalogFetchResult {
  sourceName: string;
  sourceUrl: string;
  snippet: string;
  candidates: OemCandidate[];
  success: boolean;
}

// Open an OEM catalog page and extract part-number candidates
async function fetchCatalogPage(name: string, url: string, simplePartName: string): Promise<CatalogFetchResult | null> {
  const html = await fetchWithTimeout(url);
  if (!html || html.length < 500) return null;
  if (isGoogleInternalPage(url, html)) return null;

  const text = stripHtml(html);
  if (text.length < 100) return null;

  // Find the part name in the text and extract surrounding context
  const partIdx = text.toLowerCase().indexOf(simplePartName.toLowerCase());
  const snippet = partIdx >= 0
    ? text.slice(Math.max(0, partIdx - 300), Math.min(text.length, partIdx + 1000))
    : text.slice(0, 1500);

  const candidates = extractCandidatesFromSnippet(snippet);

  return {
    sourceName: name,
    sourceUrl: url,
    snippet,
    candidates,
    success: candidates.length > 0,
  };
}

// Check if a web search provider API key is configured
function getWebSearchProvider(): { name: string; configured: boolean } {
  // Check for common web search API keys in Deno env
  const tavilyKey = Deno.env.get("TAVILY_API_KEY");
  if (tavilyKey) return { name: "Tavily", configured: true };

  const serpApiKey = Deno.env.get("SERPAPI_API_KEY");
  if (serpApiKey) return { name: "SerpApi", configured: true };

  const searchApiKey = Deno.env.get("SEARCH_API_KEY");
  if (searchApiKey) return { name: "SearchAPI", configured: true };

  return { name: "none", configured: false };
}

// Call a web search provider API if configured. Returns organic results.
async function webSearchFallback(query: string): Promise<{ title: string; url: string; snippet: string; domain: string }[] | null> {
  const provider = getWebSearchProvider();
  if (!provider.configured && provider.name === "none") return null;

  const tavilyKey = Deno.env.get("TAVILY_API_KEY");
  if (tavilyKey) {
    try {
      const resp = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: tavilyKey,
          query,
          max_results: 10,
          include_answer: false,
        }),
      });
      if (!resp.ok) return null;
      const data = await resp.json();
      if (!data.results || !Array.isArray(data.results)) return null;
      return data.results.map((r: { title: string; url: string; content: string }) => ({
        title: r.title || "",
        url: r.url || "",
        snippet: r.content || "",
        domain: (() => { try { return new URL(r.url).hostname.replace("www.", ""); } catch { return ""; } })(),
      }));
    } catch {
      return null;
    }
  }

  // Add other providers here if keys are configured
  return null;
}

async function searchOemPartNumber(req: PartResearchRequest): Promise<PartResearchResult> {
  const v = req.vehicle;
  const side = determineSide(req.partName, req.side);
  const partWithSide = side ? `${side} ${req.partName}` : req.partName;
  const simplePartName = simplifyPartName(req.partName);
  const now = new Date().toISOString();

  const question = needsConfigQuestion(req.partName, v);

  // Step 1: Try OEM catalog pages directly
  const catalogUrls = getOemCatalogUrls(v, simplePartName, side);
  const debugEntries: OemSearchDebugEntry[] = [];
  const allSources: OemNumberSource[] = [];
  const catalogSourcesOpened: string[] = [];
  let primaryOemSource = "";

  for (const cat of catalogUrls.slice(0, 4)) {
    const result = await fetchCatalogPage(cat.name, cat.url, simplePartName);
    if (!result) {
      debugEntries.push({
        sourceName: cat.name,
        sourceUrl: cat.url,
        resultSnippet: "",
        candidateNumbers: [],
        accepted: false,
        reason: "Catalog page returned no content",
      });
      continue;
    }

    catalogSourcesOpened.push(cat.name);
    if (!primaryOemSource) primaryOemSource = cat.name;

    const oemCandidates = result.candidates.filter((c) => c.numberType !== "aftermarket");

    debugEntries.push({
      sourceName: result.sourceName,
      sourceUrl: result.sourceUrl,
      resultSnippet: result.snippet.slice(0, 300),
      candidateNumbers: result.candidates,
      accepted: oemCandidates.length > 0,
      reason: oemCandidates.length > 0
        ? `Found ${oemCandidates.length} OEM candidate(s)`
        : "No labeled part numbers found on catalog page",
    });

    for (const cand of oemCandidates) {
      allSources.push({
        partNumber: cand.partNumber,
        sourceName: result.sourceName,
        sourceUrl: result.sourceUrl,
        context: cand.context.slice(0, 250),
        dateChecked: now,
        numberType: cand.numberType,
      });
    }
  }

  // Step 2: If OEM catalogs didn't produce enough candidates, try web search fallback
  let webFallbackUsed = "NO";
  let webSearchProviderName = "none";
  let organicResultsCount = 0;

  if (allSources.length < 2) {
    const provider = getWebSearchProvider();
    webSearchProviderName = provider.name;

    if (provider.configed && provider.name !== "none") {
      webFallbackUsed = "YES";
      const query = `${vehicleShort(v)} ${side ? side.toLowerCase() : ""} ${simplePartName.toLowerCase()} OEM part number`.trim();
      const webResults = await webSearchFallback(query);

      if (webResults && webResults.length > 0) {
        organicResultsCount = webResults.length;

        for (const wr of webResults) {
          if (isEbayUrl(wr.url)) continue;
          if (isGoogleInternalPage(wr.url, wr.snippet)) continue;

          const fullSnippet = `${wr.title} — ${wr.snippet}`;
          const candidates = extractCandidatesFromSnippet(fullSnippet);
          const oemCandidates = candidates.filter((c) => c.numberType !== "aftermarket");

          debugEntries.push({
            sourceName: wr.domain || "Web Result",
            sourceUrl: wr.url,
            resultSnippet: fullSnippet.slice(0, 300),
            candidateNumbers: candidates,
            accepted: oemCandidates.length > 0,
            reason: oemCandidates.length > 0
              ? `Found ${oemCandidates.length} OEM candidate(s) from web search`
              : "No labeled part numbers found in web result",
          });

          for (const cand of oemCandidates) {
            allSources.push({
              partNumber: cand.partNumber,
              sourceName: wr.domain || "Web Result",
              sourceUrl: wr.url,
              context: cand.context.slice(0, 250),
              dateChecked: now,
              numberType: cand.numberType,
            });
          }
        }
      }
    } else {
      // No web search provider configured — record this fact
      webSearchProviderName = "NOT CONFIGURED";
      debugEntries.push({
        sourceName: "Web Search Fallback",
        sourceUrl: "",
        resultSnippet: "",
        candidateNumbers: [],
        accepted: false,
        reason: "WEB SEARCH PROVIDER NOT CONFIGURED — cannot perform web search fallback",
      });
    }
  }

  // Aggregate by part number
  const numAggregation = new Map<string, { count: number; sources: OemNumberSource[]; hasOemCatalog: boolean; hasEbay: boolean }>();
  for (const src of allSources) {
    const isEbay = isEbayUrl(src.sourceUrl) || src.sourceName === "eBay Listing";
    const isCatalog = isOemCatalogSource(src.sourceName);
    const existing = numAggregation.get(src.partNumber);
    if (existing) {
      existing.count++;
      existing.sources.push(src);
      if (isCatalog) existing.hasOemCatalog = true;
      if (isEbay) existing.hasEbay = true;
    } else {
      numAggregation.set(src.partNumber, { count: 1, sources: [src], hasOemCatalog: isCatalog, hasEbay: isEbay });
    }
  }

  const sortedNumbers = Array.from(numAggregation.entries()).sort((a, b) => {
    if (a[1].hasOemCatalog && !b[1].hasOemCatalog) return -1;
    if (!a[1].hasOemCatalog && b[1].hasOemCatalog) return 1;
    return b[1].count - a[1].count;
  });

  const allCandidateNumbers = Array.from(numAggregation.keys());

  const allCandidates: OemCandidateDetail[] = Array.from(numAggregation.entries()).map(([num, data]) => ({
    partNumber: num,
    manufacturerDescription: extractDescription(data.sources[0].context, num),
    fitmentInfo: extractFitment(data.sources[0].context),
    sourceName: data.sources[0].sourceName,
    sourceUrl: data.sources[0].sourceUrl,
    numberType: data.sources[0].numberType,
  }));

  let oemPartNumber = "";
  let verified = false;
  let confidence: "high" | "medium" | "low" = "low";
  let needsManualReview = false;
  let originalPartNumber: string | undefined;
  let supersededPartNumber: string | undefined;
  let interchangeNumbers: string[] = [];
  let notes = "";
  let questionPrompt = question?.prompt;
  let questionOptions = question?.options;
  let partNumberState: PartNumberState = "none";
  let manufacturerDescription = "";
  let fitmentInfo = "";
  let sourceUrl = "";

  if (sortedNumbers.length === 0) {
    needsManualReview = true;
    const webFailMsg = webSearchProviderName === "NOT CONFIGURED"
      ? " WEB SEARCH PROVIDER NOT CONFIGURED — web fallback was unavailable."
      : "";
    notes = `OEM Part Number Not Verified — No source-backed candidates found from OEM catalog pages.${webFailMsg} Please verify manually using the manufacturer's parts catalog or enter the number from the physical part.`;
    if (question) {
      notes += ` Additionally, a configuration question must be answered: ${question.prompt}`;
    }

    return {
      oemPartNumber: "",
      interchangeNumbers: [],
      partName: partWithSide,
      side,
      confidence: "low",
      verified: false,
      needsManualReview: true,
      partNumberState: "none",
      notes,
      sources: [],
      allCandidates: [],
      debug: debugEntries,
      debugSummary: {
        vehicleDataUsed: describeVehicleData(v),
        oldOemNumber: "",
        oldNumberVerified: "NO",
        oldNumberExcluded: "YES",
        primaryOemSource: primaryOemSource || "none",
        vehicleSelectionMethod: v.vin ? "VIN" : "YMM",
        partSearch: simplePartName,
        oemResults: "0 candidates found",
        webFallbackUsed,
        webSearchProvider: webSearchProviderName,
        organicResults: `${organicResultsCount}`,
        candidateOemNumbers: [],
        sourceUrl: "",
        confirmationStatus: "Not Confirmed",
      },
    };
  }

  // Check for multiple high-frequency candidates
  const topCount = sortedNumbers[0][1].count;
  const hasCatalog = sortedNumbers[0][1].hasOemCatalog;
  const tiedNumbers = sortedNumbers.filter(([, data]) =>
    data.count >= topCount && (hasCatalog ? data.hasOemCatalog : true)
  );

  if (tiedNumbers.length >= 2 && !question) {
    const variantOptions = tiedNumbers.map(([num, data]) => {
      const desc = extractDescription(data.sources[0].context, num);
      const fitment = extractFitment(data.sources[0].context);
      const distinction = fitment || desc.slice(0, 60);
      return `Part #${num}${distinction ? ` (${distinction})` : ""}`;
    });

    questionPrompt = `Multiple OEM part numbers found for this ${v.year} ${v.make} ${v.model} ${req.partName}. Which matches this vehicle's configuration?`;
    questionOptions = [...variantOptions, "Unknown / Not Sure"];

    notes = `Found ${sortedNumbers.length} candidate OEM part number(s). ${tiedNumbers.length} have equal confidence — they may correspond to different trim/options variants. Please identify which variant matches this vehicle. Numbers extracted from source data — NOT generated.`;

    return {
      oemPartNumber: "",
      interchangeNumbers: [],
      partName: partWithSide,
      side,
      confidence: "low",
      verified: false,
      needsManualReview: true,
      partNumberState: "none",
      questionPrompt,
      questionOptions,
      notes,
      sources: allSources,
      allCandidates,
      debug: debugEntries,
      debugSummary: {
        vehicleDataUsed: describeVehicleData(v),
        oldOemNumber: "",
        oldNumberVerified: "NO",
        oldNumberExcluded: "YES",
        primaryOemSource: primaryOemSource || "none",
        vehicleSelectionMethod: v.vin ? "VIN" : "YMM",
        partSearch: simplePartName,
        oemResults: `${sortedNumbers.length} candidates found`,
        webFallbackUsed,
        webSearchProvider: webSearchProviderName,
        organicResults: `${organicResultsCount}`,
        candidateOemNumbers: allCandidateNumbers,
        sourceUrl: "",
        confirmationStatus: "Not Confirmed",
      },
    };
  }

  // Pick the top number
  const [topNumber, topData] = sortedNumbers[0];
  const topSources = topData.sources;
  sourceUrl = topSources[0].sourceUrl;

  for (const [num, data] of sortedNumbers.slice(1)) {
    const types = data.sources.map((s) => s.numberType);
    if (types.includes("superseded")) {
      supersededPartNumber = num;
    } else if (types.includes("original")) {
      originalPartNumber = num;
    } else {
      interchangeNumbers.push(num);
    }
  }

  manufacturerDescription = extractDescription(topSources[0].context, topNumber);
  fitmentInfo = extractFitment(topSources[0].context);

  const independentNonEbaySources = new Set(
    topSources.filter((s) => !isEbayUrl(s.sourceUrl) && s.sourceName !== "eBay Listing").map((s) => s.sourceName)
  ).size;
  const hasOemCatalog = topData.hasOemCatalog;

  if (hasOemCatalog || independentNonEbaySources >= 2) {
    oemPartNumber = topNumber;
    verified = false;
    confidence = "high";
    needsManualReview = false;
    partNumberState = "suggested";
    notes = `Suggested OEM part number ${topNumber} — found via ${hasOemCatalog ? "OEM catalog source" : `${independentNonEbaySources} independent sources`}. Press CONFIRM to use this number. Number extracted from source data — NOT generated.`;
  } else {
    oemPartNumber = topNumber;
    verified = false;
    confidence = "medium";
    needsManualReview = true;
    partNumberState = "suggested";
    notes = `Suggested OEM part number ${topNumber} found in 1 source (${topSources[0].sourceName}). Requires cross-verification or manual confirmation. Press CONFIRM if you have verified this matches the physical part.`;
  }

  if (question && oemPartNumber) {
    confidence = "low";
    verified = false;
    needsManualReview = true;
    notes = `Suggested OEM part number ${oemPartNumber} found but configuration question must be answered first: ${question.prompt}. ` + notes;
  }

  const returnedSources = oemPartNumber ? numAggregation.get(oemPartNumber)?.sources ?? [] : [];

  return {
    oemPartNumber,
    originalPartNumber,
    supersededPartNumber,
    interchangeNumbers: interchangeNumbers.slice(0, 5),
    partName: partWithSide,
    side,
    confidence,
    verified,
    needsManualReview,
    partNumberState,
    manufacturerDescription,
    fitmentInfo,
    questionPrompt,
    questionOptions,
    notes,
    sources: returnedSources,
    allCandidates,
    debug: debugEntries,
    debugSummary: {
      vehicleDataUsed: describeVehicleData(v),
      oldOemNumber: "",
      oldNumberVerified: "NO",
      oldNumberExcluded: "YES",
      primaryOemSource: primaryOemSource || "none",
      vehicleSelectionMethod: v.vin ? "VIN" : "YMM",
      partSearch: simplePartName,
      oemResults: `${sortedNumbers.length} candidates found`,
      webFallbackUsed,
      webSearchProvider: webSearchProviderName,
      organicResults: `${organicResultsCount}`,
      candidateOemNumbers: allCandidateNumbers,
      sourceUrl,
      confirmationStatus: "Not Confirmed",
    },
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const body = (await req.json()) as PartResearchRequest;
    if (!body.partName || !body.vehicle) {
      return new Response(
        JSON.stringify({ error: "Part name and vehicle info are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const result = await searchOemPartNumber(body);

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
