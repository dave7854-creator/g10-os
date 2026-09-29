import { useState, useEffect, useCallback } from 'react';
import { Inbox, Phone, Mail, X, Calendar, Car, Save, Search, ExternalLink, ShoppingBag, Store, Package, TrendingUp, Loader2, Send, ImageIcon, MessageSquare } from 'lucide-react';
import { Card, Badge, Button } from '@/components/ui';
import { supabase } from '@/supabaseClient';
import { toTitleCase } from '@/utils/textCase';
import { decodeVin, type NhtsaVehicle } from '@/vinDecoder';
import { MessageButton } from '@/messaging/MessageButton';
import { ModuleMessageLink } from '@/messaging/ModuleMessageLink';
import type { Screen } from '@/types';

interface PartInquiry {
  id: string;
  vin: string | null;
  year: number | null;
  make: string | null;
  model: string | null;
  trim: string | null;
  engine_size: string | null;
  drive_type: string | null;
  part_needed: string;
  part_preference: string;
  condition_preference: string;
  customer_name: string;
  phone: string;
  email: string | null;
  city: string;
  state: string;
  notes: string | null;
  status: string;
  internal_notes: string | null;
  photo_url: string | null;
  reply_message: string | null;
  reply_sent_at: string | null;
  created_at: string;
}

const STATUS_CONFIG: Record<string, { label: string; color: 'blue' | 'green' | 'amber' | 'red' | 'slate' | 'cyan' }> = {
  new: { label: 'New', color: 'blue' },
  contacted: { label: 'Contacted', color: 'amber' },
  quoted: { label: 'Quoted', color: 'cyan' },
  fulfilled: { label: 'Fulfilled', color: 'green' },
  lost: { label: 'Lost', color: 'red' },
};

const STATUS_ORDER = ['new', 'contacted', 'quoted', 'fulfilled', 'lost'];

function vehicleLabel(i: PartInquiry): string {
  if (i.vin) return `VIN: ${i.vin}`;
  if (i.year || i.make || i.model) {
    const parts = [i.year, i.make ? toTitleCase(i.make) : null, i.model ? toTitleCase(i.model) : null, i.trim ? toTitleCase(i.trim) : null].filter(Boolean);
    return parts.join(' ') || '—';
  }
  return '—';
}

