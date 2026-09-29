import { useState } from 'react';
import { ExternalLink, Search, ShoppingBag, Store, TrendingUp, Tag, Filter, AlertTriangle, CheckCircle2, X } from 'lucide-react';
import { Badge } from '@/components/ui';
import type { DismantlePart, Vehicle } from '@/types';
import { vehicleLabelString } from '@/data';

type ConditionFilter = 'used' | 'new' | 'aftermarket' | 'all';
type ListingType = 'sold' | 'active';

interface ActiveFilter {
  id: string;
  label: string;
  param: string;
}

interface MarketSource {
  id: string;
  label: string;
  icon: typeof Search;
  color: string;
  description: string;
  buildUrl: (q: string, filters: ActiveFilter[]) => string;
  listingType: ListingType;
  conditionFilter: ConditionFilter;
}

// eBay URL parameter constants
const EBAY_SOLD = '&LH_Sold=1&LH_Complete=1';
const EBAY_USED = '&LH_ItemCondition=3000'; // 3000 = Used
const EBAY_NEW = '&LH_ItemCondition=1000'; // 1000 = New
// Exclude terms for OEM-used-first filtering
const EXCLUDE_NEW = '&LH_EXDECL=-refurb,-reman,-remanufactured,-aftermarket';
const OEM_TERMS = 'OEM';

function buildSearchQuery(part: DismantlePart, vehicle: Vehicle | null, condition: ConditionFilter): string {
  // If we have an OEM part number, use it as the primary search term
  if (part.oemPartNumber) {
    const oemQuery = `${part.oemPartNumber} ${part.name.split('(')[0].trim()}`;
    if (condition === 'used') {
      return encodeURIComponent(`OEM ${oemQuery}`);
    }
    if (condition === 'aftermarket') {
      return encodeURIComponent(`aftermarket ${oemQuery}`);
    }
    if (condition === 'new') {
      return encodeURIComponent(`new ${oemQuery}`);
    }
    return encodeURIComponent(oemQuery);
  }

  // Fall back to vehicle + part name if no OEM number
  const vehiclePart = vehicle ? `${vehicle.year} ${vehicle.make} ${vehicle.model}` : '';
  const partName = part.side ? `${part.side} ${part.name}` : part.name;
  const baseQuery = `${vehiclePart} ${partName}`.trim();

  if (condition === 'used') {
    return encodeURIComponent(`${OEM_TERMS} ${baseQuery}`);
  }
  if (condition === 'aftermarket') {
    return encodeURIComponent(`aftermarket ${baseQuery}`);
  }
  if (condition === 'new') {
    return encodeURIComponent(`new ${baseQuery}`);
  }
  return encodeURIComponent(baseQuery);
}

function buildEbayParams(condition: ConditionFilter, listingType: ListingType): ActiveFilter[] {
  const filters: ActiveFilter[] = [];

  if (listingType === 'sold') {
    filters.push({ id: 'sold', label: 'Sold', param: EBAY_SOLD });
  }

  if (condition === 'used') {
    filters.push({ id: 'condition-used', label: 'Condition: Used', param: EBAY_USED });
    filters.push({ id: 'exclude-new', label: 'Exclude New/Refurb', param: EXCLUDE_NEW });
  } else if (condition === 'new') {
    filters.push({ id: 'condition-new', label: 'Condition: New', param: EBAY_NEW });
  }

  return filters;
}

function buildEbayUrl(q: string, filters: ActiveFilter[]): string {
  const params = filters.map((f) => f.param).join('');
  return `https://www.ebay.com/sch/i.html?_nkw=${q}${params}`;
}

const SOURCES: MarketSource[] = [
  {
    id: 'ebay-sold-used',
    label: 'eBay Sold (OEM Used)',
    icon: TrendingUp,
    color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    description: 'Completed OEM used sales — actual sold prices',
    listingType: 'sold',
    conditionFilter: 'used',
    buildUrl: (q, filters) => buildEbayUrl(q, filters),
  },
  {
    id: 'ebay-sold-new',
    label: 'eBay Sold (New)',
    icon: TrendingUp,
    color: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
    description: 'Completed new/replacement sales — fallback only',
    listingType: 'sold',
    conditionFilter: 'new',
    buildUrl: (q, filters) => buildEbayUrl(q, filters),
  },
  {
    id: 'ebay-active-used',
    label: 'eBay Active (OEM Used)',
    icon: ShoppingBag,
    color: 'text-red-400 bg-red-500/10 border-red-500/20',
    description: 'Current OEM used listings — asking prices',
    listingType: 'active',
    conditionFilter: 'used',
    buildUrl: (q, filters) => buildEbayUrl(q, filters),
  },
  {
    id: 'car-part',
    label: 'Car-Part.com',
    icon: Store,
    color: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
    description: 'Nationwide salvage yard inventory — OEM used',
    listingType: 'active',
    conditionFilter: 'used',
    buildUrl: (q) => `https://www.car-part.com/cgi-bin/search.cgi?partName=${q}`,
  },
];

