import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface SoldCompResult {
  price: number;
  title: string;
  date: string;
  condition: string;
  url: string;
  sold: boolean;
  exactMatch: boolean;
  itemSpecifics?: { label: string; value: string }[];
  shipping?: string;
  extractedNumbers?: { number: string; source: string }[];
}

interface OemCandidate {
  partNumber: string;
  matchCount: number;
  sources: string[];
  strongestSource: string;
  confidenceLevel?: string;
  evidencePoints?: string[];
  vehicleMatches?: number;
  oemFieldMatches?: number;
  titleMatches?: number;
  isLikelySuperseded?: boolean;
  supersededFrom?: string;
}

interface SearchRequest {
  oemPartNumber?: string;
  partName: string;
  vehicle: string;
  side?: string;
  isManual?: boolean;
  isAutomatic?: boolean;
}

interface CompStats {
  count: number;
  low: number;
  median: number;
  average: number;
  high: number;
}

interface SearchDebug {
  query: string;
  url: string;
  httpStatus: number;
  htmlLength: number;
  rawResultCount: number;
  parsedResultCount: number;
  rejectionReasons: { title: string; reason: string }[];
  blocked?: boolean;
}

interface ActiveListing {
  itemId: string;
  title: string;
  price: number;
  shipping?: string;
  condition: string;
  seller: string;
  itemUrl: string;
  detectedOem?: string;
  exactMatch: boolean;
}

interface SoldCompResponse {
  comps: SoldCompResult[];
  oemUsedSoldCount: number;
  lowRange: number;
  highRange: number;
  typicalPrice: number;
  suggestedListPrice: number;
  conditionNotes: string[];
  searchQuery: string;
  confidence: "high" | "medium" | "low";
  isManual?: boolean;
  manualPartNumber?: string;
  soldStats?: CompStats;
  activeStats?: CompStats;
  exactMatchCount?: number;
  oemCandidates?: OemCandidate[];
  strongestCandidate?: string;
  searchDebug?: SearchDebug[];
  searchLog?: string[];
  activeListings?: ActiveListing[];
  soldDataAvailable?: boolean;
  pricingSource?: string;
  debugIndicator?: {
    partNumberSource: string;
    oemResearchBypassed: boolean;
    ebaySearchStarted: boolean;
    soldResultsFound: number;
    activeResultsFound: number;
    exactNumberMatches: number;
    suggestedPrice: number;
    listingsInspected?: number;
    oemNumbersFound?: number;
    candidates?: { partNumber: string; matchCount: number; confidenceLevel?: string }[];
    strongestCandidate?: string;
    strongestConfidence?: string;
    googleVerification?: string;
    automaticResearchBypassed?: boolean;
    requestBlocked?: boolean;
    listingsFoundButNotInspected?: boolean;
    activeEbayApiSearch?: boolean;
    soldDataAvailable?: boolean;
    blockedHtmlScrapingUsed?: boolean;
    pricingSource?: string;
  };
}

function parsePrice(text: string): number | null {
  const match = text.match(/\$[\s]*([\d,]+(?:\.\d{2})?)/);
  if (!match) return null;
  const num = parseFloat(match[1].replace(/,/g, ""));
  return isNaN(num) ? null : num;
}