function formatDate(s: string): string {
  return new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

interface PriceResult {
  source: string;
  condition: 'new' | 'used' | 'aftermarket';
  title: string;
  price: number | null;
  url: string;
  link: string;
}

function buildVehicleQuery(inquiry: PartInquiry, decoded: NhtsaVehicle | null = null): string {
  if (decoded) {
    return `${decoded.year} ${decoded.make} ${decoded.model}`;
  }
  if (inquiry.year || inquiry.make || inquiry.model) {
    return [inquiry.year, inquiry.make, inquiry.model].filter(Boolean).join(' ');
  }
  return '';
}

const SOURCE_META: Record<string, { icon: typeof Search; color: string; desc: string; fallbackUrl: (q: string) => string }> = {
  'NAPA Auto Parts': { icon: Store, color: 'text-amber-400', desc: 'New OEM & aftermarket parts', fallbackUrl: (q) => `https://www.napaonline.com/en/search?q=${encodeURIComponent(q)}` },
  'Advance Auto Parts': { icon: Store, color: 'text-red-400', desc: 'New OEM & aftermarket parts', fallbackUrl: (q) => `https://shop.advanceautoparts.com/web/SearchResults?storeId=10151&catalogId=10051&langId=-1&searchTerm=${encodeURIComponent(q)}` },
  'eBay (Used)': { icon: TrendingUp, color: 'text-emerald-400', desc: 'Used parts — asking prices', fallbackUrl: (q) => `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(q)}&LH_ItemCondition=3000` },
  'eBay (New Aftermarket)': { icon: Package, color: 'text-cyan-400', desc: 'New aftermarket listings', fallbackUrl: (q) => `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(`aftermarket ${q}`)}&LH_ItemCondition=1000` },
  'Amazon': { icon: ShoppingBag, color: 'text-orange-400', desc: 'New aftermarket parts', fallbackUrl: (q) => `https://www.amazon.com/s?k=${encodeURIComponent(q)}&i=automotive` },
};

const SOURCE_ORDER = ['NAPA Auto Parts', 'Advance Auto Parts', 'eBay (Used)', 'eBay (New Aftermarket)', 'Amazon'];

function formatPrice(price: number | null): string {
  if (price === null) return 'Price unavailable';
  return `${price.toFixed(2)}`;
}

function formatRange(prices: number[]): string {
  if (prices.length === 0) return 'Price unavailable';
  if (prices.length === 1) return `${prices[0].toFixed(2)}`;
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  if (min === max) return `${min.toFixed(2)}`;
  return `${min.toFixed(2)} \u2013 ${max.toFixed(2)}`;
}

function PartsSourcing({ inquiry, decoded, decoding }: { inquiry: PartInquiry; decoded: NhtsaVehicle | null; decoding: boolean }) {
  const vehicleLabelStr = decoded
    ? `${decoded.year} ${decoded.make} ${decoded.model}${decoded.trim ? ' ' + decoded.trim : ''}`
    : buildVehicleQuery(inquiry);
  const vehicleQ = buildVehicleQuery(inquiry, decoded);

  const [priceResults, setPriceResults] = useState<PriceResult[]>([]);
  const [priceLoading, setPriceLoading] = useState(false);
  const [priceError, setPriceError] = useState<string | null>(null);
  const [fetchedKey, setFetchedKey] = useState('');

  const searchKey = `${vehicleQ}|${inquiry.part_needed}`;

  useEffect(() => {
    if (!inquiry.part_needed || !vehicleQ || searchKey === fetchedKey) return;
    setPriceLoading(true);
    setPriceError(null);

    const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/source-parts`;
    fetch(apiUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ part: inquiry.part_needed, vehicle: vehicleQ, vin: inquiry.vin ?? undefined }),
    })
      .then(async (resp) => {
        if (!resp.ok) throw new Error(`Search failed (${resp.status})`);
        const data = await resp.json();
        if (data.error) throw new Error(data.error);
        setPriceResults((data.results ?? []) as PriceResult[]);
        setFetchedKey(searchKey);
      })
      .catch((err: Error) => setPriceError(err.message))
      .finally(() => setPriceLoading(false));
  }, [searchKey, fetchedKey, inquiry.part_needed, inquiry.vin, vehicleQ]);

  const grouped = priceResults.reduce<Record<string, PriceResult[]>>((acc, r) => {
    if (!acc[r.source]) acc[r.source] = [];
    acc[r.source].push(r);
    return acc;
  }, {});

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Search size={14} className="text-slate-400" />
        <p className="text-[10px] text-slate-500 uppercase font-semibold tracking-wide">Parts Sourcing &amp; Pricing</p>
      </div>

      {decoding && (
        <div className="flex items-center gap-2 p-3 bg-slate-800/40 rounded-xl">
          <Loader2 size={14} className="text-red-400 animate-spin" />
          <p className="text-xs text-slate-400">Decoding VIN to find exact vehicle...</p>
        </div>
      )}

      {decoded && (
        <div className="p-2.5 bg-red-500/10 border border-red-500/20 rounded-xl">
          <p className="text-[10px] text-red-400 uppercase font-semibold">Matched Vehicle</p>
          <p className="text-xs text-blue-200 font-medium mt-0.5">{vehicleLabelStr}</p>
          {decoded.engine && decoded.engine !== 'N/A' && (
            <p className="text-[11px] text-slate-400 mt-0.5">Engine: {decoded.engine}</p>
          )}
        </div>
      )}

      <div className="p-2.5 bg-slate-800/40 rounded-xl">
        <p className="text-[11px] text-slate-500">Search query</p>
        <p className="text-xs text-slate-300 font-medium mt-0.5 break-words">
          {vehicleLabelStr} {inquiry.part_needed}
        </p>
      </div>

      {priceLoading && (
        <div className="flex items-center gap-2 p-3 bg-slate-800/40 rounded-xl">
          <Loader2 size={14} className="text-red-400 animate-spin" />
          <p className="text-xs text-slate-400">Searching parts suppliers for pricing...</p>
        </div>
      )}

      {priceError && (
        <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-xl">
          <p className="text-xs text-red-300">Could not fetch prices: {priceError}. Links still available below.</p>
        </div>
      )}

      {!priceLoading && (
        <div className="space-y-3">
          {SOURCE_ORDER.map((sourceName) => {
            const meta = SOURCE_META[sourceName];
            const Icon = meta.icon;
            const items = grouped[sourceName] ?? [];
            const prices = items.map((i) => i.price).filter((p): p is number => p !== null);
            const searchQuery = `${vehicleQ} ${inquiry.part_needed}`;
            const linkUrl = items.length > 0 ? items[0].link : meta.fallbackUrl(searchQuery);

            return (
              <a
                key={sourceName}
                href={linkUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 p-3 rounded-xl border bg-slate-800/40 border-slate-700/50 hover:bg-slate-800/70 transition-all active:scale-[0.98]"
              >
                <div className="w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center flex-shrink-0">
                  <Icon size={18} className={meta.color} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-white">{sourceName}</p>
                  <p className="text-[10px] text-slate-500">{meta.desc}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className={`text-sm font-bold ${prices.length > 0 ? meta.color : 'text-slate-600'}`}>
                    {formatRange(prices)}
                  </span>
                  <ExternalLink size={14} className="text-slate-600" />
                </div>
              </a>
            );
          })}
        </div>
      )}

      {inquiry.part_preference && inquiry.part_preference !== 'either' && (
        <div className="flex items-center gap-2 p-2.5 bg-slate-800/40 rounded-xl">
          <p className="text-[11px] text-slate-500">Customer preference:</p>
          <Badge color="cyan">{inquiry.part_preference}</Badge>
          {inquiry.condition_preference !== 'either' && (
            <Badge color="amber">{inquiry.condition_preference}</Badge>
          )}
        </div>
      )}
    </div>
  );
}

export function InquiriesScreen({ onNavigate, onInquiriesChanged }: { onNavigate: (s: Screen) => void; onInquiriesChanged?: () => void }) {
  void onNavigate;
  const [inquiries, setInquiries] = useState<PartInquiry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selected, setSelected] = useState<PartInquiry | null>(null);
  const [editStatus, setEditStatus] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [decodedVin, setDecodedVin] = useState<NhtsaVehicle | null>(null);
  const [decodingVin, setDecodingVin] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [sendingReply, setSendingReply] = useState(false);

  const fetchInquiries = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('part_inquiries')
      .select('*')
      .order('created_at', { ascending: false });
    if (err) {
      setError(err.message);
    } else {
      setInquiries((data ?? []) as PartInquiry[]);
      onInquiriesChanged?.();
    }
    setLoading(false);
  }, [onInquiriesChanged]);

  useEffect(() => {
    fetchInquiries();
  }, [fetchInquiries]);

  const filtered = (statusFilter === 'all'
    ? inquiries
    : inquiries.filter((i) => i.status === statusFilter)
  ).sort((a, b) => {
    const ai = STATUS_ORDER.indexOf(a.status);
    const bi = STATUS_ORDER.indexOf(b.status);
    if (ai !== bi) return ai - bi;
    return b.created_at.localeCompare(a.created_at);
  });

  const newCount = inquiries.filter((i) => i.status === 'new').length;

  const openDetail = async (i: PartInquiry) => {
    setSelected(i);
    setEditStatus(i.status);
    setEditNotes(i.internal_notes ?? '');
    setReplyText(i.reply_message ?? '');
    setDecodedVin(null);
    setDecodingVin(false);

    if (i.vin && i.vin.length === 17) {
      setDecodingVin(true);
      try {
        const decoded = await decodeVin(i.vin);
        setDecodedVin(decoded);
      } catch {
        setDecodedVin(null);
      } finally {
        setDecodingVin(false);
      }
    }

    if (i.status === 'new') {
      const { error: err } = await supabase
        .from('part_inquiries')
        .update({ status: 'contacted' })
        .eq('id', i.id);
      if (!err) {
        setEditStatus('contacted');
        setInquiries((prev) => prev.map((x) => x.id === i.id ? { ...x, status: 'contacted' } : x));
        onInquiriesChanged?.();
      }
    }
  };

  const saveDetail = async () => {
    if (!selected) return;
    setSaving(true);
    const updateData: Record<string, string | null> = {
      status: editStatus,
      internal_notes: editNotes,
      reply_message: replyText.trim() || null,
    };
    if (replyText.trim() && !selected.reply_message) {
      updateData.reply_sent_at = new Date().toISOString();
    }
    const { error: err } = await supabase
      .from('part_inquiries')
      .update(updateData)
      .eq('id', selected.id);
    setSaving(false);
    if (err) {
      setError(err.message);
      return;
    }
    setSelected(null);
    fetchInquiries();
  };

  if (loading) {
    return (
      <div className="px-4 pt-14 pb-nav-safe lg:px-8 lg:pt-8 flex flex-col items-center justify-center min-h-[60vh]">
        <div className="w-12 h-12 border-4 border-red-500/30 border-t-red-500 rounded-full animate-spin" />
        <p className="text-slate-400 text-sm mt-4">Loading inquiries...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="px-4 pt-14 pb-nav-safe lg:px-8 lg:pt-8">
        <h1 className="text-2xl font-bold text-white">Part Inquiries</h1>
        <p className="text-red-400 text-sm mt-2">{error}</p>
        <Button className="mt-4" onClick={fetchInquiries}>Retry</Button>
      </div>
    );
  }

  return (
    <div className="px-4 pt-14 pb-nav-safe lg:px-8 lg:pt-8 space-y-5 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-white">Part Inquiries</h1>
        <p className="text-slate-400 text-sm mt-0.5">Customer lead pipeline</p>
      </div>

      <ModuleMessageLink module="parts" onNavigate={onNavigate} />

      {newCount > 0 && (
        <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-xl">
          <div className="w-2.5 h-2.5 rounded-full bg-red-400 animate-pulse" />
          <p className="text-sm text-red-300 font-medium">{newCount} new {newCount === 1 ? 'inquiry' : 'inquiries'} awaiting response</p>
        </div>
      )}

      <div className="flex gap-2 overflow-x-auto scrollbar-hide -mx-4 px-4">
        <button
          onClick={() => setStatusFilter('all')}
          className={`flex-shrink-0 px-4 py-2 rounded-full text-xs font-semibold transition-all ${
            statusFilter === 'all' ? 'bg-red-600 text-white' : 'bg-slate-800/60 text-slate-400 border border-slate-700/50'
          }`}
        >
          All ({inquiries.length})
        </button>
        {STATUS_ORDER.map((s) => {
          const count = inquiries.filter((i) => i.status === s).length;
          const cfg = STATUS_CONFIG[s] ?? { label: s, color: 'slate' as const };
          return (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`flex-shrink-0 px-4 py-2 rounded-full text-xs font-semibold transition-all ${
                statusFilter === s ? 'bg-red-600 text-white' : 'bg-slate-800/60 text-slate-400 border border-slate-700/50'
              }`}
            >
              {cfg.label} ({count})
            </button>
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center text-center py-16">
          <Inbox size={48} className="text-slate-700" strokeWidth={1.5} />
          <p className="text-slate-500 text-sm mt-3">No inquiries yet</p>
          <p className="text-slate-600 text-xs mt-1">Submissions from the Find a Part form will appear here.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((i) => {
            const cfg = STATUS_CONFIG[i.status] ?? { label: i.status, color: 'slate' as const };
            return (
              <Card key={i.id} onClick={() => openDetail(i)} className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-white truncate">{toTitleCase(i.part_needed)}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{toTitleCase(i.customer_name)} · {toTitleCase(i.city)}, {i.state.toUpperCase()}</p>
                  </div>
                  <Badge color={cfg.color}>{cfg.label}</Badge>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1 text-slate-500">
                    <Car size={12} /> {vehicleLabel(i)}
                  </span>
                  <span className="flex items-center gap-1 text-slate-600">
                    <Calendar size={12} /> {formatDate(i.created_at)}
                  </span>
                </div>
                {i.condition_preference && i.condition_preference !== 'either' && (
                  <div className="mt-2">
                    <span className="text-[10px] text-slate-600 uppercase font-semibold">{i.condition_preference}</span>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {selected && (
        <InquiryDetailModal
          inquiry={selected}
          editStatus={editStatus}
          editNotes={editNotes}
          replyText={replyText}
          sendingReply={sendingReply}
          onStatusChange={setEditStatus}
          onNotesChange={setEditNotes}
          onReplyChange={setReplyText}
          onClose={() => setSelected(null)}
          onSave={saveDetail}
          saving={saving}
          decodedVin={decodedVin}
          decodingVin={decodingVin}
        />
      )}
    </div>
  );
}

function InquiryDetailModal({
  inquiry, editStatus, editNotes, replyText, sendingReply, onStatusChange, onNotesChange, onReplyChange, onClose, onSave, saving, decodedVin, decodingVin,
}: {
  inquiry: PartInquiry;
  editStatus: string;
  editNotes: string;
  replyText: string;
  sendingReply: boolean;
  onStatusChange: (s: string) => void;
  onNotesChange: (s: string) => void;
  onReplyChange: (s: string) => void;
  onClose: () => void;
  onSave: () => void;
  saving: boolean;
  decodedVin: NhtsaVehicle | null;
  decodingVin: boolean;
}) {
  const details = [
    { label: 'Date', value: formatDate(inquiry.created_at) },
    { label: 'Part Needed', value: toTitleCase(inquiry.part_needed) },
    { label: 'Vehicle', value: vehicleLabel(inquiry) },
    ...(inquiry.trim ? [{ label: 'Trim', value: toTitleCase(inquiry.trim) }] : []),
    ...(inquiry.engine_size ? [{ label: 'Engine', value: toTitleCase(inquiry.engine_size) }] : []),
    ...(inquiry.drive_type ? [{ label: 'Drive', value: toTitleCase(inquiry.drive_type) }] : []),
    { label: 'Part Type', value: inquiry.part_preference },
    { label: 'Condition', value: inquiry.condition_preference },
    { label: 'Customer', value: toTitleCase(inquiry.customer_name) },
    { label: 'Phone', value: inquiry.phone },
    { label: 'Email', value: inquiry.email || '—' },
    { label: 'Location', value: `${toTitleCase(inquiry.city)}, ${inquiry.state.toUpperCase()}` },
    { label: 'Customer Notes', value: inquiry.notes || '—' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center lg:items-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in" />
      <div
        className="relative w-full max-w-md lg:max-w-2xl bg-slate-900 rounded-t-3xl lg:rounded-2xl border-t lg:border border-slate-700/50 max-h-[85vh] flex flex-col animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-slate-900/95 backdrop-blur-xl px-4 pt-4 pb-3 border-b border-slate-800 flex items-center justify-between z-10 flex-shrink-0">
          <h2 className="text-lg font-bold text-white">Inquiry Details</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center">
            <X size={18} className="text-slate-400" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-hide p-4 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-red-500/15 flex items-center justify-center">
              <Inbox size={24} className="text-red-400" />
            </div>
            <div>
              <Badge color={STATUS_CONFIG[inquiry.status]?.color ?? 'slate'}>
                {STATUS_CONFIG[inquiry.status]?.label ?? inquiry.status}
              </Badge>
              <p className="text-xs text-slate-500 mt-1">{formatDate(inquiry.created_at)}</p>
            </div>
          </div>

          <div className="space-y-0.5">
            {details.map((d) => (
              <div key={d.label} className="flex items-start justify-between py-2.5 border-b border-slate-800/60 gap-3">
                <span className="text-sm text-slate-500 flex-shrink-0">{d.label}</span>
                <span className="text-sm text-white font-medium text-right break-words">{d.value}</span>
              </div>
            ))}
          </div>

          {inquiry.phone && (
            <a href={`tel:${inquiry.phone}`} className="flex items-center justify-center gap-2 py-3 bg-slate-800 rounded-xl text-sm font-semibold text-white active:scale-[0.98] transition-transform">
              <Phone size={16} className="text-red-400" /> Call {inquiry.phone}
            </a>
          )}
          {inquiry.phone && (
            <MessageButton
              module="parts"
              contactName={toTitleCase(inquiry.customer_name)}
              contactPhone={inquiry.phone}
              contactEmail={inquiry.email}
              recordId={inquiry.id}
              recordType="inquiry"
              recordLabel={inquiry.part_needed}
              vehicleLabel={inquiry.year ? `${inquiry.year} ${inquiry.make ?? ''} ${inquiry.model ?? ''}`.trim() : undefined}
            />
          )}
          {inquiry.email && (
            <a href={`mailto:${inquiry.email}`} className="flex items-center justify-center gap-2 py-3 bg-slate-800 rounded-xl text-sm font-semibold text-white active:scale-[0.98] transition-transform">
              <Mail size={16} className="text-red-400" /> Email {inquiry.email}
            </a>
          )}

          {inquiry.photo_url && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <ImageIcon size={14} className="text-slate-400" />
                <p className="text-[10px] text-slate-500 uppercase font-semibold tracking-wide">Part Photo</p>
              </div>
              <a href={inquiry.photo_url} target="_blank" rel="noopener noreferrer">
                <img src={inquiry.photo_url} alt="Part photo" className="w-full rounded-xl border border-slate-700/50" />
              </a>
            </div>
          )}

          <PartsSourcing inquiry={inquiry} decoded={decodedVin} decoding={decodingVin} />

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <MessageSquare size={14} className="text-slate-400" />
              <p className="text-[10px] text-slate-500 uppercase font-semibold tracking-wide">Reply to Customer</p>
            </div>
            <textarea
              value={replyText}
              onChange={(e) => onReplyChange(e.target.value)}
              placeholder="Type your response to the customer (e.g. part availability, price, shipping info)..."
              className="w-full bg-slate-800/60 border border-slate-700/50 rounded-xl p-3 text-sm text-white placeholder-slate-600 resize-vertical min-h-[100px] outline-none focus:border-red-500"
            />
            {inquiry.reply_sent_at && (
              <p className="text-[10px] text-emerald-400">Reply sent on {formatDate(inquiry.reply_sent_at)}</p>
            )}
            <div className="flex gap-2">
              {inquiry.phone && (
                <a
                  href={`sms:${inquiry.phone}?body=${encodeURIComponent(replyText)}`}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-slate-800 rounded-xl text-xs font-semibold text-white active:scale-[0.98] transition-transform"
                >
                  <Send size={14} className="text-red-400" /> SMS
                </a>
              )}
              {inquiry.email && (
                <a
                  href={`mailto:${inquiry.email}?subject=${encodeURIComponent(`Re: Your part inquiry — ${inquiry.part_needed}`)}&body=${encodeURIComponent(replyText)}`}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-slate-800 rounded-xl text-xs font-semibold text-white active:scale-[0.98] transition-transform"
                >
                  <Mail size={14} className="text-red-400" /> Email
                </a>
              )}
            </div>
            <p className="text-[10px] text-slate-600">Tap SMS or Email to send your reply. The message saves with your inquiry when you tap Save Changes.</p>
          </div>

          <div>
            <label className="text-sm font-semibold text-white block mb-2">Status</label>
            <div className="flex gap-2 flex-wrap">
              {STATUS_ORDER.map((s) => {
                const cfg = STATUS_CONFIG[s] ?? { label: s, color: 'slate' as const };
                return (
                  <button
                    key={s}
                    onClick={() => onStatusChange(s)}
                    className={`px-3 py-2 rounded-xl text-xs font-semibold border transition-all ${
                      editStatus === s
                        ? 'bg-red-600 text-white border-red-500'
                        : 'bg-slate-800/60 text-slate-400 border-slate-700/50'
                    }`}
                  >
                    {cfg.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="text-sm font-semibold text-white block mb-2">Internal Notes</label>
            <textarea
              value={editNotes}
              onChange={(e) => onNotesChange(e.target.value)}
              placeholder="Add internal notes (not visible to customer)..."
              className="w-full bg-slate-800/60 border border-slate-700/50 rounded-xl p-3 text-sm text-white placeholder-slate-600 resize-vertical min-h-[80px] outline-none focus:border-red-500"
            />
          </div>
        </div>

        <div className="sticky bottom-0 bg-slate-900/95 backdrop-blur-xl px-4 py-3 border-t border-slate-800 flex-shrink-0">
          <Button onClick={onSave} size="lg" className="w-full" disabled={saving} icon={<Save size={20} />}>
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </div>
    </div>
  );
}
