const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface RepairRequest {
  query: string;
  vehicle: {
    year?: string | null;
    make?: string | null;
    model?: string | null;
    engine?: string | null;
    vin?: string | null;
    drivetrain?: string | null;
  };
  isDtc?: boolean;
  dtcCode?: string | null;
}

interface RepairStep {
  id: string;
  title: string;
  description: string;
  source: "oem_verified" | "ai_assistant" | "shop_knowledge" | "video_third_party";
  relatedProcedureIds?: string[];
  warnings?: string[];
}

interface RepairProcedure {
  id: string;
  title: string;
  source: "oem_verified" | "ai_assistant" | "shop_knowledge" | "video_third_party";
  isDtc?: boolean;
  dtcCode?: string;
  steps: RepairStep[];
  relatedProcedureIds: string[];
  partsNeeded: { description: string; partNumber?: string; source: string; category: string; isOneTimeUse?: boolean; isFluid?: boolean }[];
  toolsNeeded: { description: string; partNumber?: string; source: string; category: string; locationNote?: string }[];
  specs: { label: string; value: string; source: string; category: string }[];
  warnings: string[];
  programmingRelearn?: string;
  tsbs?: { title: string; number: string; source: string }[];
  videos: { videoId: string; url: string; title: string; channel: string; duration?: string; thumbnail: string; matchReason: string; isShopRecommended: boolean; source: string }[];
  shopKnowledge: never[];
  aiSummary?: string;
  aiChecklist?: { step: string; oemRefId?: string }[];
}

function generateId(prefix: string, n: number): string {
  return `${prefix}-${n}`;
}

// DTC definitions database (common codes)
const DTC_DATABASE: Record<string, { definition: string; category: string; severity: string }> = {
  P0087: { definition: "Fuel Rail/System Pressure - Too Low", category: "Fuel System", severity: "High" },
  P0171: { definition: "System Too Lean (Bank 1)", category: "Fuel/Air Mixture", severity: "Medium" },
  P0172: { definition: "System Too Rich (Bank 1)", category: "Fuel/Air Mixture", severity: "Medium" },
  P0300: { definition: "Random/Multiple Cylinder Misfire Detected", category: "Ignition", severity: "High" },
  P0301: { definition: "Cylinder 1 Misfire Detected", category: "Ignition", severity: "High" },
  P0302: { definition: "Cylinder 2 Misfire Detected", category: "Ignition", severity: "High" },
  P0303: { definition: "Cylinder 3 Misfire Detected", category: "Ignition", severity: "High" },
  P0304: { definition: "Cylinder 4 Misfire Detected", category: "Ignition", severity: "High" },
  P0420: { definition: "Catalyst System Efficiency Below Threshold (Bank 1)", category: "Emissions", severity: "Medium" },
  P0430: { definition: "Catalyst System Efficiency Below Threshold (Bank 2)", category: "Emissions", severity: "Medium" },
  P0442: { definition: "Evaporative Emission System Leak Detected (small leak)", category: "Emissions", severity: "Low" },
  P0455: { definition: "Evaporative Emission System Leak Detected (large leak)", category: "Emissions", severity: "Low" },
  P0500: { definition: "Vehicle Speed Sensor - Malfunction", category: "Speed Sensor", severity: "Medium" },
  P2096: { definition: "Post Catalyst Fuel Trim System Too Lean (Bank 1)", category: "Fuel/Air Mixture", severity: "Medium" },
  P2097: { definition: "Post Catalyst Fuel Trim System Too Rich (Bank 1)", category: "Fuel/Air Mixture", severity: "Medium" },
  P0128: { definition: "Coolant Thermostat (Coolant Temperature Below Thermostat Regulating Temperature)", category: "Cooling System", severity: "Low" },
  P0011: { definition: "Camshaft Position A - Timing Over-Advanced or System Performance (Bank 1)", category: "Engine Timing", severity: "Medium" },
  P0014: { definition: "Camshaft Position B - Timing Over-Advanced or System Performance (Bank 1)", category: "Engine Timing", severity: "Medium" },
};

