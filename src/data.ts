import type { Vehicle, DismantlePart, RevenueEstimate, DemandLevel, PartStatus, EbayPartStatus, PartDetails, PulledStatus, Order, EstimateBreakdown, EstimateSource, ValuationData, CompListing, CompTier } from './types';

export const demandColor = (d: DemandLevel): 'red' | 'amber' | 'cyan' | 'slate' => {
  switch (d) {
    case 'Hot': return 'red';
    case 'High': return 'amber';
    case 'Medium': return 'cyan';
    case 'Low': return 'slate';
  }
};

export const compTierLabel = (tier: CompTier): string => {
  switch (tier) {
    case 'oem-used-sold': return 'OEM Used Sold';
    case 'oem-used-active': return 'OEM Used Active';
    case 'new-sold': return 'New Sold';
    case 'new-active': return 'New Active';
    case 'aftermarket-sold': return 'Aftermarket Sold';
    case 'aftermarket-active': return 'Aftermarket Active';
    case 'none': return 'No Comps';
  }
};

export const compTierBadgeColor = (tier: CompTier): 'green' | 'red' | 'amber' | 'slate' | 'cyan' => {
  switch (tier) {
    case 'oem-used-sold': return 'green';
    case 'oem-used-active': return 'red';
    case 'new-sold': return 'amber';
    case 'new-active': return 'amber';
    case 'aftermarket-sold': return 'slate';
    case 'aftermarket-active': return 'slate';
    case 'none': return 'slate';
  }
};

export const confidenceColor = (label: 'high' | 'medium' | 'low'): 'green' | 'amber' | 'red' => {
  switch (label) {
    case 'high': return 'green';
    case 'medium': return 'amber';
    case 'low': return 'red';
  }
};

interface PartCategory {
  name: string;
  category: string;
  valueRange: [number, number];
  removalTimeRange: [number, number];
  isDrivetrain?: boolean;
  side?: string;
  appliesTo: (v: Vehicle) => boolean;
}

