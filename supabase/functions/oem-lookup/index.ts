import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  buildOemLookupResult,
  catalogSearchTargets,
  detectManufacturer,
  emptyResult,
  extractIdentification,
  normalizeOemNumber,
  type OemLookupResult,
  type SourceIdentification,
} from "./identify.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface OemLookupRequest {
  oemNumber: string;
  year?: number;
  make?: string;
  model?: string;
  vin?: string;
  description?: string;
}

async function fetchWithTimeout(url: string, timeoutMs = 12000): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
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

function snippetAround(text: string, num: string, radius = 400): string {
  const idx = text.toUpperCase().indexOf(num);
  if (idx < 0) return text.slice(0, radius);
  return text.slice(Math.max(0, idx - radius), Math.min(text.length, idx + num.length + radius));
}

// ---------- eBay Browse (server-side; credentials never leave the edge function) ----------

interface EbayBrowseItem {
  title: string;
  itemWebUrl: string;
  condition: string;
  categoryName: string;
}

async function ebayBrowseByKeyword(
  keyword: string,
): Promise<{ items: EbayBrowseItem[]; degraded: string | null }> {
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: cfg } = await supabase
      .from("ebay_config")
      .select("client_id, client_secret, environment")
      .eq("id", 1)
      .maybeSingle();
    if (!cfg?.client_id || !cfg?.client_secret) {
      return { items: [], degraded: "eBay API not configured (ebay_config has no credentials)" };
    }
    const authUrl =
      cfg.environment === "production"
        ? "https://api.ebay.com/identity/v1/oauth2/token"
        : "https://api.sandbox.ebay.com/identity/v1/oauth2/token";
    const tokenResp = await fetch(authUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${btoa(`${cfg.client_id}:${cfg.client_secret}`)}`,
      },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        scope: "https://api.ebay.com/oauth/api_scope",
      }),
    });
    const tokenData = await tokenResp.json();
    if (!tokenData.access_token) {
      return { items: [], degraded: "eBay API token request failed" };
    }
    const browseBase =
      cfg.environment === "production" ? "https://api.ebay.com" : "https://api.sandbox.ebay.com";
    const searchUrl =
      `${browseBase}/buy/browse/v1/item_summary/search?q=${encodeURIComponent(keyword)}&limit=20`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const resp = await fetch(searchUrl, {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
          "X-EBAY-C-MARKETPLACE-ID": "EBAY_US",
        },
        signal: controller.signal,
      });
      if (!resp.ok) return { items: [], degraded: `eBay Browse returned HTTP ${resp.status}` };
      const data = await resp.json();
      const items: EbayBrowseItem[] = (data.itemSummaries || []).map((it: {
        title?: string;
        itemWebUrl?: string;
        condition?: string;
        categories?: { categoryName?: string }[];
      }) => ({
        title: it.title || "",
        itemWebUrl: it.itemWebUrl || "",
        condition: it.condition || "",
        categoryName: it.categories?.[0]?.categoryName || "",
      }));
      return { items, degraded: null };
    } finally {
      clearTimeout(timeout);
    }
  } catch {
    return { items: [], degraded: "eBay Browse request failed (network or credentials)" };
  }
}

// ---------- Web search fallback (same provider pattern as part-research) ----------

interface WebResult {
  title: string;
  url: string;
  snippet: string;
  domain: string;
}

async function webSearchFallback(query: string): Promise<{ results: WebResult[]; degraded: string | null }> {
  const tavilyKey = Deno.env.get("TAVILY_API_KEY");
  const serpKey = Deno.env.get("SERPAPI_API_KEY");
  if (!tavilyKey && !serpKey) {
    return { results: [], degraded: "web search provider not configured (TAVILY_API_KEY / SERPAPI_API_KEY)" };
  }
  try {
    if (tavilyKey) {
      const resp = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ api_key: tavilyKey, query, max_results: 8, include_answer: false }),
      });
      if (!resp.ok) return { results: [], degraded: "web search request failed" };
      const data = await resp.json();
      const results: WebResult[] = (data.results || []).map((r: { title: string; url: string; content: string }) => ({
        title: r.title || "",
        url: r.url || "",
        snippet: r.content || "",
        domain: (() => {
          try {
            return new URL(r.url).hostname.replace(/^www\./, "");
          } catch {
            return "";
          }
        })(),
      }));
      return { results, degraded: null };
    }
    // SerpApi
    const params = new URLSearchParams({ api_key: serpKey!, q: query, num: "8" });
    const resp = await fetch(`https://serpapi.com/search.json?${params.toString()}`);
    if (!resp.ok) return { results: [], degraded: "web search request failed" };
    const data = await resp.json();
    const results: WebResult[] = (data.organic_results || []).map((r: { title: string; link: string; snippet: string }) => ({
      title: r.title || "",
      url: r.link || "",
      snippet: r.snippet || "",
      domain: (() => {
        try {
          return new URL(r.link).hostname.replace(/^www\./, "");
        } catch {
          return "";
        }
      })(),
    }));
    return { results, degraded: null };
  } catch {
    return { results: [], degraded: "web search request failed" };
  }
}

