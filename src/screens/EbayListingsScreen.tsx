import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Tag, Search, ExternalLink, Loader2, Check, X, AlertCircle, TrendingUp,
  Eye, Package, DollarSign, Upload, RefreshCw, ShoppingCart, Trash2, Edit3,
  Plus, ChevronLeft, Store, Layers, CheckSquare, Square, AlertTriangle,
  FileEdit, Send, Save,
} from 'lucide-react';
import { Card, Badge, Button, formatCurrency } from '@/components/ui';
import { supabase } from '@/supabaseClient';
import { vehicleLabelString } from '@/data';
import type { Screen, DismantlePart, VehicleStore, Vehicle, EbayPartStatus } from '@/types';

type ListingStatus = 'draft' | 'active' | 'ended' | 'sold' | 'unsold';

interface EbayListing {
  id: string;
  part_id: string;
  vehicle_id: string;
  ebay_item_id: string | null;
  ebay_offer_id: string | null;
  title: string;
  description: string | null;
  category_id: string | null;
  condition_id: string | null;
  condition_description: string | null;
  price: number;
  quantity: number;
  listing_status: ListingStatus;
  listing_type: string;
  listing_duration: string;
  shipping_cost: number;
  shipping_weight_lbs: number | null;
  shipping_type: string | null;
  handling_time: number | null;
  ship_to_location: string | null;
  item_specifics: Record<string, string> | null;
  photo_urls: string[] | null;
  listing_url: string | null;
  sku: string | null;
  published_at: string | null;
  view_count: number;
  watch_count: number;
  sold_at: string | null;
  created_at: string;
  updated_at: string;
}

const STATUS_LABELS: Record<ListingStatus, string> = {
  draft: 'Draft',
  active: 'Active',
  ended: 'Ended',
  sold: 'Sold',
  unsold: 'Unsold',
};

function statusBadgeColor(status: ListingStatus): 'slate' | 'amber' | 'cyan' | 'blue' | 'green' | 'red' {
  switch (status) {
    case 'draft': return 'slate';
    case 'active': return 'green';
    case 'ended': return 'amber';
    case 'sold': return 'blue';
    case 'unsold': return 'red';
  }
}