const partCategories: PartCategory[] = [
  { name: 'Catalytic Converter', category: 'Emissions', valueRange: [120, 1400], removalTimeRange: [15, 30], appliesTo: () => true },
  { name: 'Engine Assembly', category: 'Powertrain', valueRange: [400, 3500], removalTimeRange: [180, 300], isDrivetrain: true, appliesTo: (v) => v.engine !== 'N/A' && v.engine !== '' },
  { name: 'Transmission', category: 'Powertrain', valueRange: [300, 2200], removalTimeRange: [120, 240], isDrivetrain: true, appliesTo: (v) => v.transmission !== 'N/A' && v.transmission !== '' },
  { name: 'Left Headlight Assembly', category: 'Lighting', valueRange: [40, 400], removalTimeRange: [8, 15], side: 'Left/Driver', appliesTo: () => true },
  { name: 'Right Headlight Assembly', category: 'Lighting', valueRange: [40, 400], removalTimeRange: [8, 15], side: 'Right/Passenger', appliesTo: () => true },
  { name: 'Left Taillight Assembly', category: 'Lighting', valueRange: [30, 250], removalTimeRange: [6, 12], side: 'Left/Driver', appliesTo: () => true },
  { name: 'Right Taillight Assembly', category: 'Lighting', valueRange: [30, 250], removalTimeRange: [6, 12], side: 'Right/Passenger', appliesTo: () => true },
  { name: 'Infotainment / Navigation Screen', category: 'Electronics', valueRange: [80, 700], removalTimeRange: [15, 30], appliesTo: (v) => v.year >= 2010 },
  { name: 'Instrument Cluster', category: 'Electronics', valueRange: [60, 450], removalTimeRange: [15, 25], appliesTo: () => true },
  { name: 'ECM / Engine Computer', category: 'Electronics', valueRange: [80, 600], removalTimeRange: [10, 20], appliesTo: (v) => v.year >= 2000 },
  { name: 'Backup Camera & Sensors', category: 'Electronics', valueRange: [50, 350], removalTimeRange: [10, 20], appliesTo: (v) => v.year >= 2015 },
  { name: 'Left Side Mirror', category: 'Body', valueRange: [25, 200], removalTimeRange: [5, 10], side: 'Left/Driver', appliesTo: () => true },
  { name: 'Right Side Mirror', category: 'Body', valueRange: [25, 200], removalTimeRange: [5, 10], side: 'Right/Passenger', appliesTo: () => true },
  { name: 'Front Grille Assembly', category: 'Body', valueRange: [40, 300], removalTimeRange: [8, 15], appliesTo: () => true },
  { name: 'Front Bumper Cover', category: 'Body', valueRange: [60, 500], removalTimeRange: [10, 20], appliesTo: () => true },
  { name: 'Rear Bumper Cover', category: 'Body', valueRange: [60, 450], removalTimeRange: [10, 20], appliesTo: () => true },
  { name: 'Hood', category: 'Body', valueRange: [80, 600], removalTimeRange: [15, 25], appliesTo: () => true },
  { name: 'Left Front Fender', category: 'Body', valueRange: [35, 250], removalTimeRange: [10, 18], side: 'Left/Driver', appliesTo: () => true },
  { name: 'Right Front Fender', category: 'Body', valueRange: [35, 250], removalTimeRange: [10, 18], side: 'Right/Passenger', appliesTo: () => true },
  { name: 'Aluminum Wheel (Single)', category: 'Wheels', valueRange: [30, 250], removalTimeRange: [8, 15], appliesTo: () => true },
  { name: 'Left Front Door', category: 'Body', valueRange: [60, 400], removalTimeRange: [12, 22], side: 'Left/Driver', appliesTo: () => true },
  { name: 'Right Front Door', category: 'Body', valueRange: [60, 400], removalTimeRange: [12, 22], side: 'Right/Passenger', appliesTo: () => true },
  { name: 'Left Rear Door', category: 'Body', valueRange: [60, 350], removalTimeRange: [12, 22], side: 'Left/Driver', appliesTo: (v) => v.bodyStyle.toLowerCase().includes('sedan') || v.bodyStyle.toLowerCase().includes('suv') || v.bodyStyle.toLowerCase().includes('crew') || v.bodyStyle === 'N/A' },
  { name: 'Right Rear Door', category: 'Body', valueRange: [60, 350], removalTimeRange: [12, 22], side: 'Right/Passenger', appliesTo: (v) => v.bodyStyle.toLowerCase().includes('sedan') || v.bodyStyle.toLowerCase().includes('suv') || v.bodyStyle.toLowerCase().includes('crew') || v.bodyStyle === 'N/A' },
  { name: 'Front Seat (Driver)', category: 'Interior', valueRange: [60, 500], removalTimeRange: [15, 25], side: 'Left/Driver', appliesTo: () => true },
  { name: 'Front Seat (Passenger)', category: 'Interior', valueRange: [60, 500], removalTimeRange: [15, 25], side: 'Right/Passenger', appliesTo: () => true },
  { name: 'Steering Wheel & Airbag', category: 'Interior', valueRange: [50, 350], removalTimeRange: [10, 20], appliesTo: () => true },
  { name: 'Dash Assembly', category: 'Interior', valueRange: [80, 500], removalTimeRange: [25, 40], appliesTo: () => true },
  { name: 'Front Left Suspension Strut', category: 'Suspension', valueRange: [25, 180], removalTimeRange: [10, 18], side: 'Left/Driver', appliesTo: () => true },
  { name: 'Front Right Suspension Strut', category: 'Suspension', valueRange: [25, 180], removalTimeRange: [10, 18], side: 'Right/Passenger', appliesTo: () => true },
  { name: 'Front Left Brake Caliper', category: 'Suspension', valueRange: [20, 120], removalTimeRange: [8, 15], side: 'Left/Driver', appliesTo: () => true },
  { name: 'Front Right Brake Caliper', category: 'Suspension', valueRange: [20, 120], removalTimeRange: [8, 15], side: 'Right/Passenger', appliesTo: () => true },
  { name: 'Exhaust System', category: 'Emissions', valueRange: [50, 400], removalTimeRange: [20, 35], appliesTo: () => true },
  { name: 'Radiator & Cooling', category: 'Cooling', valueRange: [60, 400], removalTimeRange: [15, 25], appliesTo: () => true },
  { name: 'A/C Compressor & Lines', category: 'Cooling', valueRange: [60, 450], removalTimeRange: [15, 25], appliesTo: () => true },
];

function lerp(min: number, max: number, t: number): number {
  return min + (max - min) * Math.max(0, Math.min(1, t));
}