function buildAiProcedure(query: string, vehicle: RepairRequest["vehicle"], isDtc: boolean, dtcCode: string | null): { mainProcedure: RepairProcedure; relatedProcedures: RepairProcedure[] } {
  const vehicleStr = [vehicle.year, vehicle.make, vehicle.model, vehicle.engine].filter(Boolean).join(" ");
  const queryLower = query.toLowerCase().trim();

  // DTC search
  if (isDtc && dtcCode) {
    const dtcInfo = DTC_DATABASE[dtcCode.toUpperCase()];
    const definition = dtcInfo?.definition ?? `${dtcCode} - Diagnostic Trouble Code`;
    const category = dtcInfo?.category ?? "Unknown System";

    const mainProc: RepairProcedure = {
      id: "dtc-main",
      title: `${dtcCode}: ${definition}`,
      source: "ai_assistant",
      isDtc: true,
      dtcCode: dtcCode.toUpperCase(),
      steps: [
        { id: "dtc-1", title: "Confirm the Code", description: `Connect a scan tool and verify ${dtcCode} is present. Check for pending or stored codes as well.`, source: "ai_assistant" },
        { id: "dtc-2", title: "Freeze Frame Data", description: "Review freeze frame data to understand the conditions when the code was set (engine temp, RPM, load, speed).", source: "ai_assistant" },
        { id: "dtc-3", title: "Visual Inspection", description: `Inspect ${category} components for obvious damage, loose connections, or leaks.`, source: "ai_assistant" },
        { id: "dtc-4", title: "Component Testing", description: `Test related ${category} components per manufacturer diagnostic procedure. Use a multimeter for electrical tests.`, source: "ai_assistant" },
        { id: "dtc-5", title: "Clear and Verify", description: "Clear the code, perform a road test under similar conditions to freeze frame data, and verify the code does not return.", source: "ai_assistant" },
      ],
      relatedProcedureIds: ["dtc-related-1", "dtc-related-2"],
      partsNeeded: [],
      toolsNeeded: [
        { description: "OBD-II Scan Tool", source: "ai_assistant", category: "standard_tool" },
        { description: "Digital Multimeter", source: "ai_assistant", category: "standard_tool" },
      ],
      specs: [],
      warnings: [
        "AI-generated diagnostic guidance. Follow OEM diagnostic procedure when available.",
        "Do not clear codes without addressing the root cause.",
      ],
      tsbs: [],
      videos: [],
      shopKnowledge: [],
      aiSummary: `${dtcCode} indicates a ${category} issue: ${definition}. This is an AI-generated overview to help guide diagnosis. Always consult OEM repair information for the definitive diagnostic procedure.`,
      aiChecklist: [
        { step: "Confirm code with scan tool", oemRefId: "dtc-1" },
        { step: "Review freeze frame data", oemRefId: "dtc-2" },
        { step: "Visual inspection of system", oemRefId: "dtc-3" },
        { step: "Component testing", oemRefId: "dtc-4" },
        { step: "Clear code and road test", oemRefId: "dtc-5" },
      ],
    };

    const relatedProcs: RepairProcedure[] = [
      {
        id: "dtc-related-1",
        title: `Component Testing - ${category}`,
        source: "ai_assistant",
        steps: [
          { id: "dtc-r1-1", title: "Locate Component", description: `Find the ${category} component using the vehicle's service manual or component location chart.`, source: "ai_assistant" },
          { id: "dtc-r1-2", title: "Electrical Test", description: "Check voltage, resistance, and continuity per specs.", source: "ai_assistant" },
        ],
        relatedProcedureIds: [],
        partsNeeded: [],
        toolsNeeded: [{ description: "Multimeter", source: "ai_assistant", category: "standard_tool" }],
        specs: [],
        warnings: ["AI-suggested procedure. Verify with OEM data."],
        tsbs: [],
        videos: [],
        shopKnowledge: [],
      },
      {
        id: "dtc-related-2",
        title: `Wiring Diagram - ${category}`,
        source: "ai_assistant",
        steps: [
          { id: "dtc-r2-1", title: "Access Wiring Diagram", description: `OEM wiring diagrams required for accurate diagnosis. Available through OEM service information.`, source: "ai_assistant" },
        ],
        relatedProcedureIds: [],
        partsNeeded: [],
        toolsNeeded: [],
        specs: [],
        warnings: ["Wiring diagrams must come from OEM source."],
        tsbs: [],
        videos: [],
        shopKnowledge: [],
      },
    ];

    return { mainProcedure: mainProc, relatedProcedures: relatedProcs };
  }

  // Repair-type search
  const mainProc: RepairProcedure = {
    id: "main-procedure",
    title: toTitleCase(query),
    source: "ai_assistant",
    steps: buildProcedureSteps(queryLower, vehicleStr),
    relatedProcedureIds: buildRelatedIds(queryLower),
    partsNeeded: buildParts(queryLower, "ai_assistant"),
    toolsNeeded: buildTools(queryLower),
    specs: [],
    warnings: buildWarnings(queryLower),
    programmingRelearn: buildRelearn(queryLower),
    tsbs: [],
    videos: [],
    shopKnowledge: [],
    aiSummary: `AI-generated repair overview for ${query} on a ${vehicleStr}. This information is provided by the AI Assistant and must be verified against OEM repair data before performing the repair.`,
    aiChecklist: buildChecklist(queryLower),
  };

  const relatedProcs = buildRelatedProcedures(queryLower, vehicleStr);

  return { mainProcedure: mainProc, relatedProcedures: relatedProcs };
}