// ---------- VIN enrichment (NHTSA vPIC — free, no key) ----------

async function decodeVin(vin: string): Promise<{ make: string; model: string; year: string } | null> {
  const clean = (vin || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (clean.length !== 17) return null;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const resp = await fetch(
        `https://vpic.nhtsa.dot.gov/api/vehicles/decodevin/${clean}?format=json`,
        { signal: controller.signal },
      );
      if (!resp.ok) return null;
      const data = await resp.json();
      const get = (name: string): string => {
        const e = (data.Results || []).find((r: { Variable: string }) => r.Variable === name);
        return (e?.Value || "").trim();
      };
      const make = get("Make");
      const model = get("Model");
      const year = get("Model Year");
      if (!make && !model) return null;
      return { make, model, year };
    } finally {
      clearTimeout(timeout);
    }
  } catch {
    return null;
  }
}

// ---------- Orchestration ----------

async function lookupOem(req: OemLookupRequest): Promise<OemLookupResult> {
  const num = normalizeOemNumber(req.oemNumber || "");
  const guess = detectManufacturer(num);
  const degraded: string[] = [];
  const sourceIds: SourceIdentification[] = [];

  if (!num) {
    return emptyResult(req.oemNumber || "", guess, degraded, "An OEM/MPN part number is required.");
  }

  const queryBits = [num];
  if (req.year) queryBits.push(String(req.year));
  if (req.make) queryBits.push(req.make);
  if (req.model) queryBits.push(req.model);
  if (req.description) queryBits.push(req.description);

  // Step 1 — authoritative catalog sources.
  const targets = catalogSearchTargets(guess.code, num).slice(0, 4);
  const catalogResults = await Promise.allSettled(
    targets.map(async (t) => {
      const html = await fetchWithTimeout(t.url);
      if (!html || html.length < 500) return null;
      const text = stripHtml(html);
      if (text.length < 100 || text.toUpperCase().indexOf(num) < 0) return null;
      return { target: t, text };
    }),
  );
  for (const r of catalogResults) {
    if (r.status !== "fulfilled" || !r.value) continue;
    const { target, text } = r.value;
    const id = extractIdentification(text, num);
    if (id.partName || id.supersededNumbers.length > 0 || id.applications.length > 0) {
      sourceIds.push({
        sourceName: target.name,
        sourceUrl: target.url,
        authoritative: target.authoritative,
        id,
        snippet: snippetAround(text, num),
      });
    }
  }

  // Step 2 — eBay Browse/catalog data (server-side credentials).
  const ebay = await ebayBrowseByKeyword(num);
  if (ebay.degraded) {
    degraded.push(ebay.degraded);
  } else {
    const matching = ebay.items.filter((it) =>
      it.title.toUpperCase().replace(/[^A-Z0-9]/g, "").includes(num.replace(/-/g, "")),
    );
    if (matching.length > 0) {
      const combined = matching
        .slice(0, 10)
        .map((it) => `${it.title} [${it.condition || "unknown condition"}${it.categoryName ? ` | ${it.categoryName}` : ""}]`)
        .join(" ||| ");
      const id = extractIdentification(combined, num);
      if (id.partName || matching.length > 0) {
        sourceIds.push({
          sourceName: "eBay Browse",
          sourceUrl: `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(num)}`,
          authoritative: false,
          id: {
            ...id,
            partName: id.partName || inferNameFromEbayTitles(matching.map((m) => m.title), num),
            partType: id.partType || "",
          },
          snippet: combined.slice(0, 600),
        });
      }
    }
  }

  // Step 3 — web fallback when catalog + eBay are thin.
  const hasName = sourceIds.some((s) => s.id.partName);
  if (!hasName || sourceIds.length < 2) {
    const web = await webSearchFallback(`"${num}" OEM part number ${req.description || ""}`.trim());
    if (web.degraded) {
      degraded.push(web.degraded);
    } else {
      for (const wr of web.results.slice(0, 6)) {
        const text = `${wr.title} — ${wr.snippet}`;
        if (text.toUpperCase().indexOf(num) < 0) continue;
        const id = extractIdentification(text, num);
        if (id.partName || id.supersededNumbers.length > 0) {
          sourceIds.push({
            sourceName: wr.domain || "Web",
            sourceUrl: wr.url,
            authoritative: /gmparts|moparparts|fordparts|toyotaparts|hondaparts|nissanparts|bmwparts|parts\./i.test(wr.domain || ""),
            id,
            snippet: text.slice(0, 400),
          });
        }
      }
    }
  }

  // Step 4 — VIN enrichment (free NHTSA decode) when provided.
  let vinNote = "";
  if (req.vin) {
    const decoded = await decodeVin(req.vin);
    if (decoded) {
      vinNote = `VIN decodes to ${decoded.year} ${decoded.make} ${decoded.model} (NHTSA vPIC).`;
    } else {
      degraded.push("VIN could not be decoded");
    }
  }

  const queryNotes = [
    queryBits.length > 1 ? `Query context: ${queryBits.slice(1).join(" ")}.` : "",
    vinNote,
  ].filter(Boolean).join(" ");

  if (sourceIds.length === 0) {
    return emptyResult(
      num,
      guess,
      degraded,
      `No source returned usable data for ${num}. ${queryNotes}`.trim(),
    );
  }

  return buildOemLookupResult({
    oemNumber: num,
    manufacturerGuess: guess,
    sourceIds,
    degraded,
    queryNotes,
  });
}

/** Fallback part-name guess from eBay titles: longest descriptive run of words before the number. */
function inferNameFromEbayTitles(titles: string[], num: string): string {
  let best = "";
  for (const t of titles) {
    const idx = t.toUpperCase().indexOf(num);
    if (idx < 0) continue;
    const before = t.slice(0, idx).replace(/[|]/g, " ").replace(/\s+/g, " ").trim();
    const words = before.split(" ").filter(Boolean);
    // Drop leading year-range / fitment noise, keep the descriptive tail.
    const cleaned = words.filter((w) => !/^(19|20)\d{2}$/.test(w)).slice(-8).join(" ");
    if (cleaned.length > best.length) best = cleaned;
  }
  return best;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }
  try {
    const body = (await req.json()) as OemLookupRequest;
    const result = await lookupOem(body);
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    // Never crash: return a degraded, well-formed result.
    const guess = detectManufacturer("");
    const result = emptyResult("", guess, ["lookup failed"], `Lookup failed: ${(err as Error).message}`);
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