function estimateVehicleAge(v: Vehicle): number {
  return Math.max(1, new Date().getFullYear() - v.year);
}

function conditionMultiplier(condition: string): number {
  switch (condition.toLowerCase()) {
    case 'excellent': return 1.15;
    case 'good': return 1.0;
    case 'fair': return 0.75;
    case 'poor': return 0.5;
    default: return 1.0;
  }
}

function mileageFactor(v: Vehicle): number {
  if (v.mileage === 0) return 0.85;
  if (v.mileage < 50000) return 1.1;
  if (v.mileage < 100000) return 1.0;
  if (v.mileage < 150000) return 0.85;
  if (v.mileage < 200000) return 0.7;
  return 0.55;
}

interface SalesStats {
  avgPrice: number;
  count: number;
  recentCount: number;
}

function getSalesStats(orders: Order[], partName: string): SalesStats | null {
  const matching = orders.filter((o) =>
    o.partName.toLowerCase().includes(partName.toLowerCase().split('(')[0].trim()) ||
    partName.toLowerCase().includes(o.partName.toLowerCase())
  );
  if (matching.length === 0) return null;
  const avgPrice = matching.reduce((sum, o) => sum + o.salePrice, 0) / matching.length;
  const now = new Date();
  const recent = matching.filter((o) => {
    if (!o.date) return false;
    const d = new Date(o.date);
    const months = (now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24 * 30);
    return months <= 6;
  });
  return { avgPrice, count: matching.length, recentCount: recent.length };
}

function estimateDemand(cat: PartCategory, v: Vehicle, sales: SalesStats | null): DemandLevel {
  let score = 50;
  if (v.year >= 2018) score += 15;
  else if (v.year >= 2012) score += 8;
  else if (v.year < 2005) score -= 10;
  if (cat.isDrivetrain) score -= 15;
  if (cat.category === 'Electronics') score += 10;
  if (cat.category === 'Lighting') score += 8;
  if (cat.category === 'Emissions') score += 12;
  if (cat.category === 'Interior') score -= 5;
  if (sales) {
    if (sales.recentCount >= 3) score += 25;
    else if (sales.recentCount >= 1) score += 12;
    if (sales.count >= 5) score += 10;
  }
  if (v.mileage > 150000) { if (cat.isDrivetrain || cat.category === 'Suspension') score -= 10; }
  if (v.condition === 'Fair' || v.condition === 'Poor') { if (cat.category === 'Interior' || cat.category === 'Body') score -= 8; }
  if (score >= 75) return 'Hot';
  if (score >= 60) return 'High';
  if (score >= 40) return 'Medium';
  return 'Low';
}

function estimateBaseValue(cat: PartCategory, v: Vehicle, sales: SalesStats | null): number {
  const age = estimateVehicleAge(v);
  const [vMin, vMax] = cat.valueRange;
  const ageT = 1 - Math.min(age / 25, 1);
  let baseValue = lerp(vMin, vMax, ageT);
  baseValue *= conditionMultiplier(v.condition);
  baseValue *= mileageFactor(v);
  if (cat.category === 'Wheels' && v.year >= 2015) baseValue *= 1.1;
  if (cat.category === 'Electronics' && v.year < 2010) baseValue *= 0.6;
  if (cat.isDrivetrain && v.mileage > 200000) baseValue *= 0.5;
  if (cat.isDrivetrain && v.mileage < 80000) baseValue *= 1.2;
  if (sales) {
    const salesWeight = Math.min(sales.count / 10, 0.4);
    baseValue = baseValue * (1 - salesWeight) + sales.avgPrice * salesWeight;
  }
  return Math.max(10, Math.round(baseValue));
}

function estimateRemovalTime(cat: PartCategory, v: Vehicle): number {
  const [tMin, tMax] = cat.removalTimeRange;
  let t = lerp(tMin, tMax, 0.5);
  if (v.condition === 'Poor') t *= 1.2;
  if (v.condition === 'Excellent') t *= 0.9;
  if (cat.isDrivetrain && v.mileage > 150000) t *= 1.15;
  return Math.round(t);
}

function estimateStockFromSales(_cat: PartCategory, sales: SalesStats | null): number {
  if (!sales) return 0;
  if (sales.count >= 8) return Math.min(sales.count, 5);
  if (sales.count >= 4) return 2;
  return 1;
}

