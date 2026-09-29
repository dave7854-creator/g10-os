import { useState, useMemo } from 'react';
import {
  Boxes, Search, X, Tag, Camera, Store, ChevronLeft, ChevronRight,
  CheckCircle2, Package, Save, Edit3, Eye, XCircle, Wrench,
} from 'lucide-react';
import { Card, Badge, Button, Modal, formatCurrency, ProgressBar } from '@/components/ui';
import { EstimateExplainer } from '@/components/EstimateExplainer';
import { ValuationSection } from '@/components/ValuationSection';
import { MarketResearch } from '@/components/MarketResearch';
import { vehicleLabelString } from '@/data';
import type { Screen, DismantlePart, PartStatus, EbayPartStatus, PulledStatus, VehicleStore, EstimateBreakdown, Vehicle } from '@/types';

const STATUS_LABELS: Record<PartStatus, string> = {
  available: 'Available', removed: 'Removed', cleaned: 'Cleaned', tested: 'Tested',
  listed: 'Listed', sold: 'Sold', scrapped: 'Scrapped',
};

function statusBadgeColor(status: PartStatus): 'slate' | 'blue' | 'cyan' | 'green' | 'amber' | 'red' {
  switch (status) {
    case 'available': return 'slate';
    case 'removed': return 'blue';
    case 'cleaned': return 'cyan';
    case 'tested': return 'cyan';
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
  ready: 'Ready to List',
  active: 'eBay Active',
  sold: 'eBay Sold',
  ended: 'eBay Ended',
  error: 'eBay Error',
};

const EBAY_STATUS_OPTIONS: EbayPartStatus[] = [
  'not_prepared', 'preparing', 'draft', 'needs_review', 'ready', 'active', 'sold', 'ended', 'error',
];

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

const PULLED_LABELS: Record<PulledStatus, string> = {
  not_pulled: 'Not Pulled',
  pulled: 'Pulled',
};

export function InventoryScreen({ onNavigate, store }: { onNavigate: (s: Screen) => void; store: VehicleStore }) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | PartStatus>('all');
  const [vehicleFilter, setVehicleFilter] = useState<'all' | 'selected'>('selected');
  const [selected, setSelected] = useState<DismantlePart | null>(null);
  const [explainer, setExplainer] = useState<{ breakdown: EstimateBreakdown; title: string } | null>(null);

  const archivedSlug = store.statusConfigs.find((c) => c.isArchived)?.slug ?? 'archived';

  const partsWithLabels = useMemo(() => {
    return store.parts.map((p) => ({
      ...p,
      vehicleLabel: store.vehicles.find((v) => v.id === p.vehicleId)
        ? vehicleLabelString(store.vehicles.find((v) => v.id === p.vehicleId) as Vehicle)
        : 'Unknown Vehicle',
    }));
  }, [store.parts, store.vehicles]);

  const scopedParts = useMemo(() => {
    let parts = partsWithLabels.filter((p) => {
      const v = store.vehicles.find((v) => v.id === p.vehicleId);
      if (!v) return false;
      if (v.status === archivedSlug) return false;
      return true;
    });
    if (vehicleFilter === 'selected' && store.selectedVehicleId) {
      parts = parts.filter((p) => p.vehicleId === store.selectedVehicleId);
    }
    return parts;
  }, [partsWithLabels, store.vehicles, store.selectedVehicleId, vehicleFilter, archivedSlug]);

  const filtered = useMemo(() => {
    let parts = scopedParts;
    if (filter !== 'all') parts = parts.filter((p) => p.status === filter);
    if (query) {
      const q = query.toLowerCase();
      parts = parts.filter((p) =>
        p.name.toLowerCase().includes(q) ||
        p.vehicleLabel.toLowerCase().includes(q) ||
        p.toteId.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q)
      );
    }
    return parts;
  }, [scopedParts, filter, query]);

  const filters: { id: 'all' | PartStatus; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'available', label: 'Available' },
    { id: 'removed', label: 'Removed' },
    { id: 'listed', label: 'Listed' },
    { id: 'sold', label: 'Sold' },
  ];

  const vehicle = selected ? store.vehicles.find((v) => v.id === selected.vehicleId) : null;

  return (
    <div className="px-4 pt-14 pb-nav-safe lg:px-8 lg:pt-8 space-y-5 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Parts Inventory</h1>
          <p className="text-slate-400 text-sm mt-0.5">{filtered.length} parts in inventory</p>
        </div>
        {store.selectedVehicleId && scopedParts.filter(p => p.status !== 'sold' && p.status !== 'scrapped').length > 0 && (
          <Button
            size="sm"
            onClick={() => {
              const firstPart = scopedParts.find(p => p.status !== 'sold' && p.status !== 'scrapped');
              if (firstPart) {
                store.selectPart(firstPart.id, firstPart.vehicleId);
                onNavigate('prepare');
              }
            }}
            icon={<Wrench size={16} />}
          >
            Pull Part
          </Button>
        )}
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => setVehicleFilter('selected')}
          disabled={!store.selectedVehicleId}
          className={`flex-1 py-2 rounded-xl text-xs font-semibold transition-all ${
            vehicleFilter === 'selected' ? 'bg-red-600 text-white' : 'bg-slate-800/60 text-slate-400 border border-slate-700/50'
          } disabled:opacity-40`}
        >
          Active Vehicle
        </button>
        <button
          onClick={() => setVehicleFilter('all')}
          className={`flex-1 py-2 rounded-xl text-xs font-semibold transition-all ${
            vehicleFilter === 'all' ? 'bg-red-600 text-white' : 'bg-slate-800/60 text-slate-400 border border-slate-700/50'
          }`}
        >
          All Vehicles
        </button>
      </div>

      <div className="relative">
        <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by part name, vehicle, SKU, or tote..."
          className="w-full bg-slate-800/60 border border-slate-700/50 rounded-xl pl-11 pr-10 py-3 text-white text-sm placeholder:text-slate-500 focus:border-red-500 focus:outline-none"
        />
        {query && (
          <button onClick={() => setQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2">
            <X size={18} className="text-slate-500" />
          </button>
        )}
      </div>

      <div className="flex gap-2 overflow-x-auto scrollbar-hide -mx-4 px-4">
        {filters.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`flex-shrink-0 px-4 py-2 rounded-full text-xs font-semibold transition-all ${
              filter === f.id ? 'bg-red-600 text-white' : 'bg-slate-800/60 text-slate-400 border border-slate-700/50'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center text-center py-16">
          <Boxes size={48} className="text-slate-700" strokeWidth={1.5} />
          <p className="text-slate-500 text-sm mt-3">No parts found</p>
          <p className="text-slate-600 text-xs mt-1">Pull parts from the Dismantle tab to populate inventory.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((part) => (
            <PartListRow key={part.id} part={part} onClick={() => setSelected(part)} />
          ))}
        </div>
      )}

      {selected && vehicle && (
        <PartDetailModal
          part={selected}
          vehicle={vehicle}
          store={store}
          onClose={() => setSelected(null)}
          onNavigate={onNavigate}
          onExplain={(breakdown) => setExplainer({ breakdown, title: selected.name })}
        />
      )}

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

function PartListRow({ part, onClick }: { part: DismantlePart & { vehicleLabel: string }; onClick: () => void }) {
  const isGone = part.status === 'sold' || part.status === 'scrapped';
  return (
    <Card onClick={onClick} className={`p-3 transition-all ${isGone ? 'opacity-50' : ''}`}>
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-slate-700/40 flex items-center justify-center flex-shrink-0">
          <Package size={18} className="text-slate-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-bold truncate ${isGone ? 'text-slate-500 line-through' : 'text-white'}`}>
            {part.name}
          </p>
          <p className="text-xs text-slate-500 truncate">{part.vehicleLabel}</p>
        </div>
        <div className="flex-shrink-0 text-right">
          <p className="text-emerald-400 text-xs font-bold">{formatCurrency(part.recommendedPrice)}</p>
          <p className="text-slate-600 text-[10px]">{part.sku || part.toteId}</p>
        </div>
      </div>
      <div className="flex items-center gap-1.5 mt-2 flex-wrap">
        <Badge color={statusBadgeColor(part.status)}>{STATUS_LABELS[part.status]}</Badge>
        <Badge color={part.pulledStatus === 'pulled' ? 'blue' : 'slate'}>
          {PULLED_LABELS[part.pulledStatus]}
        </Badge>
        <Badge color={ebayStatusBadgeColor(part.ebayStatus)}>{EBAY_STATUS_LABELS[part.ebayStatus]}</Badge>
        {part.photos > 0 && (
          <span className="flex items-center gap-0.5 text-[10px] text-slate-500">
            <Camera size={10} /> {part.photos}
          </span>
        )}
      </div>
    </Card>
  );
}

