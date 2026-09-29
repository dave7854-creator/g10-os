import { useState, useMemo } from 'react';
import {
  Car,
  Wrench,
  Brain,
  CheckCircle2,
  TrendingUp,
  Boxes,
  Clock,
  DollarSign,
  Flame,
  AlertCircle,
  Camera,
  Printer,
  Tag,
  ChevronLeft,
  ChevronRight,
  Store,
  Eye,
  Package,
  Search,
  Loader2,
  AlertTriangle,
  HelpCircle,
  Hash,
  ExternalLink,
  Bug,
  Check,
  X,
  Edit3,
} from 'lucide-react';
import { Card, Badge, Button, ProgressBar, formatCurrency } from '@/components/ui';
import { EstimateExplainer, WhyEstimateButton, SourceTag } from '@/components/EstimateExplainer';
import { MarketResearch } from '@/components/MarketResearch';
import { ValuationSection } from '@/components/ValuationSection';
import { demandColor, generateRevenueEstimate, compTierLabel, compTierBadgeColor } from '@/data';
import { researchPart, fetchSoldComps, vehicleToResearchConfig } from '@/shop/researchService';
import type { Screen, DismantlePart, RevenueEstimate, VehicleStore, EstimateBreakdown, PartStatus, Vehicle, EbayPartStatus, PartResearchResult, SoldCompResponse, SoldCompResult, SearchDebug, OemCandidate, DebugIndicator, OemNumberSource, OemSearchDebugEntry, OemDebugSummary, PartNumberState } from '@/types';

const PART_STATUSES: { id: PartStatus; label: string; color: string; textColor: string }[] = [
  { id: 'available', label: 'Available', color: 'bg-slate-600', textColor: 'text-slate-200' },
  { id: 'removed', label: 'Removed', color: 'bg-amber-600', textColor: 'text-amber-200' },
  { id: 'cleaned', label: 'Cleaned', color: 'bg-cyan-600', textColor: 'text-cyan-200' },
  { id: 'tested', label: 'Tested', color: 'bg-red-600', textColor: 'text-blue-200' },
  { id: 'listed', label: 'Listed', color: 'bg-emerald-600', textColor: 'text-emerald-200' },
  { id: 'sold', label: 'Sold', color: 'bg-green-700', textColor: 'text-green-200' },
  { id: 'scrapped', label: 'Scrapped', color: 'bg-red-900', textColor: 'text-red-200' },
];

function statusBadgeColor(status: PartStatus): 'slate' | 'amber' | 'cyan' | 'blue' | 'green' | 'red' {
  switch (status) {
    case 'available': return 'slate';
    case 'removed': return 'amber';
    case 'cleaned': return 'cyan';
    case 'tested': return 'blue';
    case 'listed': return 'green';
    case 'sold': return 'green';
    case 'scrapped': return 'red';
  }
}

const EBAY_STATUS_LABELS: Record<EbayPartStatus, string> = {
  not_prepared: 'Not Prepared',
  preparing: 'Preparing',
  draft: 'eBay Draft',
  needs_review: 'Needs Review',
  ready: 'Ready',
  active: 'eBay Active',
  sold: 'eBay Sold',
  ended: 'eBay Ended',
  error: 'eBay Error',
};

function ebayStatusBadgeColor(status: EbayPartStatus): 'slate' | 'amber' | 'cyan' | 'blue' | 'green' | 'red' {
  switch (status) {
    case 'not_prepared': return 'slate';
    case 'preparing': return 'amber';
    case 'draft': return 'amber';
    case 'needs_review': return 'amber';
    case 'ready': return 'cyan';
    case 'active': return 'green';
    case 'sold': return 'blue';
    case 'ended': return 'red';
    case 'error': return 'red';
  }
}

