/**
 * Pure, side-effect-free OEM part-number identification logic.
 *
 * No Deno / Node / browser APIs here — this module is imported by the
 * `oem-lookup` edge function AND by the Node test script
 * (`scripts/test-oem-lookup.mts`) via native TS type-stripping.
 * Keep every function deterministic and total (never throws).
 */

export interface ManufacturerGuess {
  code: string | null; // 'GM' | 'FORD' | 'MOPAR' | 'TOYOTA' | 'HONDA' | 'NISSAN' | 'BMW' | null
  name: string; // 'General Motors' | 'Unknown'
  confidence: "high" | "medium" | "low";
  reason: string;
}

export interface ExtractedIdentification {
  partName: string;
  partType: string;
  supersededNumbers: string[]; // numbers this part replaces
  supersededBy: string | null; // number that replaces this part
  hollanderNumber: string | null;
  interchangeNumbers: string[];
  applications: string[];
  manufacturerMentions: string[];
}

export interface EvidenceItem {
  fact: string;
  value: string;
  sourceName: string;
  sourceUrl: string;
  snippet: string;
}

export interface OemLookupOption {
  partName: string;
  partType: string;
  applications: string[];
  supportCount: number;
  sources: string[];
}

export interface OemLookupResult {
  identified: boolean;
  manufacturer: string;
  manufacturerCode: string | null;
  oemNumber: string;
  partName: string;
  partType: string;
  supersededNumbers: string[];
  supersededBy: string | null;
  hollanderNumber: string | null;
  interchangeNumbers: string[];
  applications: string[];
  confidence: "high" | "medium" | "low";
  confidenceReason: string;
  evidence: EvidenceItem[];
  options: OemLookupOption[];
  degraded: string[];
  notes: string;
}

/** Normalize a raw OEM/MPN entry: uppercase, strip spaces/dashes noise (but keep meaningful dashes). */
export function normalizeOemNumber(raw: string): string {
  return (raw || "")
    .toUpperCase()
    .replace(/[\s_]+/g, "")
    .replace(/[^A-Z0-9-]/g, "");
}

/**
 * Guess the manufacturer from the part-number format.
 * These are format heuristics only — the catalog/web evidence decides the final answer.
 */
export function detectManufacturer(num: string): ManufacturerGuess {
  const n = normalizeOemNumber(num);
  if (!n) {
    return { code: null, name: "Unknown", confidence: "low", reason: "Empty part number." };
  }
  // GM: classic 8-digit numeric (e.g. 23228498). Also 7-digit.
  if (/^\d{8}$/.test(n) || /^\d{7}$/.test(n)) {
    return {
      code: "GM",
      name: "General Motors",
      confidence: "high",
      reason: "8-digit numeric format is the classic GM part-number format.",
    };
  }
  // Mopar: 7-8 digits + 2 letters (e.g. 68239946AA, 55277414AF)
  if (/^\d{7,8}[A-Z]{2}$/.test(n)) {
    return {
      code: "MOPAR",
      name: "Stellantis (Mopar)",
      confidence: "high",
      reason: "Digits + 2-letter suffix matches the Mopar part-number format.",
    };
  }
  // Ford: engineering format like FL3Z-9E926-A / F81Z-9E926-AA
  if (/^[A-Z]{2,4}\d[A-Z]-\d[A-Z0-9]{3,5}-[A-Z0-9]{1,3}$/.test(n)) {
    return {
      code: "FORD",
      name: "Ford Motor Company",
      confidence: "high",
      reason: "Matches the Ford engineering part-number format.",
    };
  }
  // Toyota: 5-5 numeric with optional suffix (e.g. 90915-YZZD1)
  if (/^\d{5}-[A-Z0-9]{5}$/.test(n)) {
    return {
      code: "TOYOTA",
      name: "Toyota",
      confidence: "high",
      reason: "Matches the Toyota part-number format.",
    };
  }
  // Honda/Acura: 5-3-3 (e.g. 33151-TBA-A00)
  if (/^\d{5}-[A-Z0-9]{3}-[A-Z0-9]{3}$/.test(n)) {
    return {
      code: "HONDA",
      name: "Honda",
      confidence: "high",
      reason: "Matches the Honda/Acura part-number format.",
    };
  }
  // Nissan: 5-5 alphanumeric (e.g. 26010-3KA0A)
  if (/^[A-Z0-9]{5}-[A-Z0-9]{5}$/.test(n)) {
    return {
      code: "NISSAN",
      name: "Nissan",
      confidence: "medium",
      reason: "5-5 alphanumeric format is common for Nissan (also used by others).",
    };
  }
  // BMW: 11 digits (e.g. 51479123456) or spaced groups
  if (/^\d{11}$/.test(n)) {
    return {
      code: "BMW",
      name: "BMW",
      confidence: "medium",
      reason: "11-digit numeric format is common for BMW.",
    };
  }
  return {
    code: null,
    name: "Unknown",
    confidence: "low",
    reason: "Part-number format did not match a known manufacturer pattern; catalog evidence will decide.",
  };
}