function PartDetailModal({
  part, vehicle, store, onClose, onNavigate, onExplain,
}: {
  part: DismantlePart;
  vehicle: Vehicle;
  store: VehicleStore;
  onClose: () => void;
  onNavigate: (s: Screen) => void;
  onExplain: (breakdown: EstimateBreakdown) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<EditForm>({
    partName: part.name,
    category: part.category,
    sku: part.sku,
    toteId: part.toteId,
    condition: part.condition,
    pulledStatus: part.pulledStatus,
    quantity: part.stockQty,
    preBuyers: part.preBuyers,
    price: part.recommendedPrice,
    oemPartNumber: part.oemPartNumber,
    manufacturerPartNumber: part.manufacturerPartNumber,
    interchangeNumber: part.interchangeNumber,
    notes: part.notes,
    ebayStatus: part.ebayStatus,
    side: part.side,
    color: part.color,
    weightLbs: part.weightLbs ?? '',
    dimensions: part.dimensions,
  });

  const isGone = part.status === 'sold' || part.status === 'scrapped';

  const handleSave = async () => {
    await store.updatePartDetails(part.id, part.vehicleId, {
      partName: form.partName,
      category: form.category,
      sku: form.sku,
      toteId: form.toteId,
      condition: form.condition,
      pulledStatus: form.pulledStatus as PulledStatus,
      quantity: Number(form.quantity) || 1,
      preBuyers: form.preBuyers,
      price: form.price ? Number(form.price) : null,
      oemPartNumber: form.oemPartNumber,
      manufacturerPartNumber: form.manufacturerPartNumber,
      interchangeNumber: form.interchangeNumber,
      notes: form.notes,
      side: form.side,
      color: form.color,
      weightLbs: form.weightLbs ? Number(form.weightLbs) : null,
      dimensions: form.dimensions,
    });
    if (form.ebayStatus !== part.ebayStatus) {
      await store.updatePartEbayStatus(part.id, part.vehicleId, form.ebayStatus);
    }
    setEditing(false);
  };

  const handleGetReadyToList = () => {
    store.selectPart(part.id, part.vehicleId);
    onClose();
    onNavigate('prepare');
  };

  return (
    <Modal title="Part Details" onClose={onClose} maxWidth="lg:max-w-2xl">
      <div className="space-y-4">

        {/* Header */}
        <div className="flex items-start gap-3">
          <div className="w-14 h-14 rounded-2xl bg-slate-700/40 flex items-center justify-center flex-shrink-0">
            <Package size={24} className="text-slate-300" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-lg font-bold text-white">{editing ? form.partName : part.name}</p>
            <p className="text-sm text-slate-400">{vehicleLabelString(vehicle)}</p>
            <div className="flex items-center gap-1.5 mt-2 flex-wrap">
              <Badge color={statusBadgeColor(part.status)}>{STATUS_LABELS[part.status]}</Badge>
              <Badge color={part.pulledStatus === 'pulled' ? 'blue' : 'slate'}>
                {PULLED_LABELS[part.pulledStatus]}
              </Badge>
              <Badge color={ebayStatusBadgeColor(editing ? form.ebayStatus : part.ebayStatus)}>
                {EBAY_STATUS_LABELS[editing ? form.ebayStatus : part.ebayStatus]}
              </Badge>
            </div>
          </div>
          {!editing && !isGone && (
            <button
              onClick={() => setEditing(true)}
              className="flex items-center gap-1 text-xs text-red-400 font-semibold px-2 py-1.5 rounded-lg hover:bg-red-500/10"
            >
              <Edit3 size={14} /> Edit
            </button>
          )}
        </div>

        {/* Price Summary */}
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 bg-slate-900/50 rounded-xl">
            <p className="text-[10px] text-slate-500 uppercase font-semibold tracking-wide">Asking Price</p>
            <p className="text-lg font-bold text-emerald-400">{formatCurrency(part.recommendedPrice)}</p>
          </div>
          <div className="p-3 bg-slate-900/50 rounded-xl">
            <p className="text-[10px] text-slate-500 uppercase font-semibold tracking-wide">Market Comp (est.)</p>
            <p className="text-lg font-bold text-white">{formatCurrency(part.valuation.marketValue)}</p>
          </div>
        </div>

        {editing ? (
          <EditSection form={form} setForm={setForm} />
        ) : (
          <ViewSection part={part} />
        )}

        {/* eBay Status Control (manual override) */}
        {editing && (
          <div>
            <label className="text-[10px] text-slate-500 uppercase font-semibold tracking-wide">eBay Status (manual override)</label>
            <select
              value={form.ebayStatus}
              onChange={(e) => setForm({ ...form, ebayStatus: e.target.value as EbayPartStatus })}
              className="w-full bg-slate-800 border border-slate-700/50 rounded-xl px-3 py-2.5 text-white text-sm mt-1 focus:border-red-500 focus:outline-none"
            >
              {EBAY_STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>{EBAY_STATUS_LABELS[s]}</option>
              ))}
            </select>
          </div>
        )}

        {/* Editing controls */}
        {editing && (
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => setEditing(false)} icon={<XCircle size={16} />}>
              Cancel
            </Button>
            <Button className="flex-1" onClick={handleSave} icon={<Save size={16} />}>
              Save Changes
            </Button>
          </div>
        )}

        {/* Primary Action: GET READY TO LIST */}
        {!editing && !isGone && part.ebayStatus !== 'active' && part.ebayStatus !== 'sold' && (
          <Button size="lg" className="w-full" onClick={handleGetReadyToList} icon={<Store size={20} />}>
            Get Ready to List
          </Button>
        )}

        {/* Secondary actions */}
        {!editing && (
          <div className="flex gap-2">
            <Button
              variant="secondary"
              className="flex-1"
              onClick={() => { store.selectPart(part.id, part.vehicleId); onNavigate('dismantling'); }}
              icon={<ChevronLeft size={16} />}
            >
              Dismantle View
            </Button>
            {part.ebayStatus !== 'not_prepared' && part.ebayStatus !== 'preparing' && (
              <Button
                variant="secondary"
                className="flex-1"
                onClick={() => { store.selectVehicle(part.vehicleId); onNavigate('ebay'); }}
                icon={<Eye size={16} />}
              >
                eBay View
              </Button>
            )}
          </div>
        )}

        {!editing && (
          <>
            <ValuationSection part={part} store={store} />
            <MarketResearch part={part} vehicle={vehicle} />
          </>
        )}
      </div>
    </Modal>
  );
}