export function DismantlingScreen({ onNavigate, store }: { onNavigate: (s: Screen) => void; store: VehicleStore }) {
  const [expandedPart, setExpandedPart] = useState<string | null>(null);
  const [photoCounts, setPhotoCounts] = useState<Record<string, number>>({});
  const [explainer, setExplainer] = useState<{ breakdown: EstimateBreakdown; title: string } | null>(null);
  const [savedPartId, setSavedPartId] = useState<string | null>(null);

  const archivedSlug = store.statusConfigs.find((c) => c.isArchived)?.slug ?? 'archived';
  const selected = store.selectedVehicle;
  const vehicle = selected && selected.status !== archivedSlug ? selected : null;

  const vehicleParts = useMemo<DismantlePart[]>(
    () => vehicle ? store.parts.filter((p) => p.vehicleId === vehicle.id) : [],
    [vehicle, store.parts]
  );

  const revenue: RevenueEstimate | null = vehicle
    ? generateRevenueEstimate(vehicle, vehicleParts)
    : null;

  if (!vehicle) {
    return (
      <div className="px-4 pt-14 pb-nav-safe lg:px-8 lg:pt-8">
        <h1 className="text-2xl font-bold text-white">Dismantling</h1>
        <div className="flex flex-col items-center text-center py-16">
          <Wrench size={48} className="text-slate-700" strokeWidth={1.5} />
          <p className="text-slate-500 text-sm mt-3">No vehicles yet</p>
          <p className="text-slate-600 text-xs mt-1">Intake a vehicle to begin dismantling.</p>
          <Button onClick={() => onNavigate('intake')} size="md" className="mt-4">
            Scan a VIN
          </Button>
        </div>
      </div>
    );
  }

  const sortedParts = [...vehicleParts].sort((a, b) => b.priorityScore - a.priorityScore);
  const pulledCount = vehicleParts.filter((p) => p.status !== 'available').length;
  const pulledValue = vehicleParts.filter((p) => p.status !== 'available').reduce((sum, p) => sum + p.recommendedPrice, 0);
  const totalValue = vehicleParts.reduce((sum, p) => sum + p.recommendedPrice, 0);

  const takePhoto = (id: string) => {
    setPhotoCounts((prev) => ({ ...prev, [id]: (prev[id] ?? 0) + 1 }));
  };

  return (
    <div className="px-4 pt-14 pb-nav-safe lg:px-8 lg:pt-8 space-y-5 animate-fade-in">
      <button onClick={() => onNavigate('home')} className="flex items-center gap-1 text-slate-400 text-sm -ml-1 lg:hidden">
        <ChevronLeft size={18} /> Back
      </button>

      <div>
        <h1 className="text-2xl font-bold text-white">Dismantling</h1>
        <p className="text-slate-400 text-sm mt-0.5">AI-prioritized intelligent pull plan</p>
      </div>

      <Card className="overflow-hidden">
        <div className="h-28 bg-gradient-to-br from-slate-700 to-slate-800 flex items-center justify-center">
          <Car size={48} className="text-slate-500" strokeWidth={1} />
        </div>
        <div className="p-4">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-lg font-bold text-white">{vehicle.year} {vehicle.make} {vehicle.model}</h2>
              <p className="text-xs text-slate-400 mt-0.5">{vehicle.location} · {vehicle.vin}</p>
            </div>
            <Badge color="amber">In Progress</Badge>
          </div>

          <div className="mt-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-slate-400 font-semibold">Pull Progress</span>
              <span className="text-xs text-white font-bold">{pulledCount} / {vehicleParts.length}</span>
            </div>
            <ProgressBar value={pulledCount} total={vehicleParts.length} />
          </div>

          <div className="grid grid-cols-2 gap-3 mt-4">
            <div className="p-3 bg-slate-900/50 rounded-xl">
              <p className="text-[10px] text-slate-500 uppercase font-semibold tracking-wide">Pulled Value (est.)</p>
              <p className="text-lg font-bold text-emerald-400">{formatCurrency(pulledValue)}</p>
            </div>
            <div className="p-3 bg-slate-900/50 rounded-xl">
              <p className="text-[10px] text-slate-500 uppercase font-semibold tracking-wide">Total Potential (est.)</p>
              <p className="text-lg font-bold text-white">{formatCurrency(totalValue)}</p>
            </div>
          </div>
        </div>
      </Card>

      {revenue && <RevenueEstimateCard revenue={revenue} onExplain={() => setExplainer({ breakdown: revenue.breakdown, title: 'Vehicle Revenue Estimate' })} />}

      <div className="flex items-center gap-2 p-2.5 bg-red-500/10 border border-red-500/20 rounded-xl">
        <Brain size={14} className="text-red-400 flex-shrink-0" />
        <p className="text-xs text-red-300">AI prioritizes quick-removal, high-demand parts first. Engines/drivetrain deferred unless pre-sold.</p>
      </div>

      <div className="space-y-3">
        {sortedParts.map((part) => (
          <FullPartCard
            key={part.id}
            part={part}
            vehicle={vehicle}
            store={store}
            expanded={expandedPart === part.id}
            photoCount={photoCounts[part.id] ?? part.photos}
            onPhoto={() => takePhoto(part.id)}
            onClick={() => { setExpandedPart(expandedPart === part.id ? null : part.id); setSavedPartId(null); }}
            onExplain={() => setExplainer({ breakdown: part.breakdown, title: part.name })}
            onStatusChange={(status) => {
              store.updatePartStatus(part.id, part.vehicleId, status);
              if (status !== 'available') {
                setSavedPartId(part.id);
              }
            }}
            isJustSaved={savedPartId === part.id}
            onSavedDismiss={() => setSavedPartId(null)}
            onViewPart={() => { store.selectPart(part.id, part.vehicleId); onNavigate('inventory'); }}
            onCreateEbayDraft={() => { store.selectPart(part.id, part.vehicleId); onNavigate('prepare'); }}
          />
        ))}
      </div>

      <Button
        size="lg"
        className="w-full"
        icon={<TrendingUp size={20} />}
        onClick={() => {
          store.changeVehicleStatus(vehicle.id, 'complete', 'Dismantling complete').then(() => onNavigate('home'));
        }}
      >
        Complete Dismantling — Move to Listing
      </Button>
      {explainer && (
        <EstimateExplainer
          breakdown={explainer.breakdown}
          title={explainer.title}
          onClose={() => setExplainer(null)}
        />
      )}
    </div>
  );
}

function RevenueEstimateCard({ revenue, onExplain }: { revenue: RevenueEstimate; onExplain: () => void }) {
  return (
    <Card className="p-4 bg-gradient-to-br from-red-600/10 to-cyan-500/5 border-red-500/20">
      <div className="flex items-center gap-2 mb-3">
        <TrendingUp size={16} className="text-red-400" />
        <p className="text-xs text-red-400 font-semibold uppercase tracking-wide">Vehicle Revenue Estimate</p>
        <Badge color="green">{revenue.confidence}% confidence</Badge>
        {revenue.isEstimated && <span className="text-[10px] text-amber-400/80 font-medium ml-1">All values estimated</span>}
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <RevStat icon={DollarSign} label="Parts Value (est.)" value={formatCurrency(revenue.projectedPartsValue)} color="text-emerald-400" />
        <RevStat icon={Boxes} label="Scrap Value (est.)" value={formatCurrency(revenue.scrapValue)} color="text-slate-300" />
        <RevStat icon={Clock} label="Labor Hours (est.)" value={`${revenue.laborHours} hrs`} color="text-amber-400" />
        <RevStat icon={TrendingUp} label="Net Profit (est.)" value={formatCurrency(revenue.netProfitEstimate)} color="text-red-400" />
      </div>
      <div className="flex items-center gap-3 mt-3 pt-3 border-t border-slate-700/40">
        <SourceTag kind="placeholder" />
        <WhyEstimateButton onClick={onExplain} />
      </div>
    </Card>
  );
}

function RevStat({ icon: Icon, label, value, color }: { icon: typeof DollarSign; label: string; value: string; color: string }) {
  return (
    <div className="p-2.5 bg-slate-900/40 rounded-xl">
      <div className="flex items-center gap-1.5 mb-1">
        <Icon size={12} className="text-slate-500" />
        <p className="text-[10px] text-slate-500 uppercase font-semibold tracking-wide">{label}</p>
      </div>
      <p className={`text-base font-bold ${color}`}>{value}</p>
    </div>
  );
}

