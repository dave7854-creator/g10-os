const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface SuggestedPart {
  description: string;
  part_number: string;
  estimated_cost: number;
  supplier: string;
  is_taxable: boolean;
  core_charge: number;
}

interface SuggestRequest {
  vehicle: {
    year?: string;
    make?: string;
    model?: string;
    engine?: string;
    drivetrain?: string;
  };
  repairType: string;
}

const PARTS_DATABASE: Record<string, { description: string; part_number: string; estimated_cost: number; supplier: string; core_charge: number; is_taxable: boolean }[]> = {
  brakes: [
    { description: "Front brake pads", part_number: "BP-FRT-001", estimated_cost: 45, supplier: "NAPA Auto Parts", core_charge: 0, is_taxable: true },
    { description: "Rear brake pads", part_number: "BP-RR-001", estimated_cost: 38, supplier: "NAPA Auto Parts", core_charge: 0, is_taxable: true },
    { description: "Front brake rotors (pair)", part_number: "ROT-FRT-002", estimated_cost: 72, supplier: "Advance Auto Parts", core_charge: 0, is_taxable: true },
    { description: "Rear brake rotors (pair)", part_number: "ROT-RR-002", estimated_cost: 65, supplier: "Advance Auto Parts", core_charge: 0, is_taxable: true },
    { description: "Brake fluid (1qt)", part_number: "BF-DOT4-1Q", estimated_cost: 12, supplier: "NAPA Auto Parts", core_charge: 0, is_taxable: true },
    { description: "Brake hardware kit (front)", part_number: "BHK-FRT-003", estimated_cost: 18, supplier: "NAPA Auto Parts", core_charge: 0, is_taxable: true },
    { description: "Brake caliper (front left)", part_number: "CAL-FL-004", estimated_cost: 55, supplier: "Advance Auto Parts", core_charge: 25, is_taxable: true },
    { description: "Brake caliper (front right)", part_number: "CAL-FR-004", estimated_cost: 55, supplier: "Advance Auto Parts", core_charge: 25, is_taxable: true },
  ],
  alternator: [
    { description: "Alternator", part_number: "ALT-001", estimated_cost: 145, supplier: "NAPA Auto Parts", core_charge: 40, is_taxable: true },
    { description: "Serpentine belt", part_number: "SB-001", estimated_cost: 22, supplier: "NAPA Auto Parts", core_charge: 0, is_taxable: true },
    { description: "Alternator connector pigtail", part_number: "ACP-001", estimated_cost: 8, supplier: "Advance Auto Parts", core_charge: 0, is_taxable: true },
  ],
  starter: [
    { description: "Starter motor", part_number: "STR-001", estimated_cost: 125, supplier: "NAPA Auto Parts", core_charge: 35, is_taxable: true },
    { description: "Starter solenoid", part_number: "SOL-001", estimated_cost: 28, supplier: "NAPA Auto Parts", core_charge: 0, is_taxable: true },
  ],
  "water pump": [
    { description: "Water pump", part_number: "WP-001", estimated_cost: 68, supplier: "NAPA Auto Parts", core_charge: 15, is_taxable: true },
    { description: "Thermostat", part_number: "THERM-001", estimated_cost: 18, supplier: "NAPA Auto Parts", core_charge: 0, is_taxable: true },
    { description: "Thermostat gasket", part_number: "TG-001", estimated_cost: 5, supplier: "NAPA Auto Parts", core_charge: 0, is_taxable: true },
    { description: "Coolant (1 gallon)", part_number: "COOL-5050-1G", estimated_cost: 16, supplier: "Advance Auto Parts", core_charge: 0, is_taxable: true },
    { description: "Radiator hose (upper)", part_number: "RH-UP-001", estimated_cost: 20, supplier: "NAPA Auto Parts", core_charge: 0, is_taxable: true },
    { description: "Radiator hose (lower)", part_number: "RH-LO-001", estimated_cost: 20, supplier: "NAPA Auto Parts", core_charge: 0, is_taxable: true },
  ],
  "wheel bearing": [
    { description: "Front wheel bearing hub assembly (left)", part_number: "WB-FL-001", estimated_cost: 85, supplier: "Advance Auto Parts", core_charge: 0, is_taxable: true },
    { description: "Front wheel bearing hub assembly (right)", part_number: "WB-FR-001", estimated_cost: 85, supplier: "Advance Auto Parts", core_charge: 0, is_taxable: true },
    { description: "Wheel seal (front)", part_number: "WS-FRT-001", estimated_cost: 12, supplier: "NAPA Auto Parts", core_charge: 0, is_taxable: true },
  ],
  radiator: [
    { description: "Radiator", part_number: "RAD-001", estimated_cost: 110, supplier: "NAPA Auto Parts", core_charge: 20, is_taxable: true },
    { description: "Radiator cap", part_number: "RC-001", estimated_cost: 8, supplier: "NAPA Auto Parts", core_charge: 0, is_taxable: true },
    { description: "Coolant (1 gallon)", part_number: "COOL-5050-1G", estimated_cost: 16, supplier: "Advance Auto Parts", core_charge: 0, is_taxable: true },
    { description: "Upper radiator hose", part_number: "RH-UP-001", estimated_cost: 20, supplier: "NAPA Auto Parts", core_charge: 0, is_taxable: true },
    { description: "Lower radiator hose", part_number: "RH-LO-001", estimated_cost: 20, supplier: "NAPA Auto Parts", core_charge: 0, is_taxable: true },
  ],
  transmission: [
    { description: "Transmission filter kit", part_number: "TFK-001", estimated_cost: 35, supplier: "NAPA Auto Parts", core_charge: 0, is_taxable: true },
    { description: "Transmission pan gasket", part_number: "TPG-001", estimated_cost: 12, supplier: "NAPA Auto Parts", core_charge: 0, is_taxable: true },
    { description: "ATF fluid (1 quart)", part_number: "ATF-1Q-001", estimated_cost: 8, supplier: "Advance Auto Parts", core_charge: 0, is_taxable: true },
    { description: "Transmission cooler lines", part_number: "TCL-001", estimated_cost: 45, supplier: "NAPA Auto Parts", core_charge: 0, is_taxable: true },
  ],
  engine: [
    { description: "Oil filter", part_number: "OF-001", estimated_cost: 8, supplier: "NAPA Auto Parts", core_charge: 0, is_taxable: true },
    { description: "Engine oil (5 quart)", part_number: "EO-5W30-5Q", estimated_cost: 28, supplier: "NAPA Auto Parts", core_charge: 0, is_taxable: true },
    { description: "Spark plugs (set of 4)", part_number: "SP-SET4-001", estimated_cost: 32, supplier: "Advance Auto Parts", core_charge: 0, is_taxable: true },
    { description: "Ignition coils (set of 4)", part_number: "IC-SET4-001", estimated_cost: 120, supplier: "NAPA Auto Parts", core_charge: 0, is_taxable: true },
    { description: "Air filter", part_number: "AF-001", estimated_cost: 18, supplier: "NAPA Auto Parts", core_charge: 0, is_taxable: true },
    { description: "Fuel filter", part_number: "FF-001", estimated_cost: 22, supplier: "Advance Auto Parts", core_charge: 0, is_taxable: true },
    { description: "PCV valve", part_number: "PCV-001", estimated_cost: 8, supplier: "NAPA Auto Parts", core_charge: 0, is_taxable: true },
  ],
  suspension: [
    { description: "Upper control arm (left)", part_number: "UCA-L-001", estimated_cost: 75, supplier: "Advance Auto Parts", core_charge: 0, is_taxable: true },
    { description: "Upper control arm (right)", part_number: "UCA-R-001", estimated_cost: 75, supplier: "Advance Auto Parts", core_charge: 0, is_taxable: true },
    { description: "Ball joint (lower left)", part_number: "BJ-LL-001", estimated_cost: 35, supplier: "NAPA Auto Parts", core_charge: 0, is_taxable: true },
    { description: "Ball joint (lower right)", part_number: "BJ-LR-001", estimated_cost: 35, supplier: "NAPA Auto Parts", core_charge: 0, is_taxable: true },
    { description: "Tie rod end (inner left)", part_number: "TRE-IL-001", estimated_cost: 28, supplier: "NAPA Auto Parts", core_charge: 0, is_taxable: true },
    { description: "Tie rod end (inner right)", part_number: "TRE-IR-001", estimated_cost: 28, supplier: "NAPA Auto Parts", core_charge: 0, is_taxable: true },
    { description: "Sway bar link (left)", part_number: "SBL-L-001", estimated_cost: 22, supplier: "NAPA Auto Parts", core_charge: 0, is_taxable: true },
    { description: "Sway bar link (right)", part_number: "SBL-R-001", estimated_cost: 22, supplier: "NAPA Auto Parts", core_charge: 0, is_taxable: true },
  ],
  "ball joint": [
    { description: "Ball joint (lower left)", part_number: "BJ-LL-001", estimated_cost: 35, supplier: "NAPA Auto Parts", core_charge: 0, is_taxable: true },
    { description: "Ball joint (lower right)", part_number: "BJ-LR-001", estimated_cost: 35, supplier: "NAPA Auto Parts", core_charge: 0, is_taxable: true },
    { description: "Control arm bushing kit", part_number: "CABK-001", estimated_cost: 25, supplier: "NAPA Auto Parts", core_charge: 0, is_taxable: true },
  ],
  "oil change": [
    { description: "Oil filter", part_number: "OF-001", estimated_cost: 8, supplier: "NAPA Auto Parts", core_charge: 0, is_taxable: true },
    { description: "Engine oil (5 quart)", part_number: "EO-5W30-5Q", estimated_cost: 28, supplier: "NAPA Auto Parts", core_charge: 0, is_taxable: true },
    { description: "Drain plug washer", part_number: "DPW-001", estimated_cost: 2, supplier: "NAPA Auto Parts", core_charge: 0, is_taxable: true },
  ],
  "tune up": [
    { description: "Spark plugs (set of 4)", part_number: "SP-SET4-001", estimated_cost: 32, supplier: "Advance Auto Parts", core_charge: 0, is_taxable: true },
    { description: "Ignition coils (set of 4)", part_number: "IC-SET4-001", estimated_cost: 120, supplier: "NAPA Auto Parts", core_charge: 0, is_taxable: true },
    { description: "Air filter", part_number: "AF-001", estimated_cost: 18, supplier: "NAPA Auto Parts", core_charge: 0, is_taxable: true },
    { description: "Fuel filter", part_number: "FF-001", estimated_cost: 22, supplier: "Advance Auto Parts", core_charge: 0, is_taxable: true },
    { description: "PCV valve", part_number: "PCV-001", estimated_cost: 8, supplier: "NAPA Auto Parts", core_charge: 0, is_taxable: true },
  ],
  timing: [
    { description: "Timing belt", part_number: "TB-001", estimated_cost: 45, supplier: "NAPA Auto Parts", core_charge: 0, is_taxable: true },
    { description: "Timing belt tensioner", part_number: "TBT-001", estimated_cost: 65, supplier: "NAPA Auto Parts", core_charge: 0, is_taxable: true },
    { description: "Water pump", part_number: "WP-001", estimated_cost: 68, supplier: "NAPA Auto Parts", core_charge: 15, is_taxable: true },
    { description: "Thermostat", part_number: "THERM-001", estimated_cost: 18, supplier: "NAPA Auto Parts", core_charge: 0, is_taxable: true },
    { description: "Coolant (1 gallon)", part_number: "COOL-5050-1G", estimated_cost: 16, supplier: "Advance Auto Parts", core_charge: 0, is_taxable: true },
  ],
  exhaust: [
    { description: "Catalytic converter", part_number: "CC-001", estimated_cost: 185, supplier: "NAPA Auto Parts", core_charge: 0, is_taxable: true },
    { description: "Exhaust manifold gasket", part_number: "EMG-001", estimated_cost: 15, supplier: "NAPA Auto Parts", core_charge: 0, is_taxable: true },
    { description: "O2 sensor (upstream)", part_number: "O2S-UP-001", estimated_cost: 45, supplier: "Advance Auto Parts", core_charge: 0, is_taxable: true },
    { description: "O2 sensor (downstream)", part_number: "O2S-DN-001", estimated_cost: 45, supplier: "Advance Auto Parts", core_charge: 0, is_taxable: true },
  ],
  "fuel pump": [
    { description: "Fuel pump", part_number: "FP-001", estimated_cost: 85, supplier: "NAPA Auto Parts", core_charge: 0, is_taxable: true },
    { description: "Fuel filter", part_number: "FF-001", estimated_cost: 22, supplier: "Advance Auto Parts", core_charge: 0, is_taxable: true },
    { description: "Fuel pump relay", part_number: "FPR-001", estimated_cost: 15, supplier: "NAPA Auto Parts", core_charge: 0, is_taxable: true },
  ],
  default: [
    { description: "Gasket set", part_number: "GS-001", estimated_cost: 25, supplier: "NAPA Auto Parts", core_charge: 0, is_taxable: true },
    { description: "Bolt/nut assortment", part_number: "BNA-001", estimated_cost: 8, supplier: "NAPA Auto Parts", core_charge: 0, is_taxable: true },
    { description: "Shop supplies (fluids, cleaners)", part_number: "SUP-001", estimated_cost: 15, supplier: "NAPA Auto Parts", core_charge: 0, is_taxable: true },
  ],
};