function ViewSection({ part }: { part: DismantlePart }) {
  const rows: { label: string; value: string }[] = [
    { label: 'Category', value: part.category },
    { label: 'SKU / Stock Number', value: part.sku || 'Not set' },
    { label: 'Tote / Shelf Location', value: part.toteId },
    { label: 'Condition', value: part.condition },
    { label: 'Pulled Status', value: PULLED_LABELS[part.pulledStatus] },
    { label: 'Current Stock / Quantity', value: String(part.stockQty) },
    { label: 'Pre-Buyers', value: part.preBuyers || 'None' },
    { label: 'OEM Part Number', value: part.oemPartNumber || 'Not set' },
    { label: 'Manufacturer Part Number', value: part.manufacturerPartNumber || 'Not set' },
    { label: 'Interchange Number', value: part.interchangeNumber || 'Not set' },
    { label: 'Side / Position', value: part.side || 'Not set' },
    { label: 'Color', value: part.color || 'Not set' },
    { label: 'Weight (lbs)', value: part.weightLbs != null ? String(part.weightLbs) : 'Not set' },
    { label: 'Dimensions', value: part.dimensions || 'Not set' },
    { label: 'Notes', value: part.notes || 'None' },
  ];

  return (
    <div className="grid grid-cols-2 gap-2 text-xs">
      {rows.map((r) => (
        <div key={r.label} className="p-2.5 bg-slate-900/40 rounded-xl">
          <p className="text-[10px] text-slate-500 uppercase font-semibold tracking-wide">{r.label}</p>
          <p className="text-sm text-white mt-0.5">{r.value}</p>
        </div>
      ))}
    </div>
  );
}