async function fetchWithTimeout(url: string, timeoutMs = 10000): Promise<string> {
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

function isOemUsed(title: string): boolean {
  const lower = title.toLowerCase();
  if (/aftermarket|reproduction|replacement brand|generic|new listing/.test(lower)) return false;
  return true;
}

function isSinglePart(title: string): boolean {
  const lower = title.toLowerCase();
  if (/\bpair\b|\bset of\b|\bset\b|\b2x\b|\bboth\b|\blh ?\+ ?rh\b|\bleft ?\+ ?right\b|\bdriver ?\+ ?passenger\b/.test(lower)) {
    return false;
  }
  return true;
}

function isSameSide(title: string, side?: string): boolean {
  if (!side) return true;
  const lower = title.toLowerCase();
  const sideLower = side.toLowerCase();
  if (sideLower.includes("left") || sideLower.includes("driver")) {
    if (/\bright\b|\bpassenger\b/.test(lower) && !/\bleft\b|\bdriver\b/.test(lower)) return false;
  }
  if (sideLower.includes("right") || sideLower.includes("passenger")) {
    if (/\bleft\b|\bdriver\b/.test(lower) && !/\bright\b|\bpassenger\b/.test(lower)) return false;
  }
  return true;
}

function matchesPartType(title: string, partName: string): boolean {
  const lower = title.toLowerCase();
  const simplePart = simplifyPartName(partName).toLowerCase();

  const exclusionMap: Record<string, string[]> = {
    "instrument cluster": ["pcm", "ecm", "radio", "stereo", "head unit", "hvac", "climate control", "switch panel", "navigation screen", "infotainment", "touch screen", "display screen"],
    "radio": ["instrument cluster", "gauge cluster", "pcm", "ecm", "hvac", "climate control", "switch panel", "navigation screen", "infotainment"],
    "pcm": ["instrument cluster", "gauge cluster", "radio", "stereo", "head unit", "hvac", "climate control", "switch panel", "infotainment"],
    "headlamp": ["tail lamp", "taillight", "tail light", "fog light", "turn signal", "mirror"],
    "tail lamp": ["headlamp", "headlight", "head light", "fog light", "turn signal", "mirror"],
    "mirror": ["headlamp", "headlight", "tail lamp", "taillight", "door panel"],
    "grille": ["bumper", "fender", "hood"],
    "bumper": ["grille", "fender", "hood"],
    "fender": ["grille", "bumper", "hood", "door"],
    "hood": ["grille", "bumper", "fender", "door"],
    "alternator": ["starter", "compressor", "radiator"],
    "starter": ["alternator", "compressor", "radiator"],
    "a/c compressor": ["alternator", "starter", "radiator", "condenser"],
    "radiator": ["alternator", "starter", "compressor", "condenser"],
    "condenser": ["radiator", "alternator", "starter", "compressor"],
    "door panel": ["mirror", "seat", "glove box"],
    "glove box": ["door panel", "seat", "console"],
    "seat": ["door panel", "glove box", "console"],
    "shifter": ["steering column", "steering wheel"],
    "wheel": ["tire", "rim only"],
  };

  const exclusions = exclusionMap[simplePart];
  if (exclusions) {
    for (const ex of exclusions) {
      if (lower.includes(ex)) return false;
    }
  }
  return true;
}

function simplifyPartName(partName: string): string {
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

function isExactMatch(title: string, partNumber: string): boolean {
  const upperTitle = title.toUpperCase();
  const upperNum = partNumber.toUpperCase();
  const escaped = upperNum.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(escaped);
  return regex.test(upperTitle);
}

// Extract part numbers from eBay item specifics, title, and description
function extractPartNumbers(itemHtml: string, title: string): { number: string; source: string }[] {
  const found: { number: string; source: string }[] = [];
  const seen = new Set<string>();

  // OEM part number regex: typically 8-14 alphanumeric chars with possible suffixes
  // Chrysler/Mopar format: 5-6 digits + 2 alpha (e.g., 55277414AF)
  // Generic OEM: 6-14 alphanumeric
  const oemRegex = /\b([0-9]{5,8}[A-Z]{0,4})\b/g;

  // 1. Item specifics — highest priority
  // eBay item specifics are in divs with class like "s-item__dynamic"
  const specificsRegex = /class="[^"]*s-item__dynamic[^"]*"[^>]*>([\s\S]*?)<\/div>/gi;
  let sm: RegExpExecArray | null;
  while ((sm = specificsRegex.exec(itemHtml)) !== null) {
    const specText = sm[1].replace(/<[^>]+>/g, "").trim();
    // Labels like "OE/OEM Part Number:", "Manufacturer Part Number:", "Interchange Part Number:"
    const labelMatch = specText.match(/(OE[\/:]?\s*OEM|Manufacturer Part Number|MPN|Interchange|Other Part Number)[:\s]*(.+)/i);
    if (labelMatch) {
      const valuePart = labelMatch[2].trim();
      const numMatch = valuePart.match(/([0-9A-Z]{6,16})/);
      if (numMatch) {
        const num = numMatch[1].toUpperCase();
        if (!seen.has(num)) {
          seen.add(num);
          const label = labelMatch[1].toUpperCase();
          let source = "Description";
          if (label.includes("OEM") || label.includes("OE")) source = "OE/OEM Item Specific";
          else if (label.includes("MANUFACTURER") || label.includes("MPN")) source = "MPN Item Specific";
          else if (label.includes("INTERCHANGE") || label.includes("OTHER")) source = "Interchange Item Specific";
          found.push({ number: num, source });
        }
      }
    }
  }

  // Also try extracting from itemSpecifics JSON if present
  const jsonRegex = /"itemSpecifics":\s*\[([\s\S]*?)\]/gi;
  let jm: RegExpExecArray | null;
  while ((jm = jsonRegex.exec(itemHtml)) !== null) {
    const jsonText = jm[1];
    const pairs = jsonText.matchAll(/"label"\s*:\s*"([^"]+)"[^}]*?"value"\s*:\s*"([^"]+)"/gi);
    for (const pair of pairs) {
      const label = pair[1].toUpperCase();
      const value = pair[2].trim();
      if (label.includes("OEM") || label.includes("OE") || label.includes("MPN") || label.includes("MANUFACTURER") || label.includes("INTERCHANGE") || label.includes("OTHER PART")) {
        const numMatch = value.match(/([0-9A-Z]{6,16})/);
        if (numMatch) {
          const num = numMatch[1].toUpperCase();
          if (!seen.has(num)) {
            seen.add(num);
            let source = "Description";
            if (label.includes("OEM") || label.includes("OE")) source = "OE/OEM Item Specific";
            else if (label.includes("MANUFACTURER") || label.includes("MPN")) source = "MPN Item Specific";
            else if (label.includes("INTERCHANGE") || label.includes("OTHER")) source = "Interchange Item Specific";
            found.push({ number: num, source });
          }
        }
      }
    }
  }

  // 2. Title — next priority
  const titleMatches = title.toUpperCase().match(oemRegex);
  if (titleMatches) {
    for (const tm of titleMatches) {
      if (!seen.has(tm) && tm.length >= 6) {
        seen.add(tm);
        found.push({ number: tm, source: "Title" });
      }
    }
  }

  // 3. Description/details — lowest priority (extract from listing HTML snippet)
  const descText = itemHtml.replace(/<[^>]+>/g, " ");
  const descMatches = descText.toUpperCase().match(oemRegex);
  if (descMatches) {
    for (const dm of descMatches) {
      if (!seen.has(dm) && dm.length >= 6) {
        seen.add(dm);
        found.push({ number: dm, source: "Description" });
      }
    }
  }

  return found;
}

// Rank candidates by source priority and frequency
function rankCandidates(allNumbers: { number: string; source: string }[]): OemCandidate[] {
  const sourcePriority: Record<string, number> = {
    "OE/OEM Item Specific": 5,
    "MPN Item Specific": 4,
    "Interchange Item Specific": 3,
    "Title": 2,
    "Description": 1,
  };

  const grouped = new Map<string, { count: number; sources: Set<string>; bestSource: string; bestPriority: number }>();

  for (const { number, source } of allNumbers) {
    const existing = grouped.get(number);
    const priority = sourcePriority[source] ?? 0;
    if (existing) {
      existing.count++;
      existing.sources.add(source);
      if (priority > existing.bestPriority) {
        existing.bestPriority = priority;
        existing.bestSource = source;
      }
    } else {
      grouped.set(number, {
        count: 1,
        sources: new Set([source]),
        bestSource: source,
        bestPriority: priority,
      });
    }
  }

  const candidates: OemCandidate[] = [];
  for (const [partNumber, data] of grouped) {
    candidates.push({
      partNumber,
      matchCount: data.count,
      sources: Array.from(data.sources),
      strongestSource: data.bestSource,
    });
  }

  // Sort by: source priority first, then match count
  candidates.sort((a, b) => {
    const aPriority = sourcePriority[a.strongestSource] ?? 0;
    const bPriority = sourcePriority[b.strongestSource] ?? 0;
    if (bPriority !== aPriority) return bPriority - aPriority;
    return b.matchCount - a.matchCount;
  });

  return candidates;
}

interface EbaySearchOptions {
  query: string;
  sold: boolean;
  partName: string;
  side?: string;
  partNumber?: string;
  excludeAftermarket: boolean;
  conditionUsed: boolean;
  extractNumbers?: boolean;
  // For manual exact-number searches, skip part-type/side/aftermarket filters
  // since we already know the exact number
  relaxFilters?: boolean;
}

async function searchEbay(opts: EbaySearchOptions): Promise<{ results: SoldCompResult[]; debug: SearchDebug }> {
  const encoded = encodeURIComponent(opts.query);
  let url: string;
  if (opts.sold) {
    url = `https://www.ebay.com/sch/i.html?_nkw=${encoded}&LH_Sold=1&LH_Complete=1&LH_ItemCondition=3000&_sop=13`;
  } else {
    url = `https://www.ebay.com/sch/i.html?_nkw=${encoded}&LH_ItemCondition=3000`;
  }

  let httpStatus = 0;
  let html = "";
  let blocked = false;
  try {
    const resp = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: AbortSignal.timeout(15000),
    });
    httpStatus = resp.status;
    if (resp.status === 403 || resp.status === 429) {
      blocked = true;
    }
    html = await resp.text();
  } catch {
    return {
      results: [],
      debug: { query: opts.query, url, httpStatus: 0, htmlLength: 0, rawResultCount: 0, parsedResultCount: 0, rejectionReasons: [], blocked: true },
    };
  }

  if (blocked || !html) {
    return {
      results: [],
      debug: { query: opts.query, url, httpStatus, htmlLength: html.length, rawResultCount: 0, parsedResultCount: 0, rejectionReasons: [], blocked },
    };
  }

  // Parse items — eBay uses different layouts; try multiple regex patterns
  const itemRegexes = [
    /<li[^>]*class="[^"]*s-item[^"]*"[^>]*>([\s\S]*?)<\/li>/gi,
    /<div[^>]*class="[^"]*s-item[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<(?:div|li)/gi,
    /class="[^"]*s-item__info[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/gi,
  ];

  const items: string[] = [];
  const maxItems = opts.sold ? 25 : 15;
  for (const regex of itemRegexes) {
    let m: RegExpExecArray | null;
    regex.lastIndex = 0;
    while ((m = regex.exec(html)) !== null && items.length < maxItems) {
      const candidate = m[1];
      // Avoid duplicates and too-short fragments
      if (candidate.length > 100 && !items.includes(candidate)) {
        items.push(candidate);
      }
    }
    if (items.length >= 5) break; // Good enough parse
  }

  const rawResultCount = items.length;
  const results: SoldCompResult[] = [];
  const rejectionReasons: { title: string; reason: string }[] = [];

  for (const item of items) {
    // Try multiple price patterns
    const priceMatch = item.match(/class="[^"]*s-item__price[^"]*"[^>]*>([\s\S]*?)<\/span>/i)
      || item.match(/\$([\d,]+(?:\.\d{2})?)/i);
    const titleMatch = item.match(/class="[^"]*s-item__title[^"]*"[^>]*>([\s\S]*?)<\/(?:h3|span|div)>/i)
      || item.match(/class="[^"]*s-item__link[^"]*"[^>]*>([\s\S]*?)<\/a>/i);
    const linkMatch = item.match(/href="(https:\/\/www\.ebay\.com\/itm\/[^"]+)"/i)
      || item.match(/href="(https:\/\/www\.ebay\.com\/str\/[^"]+\/itm\/[^"]+)"/i);
    const dateMatch = item.match(/class="[^"]*s-item__title--tag[^"]*"[^>]*>([\s\S]*?)<\/span>/i)
      || item.match(/ended-date[^>]*>([\s\S]*?)<"/i)
      || item.match(/class="[^"]*s-item__ended[^"]*"[^>]*>([\s\S]*?)<\/span>/i);
    // Shipping
    const shippingMatch = item.match(/class="[^"]*s-item__shipping[^"]*"[^>]*>([\s\S]*?)<\/span>/i);
    // Condition
    const conditionMatch = item.match(/class="[^"]*s-item__condition[^"]*"[^>]*>([\s\S]*?)<\/span>/i);

    const price = priceMatch ? parsePrice(priceMatch[1].replace(/<[^>]+>/g, "").trim()) : null;
    const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, "").trim().slice(0, 150) : "";
    const link = linkMatch ? linkMatch[1] : url;
    const date = dateMatch ? dateMatch[1].replace(/<[^>]+>/g, "").trim() : "";
    const shipping = shippingMatch ? shippingMatch[1].replace(/<[^>]+>/g, "").trim() : "";
    const conditionText = conditionMatch ? conditionMatch[1].replace(/<[^>]+>/g, "").trim() : (opts.conditionUsed ? "Used" : "New");

    if (!title) {
      if (price) rejectionReasons.push({ title: "(no title)", reason: "No title found" });
      continue;
    }
    if (!price || price <= 0) {
      rejectionReasons.push({ title: title.slice(0, 50), reason: "No valid price" });
      continue;
    }

    const isExact = opts.partNumber ? isExactMatch(title, opts.partNumber) : false;

    // For manual exact-number search, relax all filters for exact matches
    if (opts.relaxFilters && isExact) {
      // Extract item specifics
      let itemSpecifics: { label: string; value: string }[] = [];
      if (opts.extractNumbers) {
        const specsRegex = /class="[^"]*s-item__dynamic[^"]*"[^>]*>([\s\S]*?)<\/div>/gi;
        let sm: RegExpExecArray | null;
        while ((sm = specsRegex.exec(item)) !== null) {
          const specText = sm[1].replace(/<[^>]+>/g, "").trim();
          const colonIdx = specText.indexOf(":");
          if (colonIdx > 0) {
            const label = specText.slice(0, colonIdx).trim();
            const value = specText.slice(colonIdx + 1).trim();
            if (label && value && label.length < 50) {
              itemSpecifics.push({ label, value });
            }
          }
        }
      }
      results.push({
        price, title, date: date || "", condition: conditionText, url: link, sold: opts.sold,
        exactMatch: true, itemSpecifics: itemSpecifics.length > 0 ? itemSpecifics : undefined,
        shipping: shipping || undefined,
        extractedNumbers: opts.extractNumbers ? extractPartNumbers(item, title) : undefined,
      });
      continue;
    }

    // Standard filters for non-exact or non-relaxed
    if (opts.excludeAftermarket && !isOemUsed(title)) {
      rejectionReasons.push({ title: title.slice(0, 50), reason: "Aftermarket/reproduction filtered" });
      continue;
    }
    if (!isSinglePart(title)) {
      rejectionReasons.push({ title: title.slice(0, 50), reason: "Pair/set filtered" });
      continue;
    }
    if (!isSameSide(title, opts.side)) {
      rejectionReasons.push({ title: title.slice(0, 50), reason: "Wrong side filtered" });
      continue;
    }
    if (!matchesPartType(title, opts.partName)) {
      rejectionReasons.push({ title: title.slice(0, 50), reason: "Wrong part type filtered" });
      continue;
    }

    // Extract item specifics for display
    let itemSpecifics: { label: string; value: string }[] = [];
    if (opts.extractNumbers) {
      const specsRegex = /class="[^"]*s-item__dynamic[^"]*"[^>]*>([\s\S]*?)<\/div>/gi;
      let sm: RegExpExecArray | null;
      while ((sm = specsRegex.exec(item)) !== null) {
        const specText = sm[1].replace(/<[^>]+>/g, "").trim();
        const colonIdx = specText.indexOf(":");
        if (colonIdx > 0) {
          const label = specText.slice(0, colonIdx).trim();
          const value = specText.slice(colonIdx + 1).trim();
          if (label && value && label.length < 50) {
            itemSpecifics.push({ label, value });
          }
        }
      }
    }

    results.push({
      price, title, date: date || "", condition: conditionText, url: link, sold: opts.sold,
      exactMatch: isExact, itemSpecifics: itemSpecifics.length > 0 ? itemSpecifics : undefined,
      shipping: shipping || undefined,
      extractedNumbers: opts.extractNumbers ? extractPartNumbers(item, title) : undefined,
    });
  }

  return {
    results: results.slice(0, opts.sold ? 15 : 8),
    debug: { query: opts.query, url, httpStatus, htmlLength: html.length, rawResultCount, parsedResultCount: results.length, rejectionReasons: rejectionReasons.slice(0, 10), blocked: false },
  };
}