const SELL_SOURCE = {
  id: 'ebay-sell',
  label: 'Sell on eBay',
  icon: Tag,
  color: 'text-white bg-red-600',
  description: 'Create a new listing',
  buildUrl: (q: string) => `https://www.ebay.com/sl/sell?title=${q}`,
};

function SourceRow({ source, query, filters }: { source: MarketSource; query: string; filters: ActiveFilter[] }) {
  const Icon = source.icon;
  const url = source.buildUrl(query, filters);
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={`flex items-center gap-3 p-3 rounded-xl border transition-all active:scale-[0.98] ${source.color}`}
    >
      <div className="w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center flex-shrink-0">
        <Icon size={18} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-white">{source.label}</p>
        <p className="text-[11px] text-slate-400 truncate">{source.description}</p>
      </div>
      <ExternalLink size={16} className="text-slate-500 flex-shrink-0" />
    </a>
  );
}

function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold bg-red-500/15 text-red-300 border border-red-500/20">
      {label}
      {onRemove && (
        <button onClick={onRemove} className="ml-0.5 hover:text-white">
          <X size={10} />
        </button>
      )}
    </span>
  );
}

export function MarketResearch({ part, vehicle }: { part: DismantlePart; vehicle: Vehicle | null }) {
  const vehicleLabel = vehicle ? vehicleLabelString(vehicle) : '';

  // Default filters: Used + Sold + Completed
  const [condition, setCondition] = useState<ConditionFilter>('used');
  const [listingType, setListingType] = useState<ListingType>('sold');

  // OEM used sold comp count from valuation data
  const oemUsedSoldCount = part.valuation?.oemUsedSoldCount ?? 0;
  const hasLimitedData = oemUsedSoldCount < 5;
  const hasNoUsedData = oemUsedSoldCount === 0;

  const query = buildSearchQuery(part, vehicle, condition);
  const filters = buildEbayParams(condition, listingType);

  // Show new/aftermarket sources only as fallback when no used data exists
  const soldSources = SOURCES.filter((s) => s.listingType === 'sold');
  const activeSources = SOURCES.filter((s) => s.listingType === 'active');

  // Prioritize OEM used sold — show it first, always
  // Show new sold only as fallback when no used comps exist
  const visibleSoldSources = hasNoUsedData
    ? soldSources
    : soldSources.filter((s) => s.conditionFilter === 'used');

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Search size={14} className="text-slate-400" />
        <p className="text-[10px] text-slate-500 uppercase font-semibold tracking-wide">Market Research</p>
      </div>

      {/* Active filter display */}
      <div className="p-2.5 bg-slate-800/40 rounded-xl space-y-2">
        <div className="flex items-center gap-1.5">
          <Filter size={11} className="text-slate-500" />
          <p className="text-[10px] text-slate-500 uppercase font-semibold">Active Filters</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <FilterChip label={`Condition: ${condition === 'used' ? 'OEM Used' : condition === 'new' ? 'New' : condition === 'aftermarket' ? 'Aftermarket' : 'All'}`} onRemove={() => setCondition('all')} />
          <FilterChip label={`Listing: ${listingType === 'sold' ? 'Sold + Completed' : 'Active'}`} onRemove={() => setListingType('active')} />
          {condition === 'used' && <FilterChip label="Exclude New/Refurb/Aftermarket" onRemove={() => setCondition('all')} />}
        </div>
      </div>

      {/* Search query preview */}
      <div className="p-2.5 bg-slate-800/40 rounded-xl">
        <p className="text-[11px] text-slate-500">Search query</p>
        <p className="text-xs text-slate-300 font-medium mt-0.5 break-words">
          {part.oemPartNumber
            ? `${condition === 'used' ? 'OEM ' : ''}${part.oemPartNumber} ${part.name.split('(')[0].trim()}${condition === 'used' ? ' -refurb -reman -aftermarket' : ''}`
            : `${condition === 'used' && 'OEM '}${vehicleLabel} ${part.side ? part.side + ' ' : ''}${part.name}${condition === 'used' && ' -refurb -reman -aftermarket'}`}
        </p>
        {part.oemPartNumber && (
          <p className="text-[10px] text-red-400 mt-1">Searching by OEM part number — most accurate</p>
        )}
      </div>

      {/* Data quality indicator */}
      {hasLimitedData ? (
        <div className="flex items-start gap-2 p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-xl">
          <AlertTriangle size={14} className="text-amber-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-xs text-amber-300 font-semibold">
              {hasNoUsedData ? 'No OEM used sold data found' : `Limited used market data — only ${oemUsedSoldCount} listing${oemUsedSoldCount !== 1 ? 's' : ''}`}
            </p>
            <p className="text-[11px] text-amber-400/70 mt-0.5">
              {hasNoUsedData
                ? 'No OEM used sold comps available. Showing new/aftermarket as fallback. Verify pricing manually.'
                : 'Fewer than 5 OEM used sold listings found. Confidence is reduced — verify pricing before listing.'}
            </p>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2 p-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
          <CheckCircle2 size={14} className="text-emerald-400 flex-shrink-0" />
          <p className="text-xs text-emerald-300 font-semibold">
            {oemUsedSoldCount} OEM used sold comps found — good market data
          </p>
        </div>
      )}

      {/* Sold listings — OEM used first */}
      <div>
        <div className="flex items-center gap-2 mb-1.5">
          <p className="text-[10px] text-slate-600 uppercase font-semibold">Sold Listings</p>
          <Badge color="green">Completed Sales</Badge>
        </div>
        <div className="space-y-2">
          {visibleSoldSources.map((s) => (
            <SourceRow key={s.id} source={s} query={query} filters={filters} />
          ))}
        </div>
      </div>

      {/* Active listings */}
      <div>
        <p className="text-[10px] text-slate-600 uppercase font-semibold mb-1.5">Active Listings</p>
        <div className="space-y-2">
          {activeSources.map((s) => (
            <SourceRow key={s.id} source={s} query={query} filters={buildEbayParams(s.conditionFilter, 'active')} />
          ))}
        </div>
      </div>

      {/* Sell this part */}
      <div>
        <p className="text-[10px] text-slate-600 uppercase font-semibold mb-1.5">Sell This Part</p>
        <a
          href={SELL_SOURCE.buildUrl(query)}
          target="_blank"
          rel="noopener noreferrer"
          className={`flex items-center gap-3 p-3 rounded-xl border transition-all active:scale-[0.98] ${SELL_SOURCE.color}`}
        >
          <div className="w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center flex-shrink-0">
            <Tag size={18} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-white">{SELL_SOURCE.label}</p>
            <p className="text-[11px] text-slate-300/70 truncate">{SELL_SOURCE.description}</p>
          </div>
          <ExternalLink size={16} className="text-slate-300 flex-shrink-0" />
        </a>
      </div>

      {/* Manual filter controls */}
      <div className="pt-2 border-t border-slate-700/40">
        <p className="text-[10px] text-slate-600 uppercase font-semibold mb-2">Adjust Filters</p>
        <div className="flex flex-wrap gap-1.5">
          {(['used', 'new', 'all'] as ConditionFilter[]).map((c) => (
            <button
              key={c}
              onClick={() => setCondition(c)}
              className={`px-3 py-1.5 rounded-full text-[10px] font-semibold transition-all active:scale-95 ${
                condition === c
                  ? 'bg-red-600 text-white'
                  : 'bg-slate-800/60 text-slate-400 border border-slate-700/50'
              }`}
            >
              {c === 'used' ? 'OEM Used' : c === 'new' ? 'New' : 'All'}
            </button>
          ))}
          <div className="w-px bg-slate-700/50 mx-1" />
          {(['sold', 'active'] as ListingType[]).map((l) => (
            <button
              key={l}
              onClick={() => setListingType(l)}
              className={`px-3 py-1.5 rounded-full text-[10px] font-semibold transition-all active:scale-95 ${
                listingType === l
                  ? 'bg-red-600 text-white'
                  : 'bg-slate-800/60 text-slate-400 border border-slate-700/50'
              }`}
            >
              {l === 'sold' ? 'Sold + Completed' : 'Active'}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