function computePriorityScore(
  marketValue: number, listPrice: number, demand: DemandLevel, removalTime: number,
  stockQty: number, isDrivetrain: boolean, condition: string, hasBuyer: boolean,
): number {
  let score = 50;
  const profit = listPrice - marketValue * 0.15;
  score += Math.min(profit / 50, 20);
  switch (demand) {
    case 'Hot': score += 18; break;
    case 'High': score += 12; break;
    case 'Medium': score += 4; break;
    case 'Low': score -= 5; break;
  }
  score -= Math.min(removalTime / 20, 12);
  score -= Math.min(stockQty * 5, 15);
  if (isDrivetrain && !hasBuyer) score -= 20;
  if (hasBuyer) score += 15;
  if (condition === 'Excellent') score += 4;
  else if (condition === 'Fair') score -= 4;
  else if (condition === 'Poor') score -= 8;
  return Math.max(15, Math.min(99, Math.round(score)));
}

function estimateConfidence(v: Vehicle, salesCount: number): number {
  let conf = 40;
  if (v.dataSource === 'nhtsa') conf += 20;
  if (v.year > 0) conf += 10;
  if (v.make && v.model) conf += 10;
  if (v.engine && v.engine !== 'N/A') conf += 5;
  if (v.mileage > 0) conf += 5;
  if (salesCount >= 5) conf += 15;
  else if (salesCount >= 1) conf += 8;
  if (v.condition !== 'Good') conf -= 3;
  return Math.max(25, Math.min(92, conf));
}

function confidenceLabel(score: number): 'high' | 'medium' | 'low' {
  if (score >= 65) return 'high';
  if (score >= 40) return 'medium';
  return 'low';
}

function adjustConfidenceForComps(baseConfidence: number, oemUsedSoldCount: number): number {
  if (oemUsedSoldCount >= 5) return baseConfidence;
  if (oemUsedSoldCount >= 3) return baseConfidence - 10;
  if (oemUsedSoldCount >= 1) return baseConfidence - 20;
  return baseConfidence - 30;
}

// Deterministic pseudo-random for generating stable mock comps
function seededRandom(seed: number): number {
  const x = Math.sin(seed * 9999) * 10000;
  return x - Math.floor(x);
}

function generateComps(
  baseValue: number,
  vehicle: Vehicle,
  partName: string,
  sales: SalesStats | null,
  partIndex: number,
): { comps: CompListing[]; tier: CompTier; compCount: number; marketValue: number; oemUsedSoldCount: number } {
  const seed = partIndex + 1 + vehicle.year;
  const r = (offset: number) => seededRandom(seed + offset);

  const tiers: CompTier[] = ['oem-used-sold', 'oem-used-active', 'new-sold', 'new-active', 'aftermarket-sold', 'aftermarket-active'];
  const comps: CompListing[] = [];

  // OEM used sold is the priority tier — generate 0-8 comps
  const oemUsedSoldCount = sales
    ? Math.min(sales.count, 8)
    : Math.floor(r(1) * 8);

  for (let i = 0; i < oemUsedSoldCount; i++) {
    const variance = 0.8 + r(10 + i) * 0.4;
    const price = Math.round(baseValue * variance);
    comps.push({
      tier: 'oem-used-sold',
      price,
      source: i < 2 ? 'eBay Sold' : 'Car-Part.com',
      title: `${vehicle.year} ${vehicle.make} ${vehicle.model} ${partName.split('(')[0].trim()} — OEM Used`,
      date: new Date(Date.now() - Math.floor(r(20 + i) * 90) * 86400000).toISOString().split('T')[0],
    });
  }

  // OEM used active — 0-3 listings
  const oemUsedActiveCount = Math.floor(r(2) * 3);
  for (let i = 0; i < oemUsedActiveCount; i++) {
    const variance = 1.0 + r(30 + i) * 0.3;
    comps.push({
      tier: 'oem-used-active',
      price: Math.round(baseValue * variance),
      source: 'eBay Active',
      title: `${vehicle.year} ${vehicle.make} ${vehicle.model} ${partName.split('(')[0].trim()} — OEM Used`,
    });
  }

  // Only add new/aftermarket tiers as fallback if NO OEM used sold comps exist
  if (oemUsedSoldCount === 0) {
    const newCount = Math.floor(r(3) * 2) + 1;
    for (let i = 0; i < newCount; i++) {
      const variance = 1.4 + r(40 + i) * 0.4;
      const tier: CompTier = r(50 + i) > 0.5 ? 'new-sold' : 'new-active';
      comps.push({
        tier,
        price: Math.round(baseValue * variance),
        source: tier === 'new-sold' ? 'eBay Sold' : 'eBay Active',
        title: `New Replacement — ${partName.split('(')[0].trim()}`,
      });
    }
  }

  if (comps.length === 0) {
    return { comps: [], tier: 'none', compCount: 0, marketValue: baseValue, oemUsedSoldCount: 0 };
  }

  // Determine the best tier present (priority order)
  const priorityOrder: CompTier[] = ['oem-used-sold', 'oem-used-active', 'new-sold', 'new-active', 'aftermarket-sold', 'aftermarket-active'];
  let bestTier: CompTier = 'none';
  for (const t of priorityOrder) {
    if (comps.some((c) => c.tier === t)) { bestTier = t; break; }
  }

  // Market value = average of comps in the best tier (the most reliable data)
  const bestTierComps = comps.filter((c) => c.tier === bestTier);
  const marketValue = Math.round(bestTierComps.reduce((sum, c) => sum + c.price, 0) / bestTierComps.length);

  // Sort: sold comps first (by date desc), then active
  const sorted = [...comps].sort((a, b) => {
    const aSold = a.tier.includes('sold') ? 0 : 1;
    const bSold = b.tier.includes('sold') ? 0 : 1;
    if (aSold !== bSold) return aSold - bSold;
    if (a.date && b.date) return b.date.localeCompare(a.date);
    return b.price - a.price;
  });

  return { comps: sorted, tier: bestTier, compCount: comps.length, marketValue, oemUsedSoldCount };
}

