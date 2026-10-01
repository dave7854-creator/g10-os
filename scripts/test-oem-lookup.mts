/**
 * OEM lookup logic test — runs with Node's native TS type-stripping, no build step.
 *
 *   node --experimental-strip-types scripts/test-oem-lookup.mts
 *
 * Fixtures are modeled on real-world sources (GMPartsGiant product page text for
 * 23228498, eBay Browse item titles) captured during research. The pure logic in
 * supabase/functions/oem-lookup/identify.ts must correctly identify the test case
 * 23228498 => GM HMI (infotainment) control module replacing 23493425, 23431257.
 */
import {
  buildOemLookupResult,
  catalogSearchTargets,
  detectManufacturer,
  emptyResult,
  extractIdentification,
  normalizeOemNumber,
  type SourceIdentification,
} from "../supabase/functions/oem-lookup/identify.ts";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(name: string, cond: boolean, detail = ""): void {
  if (cond) {
    passed++;
    console.log(`  PASS ${name}`);
  } else {
    failed++;
    failures.push(name);
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

// --- Fixture: GMPartsGiant-style catalog page text for 23228498 ---
const GM_FIXTURE = `
GMPartsGiant | GM Parts Giant
23228498 - Genuine GM Control Module Assembly
Part Description | MODULE, Video Player
Fits: 2015-2016 Chevrolet Colorado; 2015-2016 Chevrolet Corvette; 2014-2018 Chevrolet Impala;
2015-2016 Cadillac ATS; 2015-2016 Cadillac CTS; 2015-2016 Cadillac SRX; 2015-2016 GMC Yukon;
2016-2018 Buick Envision; 2015-2016 Buick Regal; 2015-2016 Cadillac Escalade ESV; 2015-2016 Chevrolet Suburban
Replaces: 23493425, 23431257
HMI Human Machine Interface Module, NG 2.0. This Genuine GM part is guaranteed by GM's factory warranty.
Also fits: 2014 Chevrolet Impala Limited; 2015 Chevrolet Colorado.
`;

// --- Fixture: eBay Browse titles mentioning 23228498 ---
const EBAY_FIXTURE = `
CORVETTE C7 IMPALA CADILLAC HMI COMMUNICATION MODULE 2014-2018 GM 23228498 [Used | eBay Motors > Parts & Accessories]
2015 GMC YUKON HMI CONTROL MODULE 23228498 [Used | eBay Motors > Parts & Accessories]
GM 23228498 HMI Module Radio Video Player Control Unit 2016 ATS [Refurbished | Consumer Electronics]
`;

function makeSource(
  name: string,
  text: string,
  num: string,
  authoritative: boolean,
): SourceIdentification {
  return {
    sourceName: name,
    sourceUrl: `https://example.com/${name}`,
    authoritative,
    id: extractIdentification(text, num),
    snippet: text.slice(0, 200),
  };
}

console.log("normalizeOemNumber");
check("trims and uppercases", normalizeOemNumber(" 23228498 ") === "23228498");
check("strips spaces inside", normalizeOemNumber("23 228 498") === "23228498");
check("keeps meaningful dashes", normalizeOemNumber("fl3z-9e926-a") === "FL3Z-9E926-A");

console.log("detectManufacturer");
check("23228498 -> GM", detectManufacturer("23228498").code === "GM");
check("GM guess is high confidence", detectManufacturer("23228498").confidence === "high");
check("68239946AA -> MOPAR", detectManufacturer("68239946AA").code === "MOPAR");
check("FL3Z-9E926-A -> FORD", detectManufacturer("FL3Z-9E926-A").code === "FORD");
check("90915-YZZD1 -> TOYOTA", detectManufacturer("90915-YZZD1").code === "TOYOTA");
check("33151-TBA-A00 -> HONDA", detectManufacturer("33151-TBA-A00").code === "HONDA");
check("empty -> null code", detectManufacturer("").code === null);
check("garbage -> null code", detectManufacturer("xyz").code === null);

console.log("catalogSearchTargets");
check("GM targets include gmpartsgiant", catalogSearchTargets("GM", "23228498").some((t) => t.name === "GMPartsGiant"));
check("unknown code falls back to 3 catalogs", catalogSearchTargets(null, "12345").length === 3);

console.log("extractIdentification (GM catalog fixture)");
const gmId = extractIdentification(GM_FIXTURE, "23228498");
check("part name extracted", gmId.partName.length > 5, `got "${gmId.partName}"`);
check(
  "part name mentions module/control module",
  /module/i.test(gmId.partName),
  `got "${gmId.partName}"`,
);
check(
  "part type is control-module-ish",
  /Module|Infotainment/i.test(gmId.partType),
  `got "${gmId.partType}"`,
);
check("superseded numbers include 23493425", gmId.supersededNumbers.includes("23493425"));
check("superseded numbers include 23431257", gmId.supersededNumbers.includes("23431257"));
check("applications found", gmId.applications.length > 0, `got ${gmId.applications.length}`);
check(
  "manufacturer mention GM",
  gmId.manufacturerMentions.includes("General Motors"),
  gmId.manufacturerMentions.join(","),
);

console.log("extractIdentification (eBay fixture)");
const ebayId = extractIdentification(EBAY_FIXTURE, "23228498");
check("eBay part name extracted", ebayId.partName.length > 5, `got "${ebayId.partName}"`);

console.log("extractIdentification edge cases");
const noHit = extractIdentification("nothing relevant here", "23228498");
check("missing number -> empty", noHit.partName === "" && noHit.applications.length === 0);
check("empty text -> no throw", extractIdentification("", "23228498").partName === "");

console.log("buildOemLookupResult (identified, authoritative)");
const sources = [
  makeSource("GMPartsGiant", GM_FIXTURE, "23228498", true),
  makeSource("eBay Browse", EBAY_FIXTURE, "23228498", false),
];
const result = buildOemLookupResult({
  oemNumber: "23228498",
  manufacturerGuess: detectManufacturer("23228498"),
  sourceIds: sources,
  degraded: ["web search provider not configured"],
});
check("identified is true", result.identified === true);
check("manufacturer is GM", result.manufacturerCode === "GM" || result.manufacturer === "General Motors");
check("confidence is high (authoritative catalog)", result.confidence === "high", `got ${result.confidence}`);
check("part name present", result.partName.length > 5, result.partName);
check("superseded numbers merged", result.supersededNumbers.includes("23493425"));
check("evidence rows exist", result.evidence.length > 0, `got ${result.evidence.length}`);
check("evidence cites GMPartsGiant", result.evidence.some((e) => e.sourceName === "GMPartsGiant"));
check("options empty when identified", result.options.length === 0);
check("degraded surfaced", result.degraded.length === 1);

console.log("buildOemLookupResult (ambiguous)");
const ambSources = [
  makeSource("CatalogA", "ABC123 - Genuine GM Headlamp Assembly\nReplaces: 11111111", "ABC123", true),
  makeSource("CatalogB", "ABC123 - Genuine Mopar Taillamp Assembly\nReplaces: 22222222", "ABC123", true),
];
const amb = buildOemLookupResult({
  oemNumber: "ABC123",
  manufacturerGuess: detectManufacturer("ABC123"),
  sourceIds: ambSources,
  degraded: [],
});
check("ambiguous -> identified false", amb.identified === false);
check("ambiguous -> 2 options", amb.options.length === 2, `got ${amb.options.length}`);
check("ambiguous -> low confidence", amb.confidence === "low");

console.log("emptyResult (no data)");
const empty = emptyResult("99999999", detectManufacturer("99999999"), ["catalog blocked"], "no data");
check("empty -> identified false", empty.identified === false);
check("empty -> degraded surfaced", empty.degraded.length === 1);
check("empty -> evidence empty", empty.evidence.length === 0);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log("Failed:", failures.join(", "));
  process.exit(1);
}