function findParts(repairType: string): typeof PARTS_DATABASE.brakes {
  const lower = repairType.toLowerCase();
  for (const key of Object.keys(PARTS_DATABASE)) {
    if (key !== "default" && lower.includes(key)) {
      return PARTS_DATABASE[key];
    }
  }
  return PARTS_DATABASE.default;
}

function adjustForVehicle(parts: typeof PARTS_DATABASE.brakes, vehicle: SuggestRequest["vehicle"]): SuggestedPart[] {
  const yearNum = parseInt(vehicle.year ?? "0");
  const isOlder = yearNum > 0 && yearNum < 2010;
  const isTruck = vehicle.body_style?.toLowerCase().includes("truck") || vehicle.model?.toLowerCase().includes("truck");

  return parts.map((p) => {
    let cost = p.estimated_cost;
    if (isTruck) cost = Math.round(cost * 1.15);
    if (isOlder) cost = Math.round(cost * 0.9);

    return {
      description: p.description,
      part_number: p.part_number,
      estimated_cost: cost,
      supplier: p.supplier,
      is_taxable: p.is_taxable,
      core_charge: p.core_charge,
    };
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { vehicle, repairType } = (await req.json()) as SuggestRequest;
    if (!repairType) {
      return new Response(
        JSON.stringify({ error: "Repair type is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const baseParts = findParts(repairType);
    const suggestions = adjustForVehicle(baseParts, vehicle);

    return new Response(
      JSON.stringify({
        suggestions,
        repairType,
        vehicle: `${vehicle.year ?? ""} ${vehicle.make ?? ""} ${vehicle.model ?? ""}`.trim(),
        source: "ai_estimate",
        confidence: "medium",
        message: "AI-suggested parts based on repair type and vehicle. Prices are estimates — verify with your supplier.",
        assumptions: [
          "Parts are commonly replaced for this repair type",
          "Prices are estimates and may vary by supplier and region",
          "Always verify compatibility with the specific vehicle",
        ],
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