const EBAY_API_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ebay-api`;

function formatEbayError(result: Record<string, unknown>): string {
  const baseError = (result.error as string) || 'Publish failed';
  const summary = result.summary as string | undefined;
  if (summary) return `${baseError}\n\n${summary}`;
  const diag = result.diagnostics as Record<string, unknown> | undefined;
  const ebayResp = diag?.ebay_response as Record<string, unknown> | undefined;
  if (!ebayResp) return baseError;

  const errors = ebayResp.errors as Array<Record<string, unknown>> | undefined;
  if (errors && errors.length > 0) {
    const parts = errors.map((e) => {
      const id = e.errorId != null ? `[${e.errorId}] ` : '';
      const msg = (e.message as string) || '';
      const longMsg = (e.longMessage as string) || '';
      const params = e.parameters as Record<string, string> | undefined;
      const paramStr = params ? ` (${Object.entries(params).map(([k, v]) => `${k}=${v}`).join(', ')})` : '';
      return `${id}${msg || longMsg}${paramStr}`;
    });
    return `${baseError}\n${parts.join('\n')}`;
  }
  return `${baseError}\n${JSON.stringify(ebayResp, null, 2)}`;
}

// ===== VALIDATION TYPES =====
type ValidationStatus = 'ready' | 'needs_review' | 'missing_info' | 'error';

interface BulkDraftInfo {
  partId: string;
  vehicleId: string;
  listingId: string | null;
  title: string;
  description: string;
  category: string;
  conditionId: string;
  conditionLabel: string;
  price: number;
  quantity: number;
  shippingCost: number;
  shippingWeight: number;
  listingType: string;
  listingDuration: string;
  itemSpecifics: Record<string, string>;
  photoCount: number;
  vehicleLabel: string;
  partName: string;
  partSku: string;
  validationStatus: ValidationStatus;
  validationIssues: string[];
  duplicateWarning: string | null;
  publishResult: 'pending' | 'published' | 'failed' | 'skipped' | 'not_attempted';
  publishError: string | null;
  ebayItemId: string | null;
  ebayOfferId: string | null;
  listingUrl: string | null;
}

const CONDITION_LABELS: Record<string, string> = {
  '3000': 'Used',
  '2500': 'Seller Refurbished',
  '4000': 'Very Good',
  '5000': 'Good',
  '6000': 'Fair',
  '7000': 'For Parts or Not Working',
};

// ===== VALIDATION LOGIC =====
function validateDraft(info: Omit<BulkDraftInfo, 'validationStatus' | 'validationIssues'>): { status: ValidationStatus; issues: string[] } {
  const issues: string[] = [];

  if (!info.title || info.title.trim().length < 5) issues.push('Title too short (min 5 characters)');
  if (info.photoCount === 0) issues.push('No photos');
  if (!info.category) issues.push('No category set');
  if (!info.conditionId) issues.push('No condition set');
  if (!info.price || info.price <= 0) issues.push('No price set');
  if (!info.quantity || info.quantity < 1) issues.push('No quantity set');
  if (info.shippingWeight <= 0) issues.push('No shipping weight set');
  if (!info.itemSpecifics || !info.itemSpecifics.Brand) issues.push('Missing brand (item specific)');
  if (info.duplicateWarning) issues.push(info.duplicateWarning);

  if (issues.length === 0) return { status: 'ready', issues: [] };
  if (issues.some(i => i.includes('No ') || i.includes('Missing'))) return { status: 'missing_info', issues };
  return { status: 'needs_review', issues };
}

function generateSku(part: DismantlePart, vehicle: Vehicle): string {
  const make = vehicle.make.slice(0, 3).toUpperCase();
  const yearStr = String(vehicle.year).slice(-2);
  const partSlug = part.name.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8).toUpperCase();
  return `${make}-${yearStr}-${partSlug}`;
}

export function EbayListingsScreen({ onNavigate, store, isManager }: { onNavigate: (s: Screen) => void; store: VehicleStore; isManager?: boolean }) {
  const [listings, setListings] = useState<EbayListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<EbayListing | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showBulkSelect, setShowBulkSelect] = useState(false);
  const [viewMode, setViewMode] = useState<'available' | 'ready' | 'drafts' | 'active' | 'sold' | 'ended'>('ready');
  const [bulkDrafts, setBulkDrafts] = useState<BulkDraftInfo[]>([]);
  const [showBulkReview, setShowBulkReview] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState('');
  const [configOk, setConfigOk] = useState(false);

  const { parts, vehicles } = store;

  const fetchListings = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('ebay_listings')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) {
      setError('Failed to load eBay listings');
    } else {
      setListings((data ?? []) as EbayListing[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchListings();
    (async () => {
      const { data } = await supabase
        .from('ebay_config')
        .select('id, client_id, refresh_token')
        .eq('id', 1)
        .maybeSingle();
      setConfigOk(!!data?.client_id);
    })();
  }, [fetchListings]);

  const handleSync = async (listing: EbayListing) => {
    if (!listing.ebay_item_id) return;
    setSyncing(true);
    try {
      const resp = await fetch(`${EBAY_API_URL}/sync`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ listing_id: listing.id, ebay_item_id: listing.ebay_item_id }),
      });
      const result = await resp.json();
      if (!resp.ok) throw new Error(result.error || 'Sync failed');
      const newStatus = result.data?.availability?.shipToLocationAvailability?.quantity === 0 ? 'sold' : listing.listing_status;
      setListings(prev => prev.map(l => l.id === listing.id ? { ...l, listing_status: newStatus } : l));
      if (newStatus === 'sold') {
        await store.updatePartEbayStatus(listing.part_id, listing.vehicle_id, 'sold');
        await store.updatePartStatus(listing.part_id, listing.vehicle_id, 'sold');
        await supabase.from('ebay_listings').update({ listing_status: 'sold', sold_at: new Date().toISOString() }).eq('id', listing.id);
      }
      await fetchListings();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  const handleEndListing = async (listing: EbayListing) => {
    if (!listing.ebay_item_id) {
      await supabase.from('ebay_listings').delete().eq('id', listing.id);
      setListings(prev => prev.filter(l => l.id !== listing.id));
      setSelected(null);
      return;
    }
    if (!confirm('End this eBay listing? This will remove it from eBay.')) return;
    setSyncing(true);
    try {
      const resp = await fetch(`${EBAY_API_URL}/end`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ listing_id: listing.id, ebay_item_id: listing.ebay_item_id }),
      });
      const result = await resp.json();
      if (!resp.ok) throw new Error(result.error || 'Failed to end listing');
      await store.updatePartEbayStatus(listing.part_id, listing.vehicle_id, 'ended');
      await fetchListings();
      setSelected(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to end listing');
    } finally {
      setSyncing(false);
    }
  };

  const listingsWithLabels = useMemo(() => {
    return listings.map(l => {
      const vehicle = vehicles.find(v => v.id === l.vehicle_id);
      const part = parts.find(p => p.id === l.part_id);
      return {
        ...l,
        vehicleLabel: vehicle ? vehicleLabelString(vehicle) : 'Unknown',
        partName: part?.name ?? l.title,
      };
    });
  }, [listings, vehicles, parts]);

  const filtered = useMemo(() => {
    return listingsWithLabels.filter(l => {
      const matchesQuery = !query || l.title.toLowerCase().includes(query.toLowerCase()) || l.vehicleLabel.toLowerCase().includes(query.toLowerCase());
      let matchesViewMode = true;
      if (viewMode === 'drafts') matchesViewMode = l.listing_status === 'draft';
      else if (viewMode === 'ready') {
        const part = parts.find(p => p.id === l.part_id);
        matchesViewMode = l.listing_status === 'draft' && part?.ebayStatus === 'ready';
      } else if (viewMode === 'active') matchesViewMode = l.listing_status === 'active';
      else if (viewMode === 'sold') matchesViewMode = l.listing_status === 'sold';
      else if (viewMode === 'ended') matchesViewMode = l.listing_status === 'ended';
      else if (viewMode === 'available') matchesViewMode = false;
      return matchesQuery && matchesViewMode;
    });
  }, [listingsWithLabels, query, viewMode, parts]);

  const activeCount = listings.filter(l => l.listing_status === 'active').length;
  const soldCount = listings.filter(l => l.listing_status === 'sold').length;
  const draftCount = listings.filter(l => l.listing_status === 'draft').length;
  const totalRevenue = listings.filter(l => l.listing_status === 'sold').reduce((sum, l) => sum + Number(l.price), 0);


  const unlistedParts = useMemo(() => {
    const listedPartIds = new Set(listings.map(l => l.part_id));
    const archivedVehicleIds = new Set(vehicles.filter(v => v.status === 'archived').map(v => v.id));
    return parts.filter(p =>
      !listedPartIds.has(p.id) &&
      p.ebayStatus === 'not_prepared' &&
      p.status !== 'sold' &&
      p.status !== 'scrapped' &&
      vehicles.find(v => v.id === p.vehicleId) &&
      !archivedVehicleIds.has(p.vehicleId)
    );
  }, [parts, listings, vehicles]);

  const preparingParts = useMemo(() => {
    const archivedVehicleIds = new Set(vehicles.filter(v => v.status === 'archived').map(v => v.id));
    return parts.filter(p =>
      p.ebayStatus === 'preparing' &&
      p.status !== 'sold' &&
      p.status !== 'scrapped' &&
      !archivedVehicleIds.has(p.vehicleId)
    );
  }, [parts, vehicles]);

  const queueParts = viewMode === 'available' ? unlistedParts : preparingParts;

  if (loading) {
    return (
      <div className="px-4 pt-14 pb-nav-safe lg:px-8 lg:pt-8 flex flex-col items-center justify-center min-h-[60vh]">
        <div className="w-12 h-12 border-4 border-red-500/30 border-t-red-500 rounded-full animate-spin" />
        <p className="text-slate-400 text-sm mt-4">Loading eBay listings...</p>
      </div>
    );
  }

  // ===== CREATE LISTING FLOW =====
  if (showCreate) {
    return (
      <CreateListingView
        parts={unlistedParts}
        vehicles={vehicles}
        onCancel={() => setShowCreate(false)}
        onCreated={async () => { setShowCreate(false); await fetchListings(); }}
        configOk={configOk}
        store={store}
      />
    );
  }

  // ===== BULK SELECT FLOW =====
  if (showBulkSelect) {
    return (
      <BulkPartSelectView
        parts={unlistedParts}
        vehicles={vehicles}
        existingListings={listings}
        onCancel={() => setShowBulkSelect(false)}
        onDraftsCreated={(drafts) => { setBulkDrafts(drafts); setShowBulkSelect(false); }}
        store={store}
      />
    );
  }

  // ===== BULK REVIEW FLOW =====
  if (showBulkReview) {
    return (
      <BulkReviewScreen
        listings={listings.filter(l => l.listing_status === 'draft' && parts.find(p => p.id === l.part_id)?.ebayStatus === 'ready')}
        parts={parts}
        vehicles={vehicles}
        configOk={configOk}
        onBack={() => setShowBulkReview(false)}
        onUpdated={() => fetchListings()}
        store={store}
      />
    );
  }

  // ===== BULK DRAFT REVIEW FLOW =====
  if (bulkDrafts.length > 0) {
    return (
      <BulkReviewView
        drafts={bulkDrafts}
        configOk={configOk}
        onBack={() => { setBulkDrafts([]); fetchListings(); }}
        onUpdateDraft={(idx, updated) => {
          setBulkDrafts(prev => prev.map((d, i) => i === idx ? updated : d));
        }}
        onSetEbayStatus={async (partId, vehicleId, status) => { await store.updatePartEbayStatus(partId, vehicleId, status); }}
      />
    );
  }

  // ===== LISTING DETAIL VIEW =====
  if (selected) {
    const vehicle = vehicles.find(v => v.id === selected.vehicle_id);
    const part = parts.find(p => p.id === selected.part_id);
    return (
      <ListingDetailView
        listing={selected}
        part={part ?? null}
        vehicle={vehicle ?? null}
        onBack={() => setSelected(null)}
        onSync={() => handleSync(selected)}
        onEnd={() => handleEndListing(selected)}
        syncing={syncing}
        store={store}
      />
    );
  }

  // ===== MAIN LISTINGS GRID =====
  return (
    <div className="px-4 pt-14 pb-nav-safe lg:px-8 lg:pt-8 space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">eBay Listings</h1>
          <p className="text-slate-400 text-sm mt-0.5">Publish and manage eBay Motors listings</p>
        </div>
        <div className="flex items-center gap-2">
          {viewMode === 'ready' && isManager && (
            <Button size="sm" variant="secondary" onClick={() => setShowBulkReview(true)} icon={<Layers size={16} />}>Bulk Review</Button>
          )}
          {viewMode === 'available' && queueParts.length > 0 && (
            <Button size="sm" variant="secondary" onClick={() => setShowBulkSelect(true)} icon={<Layers size={16} />}>Bulk Draft</Button>
          )}
          <Button size="sm" onClick={() => setShowCreate(true)} icon={<Plus size={16} />}>New Listing</Button>
        </div>
      </div>

      <div className="flex gap-1 overflow-x-auto scrollbar-hide -mx-4 px-4">
        {([
          { id: 'available', label: 'Available to Prepare', count: unlistedParts.length + preparingParts.length, color: 'amber' },
          { id: 'ready', label: 'Ready for eBay', count: listings.filter(l => l.listing_status === 'draft' && parts.find(p => p.id === l.part_id)?.ebayStatus === 'ready').length, color: 'cyan' },
          { id: 'drafts', label: 'Drafts', count: listings.filter(l => l.listing_status === 'draft' && parts.find(p => p.id === l.part_id)?.ebayStatus !== 'ready').length, color: 'slate' },
          { id: 'active', label: 'Active', count: activeCount, color: 'green' },
          { id: 'sold', label: 'Sold', count: soldCount, color: 'blue' },
          { id: 'ended', label: 'Ended', count: listings.filter(l => l.listing_status === 'ended').length, color: 'red' },
        ] as const).map(tab => (
          <button
            key={tab.id}
            onClick={() => setViewMode(tab.id)}
            className={`flex-shrink-0 px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
              viewMode === tab.id
                ? tab.color === 'amber' ? 'bg-amber-600 text-white'
                  : tab.color === 'green' ? 'bg-green-600 text-white'
                  : tab.color === 'blue' ? 'bg-red-600 text-white'
                  : tab.color === 'red' ? 'bg-red-600 text-white'
                  : tab.color === 'cyan' ? 'bg-cyan-600 text-white'
                  : 'bg-slate-600 text-white'
                : 'bg-slate-800/60 text-slate-400 border border-slate-700/50'
            }`}
          >
            {tab.label} ({tab.count})
          </button>
        ))}
      </div>

      {!configOk && (
        <div className="flex items-center gap-2 px-3 py-2.5 bg-amber-500/10 border border-amber-500/20 rounded-xl">
          <AlertCircle size={14} className="text-amber-400" />
          <p className="text-amber-300 text-xs flex-1">
            eBay is not configured. Go to Settings to add your eBay developer credentials.
          </p>
          <button onClick={() => onNavigate('settings')} className="text-amber-400 text-xs font-semibold underline">
            Settings
          </button>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-xl">
          <AlertCircle size={14} className="text-red-400" />
          <p className="text-red-300 text-xs flex-1 whitespace-pre-line">{error}</p>
          <button onClick={() => setError('')}><X size={14} className="text-red-400" /></button>
        </div>
      )}

      {viewMode === 'available' ? (
        <AvailablePartsQueue
          parts={queueParts}
          vehicles={vehicles}
          onCreateDraft={() => setShowCreate(true)}
          onBulkDraft={() => setShowBulkSelect(true)}
        />
      ) : (
        <>
      {/* Stats */}
      <div className="grid grid-cols-4 gap-2">
        <StatCard label="Active" value={String(activeCount)} icon={<Tag size={14} />} color="text-emerald-400" />
        <StatCard label="Sold" value={String(soldCount)} icon={<ShoppingCart size={14} />} color="text-red-400" />
        <StatCard label="Drafts" value={String(draftCount)} icon={<Edit3 size={14} />} color="text-slate-400" />
        <StatCard label="Revenue" value={formatCurrency(totalRevenue)} icon={<DollarSign size={14} />} color="text-emerald-400" />
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by title or vehicle..."
          className="w-full bg-slate-800/60 border border-slate-700/50 rounded-xl pl-11 pr-10 py-3 text-white text-sm placeholder:text-slate-500 focus:border-red-500 focus:outline-none"
        />
        {query && (
          <button onClick={() => setQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2">
            <X size={18} className="text-slate-500" />
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center text-center py-16">
          <Store size={48} className="text-slate-700" strokeWidth={1.5} />
          <p className="text-slate-500 text-sm mt-3">No listings in this category</p>
          <p className="text-slate-600 text-xs mt-1">Check the Available to Prepare tab for parts ready to list.</p>
          <Button onClick={() => setViewMode('available')} className="mt-4" icon={<Package size={16} />}>View Available Parts</Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map(l => (
            <Card key={l.id} onClick={() => setSelected(l)} className="p-4">
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-white truncate">{l.title}</p>
                  <p className="text-xs text-slate-500 mt-0.5 truncate">{l.vehicleLabel}</p>
                </div>
                <Badge color={statusBadgeColor(l.listing_status)}>{STATUS_LABELS[l.listing_status]}</Badge>
              </div>
              <div className="flex items-center gap-3 text-xs text-slate-500">
                <span className="text-emerald-400 font-bold">{formatCurrency(Number(l.price))}</span>
                {l.listing_status === 'active' && (
                  <span className="flex items-center gap-1"><Eye size={12} /> {l.view_count}</span>
                )}
                {l.ebay_item_id && (
                  <span className="flex items-center gap-1 text-red-400"><ExternalLink size={12} /> Live</span>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
        </>
      )}
    </div>
  );
}

function StatCard({ label, value, icon, color }: { label: string; value: string; icon: React.ReactNode; color: string }) {
  return (
    <Card className="p-2.5 text-center">
      <div className="flex items-center justify-center gap-1 mb-0.5">
        {icon}
        <p className="text-[9px] text-slate-500 uppercase font-semibold">{label}</p>
      </div>
      <p className={`text-sm font-bold ${color}`}>{value}</p>
    </Card>
  );
}

// ===== AVAILABLE PARTS QUEUE =====
function AvailablePartsQueue({
  parts, vehicles, onCreateDraft, onBulkDraft,
}: {
  parts: DismantlePart[];
  vehicles: Vehicle[];
  onCreateDraft: () => void;
  onBulkDraft: () => void;
}) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    if (!query) return parts;
    const q = query.toLowerCase();
    return parts.filter(p => {
      const v = vehicles.find(v => v.id === p.vehicleId);
      const label = v ? vehicleLabelString(v) : '';
      return p.name.toLowerCase().includes(q) || label.toLowerCase().includes(q) || p.category.toLowerCase().includes(q);
    });
  }, [parts, vehicles, query]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-xl">
        <Package size={14} className="text-amber-400 flex-shrink-0" />
        <p className="text-xs text-amber-300 flex-1">
          {parts.length} part{parts.length !== 1 ? 's' : ''} available to prepare. These are in inventory and not yet listed on eBay.
        </p>
      </div>

      <div className="relative">
        <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search available parts..."
          className="w-full bg-slate-800/60 border border-slate-700/50 rounded-xl pl-11 pr-10 py-3 text-white text-sm placeholder:text-slate-500 focus:border-red-500 focus:outline-none"
        />
        {query && (
          <button onClick={() => setQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2">
            <X size={18} className="text-slate-500" />
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center text-center py-16">
          <Package size={48} className="text-slate-700" strokeWidth={1.5} />
          <p className="text-slate-500 text-sm mt-3">No available parts to list</p>
          <p className="text-slate-600 text-xs mt-1">Pull parts in the Dismantle tab to populate this queue.</p>
          <div className="flex gap-2 mt-4">
            <Button variant="secondary" onClick={onBulkDraft} icon={<Layers size={16} />}>Bulk Draft</Button>
            <Button onClick={onCreateDraft} icon={<Plus size={16} />}>Create Draft</Button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={onBulkDraft} icon={<Layers size={16} />}>Create eBay Drafts for Selected</Button>
            <Button className="flex-1" onClick={onCreateDraft} icon={<Plus size={16} />}>Create eBay Draft</Button>
          </div>
          <div className="space-y-2">
            {filtered.map(part => {
              const v = vehicles.find(v => v.id === part.vehicleId);
              return (
                <Card key={part.id} className="p-3 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center flex-shrink-0">
                    <Package size={18} className="text-amber-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-white truncate">{part.name}</p>
                    <p className="text-xs text-slate-500 truncate">{v ? vehicleLabelString(v) : ''}</p>
                  </div>
                  <div className="flex-shrink-0 text-right">
                    <p className="text-emerald-400 text-xs font-bold">{formatCurrency(part.recommendedPrice)}</p>
                    <Badge color="slate">Not Prepared</Badge>
                  </div>
                </Card>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ===== BULK PART SELECT VIEW =====
function BulkPartSelectView({
  parts, vehicles, existingListings, onCancel, onDraftsCreated, store,
}: {
  parts: DismantlePart[];
  vehicles: Vehicle[];
  existingListings: EbayListing[];
  onCancel: () => void;
  onDraftsCreated: (drafts: BulkDraftInfo[]) => void;
  store: VehicleStore;
}) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [overrideDuplicates, setOverrideDuplicates] = useState(false);
  const [duplicateWarnings, setDuplicateWarnings] = useState<Record<string, string>>({});

  // Check for duplicates among existing listings
  useEffect(() => {
    const warnings: Record<string, string> = {};
    const listedPartIds = new Set(existingListings.map(l => l.part_id));
    for (const part of parts) {
      if (listedPartIds.has(part.id)) {
        const existing = existingListings.find(l => l.part_id === part.id);
        if (existing) {
          warnings[part.id] = `Already has ${existing.listing_status} listing`;
        }
      }
    }
    setDuplicateWarnings(warnings);
  }, [existingListings, parts]);

  const filteredParts = useMemo(() => {
    if (!query) return parts;
    const q = query.toLowerCase();
    return parts.filter(p => {
      const v = vehicles.find(v => v.id === p.vehicleId);
      const label = v ? vehicleLabelString(v) : '';
      return p.name.toLowerCase().includes(q) || label.toLowerCase().includes(q) || p.category.toLowerCase().includes(q);
    });
  }, [parts, vehicles, query]);

  const togglePart = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    const filteredWithoutDuplicates = overrideDuplicates
      ? filteredParts
      : filteredParts.filter(p => !duplicateWarnings[p.id]);
    setSelectedIds(new Set(filteredWithoutDuplicates.map(p => p.id)));
  };

  const clearSelection = () => setSelectedIds(new Set());

  const handleCreateDrafts = async () => {
    if (selectedIds.size === 0) return;
    setCreating(true);

    // Filter out duplicates unless overridden
    const partsToDraft = Array.from(selectedIds)
      .map(id => parts.find(p => p.id === id))
      .filter((p): p is DismantlePart => !!p)
      .filter(p => overrideDuplicates || !duplicateWarnings[p.id]);

    const drafts: BulkDraftInfo[] = partsToDraft.map(part => {
      const vehicle = vehicles.find(v => v.id === part.vehicleId);
      const vehicleStr = vehicle ? `${vehicle.year} ${vehicle.make} ${vehicle.model}` : '';
      const vehicleLabel = vehicle ? vehicleLabelString(vehicle) : 'Unknown';
      const sku = vehicle ? generateSku(part, vehicle) : part.id;
      const title = `${vehicleStr} ${part.name} OEM Used`.trim();
      const desc = `OEM used ${part.name} from a ${vehicleStr}. ${part.condition ? `Condition: ${part.condition}.` : ''} Tested and inspected. Ready to ship.`;
      const category = part.category || '';
      const conditionId = '3000';
      const price = part.recommendedPrice;
      const shippingWeight = 10;

      const baseInfo = {
        partId: part.id,
        vehicleId: part.vehicleId,
        listingId: null as string | null,
        title,
        description: desc,
        category,
        conditionId,
        conditionLabel: CONDITION_LABELS[conditionId] ?? 'Used',
        price,
        quantity: 1,
        shippingCost: 0,
        shippingWeight,
        listingType: 'FixedPrice',
        listingDuration: 'GTC',
        itemSpecifics: { Brand: 'OEM', Placement: part.category },
        photoCount: part.photos,
        vehicleLabel,
        partName: part.name,
        partSku: sku,
        duplicateWarning: duplicateWarnings[part.id] ?? null,
        publishResult: 'not_attempted' as const,
        publishError: null,
        ebayItemId: null,
        ebayOfferId: null,
        listingUrl: null,
      };

      const validation = validateDraft(baseInfo);
      return { ...baseInfo, validationStatus: validation.status, validationIssues: validation.issues };
    });

    // Save each draft to the database
    for (const draft of drafts) {
      const part = partsToDraft.find(p => p.id === draft.partId);
      if (!part) continue;

      const { data, error: dbError } = await supabase.from('ebay_listings').insert({
        part_id: draft.partId,
        vehicle_id: part.vehicleId,
        title: draft.title,
        description: draft.description,
        category_id: draft.category || null,
        condition_id: draft.conditionId,
        price: draft.price,
        quantity: draft.quantity,
        listing_type: draft.listingType,
        listing_duration: draft.listingDuration,
        shipping_cost: draft.shippingCost,
        shipping_weight_lbs: draft.shippingWeight,
        listing_status: 'draft',
        item_specifics: draft.itemSpecifics,
        photo_urls: [],
      }).select('id').single();

      if (!dbError && data) {
        draft.listingId = data.id;
        await store.updatePartEbayStatus(draft.partId, part.vehicleId, 'draft');
      } else {
        draft.validationStatus = 'error';
        draft.validationIssues = [...draft.validationIssues, `Database error: ${dbError?.message ?? 'Unknown'}`];
      }
    }

    setCreating(false);
    onDraftsCreated(drafts);
  };

  const selectableCount = overrideDuplicates
    ? filteredParts.length
    : filteredParts.filter(p => !duplicateWarnings[p.id]).length;

  return (
    <div className="px-4 pt-14 pb-nav-safe lg:px-8 lg:pt-8 space-y-4 animate-fade-in">
      <button onClick={onCancel} className="flex items-center gap-1 text-slate-400 text-sm">
        <ChevronLeft size={18} /> Cancel
      </button>

      <div>
        <h1 className="text-2xl font-bold text-white">Bulk Create eBay Drafts</h1>
        <p className="text-slate-400 text-sm mt-0.5">Select multiple parts to create eBay drafts at once</p>
      </div>

      {/* Selection controls */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <button onClick={selectAll} className="text-xs font-semibold text-red-400 flex items-center gap-1">
            <CheckSquare size={14} /> Select All ({selectableCount})
          </button>
          <button onClick={clearSelection} className="text-xs font-semibold text-slate-400 flex items-center gap-1">
            <Square size={14} /> Clear
          </button>
        </div>
        <Badge color={selectedIds.size > 0 ? 'blue' : 'slate'}>{selectedIds.size} selected</Badge>
      </div>

      {/* Duplicate override toggle */}
      {Object.keys(duplicateWarnings).length > 0 && (
        <Card className="p-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-white">Override duplicate warnings</p>
              <p className="text-xs text-slate-500">
                {Object.keys(duplicateWarnings).length} part(s) already have eBay listings. Enable to select them anyway.
              </p>
            </div>
            <button
              onClick={() => setOverrideDuplicates(!overrideDuplicates)}
              className={`relative w-11 h-6 rounded-full transition-colors ${overrideDuplicates ? 'bg-amber-600' : 'bg-slate-700'}`}
            >
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${overrideDuplicates ? 'translate-x-5' : ''}`} />
            </button>
          </div>
        </Card>
      )}

      {/* Search */}
      <div className="relative">
        <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search parts..."
          className="w-full bg-slate-800/60 border border-slate-700/50 rounded-xl pl-11 pr-10 py-3 text-white text-sm placeholder:text-slate-500 focus:border-red-500 focus:outline-none"
        />
        {query && (
          <button onClick={() => setQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2">
            <X size={18} className="text-slate-500" />
          </button>
        )}
      </div>

      {/* Parts list */}
      <div className="space-y-2">
        {filteredParts.length === 0 ? (
          <Card className="p-8 text-center">
            <Package size={32} className="text-slate-700 mx-auto mb-3" />
            <p className="text-slate-500 text-sm">No parts available to list.</p>
          </Card>
        ) : (
          filteredParts.map(part => {
            const v = vehicles.find(v => v.id === part.vehicleId);
            const isSelected = selectedIds.has(part.id);
            const dupWarn = duplicateWarnings[part.id];
            const isDisabled = !!dupWarn && !overrideDuplicates;

            return (
              <div
                key={part.id}
                onClick={() => !isDisabled && togglePart(part.id)}
                className={`flex items-center gap-3 p-3 rounded-xl border transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-red-500/15 border-red-500/40'
                    : isDisabled
                    ? 'bg-slate-900/30 border-slate-800/40 opacity-50 cursor-not-allowed'
                    : 'bg-slate-900/40 border-slate-800/50 active:scale-[0.99]'
                }`}
              >
                <div className="flex-shrink-0">
                  {isSelected ? (
                    <CheckSquare size={20} className="text-red-400" />
                  ) : (
                    <Square size={20} className="text-slate-600" />
                  )}
                </div>
                <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center flex-shrink-0">
                  <Package size={18} className="text-red-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-white truncate">{part.name}</p>
                  <p className="text-xs text-slate-500 truncate">{v ? vehicleLabelString(v) : ''}</p>
                </div>
                <div className="flex-shrink-0 text-right">
                  <p className="text-emerald-400 text-xs font-bold">{formatCurrency(part.recommendedPrice)}</p>
                  {dupWarn && (
                    <p className="text-[10px] text-amber-400 mt-0.5 flex items-center gap-1 justify-end">
                      <AlertTriangle size={10} /> {dupWarn}
                    </p>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Create button */}
      {selectedIds.size > 0 && (
        <Button
          onClick={handleCreateDrafts}
          size="lg"
          className="w-full"
          disabled={creating}
          icon={creating ? <Loader2 size={20} className="animate-spin" /> : <Layers size={20} />}
        >
          {creating ? 'Creating Drafts...' : `Create ${selectedIds.size} eBay Draft${selectedIds.size > 1 ? 's' : ''}`}
        </Button>
      )}
    </div>
  );
}

// ===== BULK REVIEW VIEW =====
function BulkReviewView({
  drafts, configOk, onBack, onUpdateDraft, onSetEbayStatus,
}: {
  drafts: BulkDraftInfo[];
  configOk: boolean;
  onBack: () => void;
  onUpdateDraft: (idx: number, updated: BulkDraftInfo) => void;
  onSetEbayStatus: (partId: string, vehicleId: string, status: EbayPartStatus) => Promise<void>;
}) {
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [showPublishConfirm, setShowPublishConfirm] = useState(false);
  const [publishingAll, setPublishingAll] = useState(false);
  const [publishSelectedOnly, setPublishSelectedOnly] = useState(false);
  const [selectedDraftIds, setSelectedDraftIds] = useState<Set<string>>(new Set());

  const readyDrafts = drafts.filter(d => d.validationStatus === 'ready' && d.publishResult !== 'published');
  const needsReviewCount = drafts.filter(d => d.validationStatus === 'needs_review').length;
  const missingInfoCount = drafts.filter(d => d.validationStatus === 'missing_info').length;
  const errorCount = drafts.filter(d => d.validationStatus === 'error').length;
  const readyCount = readyDrafts.length;
  const publishedCount = drafts.filter(d => d.publishResult === 'published').length;
  const failedCount = drafts.filter(d => d.publishResult === 'failed').length;

  const toggleDraftSelection = (partId: string) => {
    setSelectedDraftIds(prev => {
      const next = new Set(prev);
      if (next.has(partId)) next.delete(partId);
      else next.add(partId);
      return next;
    });
  };

  const handlePublishAll = async () => {
    setShowPublishConfirm(false);
    setPublishingAll(true);

    for (let i = 0; i < drafts.length; i++) {
      const draft = drafts[i];
      if (draft.validationStatus !== 'ready' || draft.publishResult === 'published' || !draft.listingId) {
        if (draft.publishResult === 'not_attempted') {
          onUpdateDraft(i, { ...draft, publishResult: 'skipped' });
        }
        continue;
      }

      try {
        const resp = await fetch(`${EBAY_API_URL}/publish`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            listing_id: draft.listingId,
            sku: draft.partSku,
            title: draft.title,
            description: draft.description,
            price: draft.price,
            quantity: draft.quantity,
            listing_type: draft.listingType,
            listing_duration: draft.listingDuration,
            shipping_cost: draft.shippingCost,
            shipping_weight_lbs: draft.shippingWeight,
            condition_id: draft.conditionId,
          }),
        });
        const result = await resp.json();
        if (!resp.ok) throw new Error(formatEbayError(result));

        // Save eBay IDs to database
        await supabase.from('ebay_listings').update({
          ebay_item_id: result.ebay_item_id ?? null,
          ebay_offer_id: result.ebay_offer_id ?? null,
          listing_url: result.listing_url ?? null,
          listing_status: 'active',
          published_at: new Date().toISOString(),
        }).eq('id', draft.listingId);

        const part = drafts[i];
        await onSetEbayStatus(part.partId, part.vehicleId, 'active');

        onUpdateDraft(i, {
          ...draft,
          publishResult: 'published',
          ebayItemId: result.ebay_item_id ?? null,
          ebayOfferId: result.ebay_offer_id ?? null,
          listingUrl: result.listing_url ?? null,
        });
      } catch (err) {
        const part = drafts[i];
        await onSetEbayStatus(part.partId, part.vehicleId, 'error');
        onUpdateDraft(i, {
          ...draft,
          publishResult: 'failed',
          publishError: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }

    setPublishingAll(false);
  };

  const handlePublishSelected = async () => {
    setShowPublishConfirm(false);
    setPublishSelectedOnly(true);

    for (let i = 0; i < drafts.length; i++) {
      const draft = drafts[i];
      if (!selectedDraftIds.has(draft.partId)) continue;
      if (draft.validationStatus !== 'ready' || draft.publishResult === 'published' || !draft.listingId) {
        if (draft.publishResult === 'not_attempted') {
          onUpdateDraft(i, { ...draft, publishResult: 'skipped' });
        }
        continue;
      }

      try {
        const resp = await fetch(`${EBAY_API_URL}/publish`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            listing_id: draft.listingId,
            sku: draft.partSku,
            title: draft.title,
            description: draft.description,
            price: draft.price,
            quantity: draft.quantity,
            listing_type: draft.listingType,
            listing_duration: draft.listingDuration,
            shipping_cost: draft.shippingCost,
            shipping_weight_lbs: draft.shippingWeight,
            condition_id: draft.conditionId,
          }),
        });
        const result = await resp.json();
        if (!resp.ok) throw new Error(formatEbayError(result));

        await supabase.from('ebay_listings').update({
          ebay_item_id: result.ebay_item_id ?? null,
          ebay_offer_id: result.ebay_offer_id ?? null,
          listing_url: result.listing_url ?? null,
          listing_status: 'active',
          published_at: new Date().toISOString(),
        }).eq('id', draft.listingId);

        const part = drafts[i];
        await onSetEbayStatus(part.partId, part.vehicleId, 'active');

        onUpdateDraft(i, {
          ...draft,
          publishResult: 'published',
          ebayItemId: result.ebay_item_id ?? null,
          ebayOfferId: result.ebay_offer_id ?? null,
          listingUrl: result.listing_url ?? null,
        });
      } catch (err) {
        const part = drafts[i];
        await onSetEbayStatus(part.partId, part.vehicleId, 'error');
        onUpdateDraft(i, {
          ...draft,
          publishResult: 'failed',
          publishError: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }

    setPublishSelectedOnly(false);
    setSelectedDraftIds(new Set());
  };

  // ===== EDITING A SINGLE DRAFT =====
  if (editingIdx !== null && drafts[editingIdx]) {
    return (
      <BulkDraftEditor
        draft={drafts[editingIdx]}
        onSave={(updated) => {
          const validation = validateDraft(updated);
          onUpdateDraft(editingIdx, { ...updated, validationStatus: validation.status, validationIssues: validation.issues });
          setEditingIdx(null);
        }}
        onCancel={() => setEditingIdx(null)}
      />
    );
  }

  // ===== PUBLISH CONFIRMATION =====
  if (showPublishConfirm) {
    const count = readyCount;
    return (
      <div className="fixed inset-0 z-[60] flex items-end justify-center lg:items-center">
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowPublishConfirm(false)} />
        <div className="relative w-full max-w-md bg-slate-900 rounded-t-3xl lg:rounded-2xl border-t lg:border border-slate-700/50 p-5 space-y-4 animate-slide-up">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-white">Confirm Publish</h2>
            <button onClick={() => setShowPublishConfirm(false)} className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center">
              <X size={18} className="text-slate-400" />
            </button>
          </div>
          <div className="flex items-start gap-3 px-3 py-3 bg-amber-500/10 border border-amber-500/20 rounded-xl">
            <AlertTriangle size={20} className="text-amber-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-white">You are about to publish {count} eBay listing{count > 1 ? 's' : ''}.</p>
              <p className="text-xs text-slate-400 mt-1">
                Only drafts with "Ready" status will be published. Drafts needing review, missing info, or with errors will be skipped.
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => setShowPublishConfirm(false)}>Cancel</Button>
            <Button className="flex-1" onClick={handlePublishAll} icon={<Send size={16} />}>
              Publish {count} Listing{count > 1 ? 's' : ''}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ===== MAIN REVIEW VIEW =====
  return (
    <div className="px-4 pt-14 pb-nav-safe lg:px-8 lg:pt-8 space-y-4 animate-fade-in">
      <button onClick={onBack} className="flex items-center gap-1 text-slate-400 text-sm">
        <ChevronLeft size={18} /> Back to Listings
      </button>

      <div>
        <h1 className="text-2xl font-bold text-white">Bulk eBay Review</h1>
        <p className="text-slate-400 text-sm mt-0.5">Review and publish {drafts.length} draft listing{drafts.length > 1 ? 's' : ''}</p>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-4 gap-2">
        <StatCard label="Ready" value={String(readyCount)} icon={<Check size={14} />} color="text-emerald-400" />
        <StatCard label="Review" value={String(needsReviewCount)} icon={<AlertCircle size={14} />} color="text-amber-400" />
        <StatCard label="Missing" value={String(missingInfoCount)} icon={<AlertTriangle size={14} />} color="text-red-400" />
        <StatCard label="Errors" value={String(errorCount)} icon={<X size={14} />} color="text-red-400" />
      </div>

      {/* Publish results summary */}
      {(publishedCount > 0 || failedCount > 0) && (
        <div className="grid grid-cols-2 gap-2">
          <Card className="p-2.5 text-center">
            <p className="text-[9px] text-slate-500 uppercase font-semibold">Published</p>
            <p className="text-sm font-bold text-emerald-400">{publishedCount}</p>
          </Card>
          <Card className="p-2.5 text-center">
            <p className="text-[9px] text-slate-500 uppercase font-semibold">Failed</p>
            <p className="text-sm font-bold text-red-400">{failedCount}</p>
          </Card>
        </div>
      )}

      {/* Publish buttons */}
      {!configOk && (
        <div className="flex items-center gap-2 px-3 py-2.5 bg-amber-500/10 border border-amber-500/20 rounded-xl">
          <AlertCircle size={14} className="text-amber-400" />
          <p className="text-amber-300 text-xs">Configure eBay credentials in Settings before publishing.</p>
        </div>
      )}

      <div className="flex gap-2">
        <Button
          className="flex-1"
          disabled={publishingAll || readyCount === 0 || !configOk}
          onClick={() => setShowPublishConfirm(true)}
          icon={publishingAll ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
        >
          {publishingAll ? 'Publishing...' : `Publish All Ready (${readyCount})`}
        </Button>
        <Button
          variant="secondary"
          className="flex-1"
          disabled={publishSelectedOnly || selectedDraftIds.size === 0 || !configOk}
          onClick={() => {
            const selectedReady = drafts.filter(d => selectedDraftIds.has(d.partId) && d.validationStatus === 'ready');
            if (selectedReady.length === 0) return;
            setPublishSelectedOnly(false);
            handlePublishSelected();
          }}
          icon={publishSelectedOnly ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
        >
          {publishSelectedOnly ? 'Publishing...' : `Publish Selected (${selectedDraftIds.size})`}
        </Button>
      </div>

      {/* Draft cards */}
      <div className="space-y-2">
        {drafts.map((draft, idx) => (
          <BulkDraftCard
            key={draft.partId}
            draft={draft}
            isSelected={selectedDraftIds.has(draft.partId)}
            onToggleSelect={() => toggleDraftSelection(draft.partId)}
            onEdit={() => setEditingIdx(idx)}
          />
        ))}
      </div>
    </div>
  );
}

// ===== BULK DRAFT CARD =====
function BulkDraftCard({
  draft, isSelected, onToggleSelect, onEdit,
}: {
  draft: BulkDraftInfo;
  isSelected: boolean;
  onToggleSelect: () => void;
  onEdit: () => void;
}) {
  const statusConfig: Record<ValidationStatus, { color: 'green' | 'amber' | 'red'; label: string; icon: React.ReactNode }> = {
    ready: { color: 'green', label: 'Ready', icon: <Check size={12} /> },
    needs_review: { color: 'amber', label: 'Needs Review', icon: <AlertCircle size={12} /> },
    missing_info: { color: 'red', label: 'Missing Info', icon: <AlertTriangle size={12} /> },
    error: { color: 'red', label: 'Error', icon: <X size={12} /> },
  };
  const sc = statusConfig[draft.validationStatus];

  const resultBadge: Record<typeof draft.publishResult, { color: string; label: string } | null> = {
    pending: null,
    published: { color: 'text-emerald-400', label: 'Published' },
    failed: { color: 'text-red-400', label: 'Failed' },
    skipped: { color: 'text-slate-500', label: 'Skipped' },
    not_attempted: null,
  };
  const rb = resultBadge[draft.publishResult];

  return (
    <Card className="p-3 space-y-2">
      {/* Top row: checkbox, photo, name, status */}
      <div className="flex items-start gap-3">
        {draft.validationStatus === 'ready' && draft.publishResult !== 'published' && (
          <button onClick={onToggleSelect} className="flex-shrink-0 mt-1">
            {isSelected ? <CheckSquare size={18} className="text-red-400" /> : <Square size={18} className="text-slate-600" />}
          </button>
        )}
        <div className="w-12 h-12 rounded-xl bg-slate-800 flex items-center justify-center flex-shrink-0 overflow-hidden">
          {draft.photoCount > 0 ? (
            <Package size={20} className="text-red-400" />
          ) : (
            <Package size={20} className="text-slate-600" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-white truncate">{draft.partName}</p>
          <p className="text-[10px] text-slate-500 truncate">{draft.vehicleLabel}</p>
          <p className="text-[10px] text-slate-600">SKU: {draft.partSku}</p>
        </div>
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          <Badge color={sc.color}>{sc.icon} {sc.label}</Badge>
          {rb && <span className={`text-[10px] font-semibold ${rb.color}`}>{rb.label}</span>}
        </div>
      </div>

      {/* Details row */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 px-1 text-[11px]">
        <div className="flex items-center justify-between">
          <span className="text-slate-500">Price</span>
          <span className="text-emerald-400 font-bold">{formatCurrency(draft.price)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-slate-500">Qty</span>
          <span className="text-slate-300">{draft.quantity}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-slate-500">Condition</span>
          <span className="text-slate-300">{draft.conditionLabel}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-slate-500">Shipping</span>
          <span className="text-slate-300">{draft.shippingCost > 0 ? formatCurrency(draft.shippingCost) : 'Free'} · {draft.shippingWeight}lbs</span>
        </div>
        <div className="flex items-center justify-between col-span-2">
          <span className="text-slate-500">Title</span>
          <span className="text-slate-300 truncate ml-2 max-w-[65%] text-right">{draft.title}</span>
        </div>
      </div>

      {/* Validation issues */}
      {draft.validationIssues.length > 0 && (
        <div className="space-y-0.5 pl-1">
          {draft.validationIssues.map((issue, i) => (
            <div key={i} className="flex items-start gap-1.5">
              <AlertCircle size={11} className="text-amber-400 mt-0.5 flex-shrink-0" />
              <p className="text-[11px] text-amber-300">{issue}</p>
            </div>
          ))}
        </div>
      )}

      {/* Publish error */}
      {draft.publishResult === 'failed' && draft.publishError && (
        <div className="flex items-start gap-1.5 pl-1">
          <X size={11} className="text-red-400 mt-0.5 flex-shrink-0" />
          <p className="text-[11px] text-red-300 whitespace-pre-line">{draft.publishError}</p>
        </div>
      )}

      {/* Published info */}
      {draft.publishResult === 'published' && draft.ebayItemId && (
        <div className="flex items-center gap-1.5 pl-1">
          <Check size={11} className="text-emerald-400 flex-shrink-0" />
          <span className="text-[11px] text-slate-400">eBay ID: {draft.ebayItemId}</span>
          {draft.listingUrl && (
            <a href={draft.listingUrl} target="_blank" rel="noopener noreferrer" className="text-[11px] text-red-400 underline">
              View
            </a>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-end gap-2 pt-1 border-t border-slate-800/40">
        <button onClick={onEdit} className="text-xs font-semibold text-red-400 flex items-center gap-1 active:scale-95 transition-transform">
          <FileEdit size={14} /> Edit Draft
        </button>
      </div>
    </Card>
  );
}

// ===== BULK DRAFT EDITOR =====
function BulkDraftEditor({
  draft, onSave, onCancel,
}: {
  draft: BulkDraftInfo;
  onSave: (updated: BulkDraftInfo) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(draft.title);
  const [description, setDescription] = useState(draft.description);
  const [price, setPrice] = useState(String(draft.price));
  const [quantity, setQuantity] = useState(String(draft.quantity));
  const [shippingCost, setShippingCost] = useState(String(draft.shippingCost));
  const [shippingWeight, setShippingWeight] = useState(String(draft.shippingWeight));
  const [conditionId, setConditionId] = useState(draft.conditionId);
  const [listingType, setListingType] = useState(draft.listingType);
  const [listingDuration, setListingDuration] = useState(draft.listingDuration);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    const updated: BulkDraftInfo = {
      ...draft,
      title,
      description,
      price: parseFloat(price) || 0,
      quantity: parseInt(quantity) || 1,
      shippingCost: parseFloat(shippingCost) || 0,
      shippingWeight: parseFloat(shippingWeight) || 0,
      conditionId,
      conditionLabel: CONDITION_LABELS[conditionId] ?? 'Used',
      listingType,
      listingDuration,
    };

    // Update database if listing was created
    if (draft.listingId) {
      await supabase.from('ebay_listings').update({
        title,
        description,
        price: updated.price,
        quantity: updated.quantity,
        shipping_cost: updated.shippingCost,
        shipping_weight_lbs: updated.shippingWeight,
        condition_id: conditionId,
        listing_type: listingType,
        listing_duration: listingDuration,
        updated_at: new Date().toISOString(),
      }).eq('id', draft.listingId);
    }

    setSaving(false);
    onSave(updated);
  };

  return (
    <div className="px-4 pt-14 pb-nav-safe lg:px-8 lg:pt-8 space-y-4 animate-fade-in">
      <button onClick={onCancel} className="flex items-center gap-1 text-slate-400 text-sm">
        <ChevronLeft size={18} /> Back to Review
      </button>

      <div>
        <h1 className="text-xl font-bold text-white">{draft.partName}</h1>
        <p className="text-xs text-slate-500">{draft.vehicleLabel} · SKU: {draft.partSku}</p>
      </div>

      <Card className="p-4 space-y-3">
        <FormField label="Listing Title" value={title} onChange={setTitle} placeholder="e.g. 2018 Ford F-150 Engine OEM Used" />
        <div>
          <label className="text-[10px] text-slate-500 uppercase font-semibold block mb-1">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="w-full bg-slate-900/80 border border-slate-700/50 rounded-lg px-3 py-2 text-white text-sm focus:border-red-500 focus:outline-none resize-none"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Price (USD)" value={price} onChange={setPrice} placeholder="0.00" type="number" />
          <FormField label="Quantity" value={quantity} onChange={setQuantity} type="number" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] text-slate-500 uppercase font-semibold block mb-1">Listing Type</label>
            <select value={listingType} onChange={(e) => setListingType(e.target.value)}
              className="w-full bg-slate-900/80 border border-slate-700/50 rounded-lg px-3 py-2 text-white text-sm focus:border-red-500 focus:outline-none">
              <option value="FixedPrice">Fixed Price</option>
              <option value="Auction">Auction</option>
            </select>
          </div>
          <div>
            <label className="text-[10px] text-slate-500 uppercase font-semibold block mb-1">Duration</label>
            <select value={listingDuration} onChange={(e) => setListingDuration(e.target.value)}
              className="w-full bg-slate-900/80 border border-slate-700/50 rounded-lg px-3 py-2 text-white text-sm focus:border-red-500 focus:outline-none">
              <option value="GTC">Good Till Cancelled</option>
              <option value="Days_7">7 Days</option>
              <option value="Days_30">30 Days</option>
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Shipping Cost (USD)" value={shippingCost} onChange={setShippingCost} placeholder="0.00" type="number" />
          <FormField label="Weight (lbs)" value={shippingWeight} onChange={setShippingWeight} placeholder="10" type="number" />
        </div>
        <div>
          <label className="text-[10px] text-slate-500 uppercase font-semibold block mb-1">Condition</label>
          <select value={conditionId} onChange={(e) => setConditionId(e.target.value)}
            className="w-full bg-slate-900/80 border border-slate-700/50 rounded-lg px-3 py-2 text-white text-sm focus:border-red-500 focus:outline-none">
            <option value="3000">Used</option>
            <option value="2500">Seller Refurbished</option>
            <option value="4000">Very Good</option>
            <option value="5000">Good</option>
            <option value="6000">Fair</option>
            <option value="7000">For Parts or Not Working</option>
          </select>
        </div>
      </Card>

      <div className="flex gap-2">
        <Button variant="secondary" className="flex-1" onClick={onCancel} disabled={saving}>Cancel</Button>
        <Button className="flex-1" onClick={handleSave} disabled={saving} icon={saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}>
          {saving ? 'Saving...' : 'Save Changes'}
        </Button>
      </div>
    </div>
  );
}

// ===== CREATE LISTING VIEW (existing, unchanged) =====
function CreateListingView({
  parts, vehicles, onCancel, onCreated, configOk, store,
}: {
  parts: DismantlePart[];
  vehicles: Vehicle[];
  onCancel: () => void;
  onCreated: () => void;
  configOk: boolean;
  store: VehicleStore;
}) {
  const [selectedPartId, setSelectedPartId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [listingType, setListingType] = useState('FixedPrice');
  const [listingDuration, setListingDuration] = useState('GTC');
  const [shippingCost, setShippingCost] = useState('');
  const [shippingWeight, setShippingWeight] = useState('');
  const [conditionId, setConditionId] = useState('3000');
  const [conditionDesc, setConditionDesc] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [publishNow, setPublishNow] = useState(false);

  const selectedPart = parts.find(p => p.id === selectedPartId);
  const selectedVehicle = selectedPart ? vehicles.find(v => v.id === selectedPart.vehicleId) : null;

  const handleSelectPart = (part: DismantlePart) => {
    setSelectedPartId(part.id);
    const vehicle = vehicles.find(v => v.id === part.vehicleId);
    const vehicleStr = vehicle ? `${vehicle.year} ${vehicle.make} ${vehicle.model}` : '';
    setTitle(`${vehicleStr} ${part.name} OEM Used`.trim());
    setDescription(`OEM used ${part.name} from a ${vehicleStr}. ${part.condition ? `Condition: ${part.condition}.` : ''} Tested and inspected. Ready to ship.`);
    setPrice(String(part.recommendedPrice.toFixed(2)));
    setShippingWeight('10');
  };

  const handleCreate = async () => {
    if (!selectedPartId || !selectedPart || !selectedVehicle) return;
    const priceNum = parseFloat(price);
    if (isNaN(priceNum) || priceNum <= 0) {
      setError('Enter a valid price');
      return;
    }

    setSaving(true);
    setError('');

    const { data, error: dbError } = await supabase.from('ebay_listings').insert({
      part_id: selectedPartId,
      vehicle_id: selectedPart.vehicleId,
      title,
      description,
      price: priceNum,
      quantity,
      listing_type: listingType,
      listing_duration: listingDuration,
      shipping_cost: parseFloat(shippingCost) || 0,
      shipping_weight_lbs: parseFloat(shippingWeight) || null,
      condition_id: conditionId,
      condition_description: conditionDesc || null,
      listing_status: 'draft',
      item_specifics: {
        Brand: 'OEM',
        Placement: selectedPart.category,
      },
    }).select('id').single();

    if (dbError) {
      setError('Failed to create listing: ' + dbError.message);
      setSaving(false);
      return;
    }

    if (publishNow && configOk) {
      try {
        const resp = await fetch(`${EBAY_API_URL}/publish`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            listing_id: data.id,
            sku: selectedPart?.sku || undefined,
            title,
            description,
            price: priceNum,
            quantity,
            listing_type: listingType,
            listing_duration: listingDuration,
            shipping_cost: parseFloat(shippingCost) || 0,
            shipping_weight_lbs: parseFloat(shippingWeight) || 10,
            condition_id: conditionId,
            condition_description: conditionDesc,
          }),
        });
        const result = await resp.json();
        if (!resp.ok) throw new Error(formatEbayError(result));
      } catch (err) {
        setError(`Listing saved as draft. eBay publish failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
        setSaving(false);
        onCreated();
        return;
      }
    }

    await supabase.from('part_statuses').upsert({
      part_id: selectedPartId,
      vehicle_id: selectedPart.vehicleId,
      status: 'listed',
      ebay_status: publishNow ? 'active' : 'draft',
      updated_at: new Date().toISOString(),
    });
    await store.updatePartEbayStatus(selectedPartId, selectedPart.vehicleId, publishNow ? 'active' : 'draft');

    setSaving(false);
    onCreated();
  };

  return (
    <div className="px-4 pt-14 pb-nav-safe lg:px-8 lg:pt-8 space-y-4 animate-fade-in">
      <button onClick={onCancel} className="flex items-center gap-1 text-slate-400 text-sm">
        <ChevronLeft size={18} /> Cancel
      </button>

      <div>
        <h1 className="text-2xl font-bold text-white">New eBay Listing</h1>
        <p className="text-slate-400 text-sm mt-0.5">Create a listing from your parts inventory</p>
      </div>

      {error && (
        <div className="flex items-center gap-2 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-xl">
          <AlertCircle size={14} className="text-red-400" />
          <p className="text-red-300 text-xs whitespace-pre-line">{error}</p>
        </div>
      )}

      {!selectedPartId ? (
        <div className="space-y-2">
          <p className="text-[10px] text-slate-500 uppercase font-semibold tracking-wide">Select a Part to List</p>
          {parts.length === 0 ? (
            <Card className="p-8 text-center">
              <Package size={32} className="text-slate-700 mx-auto mb-3" />
              <p className="text-slate-500 text-sm">No unlisted parts available.</p>
              <p className="text-slate-600 text-xs mt-1">Pull and prepare parts in the Dismantling tab first.</p>
            </Card>
          ) : (
            parts.map(part => {
              const v = vehicles.find(v => v.id === part.vehicleId);
              return (
                <Card key={part.id} onClick={() => handleSelectPart(part)} className="p-3 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-red-500/15 flex items-center justify-center flex-shrink-0">
                    <Package size={18} className="text-red-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-white truncate">{part.name}</p>
                    <p className="text-xs text-slate-500 truncate">{v ? vehicleLabelString(v) : ''}</p>
                  </div>
                  <span className="text-emerald-400 text-xs font-bold">{formatCurrency(part.recommendedPrice)}</span>
                </Card>
              );
            })
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <Card className="p-3 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-500/15 flex items-center justify-center flex-shrink-0">
              <Package size={18} className="text-red-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-white truncate">{selectedPart?.name}</p>
              <p className="text-xs text-slate-500 truncate">{selectedVehicle ? vehicleLabelString(selectedVehicle) : ''}</p>
            </div>
            <button onClick={() => setSelectedPartId(null)} className="text-slate-500">
              <X size={16} />
            </button>
          </Card>

          <Card className="p-4 space-y-3">
            <FormField label="Listing Title" value={title} onChange={setTitle} placeholder="e.g. 2018 Ford F-150 Engine OEM Used" />
            <div>
              <label className="text-[10px] text-slate-500 uppercase font-semibold block mb-1">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="w-full bg-slate-900/80 border border-slate-700/50 rounded-lg px-3 py-2 text-white text-sm focus:border-red-500 focus:outline-none resize-none"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Price (USD)" value={price} onChange={setPrice} placeholder="0.00" type="number" />
              <FormField label="Quantity" value={String(quantity)} onChange={(v) => setQuantity(parseInt(v) || 1)} type="number" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] text-slate-500 uppercase font-semibold block mb-1">Listing Type</label>
                <select value={listingType} onChange={(e) => setListingType(e.target.value)}
                  className="w-full bg-slate-900/80 border border-slate-700/50 rounded-lg px-3 py-2 text-white text-sm focus:border-red-500 focus:outline-none">
                  <option value="FixedPrice">Fixed Price</option>
                  <option value="Auction">Auction</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] text-slate-500 uppercase font-semibold block mb-1">Duration</label>
                <select value={listingDuration} onChange={(e) => setListingDuration(e.target.value)}
                  className="w-full bg-slate-900/80 border border-slate-700/50 rounded-lg px-3 py-2 text-white text-sm focus:border-red-500 focus:outline-none">
                  <option value="GTC">Good Till Cancelled</option>
                  <option value="Days_7">7 Days</option>
                  <option value="Days_30">30 Days</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Shipping Cost (USD)" value={shippingCost} onChange={setShippingCost} placeholder="0.00" type="number" />
              <FormField label="Weight (lbs)" value={shippingWeight} onChange={setShippingWeight} placeholder="10" type="number" />
            </div>
            <div>
              <label className="text-[10px] text-slate-500 uppercase font-semibold block mb-1">Condition</label>
              <select value={conditionId} onChange={(e) => setConditionId(e.target.value)}
                className="w-full bg-slate-900/80 border border-slate-700/50 rounded-lg px-3 py-2 text-white text-sm focus:border-red-500 focus:outline-none">
                <option value="3000">Used</option>
                <option value="2500">Seller Refurbished</option>
                <option value="4000">Very Good</option>
                <option value="5000">Good</option>
                <option value="6000">Fair</option>
                <option value="7000">For Parts or Not Working</option>
              </select>
            </div>
            <FormField label="Condition Description" value={conditionDesc} onChange={setConditionDesc} placeholder="e.g. Minor scuffs, fully functional" />
          </Card>

          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-white">Publish to eBay now</p>
                <p className="text-xs text-slate-500">{configOk ? 'Live on eBay immediately' : 'Requires eBay configuration in Settings'}</p>
              </div>
              <button
                onClick={() => setPublishNow(!publishNow)}
                disabled={!configOk}
                className={`relative w-11 h-6 rounded-full transition-colors disabled:opacity-40 ${publishNow ? 'bg-emerald-600' : 'bg-slate-700'}`}
              >
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${publishNow ? 'translate-x-5' : ''}`} />
              </button>
            </div>
          </Card>

          <Button onClick={handleCreate} size="lg" className="w-full" disabled={saving}
            icon={saving ? <Loader2 size={20} className="animate-spin" /> : publishNow ? <Upload size={20} /> : <Check size={20} />}>
            {saving ? 'Saving...' : publishNow ? 'Publish to eBay' : 'Save as Draft'}
          </Button>
        </div>
      )}
    </div>
  );
}

// ===== LISTING DETAIL VIEW (existing, unchanged) =====
function ListingDetailView({
  listing, part, vehicle, onBack, onSync, onEnd, syncing, store,
}: {
  listing: EbayListing;
  part: DismantlePart | null;
  vehicle: Vehicle | null;
  onBack: () => void;
  onSync: () => void;
  onEnd: () => void;
  syncing: boolean;
  store: VehicleStore;
}) {
  const [publishing, setPublishing] = useState(false);
  const [reviseMode, setReviseMode] = useState(false);
  const [revisePrice, setRevisePrice] = useState(String(Number(listing.price)));
  const [reviseTitle, setReviseTitle] = useState(listing.title);
  const [reviseShipping, setReviseShipping] = useState<'buyer_pays' | 'free'>((listing.shipping_type as 'buyer_pays' | 'free') ?? 'buyer_pays');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handlePublish = async () => {
    setPublishing(true);
    setError('');
    try {
      const resp = await fetch(`${EBAY_API_URL}/publish`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          listing_id: listing.id,
          sku: listing.sku || undefined,
          title: listing.title,
          description: listing.description,
          price: Number(listing.price),
          quantity: listing.quantity,
          listing_type: listing.listing_type,
          listing_duration: listing.listing_duration,
          shipping_cost: Number(listing.shipping_cost),
          shipping_weight_lbs: listing.shipping_weight_lbs || 10,
          condition_id: listing.condition_id || '3000',
          condition_description: '',
        }),
      });
      const result = await resp.json();
      if (!resp.ok) throw new Error(formatEbayError(result));
      await store.updatePartEbayStatus(listing.part_id, listing.vehicle_id, 'active');
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Publish failed');
    } finally {
      setPublishing(false);
    }
  };

  const details = [
    { label: 'eBay Item ID', value: listing.ebay_item_id || 'Not published' },
    { label: 'Vehicle', value: vehicle ? vehicleLabelString(vehicle) : 'Unknown' },
    { label: 'Part', value: part?.name ?? listing.title },
    { label: 'Listing Type', value: listing.listing_type },
    { label: 'Duration', value: listing.listing_duration },
    { label: 'Condition', value: listing.condition_id || 'Used' },
    { label: 'Quantity', value: String(listing.quantity) },
    { label: 'Shipping Cost', value: formatCurrency(Number(listing.shipping_cost)) },
    { label: 'Weight (lbs)', value: listing.shipping_weight_lbs ? String(listing.shipping_weight_lbs) : '—' },
    { label: 'Created', value: new Date(listing.created_at).toLocaleDateString() },
  ];

  return (
    <div className="px-4 pt-14 pb-nav-safe lg:px-8 lg:pt-8 space-y-4 animate-fade-in">
      <button onClick={onBack} className="flex items-center gap-1 text-slate-400 text-sm">
        <ChevronLeft size={18} /> Back to Listings
      </button>

      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-white">{listing.title}</h1>
          <div className="flex items-center gap-2 mt-1">
            <Badge color={statusBadgeColor(listing.listing_status)}>{STATUS_LABELS[listing.listing_status]}</Badge>
            {listing.ebay_item_id && <Badge color="blue">eBay Live</Badge>}
          </div>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-xl">
          <AlertCircle size={14} className="text-red-400" />
          <p className="text-red-300 text-xs whitespace-pre-line">{error}</p>
        </div>
      )}

      <div className="grid grid-cols-3 gap-3">
        <Card className="p-3 text-center">
          <p className="text-[10px] text-slate-500 uppercase font-semibold">Price</p>
          <p className="text-lg font-bold text-emerald-400 mt-1">{formatCurrency(Number(listing.price))}</p>
        </Card>
        <Card className="p-3 text-center">
          <p className="text-[10px] text-slate-500 uppercase font-semibold">Views</p>
          <p className="text-lg font-bold text-white mt-1">{listing.view_count}</p>
        </Card>
        <Card className="p-3 text-center">
          <p className="text-[10px] text-slate-500 uppercase font-semibold">Watches</p>
          <p className="text-lg font-bold text-white mt-1">{listing.watch_count}</p>
        </Card>
      </div>

      <Card className="p-4">
        <div className="space-y-0.5">
          {details.map(d => (
            <div key={d.label} className="flex items-center justify-between py-2.5 border-b border-slate-800/60">
              <span className="text-sm text-slate-500">{d.label}</span>
              <span className="text-sm text-white font-medium text-right max-w-[60%] truncate">{d.value}</span>
            </div>
          ))}
        </div>
      </Card>

      {listing.description && (
        <Card className="p-4">
          <p className="text-[10px] text-slate-500 uppercase font-semibold mb-2">Description</p>
          <p className="text-sm text-slate-300 whitespace-pre-wrap">{listing.description}</p>
        </Card>
      )}

      <div className="space-y-2">
        {listing.listing_status === 'draft' && (
          <Button onClick={handlePublish} size="lg" className="w-full" disabled={publishing}
            icon={publishing ? <Loader2 size={20} className="animate-spin" /> : <Upload size={20} />}>
            {publishing ? 'Publishing...' : 'Publish to eBay'}
          </Button>
        )}
        {listing.listing_status === 'active' && listing.ebay_item_id && (
          <>
            <Button variant="secondary" size="lg" className="w-full" disabled={syncing}
              onClick={onSync} icon={syncing ? <Loader2 size={20} className="animate-spin" /> : <RefreshCw size={20} />}>
              {syncing ? 'Syncing...' : 'Sync Status from eBay'}
            </Button>
            <Button variant="secondary" size="lg" className="w-full" onClick={() => setReviseMode(!reviseMode)} icon={<Edit3 size={20} />}>
              {reviseMode ? 'Cancel Revise' : 'Revise Listing'}
            </Button>
            {listing.ebay_item_id && (
              <a
                href={`https://www.ebay.com/itm/${listing.ebay_item_id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full bg-slate-800/60 border border-slate-700/50 rounded-2xl py-3.5 text-sm font-semibold text-slate-300 flex items-center justify-center gap-2"
              >
                <ExternalLink size={18} /> View on eBay
              </a>
            )}
          </>
        )}
        {reviseMode && listing.listing_status === 'active' && (
          <Card className="p-4 space-y-3">
            <p className="text-sm font-bold text-white">Revise Listing</p>
            <div>
              <label className="text-[10px] text-slate-500 uppercase font-semibold">Title</label>
              <input value={reviseTitle} onChange={(e) => setReviseTitle(e.target.value)} className="w-full bg-slate-900/80 border border-slate-700/50 rounded-lg px-3 py-2 text-white text-sm mt-1 focus:border-red-500 focus:outline-none" />
            </div>
            <div>
              <label className="text-[10px] text-slate-500 uppercase font-semibold">Price</label>
              <input type="number" value={revisePrice} onChange={(e) => setRevisePrice(e.target.value)} className="w-full bg-slate-900/80 border border-slate-700/50 rounded-lg px-3 py-2 text-white text-sm mt-1 focus:border-red-500 focus:outline-none" />
            </div>
            <div>
              <label className="text-[10px] text-slate-500 uppercase font-semibold">Shipping</label>
              <div className="flex gap-2 mt-1">
                <button onClick={() => setReviseShipping('buyer_pays')} className={`flex-1 py-2 rounded-lg text-xs font-semibold ${reviseShipping === 'buyer_pays' ? 'bg-red-600 text-white' : 'bg-slate-800 text-slate-400'}`}>Buyer Pays</button>
                <button onClick={() => setReviseShipping('free')} className={`flex-1 py-2 rounded-lg text-xs font-semibold ${reviseShipping === 'free' ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-400'}`}>Free Shipping</button>
              </div>
            </div>
            <Button size="md" className="w-full" disabled={saving} onClick={async () => {
              setSaving(true);
              setError('');
              try {
                await supabase.from('ebay_listings').update({
                  title: reviseTitle,
                  price: parseFloat(revisePrice),
                  shipping_type: reviseShipping,
                  shipping_cost: reviseShipping === 'free' ? 0 : null,
                }).eq('id', listing.id);
                if (listing.ebay_item_id) {
                  await fetch(`${EBAY_API_URL}/publish`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ listing_id: listing.id, title: reviseTitle, price: parseFloat(revisePrice), shipping_type: reviseShipping }),
                  });
                }
                setReviseMode(false);
                window.location.reload();
              } catch (err) {
                setError(err instanceof Error ? err.message : 'Revise failed');
              } finally {
                setSaving(false);
              }
            }} icon={saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}>
              {saving ? 'Saving...' : 'Save Revise'}
            </Button>
          </Card>
        )}
        <Button variant="danger" size="lg" className="w-full" disabled={syncing}
          onClick={onEnd} icon={syncing ? <Loader2 size={20} className="animate-spin" /> : <Trash2 size={20} />}>
          {listing.listing_status === 'draft' ? 'Delete Draft' : 'End Listing'}
        </Button>
      </div>
    </div>
  );
}

function FormField({ label, value, onChange, placeholder, type = 'text' }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div>
      <label className="text-[10px] text-slate-500 uppercase font-semibold block mb-1">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        type={type}
        className="w-full bg-slate-900/80 border border-slate-700/50 rounded-lg px-3 py-2 text-white text-sm focus:border-red-500 focus:outline-none"
      />
    </div>
  );
}

// ===== BULK REVIEW SCREEN (Admin/Owner) =====
function BulkReviewScreen({
  listings, parts, vehicles, configOk, onBack, onUpdated, store,
}: {
  listings: EbayListing[];
  parts: import('@/types').DismantlePart[];
  vehicles: import('@/types').Vehicle[];
  configOk: boolean;
  onBack: () => void;
  onUpdated: () => void;
  store: VehicleStore;
}) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editingPrice, setEditingPrice] = useState<Record<string, string>>({});
  const [editingShipping, setEditingShipping] = useState<Record<string, 'buyer_pays' | 'free'>>({});
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState('');

  const listingData = useMemo(() => {
    return listings.map(l => {
      const vehicle = vehicles.find(v => v.id === l.vehicle_id);
      const part = parts.find(p => p.id === l.part_id);
      return {
        ...l,
        vehicleLabel: vehicle ? vehicleLabelString(vehicle) : 'Unknown',
        partName: part?.name ?? l.title,
        partNumber: part?.oemPartNumber ?? '',
        photoUrl: l.photo_urls?.[0] ?? '',
        currentShipping: editingShipping[l.id] ?? (l.shipping_type ?? 'buyer_pays') as 'buyer_pays' | 'free',
      };
    });
  }, [listings, vehicles, parts, editingShipping]);

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => setSelectedIds(new Set(listingData.map(l => l.id)));
  const clearAll = () => setSelectedIds(new Set());

  const handlePriceChange = (id: string, value: string) => {
    setEditingPrice(prev => ({ ...prev, [id]: value }));
  };

  const handleShippingToggle = (id: string) => {
    setEditingShipping(prev => ({
      ...prev,
      [id]: prev[id] === 'free' ? 'buyer_pays' : 'free',
    }));
  };

  const handleSaveChanges = async () => {
    for (const id of Object.keys(editingPrice)) {
      const newPrice = parseFloat(editingPrice[id]);
      if (!isNaN(newPrice)) {
        await supabase.from('ebay_listings').update({ price: newPrice }).eq('id', id);
      }
    }
    for (const id of Object.keys(editingShipping)) {
      await supabase.from('ebay_listings').update({
        shipping_type: editingShipping[id],
        shipping_cost: editingShipping[id] === 'free' ? 0 : null,
      }).eq('id', id);
    }
    setEditingPrice({});
    setEditingShipping({});
    onUpdated();
  };

  const handlePublishSelected = async () => {
    if (selectedIds.size === 0) return;
    if (!configOk) {
      setError('eBay API is not configured. Save changes and publish when API is connected.');
      return;
    }
    setPublishing(true);
    setError('');
    try {
      for (const id of Array.from(selectedIds)) {
        const listing = listings.find(l => l.id === id);
        if (!listing) continue;
        const resp = await fetch(`${EBAY_API_URL}/publish`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ listing_id: id }),
        });
        if (!resp.ok) {
          const result = await resp.json();
          throw new Error(`Failed to publish "${listing.title}": ${formatEbayError(result)}`);
        }
        await store.updatePartEbayStatus(listing.part_id, listing.vehicle_id, 'active');
      }
      onUpdated();
      onBack();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Publish failed');
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div className="px-4 pt-14 pb-nav-safe lg:px-8 lg:pt-8 space-y-4 animate-fade-in">
      <button onClick={onBack} className="flex items-center gap-1 text-slate-400 text-sm">
        <ChevronLeft size={18} /> Back to eBay
      </button>

      <div>
        <h1 className="text-2xl font-bold text-white">Bulk Review</h1>
        <p className="text-slate-400 text-sm mt-0.5">Review and edit prepared parts before sending to eBay</p>
      </div>

      {/* Selection controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={selectAll} className="text-xs font-semibold text-red-400">Select All</button>
          <button onClick={clearAll} className="text-xs font-semibold text-slate-400">Clear</button>
        </div>
        <Badge color={selectedIds.size > 0 ? 'blue' : 'slate'}>{selectedIds.size} selected</Badge>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-xl">
          <AlertCircle size={16} className="text-red-400 flex-shrink-0" />
          <p className="text-xs text-red-300 flex-1">{error}</p>
        </div>
      )}

      {listingData.length === 0 ? (
        <div className="flex flex-col items-center text-center py-16">
          <Store size={48} className="text-slate-700" strokeWidth={1.5} />
          <p className="text-slate-500 text-sm mt-3">No parts ready for eBay</p>
          <p className="text-slate-600 text-xs mt-1">Prepare parts from inventory to populate this review area.</p>
        </div>
      ) : (
        <>
          {/* Bulk listing cards with inline editing */}
          <div className="space-y-2">
            {listingData.map(l => {
              const isSelected = selectedIds.has(l.id);
              const priceValue = editingPrice[l.id] ?? String(Number(l.price));
              const shippingValue = l.currentShipping;

              return (
                <Card key={l.id} className={`p-3 ${isSelected ? 'ring-2 ring-red-500/40' : ''}`}>
                  <div className="flex items-start gap-3">
                    <button
                      onClick={() => toggleSelect(l.id)}
                      className={`w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 mt-1 ${
                        isSelected ? 'bg-red-600' : 'bg-slate-700/50 border border-slate-600'
                      }`}
                    >
                      {isSelected && <Check size={14} className="text-white" />}
                    </button>

                    {l.photoUrl ? (
                      <img src={l.photoUrl} alt={l.title} className="w-16 h-16 rounded-xl object-cover flex-shrink-0 bg-slate-800" />
                    ) : (
                      <div className="w-16 h-16 rounded-xl bg-slate-800 flex items-center justify-center flex-shrink-0">
                        <Package size={18} className="text-slate-600" />
                      </div>
                    )}

                    <div className="flex-1 min-w-0 space-y-2">
                      <div>
                        <p className="text-sm font-bold text-white line-clamp-1">{l.partName}</p>
                        <p className="text-xs text-slate-500 truncate">{l.vehicleLabel}</p>
                        {l.partNumber && <p className="text-[10px] text-red-400 font-mono">{l.partNumber}</p>}
                      </div>

                      {/* Inline price editing */}
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-slate-500 uppercase font-semibold">Price</span>
                        <div className="flex items-center gap-1">
                          <span className="text-slate-500 text-xs">$</span>
                          <input
                            type="number"
                            value={priceValue}
                            onChange={(e) => handlePriceChange(l.id, e.target.value)}
                            className="w-20 bg-slate-900/80 border border-slate-700/50 rounded-lg px-2 py-1 text-white text-sm font-bold focus:border-red-500 focus:outline-none"
                          />
                        </div>
                      </div>

                      {/* Inline shipping toggle */}
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-slate-500 uppercase font-semibold">Shipping</span>
                        <button
                          onClick={() => handleShippingToggle(l.id)}
                          className={`px-2 py-1 rounded-lg text-[10px] font-semibold ${
                            shippingValue === 'buyer_pays' ? 'bg-red-600/20 text-red-400' : 'bg-emerald-600/20 text-emerald-400'
                          }`}
                        >
                          {shippingValue === 'buyer_pays' ? 'Buyer Pays' : 'Free'}
                        </button>
                      </div>
                    </div>

                    <Badge color="cyan">Ready</Badge>
                  </div>
                </Card>
              );
            })}
          </div>

          {/* Bottom action bar */}
          <div className="flex gap-2 pt-2">
            <Button
              variant="secondary"
              className="flex-1"
              onClick={handleSaveChanges}
              disabled={Object.keys(editingPrice).length === 0 && Object.keys(editingShipping).length === 0}
              icon={<Save size={16} />}
            >
              Save Changes
            </Button>
            {configOk ? (
              <Button
                className="flex-1"
                onClick={handlePublishSelected}
                disabled={selectedIds.size === 0 || publishing}
                icon={publishing ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
              >
                {publishing ? 'Publishing...' : `Publish ${selectedIds.size} to eBay`}
              </Button>
            ) : (
              <div className="flex-1 flex items-center justify-center px-3 py-2.5 bg-slate-800/60 rounded-xl text-xs text-slate-500 text-center">
                Connect eBay API in Settings to publish
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
