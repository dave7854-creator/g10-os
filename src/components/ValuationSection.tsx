import { useState } from 'react';
import { TrendingUp, Edit3, X, Check, AlertTriangle, Clock, Tag } from 'lucide-react';
import { Badge, Button } from '@/components/ui';
import { compTierLabel, compTierBadgeColor, confidenceColor } from '@/data';
import { formatCurrency } from '@/components/ui';
import type { DismantlePart, VehicleStore, CompListing } from '@/types';

export function ValuationSection({
  part,
  store,
}: {
  part: DismantlePart;
  store: VehicleStore;
}) {
  const [editing, setEditing] = useState(false);
  const [overrideValue, setOverrideValue] = useState('');
  const [overrideNotes, setOverrideNotes] = useState('');
  const [showAllComps, setShowAllComps] = useState(false);

  const { valuation } = part;
  const isGone = part.status === 'scrapped' || part.status === 'sold';
  const isOverridden = valuation.adjustedValue !== null;
  const effectivePrice = isOverridden ? valuation.adjustedValue! : valuation.askingPrice;

  const handleSave = () => {
    const val = overrideValue.trim() === '' ? null : Number(overrideValue);
    store.setPartValuation(part.id, part.vehicleId, val, overrideNotes);
    setEditing(false);
  };

  const handleReset = () => {
    store.setPartValuation(part.id, part.vehicleId, null, '');
    setEditing(false);
  };

  const startEdit = () => {
    setOverrideValue(valuation.adjustedValue !== null ? String(valuation.adjustedValue) : '');
    setOverrideNotes(valuation.notes);
    setEditing(true);
  };

  const visibleComps = showAllComps ? valuation.comps : valuation.comps.slice(0, 5);

  if (isGone) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Tag size={14} className="text-slate-400" />
          <p className="text-[10px] text-slate-500 uppercase font-semibold tracking-wide">Valuation</p>
        </div>
        <div className="p-3 bg-slate-800/40 rounded-xl text-center">
          <p className="text-sm text-slate-500">Value zeroed out — part marked as {part.status}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <TrendingUp size={14} className="text-slate-400" />
        <p className="text-[10px] text-slate-500 uppercase font-semibold tracking-wide">Valuation</p>
        <Badge color={compTierBadgeColor(valuation.compTier)}>{compTierLabel(valuation.compTier)}</Badge>
        <Badge color={confidenceColor(valuation.confidenceLabel)}>
          {valuation.confidenceLabel === 'low' && <AlertTriangle size={10} />}
          {valuation.confidenceLabel} confidence
        </Badge>
        {isOverridden && <Badge color="blue">Manual Override</Badge>}
      </div>

      {valuation.oemUsedSoldCount < 5 && (
        <div className="flex items-start gap-2 p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-xl">
          <AlertTriangle size={14} className="text-amber-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-xs text-amber-300 font-semibold">
              {valuation.oemUsedSoldCount === 0
                ? 'No OEM used sold data found'
                : `Limited used market data — only ${valuation.oemUsedSoldCount} OEM used sold listing${valuation.oemUsedSoldCount !== 1 ? 's' : ''}`}
            </p>
            <p className="text-[11px] text-amber-400/70 mt-0.5">
              {valuation.oemUsedSoldCount === 0
                ? 'Falling back to new/aftermarket comps. Verify pricing manually before listing.'
                : 'Fewer than 5 OEM used sold comps found. Confidence is reduced — verify pricing before listing.'}
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="p-3 bg-slate-800/50 rounded-xl">
          <p className="text-[10px] text-slate-500 uppercase font-semibold tracking-wide">Market Comp Value</p>
          <p className="text-lg font-bold text-slate-300">{formatCurrency(valuation.marketValue)}</p>
          <p className="text-[10px] text-slate-600 mt-1">From {valuation.compCount} comp{valuation.compCount !== 1 ? 's' : ''} · {valuation.oemUsedSoldCount} OEM used sold</p>
        </div>
        <div className={`p-3 rounded-xl ${isOverridden ? 'bg-red-500/10 border border-red-500/20' : 'bg-emerald-500/10 border border-emerald-500/20'}`}>
          <p className={`text-[10px] uppercase font-semibold tracking-wide ${isOverridden ? 'text-red-400' : 'text-emerald-400'}`}>
            {isOverridden ? 'Your Price (Override)' : 'Your Asking Price'}
          </p>
          <p className={`text-lg font-bold ${isOverridden ? 'text-white' : 'text-emerald-400'}`}>{formatCurrency(effectivePrice)}</p>
          <p className="text-[10px] text-slate-600 mt-1">
            {isOverridden ? 'Manually set' : `${formatCurrency(valuation.askingPrice)} suggested`}
          </p>
        </div>
      </div>

      {valuation.comps.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] text-slate-600 uppercase font-semibold">Comparable Listings</p>
            <span className="text-[10px] text-slate-600">{valuation.comps.length} total</span>
          </div>
          <div className="space-y-1.5">
            {visibleComps.map((comp, i) => (
              <CompRow key={i} comp={comp} />
            ))}
          </div>
          {valuation.comps.length > 5 && (
            <button
              onClick={() => setShowAllComps(!showAllComps)}
              className="w-full text-center text-xs text-red-400 font-semibold py-2 mt-1"
            >
              {showAllComps ? 'Show fewer' : `Show all ${valuation.comps.length} comps`}
            </button>
          )}
        </div>
      )}

      <div className="flex items-center gap-2 text-[11px] text-slate-600">
        <Clock size={11} />
        <span>Last updated {new Date(valuation.lastUpdated).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
      </div>

      {editing ? (
        <div className="space-y-3 p-3 bg-slate-800/60 rounded-xl border border-slate-700/50">
          <div>
            <p className="text-[10px] text-slate-500 uppercase font-semibold tracking-wide mb-2">Adjusted Price ($)</p>
            <input
              type="number"
              value={overrideValue}
              onChange={(e) => setOverrideValue(e.target.value)}
              placeholder={`Auto: ${formatCurrency(valuation.askingPrice)}`}
              className="w-full bg-slate-900/60 border border-slate-700/50 rounded-xl px-3 py-2.5 text-white text-sm placeholder:text-slate-600 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/20 transition-all"
            />
            <p className="text-[10px] text-slate-600 mt-1">Leave empty to use auto-calculated asking price</p>
          </div>
          <div>
            <p className="text-[10px] text-slate-500 uppercase font-semibold tracking-wide mb-2">Notes</p>
            <textarea
              value={overrideNotes}
              onChange={(e) => setOverrideNotes(e.target.value)}
              placeholder="Why are you adjusting the price?"
              rows={2}
              className="w-full bg-slate-900/60 border border-slate-700/50 rounded-xl px-3 py-2.5 text-white text-sm placeholder:text-slate-600 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/20 transition-all resize-none"
            />
          </div>
          <div className="flex gap-2">
            <Button onClick={handleSave} size="sm" className="flex-1" icon={<Check size={16} />}>Save</Button>
            {isOverridden && <Button onClick={handleReset} variant="secondary" size="sm" icon={<X size={16} />}>Reset</Button>}
            <Button onClick={() => setEditing(false)} variant="ghost" size="sm">Cancel</Button>
          </div>
        </div>
      ) : (
        <button
          onClick={startEdit}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-slate-800/60 border border-slate-700/50 text-slate-400 text-xs font-semibold active:scale-[0.98] transition-transform"
        >
          <Edit3 size={14} /> {isOverridden ? 'Edit Override' : 'Set Manual Price Override'}
        </button>
      )}
    </div>
  );
}

function CompRow({ comp }: { comp: CompListing }) {
  const isSold = comp.tier.includes('sold');
  return (
    <div className="flex items-center gap-2.5 p-2.5 bg-slate-800/40 rounded-lg">
      <div className="flex-1 min-w-0">
        <p className="text-xs text-white font-medium truncate">{comp.title}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <Badge color={compTierBadgeColor(comp.tier)}>{compTierLabel(comp.tier)}</Badge>
          <span className="text-[10px] text-slate-600">{comp.source}</span>
          {comp.date && <span className="text-[10px] text-slate-600">{comp.date}</span>}
        </div>
      </div>
      <div className="text-right flex-shrink-0">
        <p className={`text-sm font-bold ${isSold ? 'text-emerald-400' : 'text-red-400'}`}>{formatCurrency(comp.price)}</p>
        <p className="text-[10px] text-slate-600">{isSold ? 'Sold' : 'Active'}</p>
      </div>
    </div>
  );
}