function toTitleCase(s: string): string {
  return s.replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}

function buildProcedureSteps(query: string, _vehicle: string): RepairStep[] {
  if (query.includes("water pump")) {
    return [
      { id: "wp-1", title: "Drain Coolant", description: "Drain the cooling system into a suitable container. Dispose of coolant properly.", source: "ai_assistant", warnings: ["Engine must be cool before draining.", "Coolant is toxic — follow local disposal regulations."] },
      { id: "wp-2", title: "Remove Accessories", description: "Remove serpentine belt, fan shroud, and any components blocking access to the water pump.", source: "ai_assistant", relatedProcedureIds: ["related-belt"] },
      { id: "wp-3", title: "Remove Water Pump Bolts", description: "Remove water pump mounting bolts in the order specified by the OEM service manual. Note bolt locations as they may vary in length.", source: "ai_assistant" },
      { id: "wp-4", title: "Remove Old Water Pump", description: "Carefully remove the old water pump. Clean the mounting surface thoroughly.", source: "ai_assistant" },
      { id: "wp-5", title: "Install New Gasket and Pump", description: "Install new gasket (one-time-use part). Mount the new water pump and torque bolts to OEM specification in the specified sequence.", source: "ai_assistant" },
      { id: "wp-6", title: "Reinstall Accessories", description: "Reinstall all removed components in reverse order. Install new serpentine belt if damaged.", source: "ai_assistant", relatedProcedureIds: ["related-belt"] },
      { id: "wp-7", title: "Refill Coolant", description: "Refill with correct coolant type and capacity. Bleed air from the system per OEM procedure.", source: "ai_assistant", relatedProcedureIds: ["related-coolant"] },
      { id: "wp-8", title: "Test and Verify", description: "Start engine, check for leaks, verify proper operating temperature, and confirm no coolant leaks.", source: "ai_assistant" },
    ];
  }
  if (query.includes("wheel bearing") || query.includes("hub bearing")) {
    return [
      { id: "wb-1", title: "Raise and Support Vehicle", description: "Lift the vehicle safely and support on jack stands. Remove the wheel.", source: "ai_assistant", warnings: ["Use proper lifting equipment and jack stands."] },
      { id: "wb-2", title: "Remove Brake Caliper and Rotor", description: "Remove brake caliper (suspend with wire) and brake rotor.", source: "ai_assistant", relatedProcedureIds: ["related-brakes"] },
      { id: "wb-3", title: "Remove Axle Nut", description: "Remove the axle nut. May require an impact wrench or breaker bar.", source: "ai_assistant" },
      { id: "wb-4", title: "Remove Hub/Bearing Assembly", description: "Remove hub bearing mounting bolts. If pressed-in type, use a bearing press or puller.", source: "ai_assistant", warnings: ["Some bearings require a hydraulic press."] },
      { id: "wb-5", title: "Install New Bearing", description: "Install new hub/bearing assembly. Torque all bolts to OEM specification.", source: "ai_assistant" },
      { id: "wb-6", title: "Reinstall Components", description: "Reinstall axle nut (torque to spec), brake rotor, caliper, and wheel.", source: "ai_assistant" },
      { id: "wb-7", title: "Test Drive", description: "Road test to verify no noise or vibration. Check ABS function if equipped.", source: "ai_assistant" },
    ];
  }
  if (query.includes("transmission") && (query.includes("remove") || query.includes("replace"))) {
    return [
      { id: "trans-1", title: "Disconnect Battery", description: "Disconnect the negative battery terminal.", source: "ai_assistant" },
      { id: "trans-2", title: "Raise and Support Vehicle", description: "Lift vehicle and support securely on jack stands at a safe working height.", source: "ai_assistant", warnings: ["Transmissions are heavy. Use a transmission jack."] },
      { id: "trans-3", title: "Drain Transmission Fluid", description: "Drain transmission fluid into a container.", source: "ai_assistant" },
      { id: "trans-4", title: "Remove Driveshaft/Axles", description: "Remove driveshaft or half-shafts depending on configuration.", source: "ai_assistant" },
      { id: "trans-5", title: "Disconnect Wiring and Lines", description: "Disconnect all electrical connectors, shift linkage, cooler lines, and vacuum lines.", source: "ai_assistant" },
      { id: "trans-6", title: "Support Engine and Remove Crossmember", description: "Support the engine. Remove transmission crossmember and mount bolts.", source: "ai_assistant" },
      { id: "trans-7", title: "Remove Bellhousing Bolts", description: "Remove torque converter bolts (if automatic) and bellhousing bolts.", source: "ai_assistant" },
      { id: "trans-8", title: "Separate Transmission", description: "Carefully separate the transmission from the engine using a transmission jack.", source: "ai_assistant", warnings: ["Use a transmission jack rated for the weight."] },
    ];
  }

  // Generic procedure
  return [
    { id: "gen-1", title: "Prepare for Repair", description: `Gather tools and parts for ${query}. Review safety procedures.`, source: "ai_assistant" },
    { id: "gen-2", title: "Access the Component", description: "Remove any components blocking access to the repair area.", source: "ai_assistant" },
    { id: "gen-3", title: "Perform the Repair", description: `Perform the ${query} procedure following OEM specifications.`, source: "ai_assistant" },
    { id: "gen-4", title: "Reassemble and Test", description: "Reinstall all removed components. Test the repair to verify proper operation.", source: "ai_assistant" },
  ];
}