function FullPartCard({
  part, vehicle, store, expanded, photoCount, onPhoto, onClick, onExplain, onStatusChange,
  isJustSaved, onSavedDismiss, onViewPart, onCreateEbayDraft,
}: {
  part: DismantlePart; vehicle: Vehicle; store: VehicleStore; expanded: boolean; photoCount: number;
  onPhoto: () => void; onClick: () => void; onExplain: () => void;
  onStatusChange: (status: PartStatus) => void;
  isJustSaved: boolean;
  onSavedDismiss: () => void;
  onViewPart: () => void;
  onCreateEbayDraft: () => void;
}) {
  const scoreColor = part.priorityScore >= 85 ? 'text-red-400 bg-red-500/15'
    : part.priorityScore >= 70 ? 'text-amber-400 bg-amber-500/15'
    : part.priorityScore >= 50 ? 'text-cyan-400 bg-cyan-500/15'
    : 'text-slate-400 bg-slate-600/20';

  const isHeavyDrivetrain = part.category === 'Powertrain';
  const isDone = part.status === 'sold' || part.status === 'scrapped';

  return (
    <Card className={`p-3.5 transition-all ${isDone ? 'opacity-60' : ''}`}>
      <div className="flex items-center gap-3" onClick={onClick}>
        <div className={`w-12 h-12 rounded-xl flex flex-col items-center justify-center flex-shrink-0 ${scoreColor}`}>
          <span className="text-base font-bold leading-none">{part.priorityScore}</span>
          <span className="text-[8px] uppercase font-semibold tracking-wide mt-0.5">score</span>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <p className={`text-sm font-bold truncate ${isDone ? 'text-slate-500 line-through' : 'text-white'}`}>
              {part.name}
            </p>
            {part.demand === 'Hot' && !isDone && <Flame size={12} className="text-red-400 flex-shrink-0" />}
          </div>
          <div className="flex items-center gap-2 text-xs flex-wrap">
            <Badge color={statusBadgeColor(part.status)}>{PART_STATUSES.find((s) => s.id === part.status)?.label}</Badge>
            {part.ebayStatus !== 'not_prepared' && (
              <Badge color={ebayStatusBadgeColor(part.ebayStatus)}>{EBAY_STATUS_LABELS[part.ebayStatus]}</Badge>
            )}
            <Badge color={compTierBadgeColor(part.valuation.compTier)}>{compTierLabel(part.valuation.compTier)}</Badge>
            <span className="text-slate-400 font-semibold">Comp: {formatCurrency(part.valuation.marketValue)}</span>
            <span className="text-emerald-400 font-semibold">Ask: {formatCurrency(part.recommendedPrice)}</span>
            <span className="text-slate-500">{part.removalTime}min</span>
          </div>
        </div>

        {part.status !== 'available' ? (
          <CheckCircle2 size={24} className="text-emerald-400 flex-shrink-0" />
        ) : (
          <ChevronRight size={20} className={`text-slate-600 flex-shrink-0 transition-transform ${expanded ? 'rotate-90' : ''}`} />
        )}
      </div>

      {expanded && (
        <div className="mt-3 pt-3 border-t border-slate-700/40 space-y-3 animate-fade-in">
          {isJustSaved && part.status !== 'available' && (
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl space-y-2 animate-fade-in">
              <div className="flex items-center gap-2">
                <CheckCircle2 size={16} className="text-emerald-400 flex-shrink-0" />
                <p className="text-sm font-bold text-emerald-300">Saved to Inventory</p>
                <button onClick={onSavedDismiss} className="ml-auto text-emerald-400/60">
                  <ChevronRight size={16} className="rotate-90" />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={(e) => { e.stopPropagation(); onCreateEbayDraft(); }}
                  className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-amber-600 text-white font-semibold text-xs active:scale-95 transition-transform"
                >
                  <Store size={14} /> Get Ready to List
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); onViewPart(); }}
                  className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-slate-700 text-white font-semibold text-xs active:scale-95 transition-transform"
                >
                  <Eye size={14} /> View Part
                </button>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2 text-xs">
            <DetailRow label="Market Comp Value" value={formatCurrency(part.valuation.marketValue)} />
            <DetailRow label="Asking Price" value={formatCurrency(part.recommendedPrice)} />
            <DetailRow label="Removal Time" value={`${part.removalTime} min`} />
            <DetailRow label="Current Stock" value={`${part.stockQty} units`} />
            <DetailRow label="Profit Estimate" value={formatCurrency(part.profitEstimate)} />
            <DetailRow label="Confidence" value={`${part.confidence}%`} />
            <DetailRow label="Storage Tote" value={part.toteId} />
            <DetailRow label="Condition" value={part.condition} />
            <DetailRow label="Pre-sold Buyer" value={part.hasBuyer ? 'Yes' : 'No'} />
          </div>

          <div className="p-2.5 bg-red-500/10 rounded-xl flex items-start gap-2">
            <Brain size={14} className="text-red-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-blue-200">{part.reason}</p>
          </div>

          <div className="flex items-center gap-3">
            <SourceTag kind="placeholder" compact />
            <WhyEstimateButton onClick={onExplain} />
          </div>

          <ValuationSection part={part} store={store} />

          <PartResearchPanel part={part} vehicle={vehicle} store={store} />

          {isHeavyDrivetrain && !part.hasBuyer && (
            <div className="p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-start gap-2">
              <AlertCircle size={14} className="text-amber-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-amber-300">Heavy drivetrain deprioritized — no buyer on file. Pull after quick-win parts.</p>
            </div>
          )}

          <div>
            <p className="text-[10px] text-slate-500 uppercase font-semibold tracking-wide mb-2">Part Status — tap to change</p>
            <div className="grid grid-cols-4 gap-1.5">
              {PART_STATUSES.map((s) => (
                <button
                  key={s.id}
                  onClick={(e) => { e.stopPropagation(); onStatusChange(s.id); }}
                  className={`py-2 rounded-lg text-[10px] font-semibold transition-all active:scale-95 ${
                    part.status === s.id
                      ? `${s.color} ${s.textColor} ring-2 ring-white/30`
                      : 'bg-slate-800/60 text-slate-500 border border-slate-700/40'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <ActionButton icon={Camera} label={`Photos (${photoCount})`} onClick={onPhoto} color="bg-slate-700" />
            <ActionButton icon={Printer} label="Label" onClick={() => {}} color="bg-slate-700" />
            <ActionButton icon={Store} label="Prepare" onClick={() => onCreateEbayDraft()} color="bg-amber-600" />
          </div>

          <MarketResearch part={part} vehicle={vehicle} />
        </div>
      )}
    </Card>
  );
}

function ActionButton({ icon: Icon, label, onClick, color }: { icon: typeof Camera; label: string; onClick: () => void; color: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center gap-1 py-2.5 rounded-xl text-white font-semibold text-[10px] active:scale-95 transition-transform ${color}`}
    >
      <Icon size={16} />
      {label}
    </button>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-slate-500">{label}</span>
      <span className="text-white font-medium">{value}</span>
    </div>
  );
}

function PartResearchPanel({ part, vehicle, store }: { part: DismantlePart; vehicle: Vehicle; store: VehicleStore }) {
  const [researching, setResearching] = useState(false);
  const [autoResult, setAutoResult] = useState<SoldCompResponse | null>(null);
  const [compsLoading, setCompsLoading] = useState(false);
  const [compsResult, setCompsResult] = useState<SoldCompResponse | null>(null);
  const [error, setError] = useState('');
  const [answer, setAnswer] = useState('');
  const [showAnswer, setShowAnswer] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  const [manualNumber, setManualNumber] = useState('');
  const [searchingManual, setSearchingManual] = useState(false);
  const [manualCompsResult, setManualCompsResult] = useState<SoldCompResponse | null>(null);
  const [manualConfirmed, setManualConfirmed] = useState(false);
  const [manualDebugInfo, setManualDebugInfo] = useState<string>('');
  const [confirmed, setConfirmed] = useState(false);
  const [showOtherOptions, setShowOtherOptions] = useState(false);
  const [autoDebugInfo, setAutoDebugInfo] = useState<string>('');

  const handleConfirmCandidate = (candidateNumber: string) => {
    setConfirmed(true);
    store.updatePartDetails(part.id, part.vehicleId, {
      oemPartNumber: candidateNumber,
      interchangeNumber: '',
      manufacturerPartNumber: candidateNumber,
    });
  };

  const handleFetchManualComps = async () => {
    if (!manualConfirmed || !manualNumber.trim()) return;
    setCompsLoading(true);
    setError('');
    try {
      const result = await fetchSoldComps({
        oemPartNumber: manualNumber.trim().toUpperCase(),
        partName: part.name,
        vehicle: `${vehicle.year} ${vehicle.make} ${vehicle.model}`,
        side: part.side,
      });
      setCompsResult(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Comp search failed');
    } finally {
      setCompsLoading(false);
    }
  };

  const handleTryAnother = () => {
    setShowOtherOptions(!showOtherOptions);
  };

  const handleSearchManualNumber = async () => {
    if (!manualNumber.trim()) return;
    const manualNum = manualNumber.trim().toUpperCase();
    setSearchingManual(true);
    setError('');
    setManualCompsResult(null);
    setManualConfirmed(false);
    setManualDebugInfo(`PART NUMBER SOURCE: MANUAL\nMANUAL PART NUMBER: ${manualNum}\nEBAY SOLD SEARCH: YES\nSearching eBay sold/completed...`);
    try {
      const compsResult = await fetchSoldComps({
        oemPartNumber: manualNum,
        partName: part.name,
        vehicle: `${vehicle.year} ${vehicle.make} ${vehicle.model}`,
        side: part.side,
        isManual: true,
      });
      setManualCompsResult(compsResult);
      const dbg = compsResult.debugIndicator;
      if (dbg) {
        setManualDebugInfo(
          `PART NUMBER SOURCE: ${dbg.partNumberSource}\n` +
          `MANUAL PART NUMBER: ${manualNum}\n` +
          `EBAY SOLD SEARCH: ${dbg.ebaySearchStarted ? 'YES' : 'NO'}\n` +
          `SOLD RESULTS: ${dbg.soldResultsFound}\n` +
          `EXACT MATCHES: ${dbg.exactNumberMatches}\n` +
          `HTTP FAILURE/BLOCKED: ${dbg.requestBlocked ? 'YES' : 'NO'}\n` +
          `AUTOMATIC RESEARCH: BYPASSED\n` +
          `SUGGESTED PRICE: ${formatCurrency(dbg.suggestedPrice)}`
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Manual eBay search failed');
      setManualDebugInfo(prev => prev + '\nEBAY SEARCH FAILED');
    } finally {
      setSearchingManual(false);
    }
  };

  const handleConfirmManualNumber = () => {
    if (!manualNumber.trim()) return;
    const manualNum = manualNumber.trim().toUpperCase();
    setManualConfirmed(true);
    store.updatePartDetails(part.id, part.vehicleId, {
      oemPartNumber: manualNum,
      interchangeNumber: '',
      manufacturerPartNumber: manualNum,
    });
  };

  const handleResearch = async () => {
    // FIRST DECISION: if a manual part number is entered, bypass OEM research entirely
    const manualNum = manualNumber.trim();
    if (manualNum) {
      await handleSearchManualNumber();
      return;
    }
    // NO MANUAL NUMBER → run automatic eBay sold/completed research
    setResearching(true);
    setError('');
    setAutoResult(null);
    setCompsResult(null);
    setShowAnswer(false);
    setConfirmed(false);
    setShowOtherOptions(false);
    setManualCompsResult(null);
    setManualDebugInfo('');
    setAutoDebugInfo('');
    // Clear old unverified OEM number before starting fresh research
    if (part.oemPartNumber) {
      store.updatePartDetails(part.id, part.vehicleId, {
        oemPartNumber: '',
        interchangeNumber: '',
        manufacturerPartNumber: '',
      });
    }
    try {
      const result = await fetchSoldComps({
        partName: part.name,
        vehicle: `${vehicle.year} ${vehicle.make} ${vehicle.model}`,
        side: part.side,
        isAutomatic: true,
      });
      setAutoResult(result);
      const dbg = result.debugIndicator;
      if (dbg) {
        const candidateLines = dbg.candidates && dbg.candidates.length > 0
          ? dbg.candidates.map(c => `  ${c.partNumber} — ${c.matchCount} sold listings (${c.confidenceLevel || 'POSSIBLE'})`).join('\n')
          : '  None found';
        const logLines = result.searchLog && result.searchLog.length > 0
          ? '\nRESEARCH LOG:\n' + result.searchLog.map(l => `  ${l}`).join('\n')
          : '';
        setAutoDebugInfo(
          `PART NUMBER SOURCE: ${dbg.partNumberSource}\n` +
          `EBAY SOLD RESULTS: ${dbg.soldResultsFound}\n` +
          `LISTINGS INSPECTED: ${dbg.listingsInspected ?? 0}\n` +
          `OEM NUMBERS FOUND: ${dbg.oemNumbersFound ?? 0}\n` +
          `CANDIDATES + MATCH COUNTS:\n${candidateLines}\n` +
          `STRONGEST CANDIDATE: ${dbg.strongestCandidate || '(none)'}\n` +
          `STRONGEST CONFIDENCE: ${dbg.strongestConfidence || '(none)'}\n` +
          `GOOGLE VERIFICATION: ${dbg.googleVerification || 'NOT CONNECTED'}\n` +
          `HTTP FAILURE/BLOCKED: ${dbg.requestBlocked ? 'YES' : 'NO'}${logLines}`
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'eBay research failed');
    } finally {
      setResearching(false);
    }
  };

  const handleFetchComps = async () => {
    if (!confirmed) {
      setError('Part number must be confirmed before searching eBay sold comps');
      return;
    }
    setCompsLoading(true);
    setError('');
    try {
      const oemNum = part.oemPartNumber || autoResult?.strongestCandidate || '';
      if (!oemNum) {
        setError('No part number available for comp search');
        return;
      }
      const result = await fetchSoldComps({
        oemPartNumber: oemNum,
        partName: part.name,
        vehicle: `${vehicle.year} ${vehicle.make} ${vehicle.model}`,
        side: part.side,
      });
      setCompsResult(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Comp search failed');
    } finally {
      setCompsLoading(false);
    }
  };

  const handleAnswerQuestion = async () => {
    if (!answer) return;
    // Re-run eBay research
    setResearching(true);
    try {
      const result = await fetchSoldComps({
        partName: part.name,
        vehicle: `${vehicle.year} ${vehicle.make} ${vehicle.model}`,
        side: part.side,
        isAutomatic: true,
      });
      setAutoResult(result);
      setShowAnswer(false);
      setAnswer('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Research failed');
    } finally {
      setResearching(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Search size={14} className="text-slate-400" />
        <p className="text-[10px] text-slate-500 uppercase font-semibold tracking-wide">Part Research</p>
      </div>

      {/* Exact part identity */}
      <div className="p-2.5 bg-slate-800/40 rounded-xl">
        <div className="flex items-center gap-2 mb-1.5">
          <Package size={12} className="text-slate-500" />
          <p className="text-[10px] text-slate-500 uppercase font-semibold">Exact Part</p>
        </div>
        <p className="text-sm text-white font-bold">{part.name}</p>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          {part.side && <Badge color="cyan">{part.side}</Badge>}
          <Badge color="slate">{part.category}</Badge>
          {part.oemPartNumber && (
            <Badge color="blue"><Hash size={10} /> {part.oemPartNumber}</Badge>
          )}
        </div>
      </div>

      {/* Manual part number entry — available BEFORE research */}
      <div className="p-2.5 bg-slate-800/40 rounded-xl space-y-2">
        <div className="flex items-center gap-2">
          <Edit3 size={12} className="text-slate-500" />
          <p className="text-[10px] text-slate-500 uppercase font-semibold">Manual Part Number (Speed Path)</p>
        </div>
        <p className="text-[10px] text-slate-600">Enter the number from the physical part to skip OEM research and go straight to eBay pricing.</p>
        <div className="flex gap-2">
          <input
            type="text"
            value={manualNumber}
            onChange={(e) => setManualNumber(e.target.value)}
            placeholder="e.g., 55277414AF"
            className="flex-1 px-3 py-2 bg-slate-900/60 border border-slate-700/50 rounded-lg text-sm text-white font-mono placeholder:text-slate-600 focus:outline-none focus:border-red-500/50"
          />
        </div>
      </div>

      <Button
        onClick={handleResearch}
        size="sm"
        variant="secondary"
        className="w-full"
        icon={researching || searchingManual ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
        disabled={researching || searchingManual}
      >
        {searchingManual
          ? 'Searching eBay for Manual Number...'
          : researching
            ? 'Researching OEM Part Number...'
            : manualNumber.trim()
              ? 'Search eBay with Manual Number'
              : 'Research OEM Part Number'}
      </Button>

      {error && (
        <div className="p-2.5 bg-red-500/10 border border-red-500/20 rounded-xl">
          <p className="text-xs text-red-300">{error}</p>
        </div>
      )}

      {/* Configuration question */}
      {/* Automatic eBay research results — OEM number discovery from sold listings */}
      {autoResult && !manualCompsResult && (
        <div className="space-y-2">
          {/* Blocked request warning */}
          {autoResult.debugIndicator?.requestBlocked && (
            <div className="p-2.5 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-2">
              <AlertCircle size={14} className="text-red-400 flex-shrink-0" />
              <p className="text-[11px] text-red-300">Some eBay search requests were blocked (HTTP 403/429). Results may be incomplete — try again later.</p>
            </div>
          )}
          {/* Strongest eBay OEM candidate */}
          {autoResult.strongestCandidate ? (
            <div className={`p-3 rounded-xl border ${confirmed ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-red-500/10 border-red-500/20'}`}>
              <div className="flex items-center gap-2 mb-1">
                <Hash size={14} className={confirmed ? 'text-emerald-400' : 'text-red-400'} />
                <p className="text-[10px] uppercase font-semibold tracking-wide text-slate-400">Likely OEM Part Number</p>
                <Badge color={confirmed ? 'green' : 'blue'}>
                  {confirmed ? 'Confirmed' : 'Not Verified'}
                </Badge>
                {autoResult.oemCandidates && autoResult.oemCandidates[0]?.confidenceLevel && (
                  <Badge color={
                    autoResult.oemCandidates[0].confidenceLevel === 'VERIFIED' ? 'green'
                      : autoResult.oemCandidates[0].confidenceLevel === 'HIGH CONFIDENCE' ? 'green'
                      : 'amber'
                  }>
                    {autoResult.oemCandidates[0].confidenceLevel}
                  </Badge>
                )}
              </div>
              <p className="text-lg font-bold text-white font-mono">{autoResult.strongestCandidate}</p>
              {autoResult.oemCandidates && autoResult.oemCandidates[0] && (
                <div className="mt-1 space-y-0.5">
                  <p className="text-[11px] text-slate-500">
                    Found in: {autoResult.oemCandidates[0].matchCount} sold listing{autoResult.oemCandidates[0].matchCount !== 1 ? 's' : ''} · Source: {autoResult.oemCandidates[0].strongestSource}
                  </p>
                  {autoResult.oemCandidates[0].evidencePoints && autoResult.oemCandidates[0].evidencePoints.map((ev, i) => (
                    <div key={i} className="flex items-start gap-1">
                      <span className="text-emerald-400 text-[10px] flex-shrink-0">•</span>
                      <p className="text-[11px] text-slate-400">{ev}</p>
                    </div>
                  ))}
                </div>
              )}
              {!confirmed && (
                <div className="flex gap-2 mt-2">
                  <Button
                    onClick={() => handleConfirmCandidate(autoResult.strongestCandidate!)}
                    size="sm"
                    className="flex-1"
                    icon={<Check size={14} />}
                  >
                    Confirm Part Number
                  </Button>
                </div>
              )}
              {confirmed && (
                <p className="text-[11px] text-emerald-300 mt-1 font-semibold">Confirmed — ready for eBay listing</p>
              )}
            </div>
          ) : (
            <div className="p-3 rounded-xl border bg-amber-500/10 border-amber-500/20">
              <div className="flex items-center gap-2 mb-1">
                <AlertTriangle size={14} className="text-amber-400" />
                <p className="text-[10px] uppercase font-semibold tracking-wide text-slate-400">OEM Part Number Not Found</p>
              </div>
              <p className="text-sm text-amber-300">Multiple searches were tried but no part numbers were extracted from eBay sold listings. Try entering the number manually above.</p>
              {autoResult.searchLog && autoResult.searchLog.length > 0 && (
                <div className="mt-2 space-y-0.5">
                  {autoResult.searchLog.map((log, i) => (
                    <p key={i} className="text-[10px] text-slate-600">{log}</p>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Verify with Google button — not yet connected */}
          {autoResult.strongestCandidate && !confirmed && (
            <div className="flex items-center gap-2 p-2.5 bg-slate-800/40 rounded-xl">
              <Button
                onClick={() => setError('Google verification is not yet connected. This will be available in a future update.')}
                size="sm"
                variant="secondary"
                className="flex-1"
                icon={<Search size={14} />}
                disabled
              >
                Verify with Google (Not Connected)
              </Button>
            </div>
          )}

          {/* All OEM candidates with evidence and confidence */}
          {autoResult.oemCandidates && autoResult.oemCandidates.length > 0 && (
            <div className="space-y-2 p-2.5 bg-slate-800/40 rounded-xl">
              <p className="text-[10px] text-slate-500 uppercase font-semibold">Part Numbers Found</p>
              {autoResult.oemCandidates.map((cand, i) => (
                <div key={i} className="p-2 bg-slate-800/60 rounded-lg space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-bold text-white">{cand.partNumber}</span>
                    {i === 0 && <Badge color="blue">Strongest</Badge>}
                    {cand.confidenceLevel && (
                      <Badge color={
                        cand.confidenceLevel === 'VERIFIED' ? 'green'
                          : cand.confidenceLevel === 'HIGH CONFIDENCE' ? 'green'
                          : 'amber'
                      }>
                        {cand.confidenceLevel}
                      </Badge>
                    )}
                    {cand.isLikelySuperseded && <Badge color="amber">Superseded?</Badge>}
                    <span className="text-[10px] text-slate-500 ml-auto">
                      {cand.matchCount} sold listing{cand.matchCount !== 1 ? 's' : ''}
                    </span>
                  </div>
                  {cand.evidencePoints && cand.evidencePoints.length > 0 && (
                    <div className="pl-2 space-y-0.5">
                      {cand.evidencePoints.map((ev, j) => (
                        <p key={j} className="text-[10px] text-slate-500">
                          <span className="text-emerald-400">•</span> {ev}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Sold listings pricing summary */}
          {autoResult.oemUsedSoldCount > 0 && (
            <div className={`p-3 rounded-xl border ${autoResult.confidence === 'high' ? 'bg-emerald-500/10 border-emerald-500/20' : autoResult.confidence === 'medium' ? 'bg-amber-500/10 border-amber-500/20' : 'bg-red-500/10 border-red-500/20'}`}>
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp size={14} className="text-slate-400" />
                <p className="text-[10px] uppercase font-semibold tracking-wide text-slate-400">Sold Comps Pricing</p>
                <Badge color={autoResult.confidence === 'high' ? 'green' : autoResult.confidence === 'medium' ? 'amber' : 'red'}>
                  {autoResult.confidence}
                </Badge>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="text-[10px] text-slate-500 uppercase">Sold Range</p>
                  <p className="text-sm font-bold text-white">{formatCurrency(autoResult.lowRange)} - {formatCurrency(autoResult.highRange)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-500 uppercase">Typical Sold Price</p>
                  <p className="text-sm font-bold text-emerald-400">{formatCurrency(autoResult.typicalPrice)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-500 uppercase">Suggested List Price</p>
                  <p className="text-sm font-bold text-red-400">{formatCurrency(autoResult.suggestedListPrice)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-500 uppercase">Sold Listings</p>
                  <p className="text-sm font-bold text-white">{autoResult.oemUsedSoldCount}</p>
                </div>
              </div>
              {autoResult.conditionNotes.map((note, i) => (
                <div key={i} className="flex items-start gap-1.5 mt-2">
                  <AlertCircle size={11} className="text-amber-400 flex-shrink-0 mt-0.5" />
                  <p className="text-[11px] text-amber-300">{note}</p>
                </div>
              ))}
            </div>
          )}

          {/* Individual sold listings with item specifics */}
          {autoResult.comps.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] text-slate-600 uppercase font-semibold">Individual Sold Listings</p>
              {autoResult.comps.slice(0, 10).map((comp, i) => (
                <div key={i} className="p-2 bg-slate-800/40 rounded-lg">
                  <div className="flex items-center gap-2.5">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-white font-medium truncate">{comp.title}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] text-slate-600">{comp.condition}</span>
                        {comp.date && <span className="text-[10px] text-slate-600">{comp.date}</span>}
                        <Badge color="green">Sold</Badge>
                      </div>
                      {comp.shipping && (
                        <p className="text-[10px] text-slate-600 mt-0.5">{comp.shipping}</p>
                      )}
                      <a href={comp.url} target="_blank" rel="noopener noreferrer" className="text-[10px] text-red-400 hover:text-red-300 mt-0.5 inline-flex items-center gap-0.5">
                        <ExternalLink size={9} /> View listing
                      </a>
                    </div>
                    <p className="text-sm font-bold flex-shrink-0 text-emerald-400">{formatCurrency(comp.price)}</p>
                  </div>
                  {comp.itemSpecifics && comp.itemSpecifics.length > 0 && (
                    <div className="mt-1.5 pl-2 border-l border-slate-700/50 space-y-0.5">
                      {comp.itemSpecifics.filter(s =>
                        /oem|oe|manufacturer|mpn|interchange|other part/i.test(s.label)
                      ).map((spec, j) => (
                        <p key={j} className="text-[10px] text-slate-500">
                          <span className="text-slate-400">{spec.label}:</span> {spec.value.slice(0, 60)}
                        </p>
                      ))}
                      {comp.itemSpecifics.filter(s =>
                        /oem|oe|manufacturer|mpn|interchange|other part/i.test(s.label)
                      ).length === 0 && (
                        <p className="text-[10px] text-slate-600 italic">OEM #: Not provided</p>
                      )}
                    </div>
                  )}
                  {!comp.itemSpecifics && (
                    <p className="text-[10px] text-slate-600 italic mt-1 pl-2 border-l border-slate-700/50">OEM #: Not provided</p>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Research log */}
          {autoResult.searchLog && autoResult.searchLog.length > 0 && (
            <div className="space-y-1 p-2.5 bg-slate-900/40 border border-slate-800 rounded-xl">
              <p className="text-[9px] text-slate-500 uppercase font-bold tracking-wide">Research Log</p>
              {autoResult.searchLog.map((log, i) => (
                <p key={i} className="text-[10px] text-slate-500 font-mono">{log}</p>
              ))}
            </div>
          )}

          {/* Automatic debug indicator */}
          {autoDebugInfo && (
            <div className="space-y-1 p-2.5 bg-slate-900/40 border border-slate-800 rounded-xl">
              <p className="text-[9px] text-slate-500 uppercase font-bold tracking-wide">Debug Indicator</p>
              <pre className="text-[10px] text-slate-400 whitespace-pre-wrap font-mono">{autoDebugInfo}</pre>
            </div>
          )}
        </div>
      )}

      {/* Manual workflow results — speed path: eBay straight to pricing */}
      {manualCompsResult && (
        <div className="space-y-2">
          {/* Blocked request warning */}
          {manualCompsResult.debugIndicator?.requestBlocked && (
            <div className="p-2.5 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-2">
              <AlertCircle size={14} className="text-red-400 flex-shrink-0" />
              <p className="text-[11px] text-red-300">Some eBay search requests were blocked (HTTP 403/429). Results may be incomplete — try again later.</p>
            </div>
          )}

          {/* Part number + confirm */}
          <div className={`p-3 rounded-xl border ${manualConfirmed ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-red-500/10 border-red-500/20'}`}>
            <div className="flex items-center gap-2 mb-1">
              <Hash size={14} className={manualConfirmed ? 'text-emerald-400' : 'text-red-400'} />
              <p className="text-[10px] uppercase font-semibold tracking-wide text-slate-400">Manual Part Number</p>
              <Badge color={manualConfirmed ? 'green' : 'blue'}>
                {manualConfirmed ? 'Confirmed' : 'Not Confirmed'}
              </Badge>
            </div>
            <p className="text-lg font-bold text-white font-mono">{manualNumber.trim().toUpperCase()}</p>
            <p className="text-[11px] text-slate-500 mt-0.5">{part.name}</p>
            {!manualConfirmed && (
              <Button
                onClick={handleConfirmManualNumber}
                size="sm"
                className="w-full mt-2"
                icon={<Check size={14} />}
              >
                Confirm Part Number
              </Button>
            )}
            {manualConfirmed && (
              <p className="text-[11px] text-emerald-300 mt-1 font-semibold">Confirmed — ready to list</p>
            )}
          </div>

          {/* Pricing summary */}
          <div className={`p-3 rounded-xl border ${manualCompsResult.confidence === 'high' ? 'bg-emerald-500/10 border-emerald-500/20' : manualCompsResult.confidence === 'medium' ? 'bg-amber-500/10 border-amber-500/20' : 'bg-red-500/10 border-red-500/20'}`}>
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp size={14} className="text-slate-400" />
              <p className="text-[10px] uppercase font-semibold tracking-wide text-slate-400">Pricing Summary</p>
              <Badge color={manualCompsResult.confidence === 'high' ? 'green' : manualCompsResult.confidence === 'medium' ? 'amber' : 'red'}>
                {manualCompsResult.confidence}
              </Badge>
            </div>

            {/* Sold comps stats */}
            <div className="mb-2">
              <p className="text-[10px] text-emerald-400 uppercase font-semibold mb-1">Sold Comps</p>
              {manualCompsResult.soldStats && manualCompsResult.soldStats.count > 0 ? (
                <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
                  <p className="text-[10px] text-slate-500">Listings: <span className="text-white font-semibold">{manualCompsResult.soldStats.count}</span></p>
                  <p className="text-[10px] text-slate-500">Low: <span className="text-white font-semibold">{formatCurrency(manualCompsResult.soldStats.low)}</span></p>
                  <p className="text-[10px] text-slate-500">Median: <span className="text-emerald-400 font-semibold">{formatCurrency(manualCompsResult.soldStats.median)}</span></p>
                  <p className="text-[10px] text-slate-500">Average: <span className="text-white font-semibold">{formatCurrency(manualCompsResult.soldStats.average)}</span></p>
                  <p className="text-[10px] text-slate-500">High: <span className="text-white font-semibold">{formatCurrency(manualCompsResult.soldStats.high)}</span></p>
                </div>
              ) : (
                <p className="text-[10px] text-slate-600 italic">No sold comps found</p>
              )}
            </div>

            {/* Suggested list price */}
            <div className="pt-2 border-t border-slate-700/50">
              <div className="flex items-center justify-between">
                <p className="text-[10px] text-slate-400 uppercase font-semibold">Suggested List Price</p>
                <p className="text-lg font-bold text-red-400">{formatCurrency(manualCompsResult.suggestedListPrice)}</p>
              </div>
              {manualCompsResult.exactMatchCount !== undefined && (
                <p className="text-[9px] text-slate-600 mt-0.5">{manualCompsResult.exactMatchCount} exact number match{manualCompsResult.exactMatchCount !== 1 ? 'es' : ''}</p>
              )}
            </div>

            {manualCompsResult.conditionNotes.map((note, i) => (
              <div key={i} className="flex items-start gap-1.5 mt-2">
                <AlertCircle size={11} className="text-amber-400 flex-shrink-0 mt-0.5" />
                <p className="text-[11px] text-amber-300">{note}</p>
              </div>
            ))}
          </div>

          {/* Individual listings */}
          {manualCompsResult.comps.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] text-slate-600 uppercase font-semibold">Individual Listings</p>
              {manualCompsResult.comps.slice(0, 10).map((comp, i) => (
                <div key={i} className="flex items-center gap-2.5 p-2 bg-slate-800/40 rounded-lg">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-white font-medium truncate">{comp.title}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] text-slate-600">{comp.condition}</span>
                      {comp.date && <span className="text-[10px] text-slate-600">{comp.date}</span>}
                      {comp.sold ? (
                        <Badge color="green">Sold</Badge>
                      ) : (
                        <Badge color="blue">Active</Badge>
                      )}
                      {comp.exactMatch && (
                        <Badge color="cyan">Exact</Badge>
                      )}
                    </div>
                    {comp.shipping && (
                      <p className="text-[10px] text-slate-600 mt-0.5">{comp.shipping}</p>
                    )}
                    <a href={comp.url} target="_blank" rel="noopener noreferrer" className="text-[10px] text-red-400 hover:text-red-300 mt-0.5 inline-flex items-center gap-0.5">
                      <ExternalLink size={9} /> View listing
                    </a>
                  </div>
                  <p className={`text-sm font-bold flex-shrink-0 ${comp.sold ? 'text-emerald-400' : 'text-red-400'}`}>
                    {formatCurrency(comp.price)}
                  </p>
                </div>
              ))}
            </div>
          )}

          {/* Search log */}
          {manualCompsResult.searchLog && manualCompsResult.searchLog.length > 0 && (
            <div className="space-y-1 p-2.5 bg-slate-900/40 border border-slate-800 rounded-xl">
              <p className="text-[9px] text-slate-500 uppercase font-bold tracking-wide">Research Log</p>
              {manualCompsResult.searchLog.map((log, i) => (
                <p key={i} className="text-[10px] text-slate-500 font-mono">{log}</p>
              ))}
            </div>
          )}

          {/* Debug indicator */}
          {manualDebugInfo && (
            <div className="space-y-1 p-2.5 bg-slate-900/40 border border-slate-800 rounded-xl">
              <p className="text-[9px] text-slate-500 uppercase font-bold tracking-wide">Debug Indicator</p>
              <pre className="text-[10px] text-slate-400 whitespace-pre-wrap font-mono">{manualDebugInfo}</pre>
            </div>
          )}

          {/* Search debug — shows exact query, endpoint, raw/parsed counts, rejection reasons */}
          {manualCompsResult.searchDebug && manualCompsResult.searchDebug.length > 0 && (
            <div className="space-y-1.5 p-2.5 bg-slate-900/40 border border-slate-800 rounded-xl">
              <p className="text-[9px] text-slate-500 uppercase font-bold tracking-wide">eBay Search Debug</p>
              {manualCompsResult.searchDebug.map((dbg, i) => (
                <div key={i} className="space-y-0.5">
                  <p className="text-[10px] text-slate-400 font-mono">Query: {dbg.query}</p>
                  <p className="text-[10px] text-slate-500">URL: {dbg.url.slice(0, 80)}</p>
                  <p className="text-[10px] text-slate-400">HTTP: {dbg.httpStatus} | HTML: {dbg.htmlLength} bytes | Raw: {dbg.rawResultCount} | Parsed: {dbg.parsedResultCount}{dbg.blocked ? ' | BLOCKED' : ''}</p>
                  {dbg.rejectionReasons.length > 0 && (
                    <div className="pl-2 space-y-0.5">
                      <p className="text-[9px] text-slate-600 uppercase">Rejections:</p>
                      {dbg.rejectionReasons.map((r, j) => (
                        <p key={j} className="text-[9px] text-slate-600">{r.title.slice(0, 30)} → {r.reason}</p>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Sold comps results */}
      {compsResult && (
        <div className="space-y-2">
          <div className={`p-3 rounded-xl border ${compsResult.confidence === 'high' ? 'bg-emerald-500/10 border-emerald-500/20' : compsResult.confidence === 'medium' ? 'bg-amber-500/10 border-amber-500/20' : 'bg-red-500/10 border-red-500/20'}`}>
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp size={14} className="text-slate-400" />
              <p className="text-[10px] uppercase font-semibold tracking-wide text-slate-400">eBay Sold/Completed Comps</p>
              <Badge color={compsResult.confidence === 'high' ? 'green' : compsResult.confidence === 'medium' ? 'amber' : 'red'}>
                {compsResult.confidence}
              </Badge>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <p className="text-[10px] text-slate-500 uppercase">Sold Range</p>
                <p className="text-sm font-bold text-white">{formatCurrency(compsResult.lowRange)} - {formatCurrency(compsResult.highRange)}</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-500 uppercase">Typical Sold Price</p>
                <p className="text-sm font-bold text-emerald-400">{formatCurrency(compsResult.typicalPrice)}</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-500 uppercase">Suggested List Price</p>
                <p className="text-sm font-bold text-red-400">{formatCurrency(compsResult.suggestedListPrice)}</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-500 uppercase">Sold Comps Found</p>
                <p className="text-sm font-bold text-white">{compsResult.oemUsedSoldCount}</p>
              </div>
            </div>
            {compsResult.conditionNotes.map((note, i) => (
              <div key={i} className="flex items-start gap-1.5 mt-2">
                <AlertCircle size={11} className="text-amber-400 flex-shrink-0 mt-0.5" />
                <p className="text-[11px] text-amber-300">{note}</p>
              </div>
            ))}
          </div>

          {/* Individual comps */}
          {compsResult.comps.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] text-slate-600 uppercase font-semibold">Individual Listings</p>
              {compsResult.comps.slice(0, 8).map((comp, i) => (
                <div key={i} className="flex items-center gap-2.5 p-2 bg-slate-800/40 rounded-lg">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-white font-medium truncate">{comp.title}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] text-slate-600">{comp.condition}</span>
                      {comp.date && <span className="text-[10px] text-slate-600">{comp.date}</span>}
                      {comp.sold ? (
                        <Badge color="green">Sold</Badge>
                      ) : (
                        <Badge color="blue">Active</Badge>
                      )}
                    </div>
                  </div>
                  <p className={`text-sm font-bold flex-shrink-0 ${comp.sold ? 'text-emerald-400' : 'text-red-400'}`}>
                    {formatCurrency(comp.price)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