// Normalize a part number for comparison: strip leading P, uppercase, remove spaces/dashes
function normalizePartNumber(num: string): string {
  let n = num.toUpperCase().replace(/[\s\-]/g, "");
  // Strip a leading "P" that Chrysler/Mopar numbers sometimes carry (P68064923AD → 68064923AD)
  if (n.startsWith("P") && /[0-9]/.test(n[1])) {
    n = n.slice(1);
  }
  return n;
}

// --- eBay Browse API (active listings) ---
// In-process cache for identical OEM-number searches within a single request
const browseCache = new Map<string, { results: ActiveListing[]; timestamp: number }>();
const BROWSE_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

async function getEbayAppToken(): Promise<string | null> {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const { data: cfg } = await supabase.from("ebay_config").select("client_id, client_secret, environment").eq("id", 1).maybeSingle();
  if (!cfg?.client_id || !cfg?.client_secret) return null;

  const authUrl = cfg.environment === "production"
    ? "https://api.ebay.com/identity/v1/oauth2/token"
    : "https://api.sandbox.ebay.com/identity/v1/oauth2/token";

  const resp = await fetch(authUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Authorization": `Basic ${btoa(`${cfg.client_id}:${cfg.client_secret}`)}`,
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      scope: "https://api.ebay.com/oauth/api_scope",
    }),
  });
  const data = await resp.json();
  return data.access_token || null;
}

