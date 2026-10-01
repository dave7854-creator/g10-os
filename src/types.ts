export type Screen = 'home' | 'intake' | 'vehicles' | 'dismantling' | 'inventory' | 'orders' | 'ebay' | 'inquiries' | 'clockin' | 'timesheet' | 'settings' | 'towing' | 'shop' | 'parts' | 'messages' | 'prepare' | 'customer-accounts';

export type VehicleStatus = string;

export type StatusColor = 'red' | 'blue' | 'green' | 'amber' | 'slate' | 'cyan';

export type WorkflowType = 'release' | 'sold' | 'scrapped';

export interface VehicleStatusConfig {
  id: string;
  name: string;
  slug: string;
  color: StatusColor;
  sortOrder: number;
  isDefault: boolean;
  workflow: WorkflowType | null;
  isArchived: boolean;
}

export interface WorkflowData {
  release?: { releaseFee: number; signature: string };
  sold?: { buyerName: string; buyerPhone: string; salePrice: number };
  scrapped?: { yard: string; weight: number; payout: number };
}

export interface StatusLog {
  id: string;
  vehicleId: string;
  fromStatus: string;
  toStatus: string;
  user: string;
  notes: string;
  workflowData: WorkflowData | null;
  createdAt: string;
}

export interface Vehicle {
  id: string;
  vin: string;
  year: number;
  make: string;
  model: string;
  trim: string;
  color: string;
  status: VehicleStatus;
  location: string;
  intakeDate: string;
  estimatedValue: number;
  mileage: number;
  engine: string;
  transmission: string;
  bodyStyle: string;
  driveType: string;
  fuelType: string;
  plant: string;
  condition: string;
  partsTotal: number;
  partsPulled: number;
  dataSource: 'nhtsa' | 'manual';
  cabConfig?: string;
  bedLength?: string;
  interiorColor?: string;
  interiorTrim?: string;
  exteriorColor?: string;
  rpoCodes?: string;
  infotainmentSystem?: string;
  lightingOptions?: string;
  seatConfig?: string;
  factoryOptions?: string;
  configVerified?: boolean;
}

export type DemandLevel = 'Hot' | 'High' | 'Medium' | 'Low';
export type PartStatus = 'available' | 'removed' | 'cleaned' | 'tested' | 'listed' | 'sold' | 'scrapped';

export type EbayPartStatus = 'not_prepared' | 'preparing' | 'draft' | 'needs_review' | 'ready' | 'active' | 'sold' | 'ended' | 'error';

export type PulledStatus = 'not_pulled' | 'pulled';

export interface PartDetails {
  partName?: string;
  category?: string;
  sku?: string;
  toteId?: string;
  condition?: string;
  pulledStatus: PulledStatus;
  quantity: number;
  preBuyers?: string;
  price?: number | null;
  oemPartNumber?: string;
  manufacturerPartNumber?: string;
  interchangeNumber?: string;
  notes?: string;
  side?: string;
  color?: string;
  weightLbs?: number | null;
  dimensions?: string;
  photoUrls: string[];
}

export type CompTier = 'oem-used-sold' | 'oem-used-active' | 'new-sold' | 'new-active' | 'aftermarket-sold' | 'aftermarket-active' | 'none';

export interface CompListing {
  tier: CompTier;
  price: number;
  source: string;
  title: string;
  date?: string;
}

export interface ValuationData {
  marketValue: number;
  askingPrice: number;
  adjustedValue: number | null;
  compTier: CompTier;
  compCount: number;
  comps: CompListing[];
  confidence: number;
  confidenceLabel: 'high' | 'medium' | 'low';
  lastUpdated: string;
  notes: string;
  oemUsedSoldCount: number;
}

export type ValuationSourceKind = 'real' | 'placeholder';

export interface DismantlePart {
  id: string;
  vehicleId: string;
  name: string;
  category: string;
  status: PartStatus;
  marketValue: number;
  recommendedPrice: number;
  demand: DemandLevel;
  removalTime: number;
  stockQty: number;
  priorityScore: number;
  toteId: string;
  condition: string;
  hasBuyer: boolean;
  profitEstimate: number;
  photos: number;
  reason: string;
  isEstimated: boolean;
  confidence: number;
  breakdown: EstimateBreakdown;
  valuation: ValuationData;
  ebayStatus: EbayPartStatus;
  pulledStatus: PulledStatus;
  sku: string;
  oemPartNumber: string;
  manufacturerPartNumber: string;
  interchangeNumber: string;
  notes: string;
  side: string;
  color: string;
  weightLbs: number | null;
  dimensions: string;
  photoUrls: string[];
  preBuyers: string;
}

export type EstimateSourceKind = 'real' | 'placeholder';

export interface EstimateSource {
  label: string;
  kind: EstimateSourceKind;
  detail: string;
}

export interface EstimateBreakdown {
  sources: EstimateSource[];
  summary: string;
}

export interface RevenueEstimate {
  projectedPartsValue: number;
  scrapValue: number;
  laborHours: number;
  netProfitEstimate: number;
  confidence: number;
  isEstimated: boolean;
  breakdown: EstimateBreakdown;
}

export type OrderStatus = 'to-ship' | 'shipped' | 'delivered';