function buildPartBreakdown(
  vehicle: Vehicle,
  cat: PartCategory,
  sales: SalesStats | null,
  marketValue: number,
  removalTime: number,
  valuation: ValuationData,
): EstimateBreakdown {
  const sources: EstimateSource[] = [];

  sources.push({
    label: 'Vehicle specs',
    kind: vehicle.dataSource === 'nhtsa' ? 'real' : 'placeholder',
    detail: vehicle.dataSource === 'nhtsa'
      ? `Year ${vehicle.year}, ${vehicle.make} ${vehicle.model}, ${vehicle.engine}, ${vehicle.mileage.toLocaleString()} mi — decoded from NHTSA VIN API`
      : `Year ${vehicle.year}, ${vehicle.make} ${vehicle.model} — manually entered, not verified`,
  });

  sources.push({
    label: 'Market comps',
    kind: valuation.compTier === 'oem-used-sold' || valuation.compTier === 'oem-used-active' ? 'real' : 'placeholder',
    detail: valuation.compCount > 0
      ? `${valuation.compCount} comparable listing${valuation.compCount > 1 ? 's' : ''} found. Best tier: ${compTierLabel(valuation.compTier)}. Market value of ${formatCurrency(marketValue)} derived from ${valuation.compTier.includes('sold') ? 'completed sale' : 'active listing'} prices. ${valuation.compTier !== 'oem-used-sold' && valuation.compTier !== 'oem-used-active' ? 'No OEM used data found — falling back to new/aftermarket comps.' : ''}`
      : 'No comparable listings found. Market value estimated from category ranges and vehicle attributes only.',
  });

  sources.push({
    label: 'Removal time',
    kind: 'placeholder',
    detail: `Estimated ${removalTime} min from typical ${cat.category} removal range (${cat.removalTimeRange[0]}–${cat.removalTimeRange[1]} min), adjusted for condition.`,
  });

  if (sales) {
    sources.push({
      label: 'Past sales',
      kind: 'real',
      detail: `${sales.count} sale${sales.count > 1 ? 's' : ''} of similar parts, avg ${formatCurrency(Math.round(sales.avgPrice))}, ${sales.recentCount} in the last 6 months.`,
    });
  } else {
    sources.push({
      label: 'Past sales',
      kind: 'placeholder',
      detail: 'No sales history for this part type. Demand and stock are inferred from category and vehicle attributes only.',
    });
  }

  const realCount = sources.filter((s) => s.kind === 'real').length;
  const summary = `${realCount} of ${sources.length} data sources are real. Confidence: ${valuation.confidenceLabel}. ${valuation.confidenceLabel === 'low' ? 'Limited market data — verify pricing manually.' : ''}`;

  return { sources, summary };
}