function buildRelatedIds(query: string): string[] {
  if (query.includes("water pump")) return ["related-belt", "related-coolant", "related-thermostat"];
  if (query.includes("wheel bearing")) return ["related-brakes", "related-axle"];
  if (query.includes("transmission")) return ["related-coolant", "related-axle"];
  return [];
}

function buildParts(query: string, source: string): RepairProcedure["partsNeeded"] {
  if (query.includes("water pump")) return [
    { description: "Water Pump", source, category: "oem_required" },
    { description: "Water Pump Gasket", source, category: "oem_required", isOneTimeUse: true },
    { description: "Coolant (correct type for vehicle)", source, category: "oem_required", isFluid: true },
    { description: "Serpentine Belt (if worn)", source, category: "ai_suggested" },
    { description: "Thermostat (recommended while servicing)", source, category: "ai_suggested" },
  ];
  if (query.includes("wheel bearing")) return [
    { description: "Wheel Hub/Bearing Assembly", source, category: "oem_required" },
    { description: "Axle Nut (one-time-use)", source, category: "oem_required", isOneTimeUse: true },
  ];
  if (query.includes("transmission")) return [
    { description: "Transmission Fluid (correct type)", source, category: "oem_required", isFluid: true },
    { description: "Transmission Filter/Gasket Kit (if equipped)", source, category: "oem_required" },
  ];
  return [];
}