export interface CatalogTarget {
  name: string;
  url: string;
  authoritative: boolean;
}

/**
 * Authoritative catalog search URLs for a part number.
 * These catalogs' search endpoints accept a raw part number query.
 */
export function catalogSearchTargets(code: string | null, num: string): CatalogTarget[] {
  const q = encodeURIComponent(num);
  const byCode: Record<string, CatalogTarget[]> = {
    GM: [
      { name: "GMPartsGiant", url: `https://www.gmpartsgiant.com/search?q=${q}`, authoritative: true },
      { name: "GMPartsDirect", url: `https://www.gmpartsdirect.com/search?q=${q}`, authoritative: true },
    ],
    MOPAR: [
      { name: "MoparPartsGiant", url: `https://www.moparpartsgiant.com/search?q=${q}`, authoritative: true },
      { name: "MyMoparParts", url: `https://www.mymoparparts.com/search?q=${q}`, authoritative: true },
    ],
    FORD: [
      { name: "FordPartsGiant", url: `https://www.fordpartsgiant.com/search?q=${q}`, authoritative: true },
    ],
    TOYOTA: [
      { name: "ToyotaPartsDeal", url: `https://www.toyotapartsdeal.com/search?q=${q}`, authoritative: true },
    ],
    HONDA: [
      { name: "HondaPartsNow", url: `https://www.hondapartsnow.com/search?q=${q}`, authoritative: true },
    ],
    NISSAN: [
      { name: "NissanPartsDeal", url: `https://www.nissanpartsdeal.com/search?q=${q}`, authoritative: true },
    ],
    BMW: [
      { name: "BMWPartsDeal", url: `https://www.bmwpartsdeal.com/search?q=${q}`, authoritative: true },
    ],
  };
  if (code && byCode[code]) return byCode[code];
  // Unknown manufacturer: try the big three catalogs (bounded).
  return [
    { name: "GMPartsGiant", url: `https://www.gmpartsgiant.com/search?q=${q}`, authoritative: true },
    { name: "MoparPartsGiant", url: `https://www.moparpartsgiant.com/search?q=${q}`, authoritative: true },
    { name: "FordPartsGiant", url: `https://www.fordpartsgiant.com/search?q=${q}`, authoritative: true },
  ];
}

const PART_TYPE_KEYWORDS: { match: RegExp; type: string }[] = [
  { match: /hmi|infotainment|human machine interface/i, type: "HMI / Infotainment Module" },
  { match: /instrument\s*cluster|gauge\s*cluster/i, type: "Instrument Cluster" },
  { match: /control\s*module|module\s*assembly/i, type: "Control Module" },
  { match: /radio|stereo|head\s*unit|video\s*player/i, type: "Radio / Media Unit" },
  { match: /headlamp|head\s*lamp|headlight/i, type: "Headlamp" },
  { match: /tail\s*lamp|tail\s*light|taillight/i, type: "Tail Lamp" },
  { match: /mirror/i, type: "Mirror" },
  { match: /bumper/i, type: "Bumper" },
  { match: /fender/i, type: "Fender" },
  { match: /hood/i, type: "Hood" },
  { match: /grille/i, type: "Grille" },
  { match: /alternator/i, type: "Alternator" },
  { match: /starter/i, type: "Starter" },
  { match: /compressor/i, type: "A/C Compressor" },
  { match: /radiator/i, type: "Radiator" },
  { match: /condenser/i, type: "Condenser" },
  { match: /water\s*pump/i, type: "Water Pump" },
  { match: /fuel\s*pump/i, type: "Fuel Pump" },
  { match: /sensor/i, type: "Sensor" },
  { match: /actuator/i, type: "Actuator" },
  { match: /seat/i, type: "Seat" },
  { match: /door\s*panel/i, type: "Door Panel" },
  { match: /shifter/i, type: "Shifter" },
  { match: /wheel/i, type: "Wheel" },
  { match: /pcm|ecm|engine\s*control|engine\s*computer/i, type: "Engine Computer (PCM/ECM)" },
  { match: /tcm|transmission\s*control/i, type: "Transmission Control Module" },
];

