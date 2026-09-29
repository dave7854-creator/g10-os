/*
 * Repair Information Provider Service
 *
 * Reusable service layer for OEM repair information, AI assistant,
 * shop knowledge, and third-party videos. Designed so a licensed OEM
 * provider (MOTOR, direct OEM data, etc.) can be connected later
 * without rewriting the UI or this service.
 *
 * NEVER represents AI-generated information as OEM VERIFIED.
 * NEVER fakes OEM data.
 */

import { supabase } from '@/supabaseClient';

// ===== TYPES =====

export interface RepairVehicle {
  vin: string | null;
  year: string | null;
  make: string | null;
  model: string | null;
  engine: string | null;
  trim?: string | null;
  drivetrain?: string | null;
}

export type InfoSource = 'oem_verified' | 'ai_assistant' | 'shop_knowledge' | 'video_third_party';

export interface RepairStep {
  id: string;
  title: string;
  description: string;
  source: InfoSource;
  oemReference?: string;
  warnings?: string[];
  torqueSpecs?: { fastener: string; value: string; source: InfoSource }[];
  relatedProcedureIds?: string[];
}

export interface RepairProcedure {
  id: string;
  title: string;
  source: InfoSource;
  isDtc?: boolean;
  dtcCode?: string;
  steps: RepairStep[];
  relatedProcedureIds: string[];
  partsNeeded: RepairPart[];
  toolsNeeded: RepairTool[];
  specs: RepairSpec[];
  warnings: string[];
  programmingRelearn?: string;
  tsbs?: { title: string; number: string; source: InfoSource }[];
  videos: RepairVideo[];
  shopKnowledge: ShopKnowledgeEntry[];
  aiSummary?: string;
  aiChecklist?: { step: string; oemRefId?: string }[];
}

export interface RepairPart {
  description: string;
  partNumber?: string;
  source: InfoSource;
  category: 'oem_required' | 'ai_suggested' | 'shop_recommended';
  isOneTimeUse?: boolean;
  isFluid?: boolean;
}

export interface RepairTool {
  description: string;
  partNumber?: string;
  source: InfoSource;
  category: 'oem_special_tool' | 'standard_tool' | 'ai_suggested' | 'shop_tool';
  locationNote?: string;
}

export interface RepairSpec {
  label: string;
  value: string;
  source: InfoSource;
  category: 'torque' | 'fluid' | 'measurement' | 'electrical' | 'programming' | 'safety';
}

export interface RepairVideo {
  videoId: string;
  url: string;
  title: string;
  channel: string;
  duration?: string;
  thumbnail: string;
  matchReason: string;
  isShopRecommended: boolean;
  source: InfoSource;
}

export interface ShopKnowledgeEntry {
  id: string;
  technicianNotes?: string;
  actualRepairTimeMinutes?: number;
  partsUsed?: string;
  problemsEncountered?: string;
  specialTools?: string;
  tips?: string;
  recommendedVideoUrl?: string;
  recommendedVideoTitle?: string;
  createdAt: string;
}

export interface RepairOverview {
  query: string;
  vehicle: RepairVehicle;
  isDtcSearch: boolean;
  dtcCode?: string;
  mainProcedure: RepairProcedure | null;
  relatedProcedures: RepairProcedure[];
  oemProviderConnected: boolean;
  shopKnowledge: ShopKnowledgeEntry[];
  recommendedVideos: RepairVideo[];
}

// ===== PROVIDER CONFIG =====

interface ProviderConfig {
  provider_name: string | null;
  is_active: boolean;
}

export async function getProviderConfig(): Promise<ProviderConfig> {
  const { data } = await supabase
    .from('shop_repair_provider_config')
    .select('provider_name, is_active')
    .eq('id', 1)
    .maybeSingle();
  return {
    provider_name: data?.provider_name ?? null,
    is_active: data?.is_active ?? false,
  };
}

// ===== VEHICLE HELPER =====

export function vehicleKey(v: RepairVehicle): string {
  return [v.year, v.make, v.model, v.engine].filter(Boolean).join('|');
}

export function vehicleLabel(v: RepairVehicle): string {
  return [v.year, v.make, v.model, v.engine].filter(Boolean).join(' ');
}

// ===== DTC DETECTION =====

export function isDtcQuery(query: string): boolean {
  return /^[PBCU]\d{4}$/i.test(query.trim());
}

export function extractDtc(query: string): string | null {
  const match = query.trim().toUpperCase().match(/^[PBCU]\d{4}$/);
  return match ? match[0] : null;
}

// ===== MAIN SEARCH FUNCTION =====