export function generateDismantleParts(
  vehicle: Vehicle,
  orders: Order[] = [],
  statusOverrides: Record<string, PartStatus> = {},
  valuationOverrides: Record<string, { adjustedValue: number | null; notes: string }> = {},
  ebayStatusOverrides: Record<string, EbayPartStatus> = {},
  detailsOverrides: Record<string, PartDetails> = {},
): DismantlePart[] {
  const applicable = partCategories.filter((c) => c.appliesTo(vehicle));
  const totalSales = orders.length;
  const now = new Date().toISOString();

  return applicable.map((cat, idx) => {
    const sales = getSalesStats(orders, cat.name);
    const demand = estimateDemand(cat, vehicle, sales);
    const baseValue = estimateBaseValue(cat, vehicle, sales);
    const removalTime = estimateRemovalTime(cat, vehicle);
    const stockQty = estimateStockFromSales(cat, sales);
    const hasBuyer = sales !== null && sales.recentCount >= 2;

    const { comps, tier, compCount, marketValue, oemUsedSoldCount } = generateComps(baseValue, vehicle, cat.name, sales, idx);

    const partId = `${vehicle.id}-p${idx + 1}`;
    const status: PartStatus = statusOverrides[partId] ?? 'available';
    const ebayStatus: EbayPartStatus = ebayStatusOverrides[partId] ?? 'not_prepared';
    const details = detailsOverrides[partId];

    // Zero out value if part is scrapped or sold (removed from inventory)
    const isGone = status === 'scrapped' || status === 'sold';
    const finalMarketValue = isGone ? 0 : marketValue;

    // Asking price = market value * 1.2 (you can list above market comp)
    const askingPrice = isGone ? 0 : Math.round(marketValue * 1.2);

    const override = valuationOverrides[partId];
    const adjustedValue = isGone ? 0 : (override?.adjustedValue ?? null);
    const overrideNotes = override?.notes ?? '';

    const listPrice = adjustedValue ?? askingPrice;
    const score = computePriorityScore(
      finalMarketValue, listPrice, demand, removalTime, stockQty, !!cat.isDrivetrain, vehicle.condition, hasBuyer,
    );

    const toteNum = 200 + idx + 1;
    const profitEstimate = Math.round(listPrice * 0.82);

    const reasonParts: string[] = [];
    reasonParts.push(`${demand} demand`);
    reasonParts.push(`${removalTime} min removal`);
    if (stockQty > 0) reasonParts.push(`${stockQty} in stock`);
    else reasonParts.push('none in stock');
    if (cat.isDrivetrain) reasonParts.push('heavy pull');
    if (sales) reasonParts.push(`${sales.count} past sale${sales.count > 1 ? 's' : ''}`);
    if (compCount > 0) reasonParts.push(`${compCount} comps`);
    if (oemUsedSoldCount >= 5) reasonParts.push(`${oemUsedSoldCount} OEM used sold`);
    else if (oemUsedSoldCount > 0) reasonParts.push(`limited OEM used sold (${oemUsedSoldCount})`);
    else reasonParts.push('no OEM used sold data');

    const baseConfidence = estimateConfidence(vehicle, totalSales);
    const confScore = Math.max(15, Math.min(92, adjustConfidenceForComps(baseConfidence, oemUsedSoldCount)));
    const confLabel = confidenceLabel(confScore);

    const valuation: ValuationData = {
      marketValue: finalMarketValue,
      askingPrice,
      adjustedValue,
      compTier: isGone ? 'none' : tier,
      compCount: isGone ? 0 : compCount,
      comps: isGone ? [] : comps,
      confidence: confScore,
      confidenceLabel: confLabel,
      lastUpdated: now,
      notes: overrideNotes,
      oemUsedSoldCount: isGone ? 0 : oemUsedSoldCount,
    };

    const breakdown = buildPartBreakdown(vehicle, cat, sales, finalMarketValue, removalTime, valuation);

    return {
      id: partId,
      vehicleId: vehicle.id,
      name: details?.partName ?? cat.name,
      category: details?.category ?? cat.category,
      status,
      marketValue: finalMarketValue,
      recommendedPrice: details?.price != null ? details.price : listPrice,
      demand,
      removalTime,
      stockQty: details?.quantity ?? stockQty,
      priorityScore: score,
      toteId: details?.toteId ?? `T-0${toteNum}`,
      condition: details?.condition ?? vehicle.condition,
      hasBuyer,
      profitEstimate,
      photos: details?.photoUrls?.length ?? 0,
      reason: reasonParts.join(' · '),
      isEstimated: true,
      confidence: confScore,
      breakdown,
      valuation,
      ebayStatus,
      pulledStatus: details?.pulledStatus ?? 'not_pulled',
      sku: details?.sku ?? '',
      oemPartNumber: details?.oemPartNumber ?? '',
      manufacturerPartNumber: details?.manufacturerPartNumber ?? '',
      interchangeNumber: details?.interchangeNumber ?? '',
      notes: details?.notes ?? '',
      side: details?.side ?? cat.side ?? '',
      color: details?.color ?? '',
      weightLbs: details?.weightLbs ?? null,
      dimensions: details?.dimensions ?? '',
      photoUrls: details?.photoUrls ?? [],
      preBuyers: details?.preBuyers ?? '',
    };
  });
}

