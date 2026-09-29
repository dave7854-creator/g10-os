import { useState, useCallback, useMemo, useEffect } from 'react';
import {
  ChevronLeft, Search, Loader2, Wrench, BookOpen, Video, Star, Package,
  AlertTriangle, ChevronRight, Check, ArrowLeft, Save, Plus, Lightbulb,
  ShieldCheck, Sparkles, ClipboardList, ExternalLink, Car, Stethoscope,
  Zap, Clipboard, Clock, FileText,
} from 'lucide-react';
import { Card, Badge, Button } from '@/components/ui';
import { supabase } from '@/supabaseClient';
import {
  searchRepairInfo, saveShopKnowledge, toggleVideoRecommended,
  vehicleLabel, isDtcQuery,
  type RepairOverview, type RepairProcedure, type RepairVehicle,
  type InfoSource, type ShopKnowledgeEntry,
} from '@/shop/repairInformationProvider';
import type { ShopWorkOrder, ShopVehicle, ShopLaborOp, ShopPart } from '@/screens/ShopScreen';

interface Props {
  vehicle: ShopVehicle | null;
  workOrder: ShopWorkOrder | null;
  laborRate: number;
  onBack: () => void;
  onChanged: () => void;
}

export function RepairInfoScreen({ vehicle, workOrder, laborRate, onBack, onChanged }: Props) {
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [overview, setOverview] = useState<RepairOverview | null>(null);
  const [activeProcedure, setActiveProcedure] = useState<RepairProcedure | null>(null);
  const [breadcrumb, setBreadcrumb] = useState<string[]>([]);
  const [showAiChecklist, setShowAiChecklist] = useState(false);
  const [showSaveKnowledge, setShowSaveKnowledge] = useState(false);
  const [savedSearchQuery, setSavedSearchQuery] = useState('');

  const repairVehicle: RepairVehicle = useMemo(() => ({
    vin: vehicle?.vin ?? null,
    year: vehicle?.year ?? null,
    make: vehicle?.make ?? null,
    model: vehicle?.model ?? null,
    engine: vehicle?.engine ?? null,
    trim: vehicle?.trim ?? null,
    drivetrain: vehicle?.drivetrain ?? null,
  }), [vehicle]);

  const handleSearch = useCallback(async () => {
    if (!query.trim()) return;
    setSearching(true);
    setSavedSearchQuery(query.trim());
    try {
      const result = await searchRepairInfo(query.trim(), repairVehicle);
      setOverview(result);
      setActiveProcedure(result.mainProcedure);
      setBreadcrumb([result.mainProcedure?.title ?? query.trim()]);
    } catch {
      // Error state handled by null overview
    } finally {
      setSearching(false);
    }
  }, [query, repairVehicle]);

  const handleProcedureNavigation = useCallback((proc: RepairProcedure) => {
    setActiveProcedure(proc);
    setBreadcrumb(prev => [...prev, proc.title]);
    setShowAiChecklist(false);
  }, []);

  const handleBreadcrumbBack = useCallback(() => {
    setBreadcrumb(prev => {
      if (prev.length <= 1) return prev;
      const newBreadcrumb = prev.slice(0, -1);
      const prevTitle = newBreadcrumb[newBreadcrumb.length - 1];
      const proc = overview?.relatedProcedures.find(p => p.title === prevTitle)
        ?? (overview?.mainProcedure?.title === prevTitle ? overview.mainProcedure : null);
      setActiveProcedure(proc);
      return newBreadcrumb;
    });
  }, [overview]);

  const handleBackToMain = useCallback(() => {
    if (overview?.mainProcedure) {
      setActiveProcedure(overview.mainProcedure);
      setBreadcrumb([overview.mainProcedure.title]);
    }
  }, [overview]);

  const handleAddPartsToWorkOrder = useCallback(async (parts: RepairProcedure['partsNeeded']) => {
    if (!workOrder) return;
    for (const part of parts) {
      const sellPrice = 0;
      await supabase.from('shop_parts').insert({
        work_order_id: workOrder.id,
        part_number: part.partNumber ?? null,
        description: part.description,
        cost: 0,
        markup_percent: 30,
        sell_price: sellPrice,
        is_ai_suggested: part.source === 'ai_assistant',
        display_order: 999,
      });
    }
    onChanged();
  }, [workOrder, onChanged]);

  const handleAddLaborToWorkOrder = useCallback(async (description: string, estimatedHours: number) => {
    if (!workOrder) return;
    await supabase.from('shop_labor_operations').insert({
      work_order_id: workOrder.id,
      operation_description: description,
      book_hours: estimatedHours,
      charged_hours: estimatedHours,
      labor_rate: laborRate,
      labor_total: estimatedHours * laborRate,
      data_source: 'AI Estimate',
      is_ai_estimate: true,
      display_order: 999,
    });
    onChanged();
  }, [workOrder, laborRate]);

  if (!vehicle) {
    return (
      <div className="space-y-4">
        <button onClick={onBack} className="flex items-center gap-1 text-slate-400 text-sm">
          <ChevronLeft size={18} /> Back
        </button>
        <div className="flex flex-col items-center text-center py-16">
          <Car size={48} className="text-slate-700" strokeWidth={1.5} />
          <p className="text-slate-500 text-sm mt-3">No vehicle selected</p>
          <p className="text-slate-600 text-xs mt-1">Select a work order with a vehicle to use Repair Info.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="flex items-center gap-1 text-slate-400 text-sm">
        <ChevronLeft size={18} /> Back to Work Order
      </button>

      {/* Vehicle context card */}
      <Card className="p-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center flex-shrink-0">
            <Car size={18} className="text-amber-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-white truncate">{vehicleLabel(repairVehicle)}</p>
            <p className="text-xs text-slate-500 truncate">
              {vehicle.vin ?? 'No VIN'} · {vehicle.engine ?? 'N/A'}
            </p>
          </div>
          {workOrder && (
            <Badge color="blue">{workOrder.work_order_number}</Badge>
          )}
        </div>
      </Card>

      {/* Search */}
      {!overview && (
        <div className="space-y-4">
          <div className="text-center pt-2">
            <div className="w-16 h-16 rounded-2xl bg-red-500/10 flex items-center justify-center mx-auto mb-3">
              <Stethoscope size={32} className="text-red-400" />
            </div>
            <h1 className="text-2xl font-bold text-white">Repair Info</h1>
            <p className="text-slate-400 text-sm mt-1">What are you repairing?</p>
          </div>

          <div className="relative">
            <Search size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="e.g. Replace water pump, P0087, Remove transmission..."
              className="w-full bg-slate-800/60 border border-slate-700/50 rounded-2xl pl-12 pr-4 py-4 text-white text-base placeholder:text-slate-500 focus:border-red-500 focus:outline-none"
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            {['Replace water pump', 'P0420', 'Front wheel bearing', 'Remove transmission', 'Replace alternator', 'P0300 misfire'].map(suggestion => (
              <button
                key={suggestion}
                onClick={() => { setQuery(suggestion); }}
                className="text-left p-3 bg-slate-800/40 border border-slate-700/30 rounded-xl text-xs text-slate-300 active:scale-[0.97] transition-transform"
              >
                <Search size={12} className="text-slate-600 mr-1.5 inline" />
                {suggestion}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl">
            <ShieldCheck size={16} className="text-amber-400 flex-shrink-0" />
            <p className="text-xs text-amber-300">
              OEM repair information provider not connected. AI-generated guidance is available but must be verified against OEM data.
            </p>
          </div>
        </div>
      )}

      {searching && (
        <div className="flex flex-col items-center py-16">
          <Loader2 size={32} className="text-red-400 animate-spin" />
          <p className="text-slate-400 text-sm mt-3">Searching repair information...</p>
        </div>
      )}

      {/* Repair Overview */}
      {overview && !searching && (
        <RepairOverviewView
          overview={overview}
          activeProcedure={activeProcedure}
          breadcrumb={breadcrumb}
          showAiChecklist={showAiChecklist}
          onToggleAiChecklist={() => setShowAiChecklist(!showAiChecklist)}
          onNavigateProcedure={handleProcedureNavigation}
          onBreadcrumbBack={handleBreadcrumbBack}
          onBackToMain={handleBackToMain}
          onAddPartsToWorkOrder={handleAddPartsToWorkOrder}
          onAddLaborToWorkOrder={handleAddLaborToWorkOrder}
          onToggleVideoRecommended={async (videoId, recommended) => {
            await toggleVideoRecommended(videoId, recommended);
            setOverview(prev => prev ? { ...prev } : null);
          }}
          onNewSearch={() => { setOverview(null); setQuery(''); setActiveProcedure(null); setBreadcrumb([]); }}
          onShowSaveKnowledge={() => setShowSaveKnowledge(true)}
          searchQuery={savedSearchQuery}
          repairVehicle={repairVehicle}
          hasWorkOrder={!!workOrder}
        />
      )}

      {/* Save Knowledge Modal */}
      {showSaveKnowledge && (
        <SaveKnowledgeModal
          query={savedSearchQuery}
          vehicle={repairVehicle}
          onClose={() => setShowSaveKnowledge(false)}
          onSave={async (entry) => {
            await saveShopKnowledge(savedSearchQuery, repairVehicle, entry);
            setShowSaveKnowledge(false);
          }}
        />
      )}
    </div>
  );
}

// ===== REPAIR OVERVIEW VIEW =====
function RepairOverviewView({
  overview, activeProcedure, breadcrumb, showAiChecklist,
  onToggleAiChecklist, onNavigateProcedure, onBreadcrumbBack, onBackToMain,
  onAddPartsToWorkOrder, onAddLaborToWorkOrder, onToggleVideoRecommended,
  onNewSearch, onShowSaveKnowledge, searchQuery, repairVehicle, hasWorkOrder,
}: {
  overview: RepairOverview;
  activeProcedure: RepairProcedure | null;
  breadcrumb: string[];
  showAiChecklist: boolean;
  onToggleAiChecklist: () => void;
  onNavigateProcedure: (proc: RepairProcedure) => void;
  onBreadcrumbBack: () => void;
  onBackToMain: () => void;
  onAddPartsToWorkOrder: (parts: RepairProcedure['partsNeeded']) => void;
  onAddLaborToWorkOrder: (desc: string, hours: number) => void;
  onToggleVideoRecommended: (videoId: string, recommended: boolean) => void;
  onNewSearch: () => void;
  onShowSaveKnowledge: () => void;
  searchQuery: string;
  repairVehicle: RepairVehicle;
  hasWorkOrder: boolean;
}) {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['main']));

  const toggleSection = (id: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (!activeProcedure) {
    return (
      <div className="flex flex-col items-center text-center py-16">
        <AlertTriangle size={36} className="text-slate-700" strokeWidth={1.5} />
        <p className="text-slate-500 text-sm mt-3">No repair information found</p>
        <Button variant="secondary" size="sm" className="mt-4" onClick={onNewSearch}>Search Again</Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Breadcrumb */}
      {breadcrumb.length > 1 && (
        <div className="flex items-center gap-1.5 flex-wrap text-xs">
          <button onClick={onBackToMain} className="text-red-400 font-semibold">Return to Main Repair</button>
          <span className="text-slate-600">·</span>
          <button onClick={onBreadcrumbBack} className="text-slate-300 flex items-center gap-1">
            <ArrowLeft size={12} /> Back
          </button>
        </div>
      )}

      {/* Title */}
      <div>
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="text-xl font-bold text-white">{activeProcedure.title}</h1>
          <SourceBadge source={activeProcedure.source} />
          {activeProcedure.isDtc && <Badge color="red">DTC</Badge>}
        </div>
        {overview.oemProviderConnected ? (
          <p className="text-xs text-emerald-400 mt-1">OEM provider connected</p>
        ) : (
          <p className="text-xs text-amber-400 mt-1">OEM repair information provider not connected</p>
        )}
      </div>

      {/* DTC Info */}
      {overview.isDtcSearch && activeProcedure.dtcCode && (
        <Card className="p-4 bg-red-500/5 border-red-500/20">
          <div className="flex items-center gap-2">
            <Zap size={18} className="text-red-400" />
            <div>
              <p className="text-sm font-bold text-white">{activeProcedure.dtcCode}</p>
              <p className="text-xs text-slate-400">{activeProcedure.title.replace(`${activeProcedure.dtcCode}: `, '')}</p>
            </div>
          </div>
        </Card>
      )}

      {/* AI Summary */}
      {activeProcedure.aiSummary && (
        <Card className="p-4 bg-red-500/5 border-red-500/20">
          <div className="flex items-start gap-2">
            <Sparkles size={16} className="text-red-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-[10px] text-red-400 uppercase font-semibold">AI Assistant Summary</p>
              <p className="text-sm text-slate-300 mt-1">{activeProcedure.aiSummary}</p>
            </div>
          </div>
        </Card>
      )}

      {/* OEM not connected notice */}
      {!overview.oemProviderConnected && (
        <div className="flex items-center gap-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl">
          <ShieldCheck size={16} className="text-amber-400 flex-shrink-0" />
          <p className="text-xs text-amber-300">
            Information shown is from the AI Assistant. OEM Verified information requires a licensed provider connection.
          </p>
        </div>
      )}

      {/* AI Checklist toggle */}
      {activeProcedure.aiChecklist && activeProcedure.aiChecklist.length > 0 && (
        <Button variant="secondary" size="md" className="w-full" onClick={onToggleAiChecklist} icon={<Lightbulb size={18} />}>
          {showAiChecklist ? 'Hide AI Checklist' : 'Simplify with AI'}
        </Button>
      )}

      {/* AI Checklist */}
      {showAiChecklist && activeProcedure.aiChecklist && (
        <Card className="p-4 bg-red-500/5 border-red-500/20">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-bold text-red-400">AI Technician Checklist</p>
            <span className="text-[10px] text-slate-500">AI-generated · links to original</span>
          </div>
          <div className="space-y-2">
            {activeProcedure.aiChecklist.map((item, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-red-500/15 flex items-center justify-center flex-shrink-0">
                  <span className="text-[10px] font-bold text-red-400">{i + 1}</span>
                </div>
                <p className="text-sm text-slate-300 flex-1">{item.step}</p>
                {item.oemRefId && (
                  <button
                    onClick={() => {
                      const step = activeProcedure.steps.find(s => s.id === item.oemRefId);
                      if (step) toggleSection('main');
                    }}
                    className="text-[10px] text-red-400 font-semibold"
                  >
                    View Original
                  </button>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Main Procedure */}
      <CollapsibleSection
        id="main"
        title="Main Procedure"
        icon={<BookOpen size={16} />}
        expanded={expandedSections.has('main')}
        onToggle={() => toggleSection('main')}
      >
        <div className="space-y-3">
          {activeProcedure.steps.map((step, i) => (
            <div key={step.id} className="flex gap-3">
              <div className="w-7 h-7 rounded-lg bg-slate-700/50 flex items-center justify-center flex-shrink-0 text-xs font-bold text-slate-300">
                {i + 1}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-white">{step.title}</p>
                  <SourceBadge source={step.source} small />
                </div>
                <p className="text-xs text-slate-400 mt-0.5">{step.description}</p>
                {step.warnings && step.warnings.length > 0 && (
                  <div className="mt-1.5 space-y-1">
                    {step.warnings.map((w, wi) => (
                      <div key={wi} className="flex items-center gap-1.5 text-[11px] text-amber-300">
                        <AlertTriangle size={11} className="flex-shrink-0" />
                        {w}
                      </div>
                    ))}
                  </div>
                )}
                {step.relatedProcedureIds && step.relatedProcedureIds.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {step.relatedProcedureIds.map(rid => {
                      const related = overview.relatedProcedures.find(p => p.id === rid);
                      if (!related) return null;
                      return (
                        <button
                          key={rid}
                          onClick={() => onNavigateProcedure(related)}
                          className="flex items-center gap-1 text-[11px] text-red-400 font-semibold bg-red-500/10 px-2 py-1 rounded-lg active:scale-95 transition-transform"
                        >
                          {related.title} <ChevronRight size={10} />
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </CollapsibleSection>

      {/* Related Procedures */}
      {overview.relatedProcedures.length > 0 && (
        <CollapsibleSection
          id="related"
          title={`Related Procedures (${overview.relatedProcedures.length})`}
          icon={<ClipboardList size={16} />}
          expanded={expandedSections.has('related')}
          onToggle={() => toggleSection('related')}
        >
          <div className="space-y-2">
            {overview.relatedProcedures.map(proc => (
              <button
                key={proc.id}
                onClick={() => onNavigateProcedure(proc)}
                className="w-full flex items-center justify-between p-3 bg-slate-900/40 rounded-xl active:scale-[0.97] transition-transform"
              >
                <div className="flex items-center gap-2">
                  <Wrench size={14} className="text-slate-500" />
                  <span className="text-sm text-slate-200">{proc.title}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <SourceBadge source={proc.source} small />
                  <ChevronRight size={14} className="text-slate-600" />
                </div>
              </button>
            ))}
          </div>
        </CollapsibleSection>
      )}

      {/* Parts Needed */}
      {activeProcedure.partsNeeded.length > 0 && (
        <CollapsibleSection
          id="parts"
          title={`Parts Needed (${activeProcedure.partsNeeded.length})`}
          icon={<Package size={16} />}
          expanded={expandedSections.has('parts')}
          onToggle={() => toggleSection('parts')}
        >
          <div className="space-y-2">
            {(['oem_required', 'ai_suggested', 'shop_recommended'] as const).map(cat => {
              const parts = activeProcedure.partsNeeded.filter(p => p.category === cat);
              if (parts.length === 0) return null;
              return (
                <div key={cat}>
                  <p className="text-[10px] text-slate-500 uppercase font-semibold mb-1.5">
                    {cat === 'oem_required' ? 'OEM Required' : cat === 'ai_suggested' ? 'AI Suggested' : 'Shop Recommended'}
                  </p>
                  {parts.map((part, i) => (
                    <div key={i} className="flex items-center gap-2 p-2 bg-slate-900/40 rounded-lg mb-1">
                      <Package size={12} className="text-slate-500 flex-shrink-0" />
                      <span className="text-sm text-slate-200 flex-1">{part.description}</span>
                      {part.partNumber && <span className="text-[10px] text-red-400 font-mono">{part.partNumber}</span>}
                      {part.isOneTimeUse && <Badge color="amber">1x use</Badge>}
                      {part.isFluid && <Badge color="cyan">Fluid</Badge>}
                    </div>
                  ))}
                </div>
              );
            })}
            {hasWorkOrder && (
              <Button size="sm" variant="secondary" className="w-full mt-2" onClick={() => onAddPartsToWorkOrder(activeProcedure.partsNeeded)} icon={<Plus size={14} />}>
                Add Parts to Work Order
              </Button>
            )}
          </div>
        </CollapsibleSection>
      )}

      {/* Tools Needed */}
      {activeProcedure.toolsNeeded.length > 0 && (
        <CollapsibleSection
          id="tools"
          title={`Tools Needed (${activeProcedure.toolsNeeded.length})`}
          icon={<Wrench size={16} />}
          expanded={expandedSections.has('tools')}
          onToggle={() => toggleSection('tools')}
        >
          <div className="space-y-2">
            {(['oem_special_tool', 'standard_tool', 'ai_suggested', 'shop_tool'] as const).map(cat => {
              const tools = activeProcedure.toolsNeeded.filter(t => t.category === cat);
              if (tools.length === 0) return null;
              return (
                <div key={cat}>
                  <p className="text-[10px] text-slate-500 uppercase font-semibold mb-1.5">
                    {cat === 'oem_special_tool' ? 'OEM Special Tool' : cat === 'standard_tool' ? 'Standard Tool' : cat === 'ai_suggested' ? 'AI Suggested' : 'Shop Tool'}
                  </p>
                  {tools.map((tool, i) => (
                    <div key={i} className="flex items-center gap-2 p-2 bg-slate-900/40 rounded-lg mb-1">
                      <Wrench size={12} className="text-slate-500 flex-shrink-0" />
                      <span className="text-sm text-slate-200 flex-1">{tool.description}</span>
                      {tool.locationNote && <span className="text-[10px] text-amber-400">{tool.locationNote}</span>}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </CollapsibleSection>
      )}

      {/* Specifications */}
      {activeProcedure.specs.length > 0 && (
        <CollapsibleSection
          id="specs"
          title="Specifications / Torque"
          icon={<ShieldCheck size={16} />}
          expanded={expandedSections.has('specs')}
          onToggle={() => toggleSection('specs')}
        >
          <div className="space-y-1.5">
            {activeProcedure.specs.map((spec, i) => (
              <div key={i} className="flex items-center justify-between p-2 bg-slate-900/40 rounded-lg">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-slate-300">{spec.label}</span>
                  <SourceBadge source={spec.source} small />
                </div>
                <span className="text-sm font-bold text-white">{spec.value}</span>
              </div>
            ))}
          </div>
        </CollapsibleSection>
      )}

      {/* Warnings */}
      {activeProcedure.warnings.length > 0 && (
        <Card className="p-4 bg-amber-500/5 border-amber-500/20">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle size={16} className="text-amber-400" />
            <p className="text-sm font-bold text-amber-300">Warnings</p>
          </div>
          <div className="space-y-1.5">
            {activeProcedure.warnings.map((w, i) => (
              <p key={i} className="text-xs text-amber-200/80 flex items-start gap-1.5">
                <span className="text-amber-500">•</span>
                {w}
              </p>
            ))}
          </div>
        </Card>
      )}

      {/* Programming / Relearn */}
      {activeProcedure.programmingRelearn && (
        <Card className="p-4 bg-cyan-500/5 border-cyan-500/20">
          <div className="flex items-center gap-2 mb-1">
            <Zap size={16} className="text-cyan-400" />
            <p className="text-sm font-bold text-cyan-300">Programming / Relearn</p>
          </div>
          <p className="text-xs text-slate-300">{activeProcedure.programmingRelearn}</p>
        </Card>
      )}

      {/* TSBs */}
      {activeProcedure.tsbs && activeProcedure.tsbs.length > 0 && (
        <CollapsibleSection
          id="tsbs"
          title={`TSBs (${activeProcedure.tsbs.length})`}
          icon={<FileText size={16} />}
          expanded={expandedSections.has('tsbs')}
          onToggle={() => toggleSection('tsbs')}
        >
          <div className="space-y-2">
            {activeProcedure.tsbs.map((tsb, i) => (
              <div key={i} className="p-2 bg-slate-900/40 rounded-lg">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-slate-200">{tsb.title}</span>
                  <SourceBadge source={tsb.source} small />
                </div>
                <p className="text-[10px] text-slate-500 mt-0.5">TSB #{tsb.number}</p>
              </div>
            ))}
          </div>
        </CollapsibleSection>
      )}

      {/* Videos */}
      {activeProcedure.videos.length > 0 && (
        <CollapsibleSection
          id="videos"
          title={`Videos (${activeProcedure.videos.length})`}
          icon={<Video size={16} />}
          expanded={expandedSections.has('videos')}
          onToggle={() => toggleSection('videos')}
        >
          <p className="text-[10px] text-slate-500 mb-2">THIRD-PARTY VIDEO — Always verify procedures with OEM data.</p>
          <div className="space-y-3">
            {activeProcedure.videos.map(video => (
              <div key={video.videoId} className="bg-slate-900/40 rounded-xl overflow-hidden">
                {video.thumbnail && (
                  <a href={video.url} target="_blank" rel="noopener noreferrer">
                    <img src={video.thumbnail} alt={video.title} className="w-full h-32 object-cover" />
                  </a>
                )}
                <div className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-white line-clamp-2">{video.title}</p>
                      <p className="text-[10px] text-slate-500 mt-0.5">{video.channel}{video.duration ? ` · ${video.duration}` : ''}</p>
                      <p className="text-[10px] text-red-400 mt-0.5">{video.matchReason}</p>
                    </div>
                    {video.isShopRecommended && (
                      <div className="flex items-center gap-0.5 text-[10px] text-amber-400 font-semibold">
                        <Star size={10} fill="currentColor" /> Shop
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <a
                      href={video.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 bg-red-600/20 text-red-400 text-xs font-semibold py-2 rounded-lg flex items-center justify-center gap-1 active:scale-95 transition-transform"
                    >
                      <ExternalLink size={12} /> Watch
                    </a>
                    <button
                      onClick={() => onToggleVideoRecommended(video.videoId, !video.isShopRecommended)}
                      className={`px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                        video.isShopRecommended
                          ? 'bg-amber-500/20 text-amber-400'
                          : 'bg-slate-700/50 text-slate-400'
                      }`}
                    >
                      <Star size={12} fill={video.isShopRecommended ? 'currentColor' : 'none'} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CollapsibleSection>
      )}

      {/* Shop Knowledge */}
      {overview.shopKnowledge.length > 0 && (
        <CollapsibleSection
          id="knowledge"
          title={`Shop Knowledge (${overview.shopKnowledge.length})`}
          icon={<Clipboard size={16} />}
          expanded={expandedSections.has('knowledge')}
          onToggle={() => toggleSection('knowledge')}
        >
          <div className="space-y-2">
            {overview.shopKnowledge.map(entry => (
              <Card key={entry.id} className="p-3 bg-emerald-500/5 border-emerald-500/20">
                {entry.technicianNotes && <p className="text-sm text-slate-200">{entry.technicianNotes}</p>}
                <div className="flex items-center gap-3 mt-1.5 flex-wrap text-[10px] text-slate-500">
                  {entry.actualRepairTimeMinutes && (
                    <span className="flex items-center gap-0.5"><Clock size={10} /> {entry.actualRepairTimeMinutes} min</span>
                  )}
                  {entry.specialTools && <span className="flex items-center gap-0.5"><Wrench size={10} /> {entry.specialTools}</span>}
                  {entry.tips && <span className="flex items-center gap-0.5"><Lightbulb size={10} /> {entry.tips}</span>}
                </div>
                {entry.problemsEncountered && (
                  <p className="text-[11px] text-amber-300 mt-1">Problem: {entry.problemsEncountered}</p>
                )}
              </Card>
            ))}
          </div>
        </CollapsibleSection>
      )}

      {/* Action Buttons */}
      <div className="flex gap-2 pt-2">
        <Button variant="secondary" className="flex-1" onClick={onShowSaveKnowledge} icon={<Save size={16} />}>
          Save Knowledge
        </Button>
        <Button variant="ghost" className="flex-1" onClick={onNewSearch} icon={<Search size={16} />}>
          New Search
        </Button>
      </div>

      {hasWorkOrder && (
        <Button
          variant="secondary"
          size="sm"
          className="w-full"
          onClick={() => onAddLaborToWorkOrder(activeProcedure.title, 1.0)}
          icon={<Plus size={14} />}
        >
          Add Labor to Work Order
        </Button>
      )}
    </div>
  );
}

// ===== COLLAPSIBLE SECTION =====
function CollapsibleSection({ id, title, icon, expanded, onToggle, children }: {
  id: string;
  title: string;
  icon: React.ReactNode;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <Card className="overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-3.5 active:scale-[0.98] transition-transform"
      >
        <div className="flex items-center gap-2">
          <span className="text-slate-400">{icon}</span>
          <span className="text-sm font-bold text-white">{title}</span>
        </div>
        <ChevronRight size={16} className={`text-slate-500 transition-transform ${expanded ? 'rotate-90' : ''}`} />
      </button>
      {expanded && <div className="px-3.5 pb-3.5">{children}</div>}
    </Card>
  );
}

// ===== SOURCE BADGE =====
function SourceBadge({ source, small }: { source: InfoSource; small?: boolean }) {
  const config: Record<InfoSource, { label: string; color: 'blue' | 'green' | 'amber' | 'slate' | 'cyan' }> = {
    oem_verified: { label: 'OEM Verified', color: 'green' },
    ai_assistant: { label: 'AI', color: 'blue' },
    shop_knowledge: { label: 'Shop', color: 'amber' },
    video_third_party: { label: 'Third-Party', color: 'slate' },
  };
  const c = config[source];
  return <Badge color={c.color}>{small ? c.label.slice(0, 3) : c.label}</Badge>;
}

// ===== SAVE KNOWLEDGE MODAL =====
function SaveKnowledgeModal({ query, vehicle, onClose, onSave }: {
  query: string;
  vehicle: RepairVehicle;
  onClose: () => void;
  onSave: (entry: {
    technicianNotes?: string;
    actualRepairTimeMinutes?: number;
    partsUsed?: string;
    problemsEncountered?: string;
    specialTools?: string;
    tips?: string;
    recommendedVideoUrl?: string;
    recommendedVideoTitle?: string;
  }) => void;
}) {
  const [notes, setNotes] = useState('');
  const [time, setTime] = useState('');
  const [parts, setParts] = useState('');
  const [problems, setProblems] = useState('');
  const [tools, setTools] = useState('');
  const [tips, setTips] = useState('');

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-end lg:items-center justify-center p-0 lg:p-4">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-700/50 rounded-t-3xl lg:rounded-3xl max-h-[85vh] overflow-y-auto">
        <div className="sticky top-0 bg-slate-900 border-b border-slate-700/50 p-4 flex items-center justify-between z-10">
          <h2 className="text-sm font-bold text-white">Save Shop Knowledge</h2>
          <button onClick={onClose} className="text-slate-400">✕</button>
        </div>
        <div className="p-4 space-y-3">
          <p className="text-xs text-slate-500">Saving knowledge for: <span className="text-slate-300">{query}</span> on <span className="text-slate-300">{vehicleLabel(vehicle)}</span></p>

          <div>
            <label className="text-[10px] text-slate-500 uppercase font-semibold">Technician Notes</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="w-full bg-slate-800 border border-slate-700/50 rounded-xl px-3 py-2 text-white text-sm mt-1 focus:border-red-500 focus:outline-none" />
          </div>
          <div>
            <label className="text-[10px] text-slate-500 uppercase font-semibold">Actual Repair Time (minutes)</label>
            <input type="number" value={time} onChange={(e) => setTime(e.target.value)} className="w-full bg-slate-800 border border-slate-700/50 rounded-xl px-3 py-2 text-white text-sm mt-1 focus:border-red-500 focus:outline-none" />
          </div>
          <div>
            <label className="text-[10px] text-slate-500 uppercase font-semibold">Parts Used</label>
            <input value={parts} onChange={(e) => setParts(e.target.value)} className="w-full bg-slate-800 border border-slate-700/50 rounded-xl px-3 py-2 text-white text-sm mt-1 focus:border-red-500 focus:outline-none" />
          </div>
          <div>
            <label className="text-[10px] text-slate-500 uppercase font-semibold">Problems Encountered</label>
            <input value={problems} onChange={(e) => setProblems(e.target.value)} className="w-full bg-slate-800 border border-slate-700/50 rounded-xl px-3 py-2 text-white text-sm mt-1 focus:border-red-500 focus:outline-none" />
          </div>
          <div>
            <label className="text-[10px] text-slate-500 uppercase font-semibold">Special Tools</label>
            <input value={tools} onChange={(e) => setTools(e.target.value)} className="w-full bg-slate-800 border border-slate-700/50 rounded-xl px-3 py-2 text-white text-sm mt-1 focus:border-red-500 focus:outline-none" />
          </div>
          <div>
            <label className="text-[10px] text-slate-500 uppercase font-semibold">Tips</label>
            <input value={tips} onChange={(e) => setTips(e.target.value)} className="w-full bg-slate-800 border border-slate-700/50 rounded-xl px-3 py-2 text-white text-sm mt-1 focus:border-red-500 focus:outline-none" />
          </div>

          <div className="flex gap-2 pt-2">
            <Button variant="secondary" className="flex-1" onClick={onClose}>Cancel</Button>
            <Button className="flex-1" onClick={() => {
              onSave({
                technicianNotes: notes || undefined,
                actualRepairTimeMinutes: time ? parseInt(time) : undefined,
                partsUsed: parts || undefined,
                problemsEncountered: problems || undefined,
                specialTools: tools || undefined,
                tips: tips || undefined,
              });
            }} icon={<Save size={16} />}>Save</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