function buildTools(query: string): RepairProcedure["toolsNeeded"] {
  if (query.includes("water pump")) return [
    { description: "Socket Set", source: "ai_assistant", category: "standard_tool" },
    { description: "Coolant Drain Pan", source: "ai_assistant", category: "standard_tool" },
    { description: "Torque Wrench", source: "ai_assistant", category: "standard_tool" },
    { description: "Serpentine Belt Tool", source: "ai_assistant", category: "ai_suggested" },
  ];
  if (query.includes("wheel bearing")) return [
    { description: "Socket Set", source: "ai_assistant", category: "standard_tool" },
    { description: "Axle Nut Socket (correct size)", source: "ai_assistant", category: "oem_special_tool" },
    { description: "Bearing Press or Slide Hammer", source: "ai_assistant", category: "oem_special_tool" },
    { description: "Torque Wrench", source: "ai_assistant", category: "standard_tool" },
  ];
  if (query.includes("transmission")) return [
    { description: "Transmission Jack", source: "ai_assistant", category: "oem_special_tool" },
    { description: "Socket Set (deep well)", source: "ai_assistant", category: "standard_tool" },
    { description: "Torque Wrench", source: "ai_assistant", category: "standard_tool" },
    { description: "Fluid Catch Pan", source: "ai_assistant", category: "standard_tool" },
  ];
  return [
    { description: "Standard Socket Set", source: "ai_assistant", category: "standard_tool" },
    { description: "Torque Wrench", source: "ai_assistant", category: "standard_tool" },
  ];
}

function buildWarnings(query: string): string[] {
  if (query.includes("water pump")) return [
    "Never open a hot cooling system — severe burn risk.",
    "Dispose of used coolant properly per local regulations.",
    "AI-generated warnings. Always follow OEM safety procedures.",
  ];
  if (query.includes("transmission")) return [
    "Transmissions are extremely heavy — always use a transmission jack.",
    "Support the engine before removing the transmission crossmember.",
    "AI-generated warnings. Always follow OEM safety procedures.",
  ];
  return [
    "AI-generated repair guidance. Verify all torque specs and procedures with OEM repair information.",
    "Ensure vehicle is safely supported before working underneath.",
  ];
}

function buildRelearn(query: string): string | undefined {
  if (query.includes("wheel bearing") || query.includes("hub bearing")) {
    return "Some vehicles may require ABS relearn or sensor calibration after wheel bearing replacement. Check OEM service information.";
  }
  return undefined;
}

function buildChecklist(query: string): { step: string; oemRefId?: string }[] {
  if (query.includes("water pump")) return [
    { step: "Drain coolant (engine cool)", oemRefId: "wp-1" },
    { step: "Remove belt and accessories", oemRefId: "wp-2" },
    { step: "Remove water pump bolts", oemRefId: "wp-3" },
    { step: "Remove old pump, clean surface", oemRefId: "wp-4" },
    { step: "Install new gasket and pump", oemRefId: "wp-5" },
    { step: "Reinstall accessories", oemRefId: "wp-6" },
    { step: "Refill coolant, bleed air", oemRefId: "wp-7" },
    { step: "Test for leaks", oemRefId: "wp-8" },
  ];
  if (query.includes("wheel bearing")) return [
    { step: "Raise vehicle, remove wheel", oemRefId: "wb-1" },
    { step: "Remove brake caliper and rotor", oemRefId: "wb-2" },
    { step: "Remove axle nut", oemRefId: "wb-3" },
    { step: "Remove hub/bearing", oemRefId: "wb-4" },
    { step: "Install new bearing", oemRefId: "wb-5" },
    { step: "Reinstall everything", oemRefId: "wb-6" },
    { step: "Test drive", oemRefId: "wb-7" },
  ];
  return [
    { step: "Prepare for repair" },
    { step: "Access the component" },
    { step: "Perform the repair" },
    { step: "Reassemble and test" },
  ];
}