interface EditForm {
  partName: string; category: string; sku: string; toteId: string; condition: string;
  pulledStatus: PulledStatus; quantity: number | string; preBuyers: string;
  price: number | string; oemPartNumber: string; manufacturerPartNumber: string;
  interchangeNumber: string; notes: string; ebayStatus: EbayPartStatus;
  side: string; color: string; weightLbs: number | string; dimensions: string;
}

function EditSection({ form, setForm }: { form: EditForm; setForm: (f: EditForm) => void }) {
  const update = (key: keyof EditForm, value: unknown) => setForm({ ...form, [key]: value });

  const fields: { key: keyof EditForm; label: string; type?: string }[] = [
    { key: 'partName', label: 'Part Name' },
    { key: 'category', label: 'Category' },
    { key: 'sku', label: 'SKU / Stock Number' },
    { key: 'toteId', label: 'Tote ID / Shelf Location' },
    { key: 'condition', label: 'Condition' },
    { key: 'quantity', label: 'Current Stock / Quantity', type: 'number' },
    { key: 'preBuyers', label: 'Pre-Buyers' },
    { key: 'price', label: 'Price', type: 'number' },
    { key: 'oemPartNumber', label: 'OEM Part Number' },
    { key: 'manufacturerPartNumber', label: 'Manufacturer Part Number' },
    { key: 'interchangeNumber', label: 'Interchange Number' },
    { key: 'side', label: 'Side / Position' },
    { key: 'color', label: 'Color' },
    { key: 'weightLbs', label: 'Weight (lbs)', type: 'number' },
    { key: 'dimensions', label: 'Dimensions' },
  ];

  return (
    <div className="space-y-3">
      <div>
        <label className="text-[10px] text-slate-500 uppercase font-semibold tracking-wide">Pulled Status</label>
        <div className="flex gap-2 mt-1">
          {(['not_pulled', 'pulled'] as PulledStatus[]).map((ps) => (
            <button
              key={ps}
              onClick={() => update('pulledStatus', ps)}
              className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                form.pulledStatus === ps ? 'bg-red-600 text-white' : 'bg-slate-800 text-slate-400 border border-slate-700/50'
              }`}
            >
              {PULLED_LABELS[ps]}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {fields.map((f) => (
          <div key={f.key}>
            <label className="text-[10px] text-slate-500 uppercase font-semibold tracking-wide">{f.label}</label>
            <input
              type={f.type ?? 'text'}
              value={String(form[f.key] ?? '')}
              onChange={(e) => update(f.key, f.type === 'number' ? e.target.value : e.target.value)}
              className="w-full bg-slate-800 border border-slate-700/50 rounded-xl px-3 py-2.5 text-white text-sm mt-1 focus:border-red-500 focus:outline-none"
            />
          </div>
        ))}
      </div>
      <div>
        <label className="text-[10px] text-slate-500 uppercase font-semibold tracking-wide">Notes</label>
        <textarea
          value={String(form.notes ?? '')}
          onChange={(e) => update('notes', e.target.value)}
          rows={3}
          className="w-full bg-slate-800 border border-slate-700/50 rounded-xl px-3 py-2.5 text-white text-sm mt-1 focus:border-red-500 focus:outline-none resize-none"
        />
      </div>
    </div>
  );
}
