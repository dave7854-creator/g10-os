import type { Vehicle, PartResearchResult, SoldCompResponse, VehicleConfigOptions, OemLookupRequest, OemLookupResult } from '@/types';

function edgeUrl(slug: string): string {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  return `${url}/functions/v1/${slug}`;
}

function getAnonKey(): string {
  return import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';
}

async function callEdge<T>(slug: string, body: unknown): Promise<T> {
  const resp = await fetch(edgeUrl(slug), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${getAnonKey()}`,
    },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Edge function ${slug} failed: ${resp.status} ${text}`);
  }
  return await resp.json() as T;
}

export async function fetchVehicleConfig(vehicle: {
  vin?: string;
  year: number;
  make: string;
  model: string;
  trim?: string;
  engine?: string;
  bodyStyle?: string;
}): Promise<VehicleConfigOptions> {
  return callEdge('vehicle-config', vehicle);
}

export interface PartResearchPayload {
  vehicle: {
    year: number;
    make: string;
    model: string;
    trim: string;
    engine: string;
    transmission: string;
    driveType: string;
    bodyStyle: string;
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

export async function researchPart(payload: PartResearchPayload): Promise<PartResearchResult> {
  return callEdge('part-research', payload);
}

/**
 * Identify a part from its OEM/MPN number (reverse lookup).
 * Runs server-side: catalog sources first, then eBay Browse, then web fallback.
 */
export async function lookupOemNumber(payload: OemLookupRequest): Promise<OemLookupResult> {
  return callEdge('oem-lookup', payload);
}

export interface SoldCompPayload {
  oemPartNumber?: string;
  partName: string;
  vehicle: string;
  side?: string;
  isManual?: boolean;
  isAutomatic?: boolean;
}

export async function fetchSoldComps(payload: SoldCompPayload): Promise<SoldCompResponse> {
  return callEdge('source-parts', payload);
}

export function vehicleToResearchConfig(v: Vehicle): PartResearchPayload['vehicle'] {
  return {
    year: v.year,
    make: v.make,
    model: v.model,
    trim: v.trim,
    engine: v.engine,
    transmission: v.transmission,
    driveType: v.driveType,
    bodyStyle: v.bodyStyle,
    cabConfig: v.cabConfig,
    interiorColor: v.interiorColor,
    exteriorColor: v.exteriorColor,
    infotainmentSystem: v.infotainmentSystem,
    lightingOptions: v.lightingOptions,
    seatConfig: v.seatConfig,
    rpoCodes: v.rpoCodes,
    vin: v.vin,
  };
}