export function classifyPartType(text: string): string {
  for (const k of PART_TYPE_KEYWORDS) {
    if (k.match.test(text)) return k.type;
  }
  return "";
}

function cleanPhrase(s: string): string {
  return s.replace(/\s+/g, " ").replace(/^[,\-–—:;|/]+/, "").replace(/[,\-–—:;|/]+$/, "").trim();
}

/** Pull the most descriptive title-ish phrase near the part number. */
function extractPartName(text: string, num: string): string {
  const idx = text.toUpperCase().indexOf(num);
  if (idx < 0) return "";
  const window = text.slice(Math.max(0, idx - 160), Math.min(text.length, idx + 160));

  // Labeled description patterns ("Part Description | MODULE, Video Player")
  const labeled = window.match(
    /(?:part description|description|product name|title)\s*[:|]\s*([^|.;]{4,80})/i,
  );
  if (labeled) return cleanPhrase(labeled[1]);

  // "23228498 - Genuine GM Control Module Assembly" title pattern
  const dashTitle = window.match(
    new RegExp(`${escapeRegExp(num)}\\s*[-–—:|]\\s*([A-Za-z][A-Za-z0-9 ,&'()/-]{3,70})`, "i"),
  );
  if (dashTitle) return cleanPhrase(dashTitle[1].replace(/^(genuine|oem)\s+/i, ""));

  // eBay-style: "... HMI COMMUNICATION MODULE 2014-2018 GM 23228498"
  const before = text.slice(Math.max(0, idx - 140), idx);
  const words = cleanPhrase(before).split(" ").filter(Boolean);
  const tail = words.slice(-9).join(" ");
  if (tail.length >= 8) return tail;
  return "";
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Numbers this part replaces ("Replaces 23493425, 23431257"). */
function extractSupersededNumbers(text: string, num: string): string[] {
  const out: string[] = [];
  const patterns = [
    /replaces?\s*:?\s*([\d][\d,\s]{5,60})/gi,
    /supersedes?\s*:?\s*([\d][\d,\s]{5,60})/gi,
  ];
  for (const p of patterns) {
    let m: RegExpExecArray | null;
    while ((m = p.exec(text)) !== null) {
      const nums = m[1].match(/\b\d{5,11}\b/g) || [];
      for (const x of nums) {
        if (x !== num && !out.includes(x)) out.push(x);
      }
    }
  }
  return out.slice(0, 8);
}

/** Number that replaces this part ("replaced by 23512345"). */
function extractSupersededBy(text: string): string | null {
  const m = text.match(/replaced\s+by\s*:?\s*([A-Z0-9-]{5,20})/i);
  return m ? m[1].toUpperCase() : null;
}

function extractHollander(text: string): string | null {
  const m = text.match(/hollander\s*(?:#|no\.?|number)?\s*:?\s*([A-Z0-9-]{3,20})/i);
  return m ? m[1].toUpperCase() : null;
}

function extractInterchange(text: string, num: string): string[] {
  const out: string[] = [];
  const patterns = [
    /interchange\s*(?:numbers?|#)?\s*:?\s*([\w\d,\s-]{5,80})/gi,
    /(?:oem|oe)\s*(?:part\s*)?(?:numbers?|#)\s*:?\s*([\w\d,\s-]{5,80})/gi,
    /cross[\s-]?reference\s*:?\s*([\w\d,\s-]{5,80})/gi,
  ];
  for (const p of patterns) {
    let m: RegExpExecArray | null;
    while ((m = p.exec(text)) !== null) {
      const nums = m[1].match(/\b[A-Z0-9][A-Z0-9-]{4,19}\b/g) || [];
      for (const x of nums) {
        const up = x.toUpperCase();
        if (up !== num && !out.includes(up) && /[0-9]/.test(up)) out.push(up);
      }
    }
  }
  return out.slice(0, 8);
}

/** Likely vehicle applications ("fits 2015-2016 Chevrolet Tahoe", "for 2014-2018 GM ..."). */
function extractApplications(text: string): string[] {
  const out: string[] = [];
  const patterns = [
    /fits\s+([^.;]{6,120})/gi,
    /application[s]?\s*:\s*([^.;]{6,120})/gi,
    /for\s+((?:19|20)\d{2}\s*[-–]\s*(?:19|20)\d{2}\s+[^.;]{4,100})/gi,
    /((?:19|20)\d{2}\s*[-–]\s*(?:19|20)\d{2}\s+(?:GM|Chevrolet|GMC|Cadillac|Buick|Ford|Dodge|Ram|Jeep|Chrysler|Toyota|Honda|Nissan)[^.;]{0,80})/gi,
  ];
  for (const p of patterns) {
    let m: RegExpExecArray | null;
    while ((m = p.exec(text)) !== null) {
      const app = cleanPhrase(m[1]);
      if (app.length >= 6 && app.length <= 140 && !out.includes(app)) out.push(app);
      if (out.length >= 6) break;
    }
  }
  return out.slice(0, 6);
}

function extractManufacturerMentions(text: string): string[] {
  const out: string[] = [];
  const map: [RegExp, string][] = [
    [/\bgeneral motors\b|\bgenuine gm\b/i, "General Motors"],
    [/\bstellantis\b|\bmopar\b/i, "Stellantis (Mopar)"],
    [/\bford motor\b/i, "Ford Motor Company"],
    [/\btoyota\b/i, "Toyota"],
    [/\bhonda\b/i, "Honda"],
    [/\bnissan\b/i, "Nissan"],
    [/\bbmw\b/i, "BMW"],
  ];
  for (const [re, name] of map) {
    if (re.test(text) && !out.includes(name)) out.push(name);
  }
  return out;
}

/**
 * Extract everything identifiable about `num` from a source text blob.
 * Total: returns empty-ish structure when the number isn't present.
 */
export function extractIdentification(text: string, num: string): ExtractedIdentification {
  const n = normalizeOemNumber(num);
  const empty: ExtractedIdentification = {
    partName: "",
    partType: "",
    supersededNumbers: [],
    supersededBy: null,
    hollanderNumber: null,
    interchangeNumbers: [],
    applications: [],
    manufacturerMentions: [],
  };
  if (!n || !text || text.toUpperCase().indexOf(n) < 0) return empty;

  const partName = extractPartName(text, n);
  const contextWindow = (() => {
    const idx = text.toUpperCase().indexOf(n);
    return text.slice(Math.max(0, idx - 600), Math.min(text.length, idx + 600));
  })();

  return {
    partName,
    partType: classifyPartType(partName + " " + contextWindow),
    supersededNumbers: extractSupersededNumbers(text, n),
    supersededBy: extractSupersededBy(text),
    hollanderNumber: extractHollander(text),
    interchangeNumbers: extractInterchange(text, n),
    applications: extractApplications(text),
    manufacturerMentions: extractManufacturerMentions(text),
  };
}

export interface SourceIdentification {
  sourceName: string;
  sourceUrl: string;
  authoritative: boolean;
  id: ExtractedIdentification;
  snippet: string;
}

function isMeaningfulName(name: string): boolean {
  const t = name.trim();
  if (t.length < 4) return false;
  // Reject pure boilerplate
  if (/^(home|search|cart|menu|account|sign in)$/i.test(t)) return false;
  return true;
}

/**
 * Merge per-source identifications into one structured result.
 * - Distinct part names with real support => ambiguous => selectable options.
 * - Never throws; always returns a well-formed result.
 */
export function buildOemLookupResult(args: {
  oemNumber: string;
  manufacturerGuess: ManufacturerGuess;
  sourceIds: SourceIdentification[];
  degraded: string[];
  queryNotes?: string;
}): OemLookupResult {
  const num = normalizeOemNumber(args.oemNumber);
  const evidence: EvidenceItem[] = [];
  const degraded = [...args.degraded];

  const ev = (fact: string, value: string, s: SourceIdentification) => {
    evidence.push({
      fact,
      value,
      sourceName: s.sourceName,
      sourceUrl: s.sourceUrl,
      snippet: s.snippet.slice(0, 280),
    });
  };

  // Group sources by normalized part name to detect ambiguity.
  const byName = new Map<string, SourceIdentification[]>();
  for (const s of args.sourceIds) {
    if (!isMeaningfulName(s.id.partName)) continue;
    const key = s.id.partName.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    const list = byName.get(key) || [];
    list.push(s);
    byName.set(key, list);
  }

  const sortedNames = Array.from(byName.entries()).sort((a, b) => {
    const authA = a[1].some((s) => s.authoritative) ? 1 : 0;
    const authB = b[1].some((s) => s.authoritative) ? 1 : 0;
    if (authA !== authB) return authB - authA;
    return b[1].length - a[1].length;
  });

  // Ambiguous: 2+ distinct names each backed by 2+ sources (or 1 authoritative).
  const strongNames = sortedNames.filter(([, list]) =>
    list.length >= 2 || list.some((s) => s.authoritative),
  );

  if (strongNames.length >= 2) {
    const options: OemLookupOption[] = strongNames.slice(0, 5).map(([, list]) => {
      const first = list[0].id;
      for (const s of list) {
        ev("candidate part name", s.id.partName, s);
      }
      return {
        partName: list[0].id.partName,
        partType: first.partType,
        applications: Array.from(new Set(list.flatMap((s) => s.id.applications))).slice(0, 4),
        supportCount: list.length,
        sources: Array.from(new Set(list.map((s) => s.sourceName))),
      };
    });
    return {
      identified: false,
      manufacturer: args.manufacturerGuess.name,
      manufacturerCode: args.manufacturerGuess.code,
      oemNumber: num,
      partName: "",
      partType: "",
      supersededNumbers: [],
      supersededBy: null,
      hollanderNumber: null,
      interchangeNumbers: [],
      applications: [],
      confidence: "low",
      confidenceReason:
        "The number maps to multiple distinct parts across sources — select the option matching the physical part.",
      evidence,
      options,
      degraded,
      notes:
        `Ambiguous part number ${num}: ${strongNames.length} distinct identifications found. ` +
        "Pick the option that matches the physical part instead of guessing.",
    };
  }

  const top = sortedNames[0];
  const topList = top ? top[1] : [];
  const topId: ExtractedIdentification = topList[0]?.id || {
    partName: "",
    partType: "",
    supersededNumbers: [],
    supersededBy: null,
    hollanderNumber: null,
    interchangeNumbers: [],
    applications: [],
    manufacturerMentions: [],
  };

  // Merge facts across all sources (union, deduped).
  const mergeStr = (get: (id: ExtractedIdentification) => string): string => {
    for (const s of topList) {
      const v = get(s.id);
      if (v) return v;
    }
    for (const s of args.sourceIds) {
      const v = get(s.id);
      if (v) return v;
    }
    return "";
  };
  const mergeArr = (get: (id: ExtractedIdentification) => string[]): string[] => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const s of [...topList, ...args.sourceIds]) {
      for (const v of get(s.id)) {
        if (!seen.has(v)) {
          seen.add(v);
          out.push(v);
        }
      }
    }
    return out;
  };

  const partName = topId.partName || "";
  const partType = mergeStr((id) => id.partType);
  const supersededNumbers = mergeArr((id) => id.supersededNumbers);
  const supersededBy = mergeStr((id) => id.supersededBy || "");
  const hollanderNumber = mergeStr((id) => id.hollanderNumber || "");
  const interchangeNumbers = mergeArr((id) => id.interchangeNumbers);
  const applications = mergeArr((id) => id.applications);
  const manufacturerMentions = mergeArr((id) => id.manufacturerMentions);

  // Evidence per fact.
  for (const s of topList) {
    if (s.id.partName) ev("part name", s.id.partName, s);
    if (s.id.partType) ev("part type", s.id.partType, s);
  }
  for (const s of args.sourceIds) {
    for (const x of s.id.supersededNumbers) ev("replaces", x, s);
    if (s.id.supersededBy) ev("replaced by", s.id.supersededBy, s);
    if (s.id.hollanderNumber) ev("hollander", s.id.hollanderNumber, s);
    for (const x of s.id.interchangeNumbers.slice(0, 3)) ev("interchange", x, s);
    for (const x of s.id.applications.slice(0, 3)) ev("application", x, s);
    for (const x of s.id.manufacturerMentions) ev("manufacturer mention", x, s);
  }

  // Manufacturer: prefer catalog/authoritative + manufacturer mentions over the format guess.
  let manufacturer = args.manufacturerGuess.name;
  let manufacturerCode = args.manufacturerGuess.code;
  const mentionCounts = new Map<string, number>();
  for (const m of manufacturerMentions) mentionCounts.set(m, (mentionCounts.get(m) || 0) + 1);
  const topMention = Array.from(mentionCounts.entries()).sort((a, b) => b[1] - a[1])[0];
  if (topMention && (manufacturerCode === null || args.manufacturerGuess.confidence !== "high")) {
    manufacturer = topMention[0];
    const codeByName: Record<string, string> = {
      "General Motors": "GM",
      "Stellantis (Mopar)": "MOPAR",
      "Ford Motor Company": "FORD",
      Toyota: "TOYOTA",
      Honda: "HONDA",
      Nissan: "NISSAN",
      BMW: "BMW",
    };
    manufacturerCode = codeByName[topMention[0]] || manufacturerCode;
  }

  const hasAuthoritative = topList.some((s) => s.authoritative);
  const independentSources = new Set(topList.map((s) => s.sourceName)).size;

  let confidence: "high" | "medium" | "low" = "low";
  let confidenceReason = "";
  const identified = partName !== "" && isMeaningfulName(partName);

  if (!identified) {
    confidenceReason =
      args.sourceIds.length === 0
        ? "No source returned usable data for this number."
        : "Sources mention the number but no clear part name could be extracted.";
  } else if (hasAuthoritative) {
    confidence = "high";
    confidenceReason = `Authoritative catalog source confirms ${num} as "${partName}".`;
  } else if (independentSources >= 2) {
    confidence = "high";
    confidenceReason = `${independentSources} independent sources agree on "${partName}".`;
  } else if (independentSources === 1) {
    confidence = "medium";
    confidenceReason = `Single source (${topList[0].sourceName}) identifies ${num} as "${partName}" — cross-verification recommended.`;
  }

  if (degraded.length > 0 && confidence === "high") {
    confidenceReason += ` (${degraded.length} source(s) unavailable: ${degraded.join(", ")}.)`;
  }

  return {
    identified,
    manufacturer,
    manufacturerCode,
    oemNumber: num,
    partName,
    partType,
    supersededNumbers,
    supersededBy: supersededBy || null,
    hollanderNumber: hollanderNumber || null,
    interchangeNumbers,
    applications,
    confidence,
    confidenceReason,
    evidence,
    options: [],
    degraded,
    notes: args.queryNotes || "",
  };
}

/** Empty/degraded result — used when every source fails. Never throws. */
export function emptyResult(
  oemNumber: string,
  manufacturerGuess: ManufacturerGuess,
  degraded: string[],
  notes: string,
): OemLookupResult {
  return {
    identified: false,
    manufacturer: manufacturerGuess.name,
    manufacturerCode: manufacturerGuess.code,
    oemNumber: normalizeOemNumber(oemNumber),
    partName: "",
    partType: "",
    supersededNumbers: [],
    supersededBy: null,
    hollanderNumber: null,
    interchangeNumbers: [],
    applications: [],
    confidence: "low",
    confidenceReason: "No source returned usable data for this number.",
    evidence: [],
    options: [],
    degraded,
    notes,
  };
}
