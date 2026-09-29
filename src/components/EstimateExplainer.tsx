import { HelpCircle, X, Database, Layers, CheckCircle2, AlertCircle } from 'lucide-react';
import type { EstimateBreakdown } from '@/types';
import { Card, Badge } from '@/components/ui';

export function SourceTag({ kind, compact }: { kind: 'real' | 'placeholder'; compact?: boolean }) {
  if (kind === 'real') {
    return (
      <span className={`inline-flex items-center gap-1 ${compact ? 'text-[9px]' : 'text-[10px]'} font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-1.5 py-0.5`}>
        <Database size={10} /> Real data
      </span>
    );
  }
  return (
    <span className={`inline-flex items-center gap-1 ${compact ? 'text-[9px]' : 'text-[10px]'} font-semibold text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-full px-1.5 py-0.5`}>
      <Layers size={10} /> Estimated
    </span>
  );
}

export function EstimateExplainer({
  breakdown,
  title,
  onClose,
}: {
  breakdown: EstimateBreakdown;
  title: string;
  onClose: () => void;
}) {
  const realCount = breakdown.sources.filter((s) => s.kind === 'real').length;
  const placeholderCount = breakdown.sources.length - realCount;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in" />
      <div
        className="relative w-full max-w-md bg-slate-900 rounded-t-3xl border-t border-slate-700/50 max-h-[85vh] overflow-y-auto scrollbar-hide animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-slate-900/95 backdrop-blur-xl px-4 pt-4 pb-3 border-b border-slate-800 flex items-center justify-between z-10">
          <div className="flex items-center gap-2">
            <HelpCircle size={20} className="text-red-400" />
            <h2 className="text-lg font-bold text-white">Why this estimate?</h2>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center">
            <X size={18} className="text-slate-400" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div>
            <p className="text-sm font-semibold text-white">{title}</p>
            <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">{breakdown.summary}</p>
          </div>

          <div className="flex items-center gap-2">
            <Badge color="green">{realCount} real</Badge>
            <Badge color="amber">{placeholderCount} estimated</Badge>
          </div>

          <div className="space-y-3">
            {breakdown.sources.map((source, idx) => (
              <Card key={idx} className="p-3.5">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    {source.kind === 'real' ? (
                      <CheckCircle2 size={16} className="text-emerald-400 flex-shrink-0 mt-0.5" />
                    ) : (
                      <AlertCircle size={16} className="text-amber-400 flex-shrink-0 mt-0.5" />
                    )}
                    <p className="text-sm font-semibold text-white">{source.label}</p>
                  </div>
                  <SourceTag kind={source.kind} />
                </div>
                <p className="text-xs text-slate-400 leading-relaxed pl-6">{source.detail}</p>
              </Card>
            ))}
          </div>

          <div className="p-3 bg-slate-800/50 rounded-xl">
            <p className="text-[11px] text-slate-500 leading-relaxed">
              Real data comes from verified sources like the NHTSA VIN decode API or your actual past sales records.
              Estimated data uses industry category ranges and heuristic adjustments. As you accumulate more sales,
              more values will shift to real data and confidence will increase.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export function WhyEstimateButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-400 hover:text-red-300 transition-colors active:scale-95"
    >
      <HelpCircle size={13} />
      Why this estimate?
    </button>
  );
}