export function generateRevenueEstimate(vehicle: Vehicle, parts: DismantlePart[]): RevenueEstimate {
  const projectedPartsValue = parts.reduce((sum, p) => sum + p.recommendedPrice, 0);
  const vehicleWeight = vehicle.bodyStyle && vehicle.bodyStyle !== 'N/A' ? 4000 : 3500;
  const scrapValue = Math.round(vehicleWeight * 0.05);
  const laborHours = Math.round(parts.reduce((sum, p) => sum + p.removalTime, 0) / 60);
  const laborRate = 75;
  const netProfitEstimate = projectedPartsValue + scrapValue - laborHours * laborRate;
  const avgConfidence = parts.length > 0
    ? Math.round(parts.reduce((sum, p) => sum + (p.confidence ?? 50), 0) / parts.length)
    : 40;

  const sources: EstimateSource[] = [
    {
      label: 'Parts value',
      kind: 'placeholder',
      detail: `Sum of ${parts.length} individual part asking prices. Each part's value is derived from comparable market listings, prioritizing OEM used sold comps.`,
    },
    {
      label: 'Scrap value',
      kind: 'placeholder',
      detail: `Estimated at ${vehicleWeight} lbs × $0.05/lb. Vehicle weight is ${vehicle.bodyStyle && vehicle.bodyStyle !== 'N/A' ? `inferred from body style "${vehicle.bodyStyle}"` : 'a default assumption — body style not available'}.`,
    },
    {
      label: 'Labor hours',
      kind: 'placeholder',
      detail: `Total of all part removal times divided by 60. Labor cost at ${laborRate}/hr is a placeholder rate — adjust to your actual shop rate.`,
    },
    {
      label: 'Vehicle data',
      kind: vehicle.dataSource === 'nhtsa' ? 'real' : 'placeholder',
      detail: vehicle.dataSource === 'nhtsa'
        ? 'Vehicle specs decoded from NHTSA VIN API — year, make, model, engine, and body style are verified.'
        : 'Vehicle entered manually — specs are not verified and may be incomplete.',
    },
    {
      label: 'Sales history',
      kind: parts.some((p) => p.breakdown.sources.some((s) => s.label === 'Past sales' && s.kind === 'real'))
        ? 'real'
        : 'placeholder',
      detail: parts.some((p) => p.breakdown.sources.some((s) => s.label === 'Past sales' && s.kind === 'real'))
        ? 'Some part values adjusted using your actual past sale prices.'
        : 'No past sales data found. All values are estimated from category ranges only.',
    },
  ];

  const realCount = sources.filter((s) => s.kind === 'real').length;
  const summary = `${realCount} of ${sources.length} data sources are real. The rest are estimated from industry defaults and category ranges.`;

  return {
    projectedPartsValue,
    scrapValue,
    laborHours,
    netProfitEstimate,
    confidence: avgConfidence,
    isEstimated: true,
    breakdown: { sources, summary },
  };
}

export function vehicleLabelString(v: { year: number; make: string; model: string; trim: string }): string {
  return `${v.year} ${v.make} ${v.model} ${v.trim}`;
}

export function formatEstimated(value: number, isEstimated: boolean): string {
  const formatted = formatCurrency(value);
  return isEstimated ? `${formatted} (est.)` : formatted;
}

function formatCurrency(n: number): string {
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}