export interface Order {
  id: string;
  vehicleId: string;
  orderNumber: string;
  buyer: string;
  buyerLocation: string;
  partName: string;
  salePrice: number;
  shippingCost: number;
  status: OrderStatus;
  carrier: string;
  trackingNumber: string;
  date: string;
  toteId: string;
}

export interface VehicleConfigOptions {
  exteriorColors: string[];
  interiorColors: string[];
  cabConfigs: string[];
  bedLengths: string[];
  trimLevels: string[];
  infotainmentSystems: string[];
  lightingOptions: string[];
  seatConfigs: string[];
  knownRpoCodes?: string[];
}

export interface OemNumberSource {
  partNumber: string;
  sourceName: string;
  sourceUrl: string;
  context: string;
  dateChecked: string;
  numberType: 'oem' | 'original' | 'superseded' | 'interchange' | 'aftermarket' | 'unknown';
}

export interface OemCandidate {
  partNumber: string;
  context: string;
  numberType: 'oem' | 'original' | 'superseded' | 'interchange' | 'aftermarket' | 'unknown';
}

export interface OemSearchDebugEntry {
  sourceName: string;
  sourceUrl: string;
  resultSnippet: string;
  candidateNumbers: OemCandidate[];
  accepted: boolean;
  reason: string;
}

export interface OemDebugSummary {
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

export type PartNumberState = 'none' | 'suggested' | 'confirmed';

export interface OemCandidateDetail {
  partNumber: string;
  manufacturerDescription?: string;
  fitmentInfo?: string;
  sourceName: string;
  sourceUrl: string;
  numberType: 'oem' | 'original' | 'superseded' | 'interchange' | 'aftermarket' | 'unknown';
}

export interface PartResearchResult {
  oemPartNumber: string;
  originalPartNumber?: string;
  supersededPartNumber?: string;
  interchangeNumbers: string[];
  partName: string;
  side: string;
  confidence: 'high' | 'medium' | 'low';
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

export interface OemLookupRequest {
  oemNumber: string;
  year?: number;
  make?: string;
  model?: string;
  vin?: string;
  description?: string;
}

export interface OemEvidence {
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
  confidence: 'high' | 'medium' | 'low';
  confidenceReason: string;
  evidence: OemEvidence[];
  options: OemLookupOption[];
  degraded: string[];
  notes: string;
}

export interface SoldCompResult {
  price: number;
  title: string;
  date: string;
  condition: string;
  url: string;
  sold: boolean;
  exactMatch: boolean;
  itemSpecifics?: { label: string; value: string }[];
  shipping?: string;
}

export interface ActiveListing {
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

export interface OemCandidate {
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

export interface CompStats {
  count: number;
  low: number;
  median: number;
  average: number;
  high: number;
}

export interface SearchDebug {
  query: string;
  url: string;
  httpStatus: number;
  htmlLength: number;
  rawResultCount: number;
  parsedResultCount: number;
  rejectionReasons: { title: string; reason: string }[];
  blocked?: boolean;
}

export interface DebugIndicator {
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
}

export interface SoldCompResponse {
  comps: SoldCompResult[];
  oemUsedSoldCount: number;
  lowRange: number;
  highRange: number;
  typicalPrice: number;
  suggestedListPrice: number;
  conditionNotes: string[];
  searchQuery: string;
  confidence: 'high' | 'medium' | 'low';
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
  debugIndicator?: DebugIndicator;
}

export interface PartResearchRequest {
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
    vin?: string;
  };
  partName: string;
  partCategory: string;
  side?: string;
}

export interface VehicleStore {
  vehicles: Vehicle[];
  parts: DismantlePart[];
  orders: Order[];
  statusConfigs: VehicleStatusConfig[];
  statusLogs: StatusLog[];
  selectedVehicleId: string | null;
  selectedPartId: string | null;
  selectedVehicle: Vehicle | null;
  loading: boolean;
  selectVehicle: (id: string | null) => void;
  selectPart: (partId: string | null, vehicleId?: string | null) => void;
  addVehicle: (v: Vehicle) => Promise<void>;
  updateVehicle: (id: string, patch: Partial<Vehicle>) => Promise<void>;
  updatePartStatus: (partId: string, vehicleId: string, status: PartStatus) => Promise<void>;
  setPartValuation: (partId: string, vehicleId: string, adjustedValue: number | null, notes: string) => Promise<void>;
  updatePartEbayStatus: (partId: string, vehicleId: string, ebayStatus: EbayPartStatus) => Promise<void>;
  updatePartDetails: (partId: string, vehicleId: string, details: Partial<PartDetails>) => Promise<void>;
  markOrderShipped: (orderId: string) => Promise<void>;
  changeVehicleStatus: (vehicleId: string, toStatus: string, notes: string, workflowData?: WorkflowData) => Promise<void>;
  addStatusConfig: (config: Omit<VehicleStatusConfig, 'id'>) => Promise<void>;
  updateStatusConfig: (id: string, patch: Partial<VehicleStatusConfig>) => Promise<void>;
  deleteStatusConfig: (id: string) => Promise<void>;
  reorderStatusConfigs: (ids: string[]) => Promise<void>;
  deleteVehicle: (id: string) => Promise<void>;
  deleteAllArchivedVehicles: (archivedSlug: string) => Promise<void>;
}