function getEbayBrowseBaseUrl(env: string | null | undefined): string {
  return env === "production" ? "https://api.ebay.com" : "https://api.sandbox.ebay.com";
}

async function searchEbayBrowseAPI(query: string, oemNumber: string): Promise<{ results: ActiveListing[]; log: string[] }> {
  const logs: string[] = [];
  const normalized = normalizePartNumber(oemNumber);

  // Check cache
  const cached = browseCache.get(normalized);
  if (cached && Date.now() - cached.timestamp < BROWSE_CACHE_TTL_MS) {
    logs.push(`BROWSE API: Cache hit for ${normalized}`);
    return { results: cached.results, log: logs };
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const { data: cfg } = await supabase.from("ebay_config").select("environment").eq("id", 1).maybeSingle();
  const baseUrl = getEbayBrowseBaseUrl(cfg?.environment);

  const token = await getEbayAppToken();
  if (!token) {
    logs.push("BROWSE API: No app token — eBay credentials not configured");
    return { results: [], log: logs };
  }

  const searchUrl = `${baseUrl}/buy/browse/v1/item_summary/search?q=${encodeURIComponent(query)}&limit=50`;
  logs.push(`BROWSE API: GET ${searchUrl}`);

  let resp: Response;
  try {
    resp = await fetch(searchUrl, {
      headers: { "Authorization": `Bearer ${token}` },
      signal: AbortSignal.timeout(12000),
    });
  } catch (err) {
    logs.push(`BROWSE API: Request failed — ${err.message}`);
    return { results: [], log: logs };
  }

  logs.push(`BROWSE API: HTTP ${resp.status}`);

  if (resp.status === 429) {
    const retryAfter = resp.headers.get("Retry-After");
    logs.push(`BROWSE API: Rate limited (429) — Retry-After: ${retryAfter || "not specified"}s`);
    return { results: [], log: logs };
  }
  if (!resp.ok) {
    const errText = await resp.text().catch(() => "");
    logs.push(`BROWSE API: Error HTTP ${resp.status} — ${errText.slice(0, 300)}`);
    return { results: [], log: logs };
  }

  const data = await resp.json();
  const itemSummaries = (data.itemSummaries || []) as Array<Record<string, unknown>>;
  logs.push(`BROWSE API: ${itemSummaries.length} items returned`);

  const results: ActiveListing[] = [];
  for (const item of itemSummaries) {
    const title = (item.title as string) || "";
    const itemId = (item.itemId as string) || "";
    const priceVal = parseFloat((item.price?.value as string) || "0");
    const shippingInfo = item.shippingOptions as Array<Record<string, unknown>> | undefined;
    const shippingCost = shippingOptions?.[0]?.shippingCost?.value as string | undefined;
    const condition = (item.condition as string) || "Unknown";
    const seller = (item.seller?.username as string) || "";
    const itemUrl = (item.itemWebUrl as string) || "";

    // Extract detected OEM/MPN from item aspects
    let detectedOem: string | undefined;
    const aspects = item.aspects as Record<string, string> | undefined;
    if (aspects) {
      for (const [key, val] of Object.entries(aspects)) {
        const keyUpper = key.toUpperCase();
        if (keyUpper.includes("OEM") || keyUpper.includes("MPN") || keyUpper.includes("MANUFACTURER") || keyUpper.includes("INTERCHANGE")) {
          detectedOem = val;
          break;
        }
      }
    }

    // Exact match: normalized OEM number appears in title or detected OEM field
    const titleUpper = title.toUpperCase();
    const isExact = titleUpper.includes(normalized) ||
      titleUpper.includes(oemNumber.toUpperCase()) ||
      (detectedOem ? normalizePartNumber(detectedOem) === normalized : false);

    results.push({
      itemId,
      title,
      price: priceVal,
      shipping: shippingCost ? `${shippingCost}` : undefined,
      condition,
      seller,
      itemUrl,
      detectedOem,
      exactMatch: isExact,
    });
  }

  // Sort exact matches first
  results.sort((a, b) => {
    if (a.exactMatch && !b.exactMatch) return -1;
    if (!a.exactMatch && b.exactMatch) return 1;
    return 0;
  });

  browseCache.set(normalized, { results, timestamp: Date.now() });
  logs.push(`BROWSE API: ${results.filter(r => r.exactMatch).length} exact matches out of ${results.length} total`);

  return { results, log: logs };
}

// Check if a listing's extracted numbers match the target (normalized comparison)
function listingMatchesNumber(listing: SoldCompResult, targetNum: string): boolean {
  const normalizedTarget = normalizePartNumber(targetNum);
  // Check title
  if (normalizePartNumber(listing.title.toUpperCase().includes(targetNum.toUpperCase()) ? targetNum : "").length > 0) return true;
  // Check extracted numbers
  if (listing.extractedNumbers) {
    for (const ext of listing.extractedNumbers) {
      if (normalizePartNumber(ext.number) === normalizedTarget) return true;
    }
  }
  // Check item specifics
  if (listing.itemSpecifics) {
    for (const spec of listing.itemSpecifics) {
      const numMatch = spec.value.match(/([0-9A-Z]{6,16})/);
      if (numMatch && normalizePartNumber(numMatch[1]) === normalizedTarget) return true;
    }
  }
  // Also check raw title contains the normalized form
  const titleUpper = listing.title.toUpperCase();
  if (titleUpper.includes(normalizedTarget)) return true;
  if (titleUpper.includes(targetNum.toUpperCase())) return true;
  return false;
}

// Manual path: Browse API for active listings + single sold HTML attempt (no retry on block)
async function searchEbayManual(req: SearchRequest): Promise<{
  sold: SoldCompResult[];
  active: ActiveListing[];
  debug: SearchDebug[];
  searchLog: string[];
  soldDataAvailable: boolean;
  soldBlocked: boolean;
}> {
  const rawNum = req.oemPartNumber!.toUpperCase();
  const partName = req.partName;
  const vehicle = req.vehicle;
  const debugList: SearchDebug[] = [];
  const searchLog: string[] = [];
  const normalized = normalizePartNumber(rawNum);

  searchLog.push(`PART NUMBER SOURCE: MANUAL`);
  searchLog.push(`MANUAL PART NUMBER: ${rawNum} (normalized: ${normalized})`);
  searchLog.push(`BLOCKED HTML SCRAPING USED: NO`);

  // --- Step 1: Browse API for ACTIVE listings ---
  // Fallback order: A) exact OEM number, B) OEM + part name, C) OEM + year/make/model
  const browseQueries = [
    normalized,
    `${normalized} ${partName}`,
    `${normalized} ${vehicle}`,
  ];

  let allActive: ActiveListing[] = [];
  const seenItemIds = new Set<string>();

  for (const q of browseQueries) {
    searchLog.push(`ACTIVE EBAY API SEARCH: query="${q}"`);
    const { results, log: browseLogs } = await searchEbayBrowseAPI(q, rawNum);
    searchLog.push(...browseLogs);

    for (const item of results) {
      if (!seenItemIds.has(item.itemId)) {
        seenItemIds.add(item.itemId);
        allActive.push(item);
      }
    }

    // Stop additional searches once sufficient exact matches found
    const exactCount = allActive.filter(a => a.exactMatch).length;
    if (exactCount >= 5) {
      searchLog.push(`Stopping search — ${exactCount} exact matches found`);
      break;
    }
  }

  const exactActiveMatches = allActive.filter(a => a.exactMatch);
  searchLog.push(`ACTIVE RESULTS: ${allActive.length} total, ${exactActiveMatches.length} exact number matches`);
  searchLog.push(`EXACT NUMBER MATCHES: ${exactActiveMatches.length}`);

  // --- Step 2: Sold comps — SINGLE attempt, no retry on block ---
  searchLog.push(`SOLD DATA: attempting single eBay sold search...`);
  const soldResult = await searchEbay({
    query: normalized,
    sold: true,
    partName,
    side: req.side,
    partNumber: rawNum,
    excludeAftermarket: false,
    conditionUsed: true,
    extractNumbers: true,
    relaxFilters: true,
  });
  debugList.push(soldResult.debug);

  let soldDataAvailable = false;
  let soldBlocked = false;
  let soldResults: SoldCompResult[] = [];

  if (soldResult.debug.blocked) {
    soldBlocked = true;
    searchLog.push(`SOLD DATA AVAILABLE: NO`);
    searchLog.push(`SOLD SEARCH: BLOCKED (HTTP ${soldResult.debug.httpStatus}) — not retrying`);
  } else if (soldResult.results.length > 0) {
    soldDataAvailable = true;
    soldResults = soldResult.results;
    // Re-check exact matches
    for (const item of soldResults) {
      item.exactMatch = listingMatchesNumber(item, rawNum);
    }
    searchLog.push(`SOLD DATA AVAILABLE: YES`);
    searchLog.push(`SOLD SEARCH: ${soldResults.length} results, ${soldResults.filter(s => s.exactMatch).length} exact matches`);
  } else {
    // Got a response but zero results — data is available, just no matches
    soldDataAvailable = true;
    searchLog.push(`SOLD DATA AVAILABLE: YES (0 results returned)`);
  }

  return { sold: soldResults.slice(0, 15), active: allActive, debug: debugList, searchLog, soldDataAvailable, soldBlocked };
}

// --- Part synonym system ---
const PART_SYNONYMS: Record<string, string[]> = {
  "PCM": ["PCM", "ECM", "ECU", "Engine Computer", "Engine Control Module", "Powertrain Control Module", "Engine Controller"],
  "ECM": ["PCM", "ECM", "ECU", "Engine Computer", "Engine Control Module", "Powertrain Control Module", "Engine Controller"],
  "ECU": ["PCM", "ECM", "ECU", "Engine Computer", "Engine Control Module", "Powertrain Control Module", "Engine Controller"],
  "Instrument Cluster": ["Instrument Cluster", "Gauge Cluster", "Dash Cluster", "Instrument Panel Cluster", "Cluster"],
  "Radio": ["Radio", "Stereo", "Head Unit", "Audio Unit", "Radio Receiver", "Infotainment"],
  "Headlamp": ["Headlamp", "Headlight", "Head Light", "Head Lamp Assembly", "Headlight Assembly"],
  "Tail Lamp": ["Tail Lamp", "Taillight", "Tail Light", "Tail Lamp Assembly", "Rear Lamp"],
  "Mirror": ["Mirror", "Side Mirror", "Wing Mirror", "Door Mirror", "Rearview Mirror", "Outside Mirror"],
  "Grille": ["Grille", "Front Grille", "Radiator Grille", "Grille Assembly"],
  "Bumper": ["Bumper", "Bumper Cover", "Bumper Assembly", "Front Bumper", "Rear Bumper", "Bumper Fascia"],
  "Fender": ["Fender", "Front Fender", "Rear Fender", "Fender Panel", "Quarter Panel"],
  "Hood": ["Hood", "Bonnet", "Hood Panel", "Hood Assembly"],
  "Alternator": ["Alternator", "Alternator Assembly"],
  "Starter": ["Starter", "Starter Motor", "Starter Assembly"],
  "A/C Compressor": ["A/C Compressor", "AC Compressor", "Air Conditioning Compressor", "Compressor"],
  "Radiator": ["Radiator", "Engine Radiator", "Cooling Radiator"],
  "Condenser": ["Condenser", "A/C Condenser", "AC Condenser", "Air Conditioning Condenser"],
  "Door Panel": ["Door Panel", "Door Trim", "Door Card", "Interior Door Panel"],
  "Glove Box": ["Glove Box", "Glovebox", "Glove Compartment"],
  "Seat": ["Seat", "Front Seat", "Driver Seat", "Passenger Seat", "Bucket Seat"],
  "Shifter": ["Shifter", "Gear Shifter", "Shift Lever", "Transmission Shifter"],
  "Wheel": ["Wheel", "Alloy Wheel", "Rim", "Factory Wheel", "OEM Wheel"],
};

function getSynonyms(partName: string): string[] {
  const simple = simplifyPartName(partName);
  return PART_SYNONYMS[simple] || [partName];
}

function generateSearchQueries(vehicle: string, partName: string, side?: string): string[] {
  const synonyms = getSynonyms(partName);
  const sideSuffix = side ? " " + side : "";
  const queries: string[] = [];
  for (const syn of synonyms.slice(0, 4)) {
    queries.push(`${vehicle} ${syn}${sideSuffix}`);
  }
  const makeModel = vehicle.replace(/^\d{4}\s+/, "");
  queries.push(`${makeModel} ${synonyms[0]}${sideSuffix}`);
  queries.push(`${vehicle} OEM ${synonyms[0]}${sideSuffix}`);
  const make = vehicle.split(" ")[1] || "";
  if (make) {
    queries.push(`${make} ${synonyms[0]}${sideSuffix} used`);
  }
  return queries;
}

function areSuperseded(numA: string, numB: string): boolean {
  if (numA === numB) return false;
  const baseA = numA.replace(/[A-Z]+$/, "");
  const baseB = numB.replace(/[A-Z]+$/, "");
  return baseA === baseB && baseA.length >= 5;
}

function extractNumbersFromListing(listing: SoldCompResult): { number: string; source: string }[] {
  // Prefer extractedNumbers (from raw HTML parsing — includes OEM/MPN/Interchange fields + description)
  if (listing.extractedNumbers && listing.extractedNumbers.length > 0) {
    return listing.extractedNumbers;
  }

  // Fallback: parse from itemSpecifics + title
  const found: { number: string; source: string }[] = [];
  const oemRegex = /\b([0-9]{5,8}[A-Z]{0,4})\b/g;
  const titleMatches = listing.title.toUpperCase().match(oemRegex);
  if (titleMatches) {
    for (const tm of titleMatches) {
      if (tm.length >= 6) found.push({ number: tm, source: "Title" });
    }
  }
  if (listing.itemSpecifics) {
    for (const spec of listing.itemSpecifics) {
      const label = spec.label.toUpperCase();
      if (label.includes("OEM") || label.includes("OE")) {
        const numMatch = spec.value.match(/([0-9A-Z]{6,16})/);
        if (numMatch) found.push({ number: numMatch[1].toUpperCase(), source: "OE/OEM Item Specific" });
      } else if (label.includes("MANUFACTURER") || label.includes("MPN")) {
        const numMatch = spec.value.match(/([0-9A-Z]{6,16})/);
        if (numMatch) found.push({ number: numMatch[1].toUpperCase(), source: "MPN Item Specific" });
      } else if (label.includes("INTERCHANGE") || label.includes("OTHER")) {
        const numMatch = spec.value.match(/([0-9A-Z]{6,16})/);
        if (numMatch) found.push({ number: numMatch[1].toUpperCase(), source: "Interchange Item Specific" });
      }
    }
  }
  return found;
}

async function searchEbayAutomaticIntelligent(req: SearchRequest): Promise<{
  sold: SoldCompResult[];
  candidates: OemCandidate[];
  searchLog: string[];
  searchDebug: SearchDebug[];
  anyBlocked: boolean;
  listingsFoundButNotInspected: boolean;
}> {
  const partName = req.partName;
  const vehicle = req.vehicle;
  const side = req.side;
  const searchLog: string[] = [];
  const searchDebug: SearchDebug[] = [];
  const allSold: SoldCompResult[] = [];
  const seenUrls = new Set<string>();

  const queries = generateSearchQueries(vehicle, partName, side);
  searchLog.push(`Generated ${queries.length} search queries using ${getSynonyms(partName).length} synonyms for "${partName}"`);

  let anyBlocked = false;

  // Round 1: first 3 queries in parallel
  const round1Queries = queries.slice(0, 3);
  searchLog.push(`Round 1: Searching [${round1Queries.map(q => '"' + q + '"').join(", ")}]`);

  const round1Results = await Promise.allSettled(
    round1Queries.map((q) => searchEbay({
      query: q, sold: true, partName, side,
      excludeAftermarket: false, conditionUsed: true, extractNumbers: true,
    }))
  );

  for (let i = 0; i < round1Results.length; i++) {
    const r = round1Results[i];
    if (r.status === "fulfilled") {
      searchDebug.push(r.value.debug);
      if (r.value.debug.blocked) {
        anyBlocked = true;
        searchLog.push(`Round 1 query "${round1Queries[i]}": REQUEST BLOCKED (HTTP ${r.value.debug.httpStatus})`);
      } else {
        for (const item of r.value.results) {
          if (!seenUrls.has(item.url)) { seenUrls.add(item.url); allSold.push(item); }
        }
      }
    }
  }
  searchLog.push(`Round 1: Found ${allSold.length} sold listings so far`);

  let allNumbers: { number: string; source: string }[] = [];
  for (const listing of allSold) allNumbers.push(...extractNumbersFromListing(listing));
  let candidates = rankCandidates(allNumbers);
  searchLog.push(`Round 1: Extracted ${candidates.length} candidate part numbers`);

  // Round 2: if weak, try remaining queries
  if (allSold.length < 3 && queries.length > 3) {
    const round2Queries = queries.slice(3);
    searchLog.push(`Round 2: Weak results, trying [${round2Queries.map(q => '"' + q + '"').join(", ")}]`);

    const round2Results = await Promise.allSettled(
      round2Queries.map((q) => searchEbay({
        query: q, sold: true, partName, side,
        excludeAftermarket: false, conditionUsed: true, extractNumbers: true,
      }))
    );

    for (let i = 0; i < round2Results.length; i++) {
      const r = round2Results[i];
      if (r.status === "fulfilled") {
        searchDebug.push(r.value.debug);
        if (r.value.debug.blocked) {
          anyBlocked = true;
          searchLog.push(`Round 2 query "${round2Queries[i]}": REQUEST BLOCKED (HTTP ${r.value.debug.httpStatus})`);
        } else {
          for (const item of r.value.results) {
            if (!seenUrls.has(item.url)) { seenUrls.add(item.url); allSold.push(item); }
          }
        }
      }
    }
    searchLog.push(`Round 2: Found ${allSold.length} total sold listings`);

    allNumbers = [];
    for (const listing of allSold) allNumbers.push(...extractNumbersFromListing(listing));
    candidates = rankCandidates(allNumbers);
    searchLog.push(`Round 2: Extracted ${candidates.length} candidate part numbers`);
  }

  // Round 3: search directly for strongest candidate
  if (candidates.length > 0 && candidates[0].matchCount >= 1) {
    const topCandidate = candidates[0].partNumber;
    searchLog.push(`Round 3: Searching directly for strongest candidate "${topCandidate}"`);

    const directResult = await searchEbay({
      query: topCandidate, sold: true, partName, side, partNumber: topCandidate,
      excludeAftermarket: false, conditionUsed: true, extractNumbers: true, relaxFilters: true,
    });
    searchDebug.push(directResult.debug);
    if (directResult.debug.blocked) {
      anyBlocked = true;
      searchLog.push(`Round 3: REQUEST BLOCKED (HTTP ${directResult.debug.httpStatus})`);
    }

    let newFromDirect = 0;
    for (const item of directResult.results) {
      if (!seenUrls.has(item.url)) { seenUrls.add(item.url); allSold.push(item); newFromDirect++; }
    }
    searchLog.push(`Round 3: Found ${newFromDirect} new listings via direct candidate search`);

    allNumbers = [];
    for (const listing of allSold) allNumbers.push(...extractNumbersFromListing(listing));
    candidates = rankCandidates(allNumbers);
  }

  // Build evidence for each candidate
  const evidenceCandidates: OemCandidate[] = [];
  const vehicleYear = vehicle.split(" ")[0];
  const vehicleMake = vehicle.split(" ")[1] || "";

  for (const cand of candidates) {
    const evidence: string[] = [];
    let vehicleMatches = 0;
    let oemFieldMatches = 0;
    let titleMatches = 0;

    for (const listing of allSold) {
      const hasNumber = listing.title.toUpperCase().includes(cand.partNumber) ||
        (listing.itemSpecifics && listing.itemSpecifics.some(s => s.value.toUpperCase().includes(cand.partNumber)));

      if (hasNumber) {
        const listingText = listing.title.toLowerCase();
        if (listingText.includes(vehicleMake.toLowerCase()) || listingText.includes(vehicleYear)) vehicleMatches++;

        if (listing.itemSpecifics) {
          for (const spec of listing.itemSpecifics) {
            const label = spec.label.toUpperCase();
            if ((label.includes("OEM") || label.includes("OE") || label.includes("MANUFACTURER") || label.includes("MPN") || label.includes("INTERCHANGE")) &&
                spec.value.toUpperCase().includes(cand.partNumber)) { oemFieldMatches++; break; }
          }
        }
        if (listing.title.toUpperCase().includes(cand.partNumber)) titleMatches++;
      }
    }

    evidence.push(`Found on ${cand.matchCount} relevant sold eBay listing${cand.matchCount !== 1 ? "s" : ""}`);
    if (vehicleMatches > 0) evidence.push(`${vehicleMatches} listing${vehicleMatches !== 1 ? "s" : ""} match ${vehicle}`);
    if (oemFieldMatches > 0) evidence.push(`Confirmed in OE/OEM Part Number field on ${oemFieldMatches} listing${oemFieldMatches !== 1 ? "s" : ""}`);
    if (titleMatches > 0) evidence.push(`Appears in listing title on ${titleMatches} listing${titleMatches !== 1 ? "s" : ""}`);
    evidence.push(`Strongest source: ${cand.strongestSource}`);

    let confidenceLevel = "POSSIBLE";
    if (oemFieldMatches >= 2 && vehicleMatches >= 2) confidenceLevel = "VERIFIED";
    else if (cand.matchCount >= 3 && vehicleMatches >= 2) confidenceLevel = "HIGH CONFIDENCE";

    let isLikelySuperseded = false;
    let supersededFrom: string | undefined;
    for (const other of candidates) {
      if (other.partNumber !== cand.partNumber && areSuperseded(cand.partNumber, other.partNumber)) {
        isLikelySuperseded = true;
        if (cand.matchCount < other.matchCount) supersededFrom = other.partNumber;
        break;
      }
    }
    if (isLikelySuperseded && supersededFrom) {
      evidence.push(`Possible supersession of ${supersededFrom} — verify original vs revised number`);
    }

    evidenceCandidates.push({
      partNumber: cand.partNumber, matchCount: cand.matchCount, sources: cand.sources,
      strongestSource: cand.strongestSource, confidenceLevel, evidencePoints: evidence,
      vehicleMatches, oemFieldMatches, titleMatches, isLikelySuperseded, supersededFrom,
    });
  }

  // Bug detection: sold listings found but none inspected for OEM numbers
  const totalExtracted = allNumbers.length;
  const listingsInspected = allSold.length;
  const listingsFoundButNotInspected = listingsInspected > 0 && totalExtracted === 0;

  searchLog.push(`Final: ${evidenceCandidates.length} candidates, ${listingsInspected} sold listings inspected, ${totalExtracted} numbers extracted`);
  if (anyBlocked) {
    searchLog.push(`WARNING: Some eBay requests were blocked (HTTP 403/429) — results may be incomplete`);
  }
  if (listingsFoundButNotInspected) {
    searchLog.push(`BUG: SOLD LISTINGS FOUND BUT NOT PASSED TO OEM INSPECTION (${listingsInspected} listings, 0 numbers)`);
  }
  if (evidenceCandidates.length > 0) {
    searchLog.push(`Strongest: ${evidenceCandidates[0].partNumber} (${evidenceCandidates[0].confidenceLevel})`);
  } else {
    if (listingsInspected > 0) {
      searchLog.push(`OEM PART NUMBER NOT FOUND — ${listingsInspected} sold listings were inspected but no OEM numbers could be extracted`);
    } else if (anyBlocked) {
      searchLog.push(`OEM PART NUMBER NOT FOUND — eBay requests were blocked, no listings could be retrieved`);
    } else {
      searchLog.push(`OEM PART NUMBER NOT FOUND after ${searchDebug.length} searches — no sold listings found for any query variation`);
    }
  }

  return { sold: allSold, candidates: evidenceCandidates, searchLog, searchDebug, anyBlocked, listingsFoundButNotInspected };
}

function computeStatsFromPrices(prices: number[]): CompStats {
  if (prices.length === 0) {
    return { count: 0, low: 0, median: 0, average: 0, high: 0 };
  }
  const sorted = [...prices].sort((a, b) => a - b);
  const low = sorted[0];
  const high = sorted[sorted.length - 1];
  const median = sorted.length % 2 === 0
    ? Math.round((sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2)
    : sorted[Math.floor(sorted.length / 2)];
  const average = Math.round(prices.reduce((sum, p) => sum + p, 0) / prices.length);
  return { count: prices.length, low, median, average, high };
}

function computeSuggestedListPrice(soldStats: CompStats, activeStats: CompStats): number {
  if (soldStats.count === 0 && activeStats.count === 0) return 0;
  let anchor = soldStats.count > 0 ? soldStats.median : activeStats.median;
  if (activeStats.count > 0 && soldStats.count > 0) {
    if (activeStats.median < soldStats.median * 0.8) {
      anchor = Math.round((soldStats.median + activeStats.median) / 2);
    }
  }
  return Math.round(anchor * 1.05);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const body = (await req.json()) as SearchRequest;
    if (!body.partName) {
      return new Response(
        JSON.stringify({ error: "Part name is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // MANUAL PATH: Browse API for active + single sold HTML attempt (no retry on block)
    if (body.isManual && body.oemPartNumber) {
      const partNum = body.oemPartNumber.toUpperCase();
      const { sold, active, debug: searchDebug, searchLog: manualLog, soldDataAvailable, soldBlocked } = await searchEbayManual({
        ...body,
        oemPartNumber: partNum,
      });

      const soldPrices = sold.map(c => c.price);
      const soldStats = computeStatsFromPrices(soldPrices);

      // Active listings: compute stats from exact matches only
      const exactActive = active.filter(a => a.exactMatch);
      const activePrices = exactActive.map(a => a.price).filter(p => p > 0);
      const activeStats = computeStatsFromPrices(activePrices);

      const exactMatchCount = sold.filter(c => c.exactMatch).length + exactActive.length;

      // Pricing logic:
      // - If sold data available with results → use sold comps ("SOLD")
      // - If sold unavailable but active exact matches exist → use active market range ("ACTIVE MARKET")
      // - If neither → "INSUFFICIENT DATA" (never $0)
      let suggestedListPrice = 0;
      let pricingSource = "INSUFFICIENT DATA";
      let lowRange = 0;
      let highRange = 0;
      let typicalPrice = 0;

      if (soldDataAvailable && soldStats.count > 0) {
        suggestedListPrice = computeSuggestedListPrice(soldStats, activeStats);
        pricingSource = "SOLD";
        lowRange = soldStats.low;
        highRange = soldStats.high;
        typicalPrice = soldStats.median;
      } else if (activeStats.count > 0) {
        // Active Market Estimate — use median of active exact matches
        suggestedListPrice = Math.round(activeStats.median * 1.05);
        pricingSource = "ACTIVE MARKET";
        lowRange = activeStats.low;
        highRange = activeStats.high;
        typicalPrice = activeStats.median;
      }

      let confidence: "high" | "medium" | "low" = "low";
      if (pricingSource === "SOLD" && soldStats.count >= 5) confidence = "high";
      else if (pricingSource === "SOLD" && soldStats.count >= 2) confidence = "medium";
      else if (pricingSource === "ACTIVE MARKET" && activeStats.count >= 3) confidence = "medium";

      const conditionNotes: string[] = [];
      if (soldBlocked) {
        conditionNotes.push("Sold data unavailable — eBay blocked the sold search request. Active market pricing used instead.");
      }
      if (!soldDataAvailable && !soldBlocked) {
        conditionNotes.push("Sold data unavailable.");
      }
      if (pricingSource === "ACTIVE MARKET") {
        conditionNotes.push("Price shown is an Active Market Estimate based on current asking prices — not sold comp data.");
      }
      if (pricingSource === "INSUFFICIENT DATA") {
        conditionNotes.push("Insufficient pricing data — no sold comps or active exact matches found. Enter a price manually.");
      }
      const allTitles = [...sold.map(c => c.title), ...exactActive.map(a => a.title)].join(" ").toLowerCase();
      if (allTitles.includes("program") || allTitles.includes("unlock") || allTitles.includes("vin")) {
        conditionNotes.push("Some listings mention programming/VIN unlocking — this can materially affect value");
      }
      if (allTitles.includes("tested")) {
        conditionNotes.push("Some listings mention tested — tested parts typically sell higher");
      }

      manualLog.push(`PRICING SOURCE: ${pricingSource}`);

      const response: SoldCompResponse = {
        comps: sold.slice(0, 15),
        oemUsedSoldCount: soldStats.count,
        lowRange,
        highRange,
        typicalPrice,
        suggestedListPrice,
        conditionNotes,
        searchQuery: partNum,
        confidence,
        isManual: true,
        manualPartNumber: partNum,
        soldStats,
        activeStats,
        exactMatchCount,
        searchDebug,
        searchLog: manualLog,
        activeListings: active.slice(0, 20),
        soldDataAvailable,
        pricingSource,
        debugIndicator: {
          partNumberSource: "MANUAL",
          oemResearchBypassed: true,
          ebaySearchStarted: true,
          soldResultsFound: soldStats.count,
          activeResultsFound: active.length,
          exactNumberMatches: exactMatchCount,
          suggestedPrice: suggestedListPrice,
          automaticResearchBypassed: true,
          requestBlocked: soldBlocked,
          activeEbayApiSearch: true,
          soldDataAvailable,
          blockedHtmlScrapingUsed: false,
          pricingSource,
        },
      };

      return new Response(
        JSON.stringify(response),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // AUTOMATIC PATH: Intelligent multi-round eBay research for OEM number discovery
    const { sold: soldComps, candidates, searchLog, searchDebug: autoDebug, anyBlocked, listingsFoundButNotInspected } = await searchEbayAutomaticIntelligent(body);

    const allComps = soldComps;
    const oemUsedSoldCount = soldComps.length;
    const prices = soldComps.map(c => c.price).sort((a, b) => a - b);

    let lowRange = 0, highRange = 0, typicalPrice = 0, suggestedListPrice = 0;
    if (prices.length > 0) {
      lowRange = prices[0];
      highRange = prices[prices.length - 1];
      typicalPrice = prices.length % 2 === 0
        ? Math.round((prices[prices.length / 2 - 1] + prices[prices.length / 2]) / 2)
        : prices[Math.floor(prices.length / 2)];
      suggestedListPrice = prices.length >= 4
        ? Math.round(prices[Math.floor(prices.length * 0.75)])
        : Math.round(typicalPrice * 1.1);
    }

    const conditionNotes: string[] = [];
    const titles = soldComps.map(c => c.title.toLowerCase()).join(" ");
    if (titles.includes("program") || titles.includes("unlock") || titles.includes("vin")) {
      conditionNotes.push("Some comps mention programming/VIN unlocking — this can materially affect value");
    }
    if (titles.includes("tested")) {
      conditionNotes.push("Some comps mention tested — tested parts typically sell higher");
    }
    if (titles.includes("repair") || titles.includes("reman")) {
      conditionNotes.push("Some comps may be repaired/remanufactured — verify condition differences");
    }

    let confidence: "high" | "medium" | "low" = "low";
    if (oemUsedSoldCount >= 5) confidence = "high";
    else if (oemUsedSoldCount >= 2) confidence = "medium";

    const searchQuery = `${body.vehicle} ${body.partName}${body.side ? " " + body.side : ""}`;
    const strongestCandidate = candidates.length > 0 ? candidates[0].partNumber : "";
    const strongestConfidence = candidates.length > 0 ? (candidates[0].confidenceLevel || "POSSIBLE") : "";

    const response: SoldCompResponse = {
      comps: allComps,
      oemUsedSoldCount,
      lowRange,
      highRange,
      typicalPrice,
      suggestedListPrice,
      conditionNotes,
      searchQuery,
      confidence,
      isManual: false,
      oemCandidates: candidates,
      strongestCandidate,
      searchDebug: autoDebug,
      searchLog,
      debugIndicator: {
        partNumberSource: "AUTOMATIC",
        oemResearchBypassed: false,
        ebaySearchStarted: true,
        soldResultsFound: oemUsedSoldCount,
        activeResultsFound: 0,
        exactNumberMatches: 0,
        suggestedPrice: suggestedListPrice,
        listingsInspected: oemUsedSoldCount,
        oemNumbersFound: candidates.length,
        candidates: candidates.map(c => ({ partNumber: c.partNumber, matchCount: c.matchCount, confidenceLevel: c.confidenceLevel })),
        strongestCandidate,
        strongestConfidence,
        googleVerification: "NOT CONNECTED",
        requestBlocked: anyBlocked,
        listingsFoundButNotInspected,
      },
    };

    return new Response(
      JSON.stringify(response),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