const REPAIR_INFO_API = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/repair-info`;

export async function searchRepairInfo(
  query: string,
  vehicle: RepairVehicle
): Promise<RepairOverview> {
  const config = await getProviderConfig();
  const vKey = vehicleKey(vehicle);
  const dtc = extractDtc(query);
  const isDtc = !!dtc;

  // Fetch shop knowledge for this repair + vehicle
  const { data: knowledgeData } = await supabase
    .from('shop_repair_knowledge')
    .select('*')
    .or(`repair_query.ilike.%${query}%,dtc_code.eq.${dtc ?? ''}`)
    .order('created_at', { ascending: false })
    .limit(10);

  const shopKnowledge: ShopKnowledgeEntry[] = (knowledgeData ?? []).map((k: Record<string, unknown>) => ({
    id: String(k.id),
    technicianNotes: k.technician_notes as string | undefined,
    actualRepairTimeMinutes: k.actual_repair_time_minutes as number | undefined,
    partsUsed: k.parts_used as string | undefined,
    problemsEncountered: k.problems_encountered as string | undefined,
    specialTools: k.special_tools as string | undefined,
    tips: k.tips as string | undefined,
    recommendedVideoUrl: k.recommended_video_url as string | undefined,
    recommendedVideoTitle: k.recommended_video_title as string | undefined,
    createdAt: k.created_at as string,
  }));

  // Fetch shop-recommended videos
  const { data: videoData } = await supabase
    .from('shop_repair_videos')
    .select('*')
    .or(`repair_query.ilike.%${query}%`)
    .order('is_shop_recommended', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(5);

  const shopVideos: RepairVideo[] = (videoData ?? []).map((v: Record<string, unknown>) => ({
    videoId: String(v.id),
    url: v.video_url as string,
    title: v.video_title as string,
    channel: v.channel_name as string | undefined ?? '',
    duration: v.duration as string | undefined,
    thumbnail: v.thumbnail_url as string | undefined ?? '',
    matchReason: v.match_reason as string | undefined ?? 'Shop recommended',
    isShopRecommended: v.is_shop_recommended as boolean | undefined ?? false,
    source: 'video_third_party' as InfoSource,
  }));

  // Call the repair-info edge function for AI assistant + video search
  let aiProcedure: RepairProcedure | null = null;
  let aiRelated: RepairProcedure[] = [];

  try {
    const resp = await fetch(REPAIR_INFO_API, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query,
        vehicle: {
          year: vehicle.year,
          make: vehicle.make,
          model: vehicle.model,
          engine: vehicle.engine,
          vin: vehicle.vin,
          drivetrain: vehicle.drivetrain,
        },
        isDtc,
        dtcCode: dtc,
      }),
    });

    if (resp.ok) {
      const result = await resp.json();
      if (result.mainProcedure) {
        aiProcedure = result.mainProcedure as RepairProcedure;
      }
      if (result.relatedProcedures) {
        aiRelated = result.relatedProcedures as RepairProcedure[];
      }
    }
  } catch {
    // Silent — AI not available, show what we have
  }

  // Merge shop-recommended videos into the procedure
  if (aiProcedure) {
    aiProcedure.videos = [...shopVideos, ...aiProcedure.videos];
    aiProcedure.shopKnowledge = shopKnowledge;
  }

  return {
    query,
    vehicle,
    isDtcSearch: isDtc,
    dtcCode: dtc ?? undefined,
    mainProcedure: aiProcedure,
    relatedProcedures: aiRelated,
    oemProviderConnected: config.is_active,
    shopKnowledge,
    recommendedVideos: shopVideos,
  };
}

// ===== SHOP KNOWLEDGE SAVE =====

export async function saveShopKnowledge(
  query: string,
  vehicle: RepairVehicle,
  entry: {
    technicianNotes?: string;
    actualRepairTimeMinutes?: number;
    partsUsed?: string;
    problemsEncountered?: string;
    specialTools?: string;
    tips?: string;
    recommendedVideoUrl?: string;
    recommendedVideoTitle?: string;
  }
): Promise<void> {
  await supabase.from('shop_repair_knowledge').insert({
    repair_query: query,
    vehicle_key: vehicleKey(vehicle),
    vin: vehicle.vin,
    year: vehicle.year,
    make: vehicle.make,
    model: vehicle.model,
    engine: vehicle.engine,
    technician_notes: entry.technicianNotes ?? null,
    actual_repair_time_minutes: entry.actualRepairTimeMinutes ?? null,
    parts_used: entry.partsUsed ?? null,
    problems_encountered: entry.problemsEncountered ?? null,
    special_tools: entry.specialTools ?? null,
    tips: entry.tips ?? null,
    recommended_video_url: entry.recommendedVideoUrl ?? null,
    recommended_video_title: entry.recommendedVideoTitle ?? null,
  });
}

// ===== VIDEO RECOMMENDATION TOGGLE =====

export async function toggleVideoRecommended(videoId: string, recommended: boolean): Promise<void> {
  await supabase
    .from('shop_repair_videos')
    .update({ is_shop_recommended: recommended })
    .eq('id', videoId);
}

export async function saveVideoRecommendation(
  video: RepairVideo,
  query: string,
  vehicle: RepairVehicle
): Promise<void> {
  await supabase.from('shop_repair_videos').upsert({
    video_url: video.url,
    video_title: video.title,
    channel_name: video.channel,
    duration: video.duration,
    thumbnail_url: video.thumbnail,
    repair_query: query,
    vehicle_key: vehicleKey(vehicle),
    year: vehicle.year,
    make: vehicle.make,
    model: vehicle.model,
    engine: vehicle.engine,
    is_shop_recommended: true,
    match_reason: video.matchReason,
  }, { onConflict: 'video_url' });
}