function buildRelatedProcedures(query: string, vehicle: string): RepairProcedure[] {
  const procs: RepairProcedure[] = [];

  if (query.includes("water pump")) {
    procs.push({
      id: "related-belt",
      title: "Remove and Replace Serpentine Belt",
      source: "ai_assistant",
      steps: [
        { id: "belt-1", title: "Locate Belt Tensioner", description: `Find the belt tensioner on the ${vehicle}.`, source: "ai_assistant" },
        { id: "belt-2", title: "Release Tension", description: "Rotate the tensioner to release belt tension.", source: "ai_assistant" },
        { id: "belt-3", title: "Remove Belt", description: "Slide the belt off the pulleys. Note routing for reinstallation.", source: "ai_assistant" },
      ],
      relatedProcedureIds: [],
      partsNeeded: [{ description: "Serpentine Belt", source: "ai_assistant", category: "ai_suggested" }],
      toolsNeeded: [{ description: "Belt Tensioner Tool or Wrench", source: "ai_assistant", category: "standard_tool" }],
      specs: [],
      warnings: ["AI-suggested procedure. Verify belt routing with OEM diagram."],
      tsbs: [],
      videos: [],
      shopKnowledge: [],
    });
    procs.push({
      id: "related-coolant",
      title: "Coolant Drain and Refill / Bleed Air",
      source: "ai_assistant",
      steps: [
        { id: "cool-1", title: "Drain Coolant", description: "Open drain valve or remove lower radiator hose.", source: "ai_assistant" },
        { id: "cool-2", title: "Close Drain", description: "Close drain valve or reinstall hose.", source: "ai_assistant" },
        { id: "cool-3", title: "Refill Coolant", description: `Fill with correct coolant type for the ${vehicle}.`, source: "ai_assistant" },
        { id: "cool-4", title: "Bleed Air", description: "Follow OEM air-bleed procedure. Run engine to operating temperature with heater on.", source: "ai_assistant" },
      ],
      relatedProcedureIds: [],
      partsNeeded: [{ description: "Coolant (correct type)", source: "ai_assistant", category: "oem_required", isFluid: true }],
      toolsNeeded: [{ description: "Coolant Drain Pan", source: "ai_assistant", category: "standard_tool" }],
      specs: [],
      warnings: ["Never open hot cooling system.", "AI-suggested procedure. Verify coolant capacity with OEM specs."],
      tsbs: [],
      videos: [],
      shopKnowledge: [],
    });
  }

  if (query.includes("wheel bearing")) {
    procs.push({
      id: "related-brakes",
      title: "Remove Brake Caliper and Rotor",
      source: "ai_assistant",
      steps: [
        { id: "brk-1", title: "Remove Caliper Bolts", description: "Remove brake caliper mounting bolts.", source: "ai_assistant" },
        { id: "brk-2", title: "Suspend Caliper", description: "Suspend caliper with wire — never let it hang by the brake hose.", source: "ai_assistant" },
        { id: "brk-3", title: "Remove Rotor", description: "Remove brake rotor. May need to tap loose if rusted.", source: "ai_assistant" },
      ],
      relatedProcedureIds: [],
      partsNeeded: [],
      toolsNeeded: [{ description: "Socket Set", source: "ai_assistant", category: "standard_tool" }],
      specs: [],
      warnings: ["Never let caliper hang by brake hose.", "AI-suggested procedure."],
      tsbs: [],
      videos: [],
      shopKnowledge: [],
    });
  }

  return procs;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { query, vehicle, isDtc, dtcCode } = await req.json() as RepairRequest;

    if (!query) {
      return new Response(
        JSON.stringify({ error: "Repair query is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { mainProcedure, relatedProcedures } = buildAiProcedure(query, vehicle, isDtc ?? false, dtcCode ?? null);

    return new Response(
      JSON.stringify({
        mainProcedure,
        relatedProcedures,
        source: "ai_assistant",
        message: "AI-generated repair information. OEM data requires a licensed provider connection.",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
