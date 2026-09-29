import { useState, useMemo, useCallback, useEffect } from 'react';
import {
  ChevronLeft, Camera, Upload, Trash2, Search, Loader2, CheckCircle2,
  XCircle, AlertTriangle, Store, Save, ArrowRight, ArrowLeft,
  Package, DollarSign, RefreshCw, X, Truck, PackageCheck,
  Image as ImageIcon, Check, Edit3, Tag,
} from 'lucide-react';
import { Card, Badge, Button, formatCurrency } from '@/components/ui';
import { supabase } from '@/supabaseClient';
import { vehicleLabelString } from '@/data';
import type { Screen, DismantlePart, VehicleStore, Vehicle, EbayPartStatus, PartDetails } from '@/types';

const EBAY_API_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ebay-api`;
const PHOTOS_BUCKET = 'part-photos';

type Step = 'identify' | 'manual' | 'verify' | 'listing' | 'sku' | 'price' | 'shipping' | 'photos' | 'ready';
const STEP_ORDER: Step[] = ['identify', 'manual', 'verify', 'listing', 'sku', 'price', 'shipping', 'photos', 'ready'];

interface CompResult {
  title: string;
  price: number;
  condition: string;
  source: string;
  matchConfidence: 'high' | 'medium' | 'low';
  isOem: boolean;
  isNew: boolean;
  isSold: boolean;
  shipping?: number;
  photoUrl?: string;
  soldDate?: string;
  partNumber?: string;
}

interface EbayDefaults {
  shippingType: 'buyer_pays' | 'free';
  handlingDays: number;
  shipToLocation: string;
}

export function PrepareForListing({ onNavigate, store, isManager }: { onNavigate: (s: Screen) => void; store: VehicleStore; isManager: boolean }) {
  const [step, setStep] = useState<Step>('identify');
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [oemPartNumber, setOemPartNumber] = useState('');
  const [manufacturerPartNumber, setManufacturerPartNumber] = useState('');
  const [interchangeNumber, setInterchangeNumber] = useState('');
  const [aiSuggestion, setAiSuggestion] = useState<{ oem?: string; mpn?: string } | null>(null);
  const [aiVerified, setAiVerified] = useState<Record<string, 'confirmed' | 'rejected'>>({});
  const [lookingUp, setLookingUp] = useState(false);
  const [comps, setComps] = useState<CompResult[]>([]);
  const [compsLoading, setCompsLoading] = useState(false);
  const [compsSearched, setCompsSearched] = useState(false);
  const [price, setPrice] = useState('');
  const [editingPrice, setEditingPrice] = useState(false);
  const [shippingType, setShippingType] = useState<'buyer_pays' | 'free'>('buyer_pays');
  const [handlingDays] = useState(3);
  const [shipToLocation] = useState('US');
  const [suggestedTitle, setSuggestedTitle] = useState('');
  const [creating, setCreating] = useState(false);
  const [createdListingId, setCreatedListingId] = useState<string | null>(null);
  const [error, setError] = useState('');

  // Custom SKU state
  const [customSku, setCustomSku] = useState('');
  const [skuConfirmed, setSkuConfirmed] = useState(false);
  const [skuChecking, setSkuChecking] = useState(false);
  const [skuDuplicate, setSkuDuplicate] = useState(false);
  const [skuSaved, setSkuSaved] = useState(false);

  const part = useMemo<DismantlePart | null>(() => {
    // Primary lookup: exact selected part ID
    if (store.selectedPartId) {
      const exact = store.parts.find((p) => p.id === store.selectedPartId) ?? null;
      if (exact) return exact;
    }
    // Fallback: if no selectedPartId, try by vehicle (legacy path)
    if (!store.selectedVehicleId) return null;
    return store.parts.find((p) => p.vehicleId === store.selectedVehicleId && p.id.startsWith(store.selectedVehicleId!))
      ?? store.parts.find((p) => p.vehicleId === store.selectedVehicleId)
      ?? null;
  }, [store.parts, store.selectedPartId, store.selectedVehicleId]);

  // Identity guard: verify the loaded part ID matches the selected part ID
  const selectedPartId = store.selectedPartId;

  const vehicle = useMemo<Vehicle | null>(() => {
    if (!part) return null;
    return store.vehicles.find((v) => v.id === part.vehicleId) ?? null;
  }, [part, store.vehicles]);

  // Reset all form state when the selected part changes
  useEffect(() => {
    setStep('identify');
    setPhotoUrls([]);
    setOemPartNumber('');
    setManufacturerPartNumber('');
    setInterchangeNumber('');
    setAiSuggestion(null);
    setAiVerified({});
    setComps([]);
    setCompsSearched(false);
    setPrice('');
    setSuggestedTitle('');
    setError('');
    setCreatedListingId(null);
    setCustomSku('');
    setSkuConfirmed(false);
    setSkuDuplicate(false);
    setSkuSaved(false);
  }, [selectedPartId]);

  // Load existing part details + ebay defaults into form state
  // Only load when the part ID matches the selected part ID to prevent stale data
  useEffect(() => {
    if (part && (!selectedPartId || part.id === selectedPartId)) {
      setPhotoUrls(part.photoUrls ?? []);
      setOemPartNumber(part.oemPartNumber ?? '');
      setManufacturerPartNumber(part.manufacturerPartNumber ?? '');
      setInterchangeNumber(part.interchangeNumber ?? '');
      setPrice(String(part.recommendedPrice ?? ''));
      setCustomSku(part.sku ?? '');
      setSkuConfirmed(!!part.sku);
      setSkuSaved(!!part.sku);
    }
  }, [part?.id, selectedPartId]);

  // Load eBay defaults from config
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('ebay_config')
        .select('default_shipping_type, default_handling_days, default_ship_to_location')
        .eq('id', 1)
        .maybeSingle();
      if (data) {
        setShippingType(data.default_shipping_type === 'free' ? 'free' : 'buyer_pays');
      }
    })();
  }, []);

  // Set eBay status to "preparing" on mount — only for the exact selected part
  useEffect(() => {
    if (part && part.id === (selectedPartId ?? part.id) && part.ebayStatus === 'not_prepared') {
      store.updatePartEbayStatus(part.id, part.vehicleId, 'preparing');
    }
  }, [part?.id, selectedPartId]);

  // Auto-lookup part number on mount — only for the exact selected part
  useEffect(() => {
    if (part && part.id === (selectedPartId ?? part.id) && vehicle && step === 'identify' && !aiSuggestion && !lookingUp) {
      handleLookupPart();
    }
  }, [part?.id, selectedPartId, step]);

  const fetchComps = useCallback(async (searchOverride?: string) => {
    if (!part || !vehicle) return;
    setCompsLoading(true);
    setCompsSearched(true);
    setError('');
    try {
      const searchQuery = searchOverride ?? (oemPartNumber || manufacturerPartNumber
        ? `${oemPartNumber || manufacturerPartNumber}`
        : `${vehicle.year} ${vehicle.make} ${vehicle.model} ${part.name}`);
      const resp = await fetch(`${EBAY_API_URL}/search-comps`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: searchQuery, vehicle, partName: part.name }),
      });
      if (!resp.ok) {
        setComps(generateLocalComps(part, vehicle));
        return;
      }
      const result = await resp.json();
      if (result.comps && Array.isArray(result.comps)) {
        setComps(result.comps.map((c: Record<string, unknown>) => ({
          title: String(c.title ?? ''),
          price: Number(c.price ?? 0),
          condition: String(c.condition ?? 'Used'),
          source: String(c.source ?? 'eBay'),
          matchConfidence: (c.matchConfidence as 'high' | 'medium' | 'low') ?? 'medium',
          isOem: Boolean(c.isOem ?? true),
          isNew: Boolean(c.isNew ?? false),
          isSold: Boolean(c.isSold ?? true),
          shipping: c.shipping ? Number(c.shipping) : undefined,
          photoUrl: c.photoUrl ? String(c.photoUrl) : undefined,
          soldDate: c.soldDate ? String(c.soldDate) : undefined,
          partNumber: c.partNumber ? String(c.partNumber) : undefined,
        })));
      } else {
        setComps(generateLocalComps(part, vehicle));
      }
    } catch {
      setComps(generateLocalComps(part, vehicle));
    } finally {
      setCompsLoading(false);
    }
  }, [part, vehicle, oemPartNumber, manufacturerPartNumber, selectedPartId]);

  const handleLookupPart = useCallback(async () => {
    if (!part || !vehicle) return;
    setLookingUp(true);
    setError('');
    try {
      // Try the suggest-parts edge function for AI part number identification
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/suggest-parts`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          partName: part.name,
          vehicle: { year: vehicle.year, make: vehicle.make, model: vehicle.model, trim: vehicle.trim, engine: vehicle.engine },
        }),
      });
      if (!resp.ok) {
        // No suggestion available — user enters manually
        return;
      }
      const result = await resp.json();
      const oem = result.oemPartNumber ?? result.partNumber ?? undefined;
      const mpn = result.manufacturerPartNumber ?? undefined;
      if (oem || mpn) {
        setAiSuggestion({ oem, mpn });
      }
    } catch {
      // Silent failure — user enters manually
    } finally {
      setLookingUp(false);
    }
  }, [part, vehicle, selectedPartId]);

  const handleUploadPhotos = useCallback(async (files: FileList) => {
    if (!part) return;
    setUploading(true);
    setError('');
    const newUrls: string[] = [];
    for (const file of Array.from(files)) {
      const ext = file.name.split('.').pop() ?? 'jpg';
      const fileName = `${part.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from(PHOTOS_BUCKET)
        .upload(fileName, file, { upsert: false });
      if (uploadError) {
        setError(`Upload failed: ${uploadError.message}`);
        continue;
      }
      const { data: urlData } = supabase.storage.from(PHOTOS_BUCKET).getPublicUrl(fileName);
      newUrls.push(urlData.publicUrl);
    }
    const updated = [...photoUrls, ...newUrls];
    setPhotoUrls(updated);
    await store.updatePartDetails(part.id, part.vehicleId, { photoUrls: updated });
    setUploading(false);
  }, [part, photoUrls, store]);

  const handleDeletePhoto = useCallback(async (index: number) => {
    if (!part) return;
    const updated = photoUrls.filter((_, i) => i !== index);
    setPhotoUrls(updated);
    await store.updatePartDetails(part.id, part.vehicleId, { photoUrls: updated });
  }, [part, photoUrls, store]);

  const generateListingInfo = useCallback(() => {
    if (!part || !vehicle) return;
    const vehicleStr = `${vehicle.year} ${vehicle.make} ${vehicle.model}`;
    const title = `${vehicleStr} ${part.name} - OEM Used${oemPartNumber ? ` ${oemPartNumber}` : ''}`.substring(0, 80);
    setSuggestedTitle(title);

    const soldOemComps = comps.filter(c => c.isOem && !c.isNew && c.isSold);
    if (soldOemComps.length > 0) {
      const avg = soldOemComps.reduce((sum, c) => sum + c.price, 0) / soldOemComps.length;
      setPrice(String(Math.round(avg)));
    }
  }, [part, vehicle, comps, oemPartNumber, selectedPartId]);

  const handleSaveAll = useCallback(async () => {
    if (!part) return;
    const details: Partial<PartDetails> = {
      oemPartNumber,
      manufacturerPartNumber,
      interchangeNumber,
      photoUrls,
    };
    if (price) details.price = Number(price);
    await store.updatePartDetails(part.id, part.vehicleId, details);
  }, [part, oemPartNumber, manufacturerPartNumber, interchangeNumber, photoUrls, price, store, selectedPartId]);

  const checkSkuDuplicate = useCallback(async (sku: string): Promise<boolean> => {
    if (!sku.trim()) return false;
    const { data } = await supabase
      .from('part_details')
      .select('part_id')
      .eq('sku', sku.trim())
      .neq('part_id', part?.id ?? '')
      .maybeSingle();
    return !!data;
  }, [part?.id]);

  const handleSkuConfirm = useCallback(async () => {
    if (!part || !customSku.trim()) return;
    setSkuChecking(true);
    setSkuDuplicate(false);
    try {
      const isDup = await checkSkuDuplicate(customSku.trim());
      if (isDup) {
        setSkuDuplicate(true);
        setSkuConfirmed(false);
        setSkuChecking(false);
        return;
      }
      await store.updatePartDetails(part.id, part.vehicleId, { sku: customSku.trim() });
      setSkuConfirmed(true);
      setSkuSaved(true);
      setSkuDuplicate(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save SKU');
    } finally {
      setSkuChecking(false);
    }
  }, [part, customSku, store, checkSkuDuplicate]);

  const handleSkuEdit = useCallback(() => {
    setSkuConfirmed(false);
    setSkuSaved(false);
  }, []);

  const handleCreateReady = useCallback(async () => {
    if (!part || !vehicle) return;
    // Identity guard: verify we're creating a listing for the exact selected part
    if (selectedPartId && part.id !== selectedPartId) {
 setError('Part identity mismatch. The selected part does not match the part being listed. Please go back and select the correct part.');
      return;
    }
    setCreating(true);
    setError('');
    try {
      await handleSaveAll();

      const title = suggestedTitle || `${vehicle.year} ${vehicle.make} ${vehicle.model} ${part.name} - OEM Used`;
      const description = `Genuine OEM ${part.name} removed from a ${vehicleLabelString(vehicle)}. VIN: ${vehicle.vin}. Mileage: ${vehicle.mileage.toLocaleString()}. Condition: ${part.condition}.${part.notes ? `\n\nNotes: ${part.notes}` : ''}`;
      const priceNum = parseFloat(price) || part.recommendedPrice;

      const itemSpecifics: Record<string, string> = {
        Brand: 'OEM',
        Placement: part.category,
      };
      if (oemPartNumber) itemSpecifics['OEM Part Number'] = oemPartNumber;
      if (manufacturerPartNumber) itemSpecifics['Manufacturer Part Number'] = manufacturerPartNumber;
      if (interchangeNumber) itemSpecifics['Interchange Part Number'] = interchangeNumber;

      const { data, error: dbError } = await supabase.from('ebay_listings').insert({
        part_id: part.id,
        vehicle_id: part.vehicleId,
        title,
        description,
        price: priceNum,
        quantity: part.stockQty || 1,
        listing_type: 'FIXED_PRICE',
        listing_duration: 'GTC',
        shipping_type: shippingType,
        shipping_cost: shippingType === 'free' ? 0 : null,
        handling_time: handlingDays,
        ship_to_location: shipToLocation,
        condition_id: '3000',
        condition_description: part.condition,
        listing_status: 'draft',
        item_specifics: itemSpecifics,
        photo_urls: photoUrls,
        sku: customSku.trim(),
      }).select('id').single();

      if (dbError) {
        setError('Failed to create: ' + dbError.message);
        setCreating(false);
        return;
      }

      await store.updatePartEbayStatus(part.id, part.vehicleId, 'ready');
      setCreatedListingId(data.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create listing');
    } finally {
      setCreating(false);
    }
  }, [part, vehicle, handleSaveAll, suggestedTitle, price, shippingType, handlingDays, shipToLocation, oemPartNumber, manufacturerPartNumber, interchangeNumber, photoUrls, customSku, store, selectedPartId]);

  const stepIndex = STEP_ORDER.indexOf(step);

  // ===== NO PART SELECTED =====
  if (!part || !vehicle) {
    return (
      <div className="px-4 pt-14 pb-nav-safe lg:px-8 lg:pt-8">
        <button onClick={() => onNavigate('inventory')} className="flex items-center gap-1 text-slate-400 text-sm mb-4">
          <ChevronLeft size={18} /> Back to Inventory
        </button>
        <div className="flex flex-col items-center text-center py-16">
          <Package size={48} className="text-slate-700" strokeWidth={1.5} />
          <p className="text-slate-500 text-sm mt-3">No part selected</p>
          <Button onClick={() => onNavigate('inventory')} className="mt-4">Go to Inventory</Button>
        </div>
      </div>
    );
  }

  // ===== SUCCESS SCREEN =====
  if (createdListingId) {
    return (
      <div className="px-4 pt-14 pb-nav-safe lg:px-8 lg:pt-8 space-y-5 animate-fade-in">
        <div className="flex flex-col items-center text-center py-12">
          <div className="w-16 h-16 rounded-full bg-emerald-500/15 flex items-center justify-center">
            <CheckCircle2 size={36} className="text-emerald-400" />
          </div>
          <h2 className="text-xl font-bold text-white mt-4">Ready for eBay!</h2>
          <p className="text-slate-400 text-sm mt-1 max-w-sm">
            "{part.name}" is saved as Ready for eBay. The owner/admin can review and publish it from the eBay tab.
          </p>
          <div className="flex gap-2 mt-6 w-full max-w-sm">
            <Button variant="secondary" className="flex-1" onClick={() => onNavigate('inventory')} icon={<ChevronLeft size={16} />}>
              Back to Inventory
            </Button>
            <Button className="flex-1" onClick={() => onNavigate('ebay')} icon={<Store size={16} />}>
              View in eBay
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 pt-14 pb-nav-safe lg:px-8 lg:pt-8 space-y-5 animate-fade-in">
      {/* Back button */}
      <button onClick={() => onNavigate('inventory')} className="flex items-center gap-1 text-slate-400 text-sm -ml-1">
        <ChevronLeft size={18} /> Back to Inventory
      </button>

      {/* Part summary card — always visible */}
      <Card className="p-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center flex-shrink-0">
            <Package size={20} className="text-amber-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-white truncate">{part.name}</p>
            <p className="text-xs text-slate-500 truncate">{vehicleLabelString(vehicle)}</p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 mt-3 text-xs">
          <div>
            <p className="text-[10px] text-slate-500 uppercase font-semibold">Part ID</p>
            <p className="text-white mt-0.5 font-mono text-[10px] truncate">{part.id.slice(-8)}</p>
          </div>
          <div>
            <p className="text-[10px] text-slate-500 uppercase font-semibold">SKU</p>
            <p className="text-white mt-0.5">{part.sku || 'Not set'}</p>
          </div>
          <div>
            <p className="text-[10px] text-slate-500 uppercase font-semibold">Pulled</p>
            <p className="text-white mt-0.5">{part.pulledStatus === 'pulled' ? 'Pulled' : 'Not Pulled'}</p>
          </div>
        </div>
      </Card>

      {/* Step indicator */}
      <StepIndicator currentStep={step} stepIndex={stepIndex} />

      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-xl">
          <AlertTriangle size={16} className="text-red-400 flex-shrink-0" />
          <p className="text-xs text-red-300 flex-1">{error}</p>
          <button onClick={() => setError('')}><X size={14} className="text-red-400/60" /></button>
        </div>
      )}

      {/* ===== STEP: IDENTIFY ===== */}
      {step === 'identify' && (
        <div className="space-y-5">
          <div className="text-center pt-2">
            <h2 className="text-xl font-bold text-white">Identify the Part</h2>
            <p className="text-sm text-slate-400 mt-1">Looking up part number for this {part.name}...</p>
          </div>

          {lookingUp ? (
            <div className="flex flex-col items-center py-12">
              <Loader2 size={32} className="text-red-400 animate-spin" />
              <p className="text-slate-400 text-sm mt-3">Searching for part number...</p>
            </div>
          ) : aiSuggestion ? (
            <div className="space-y-4">
              <Card className="p-5 bg-red-500/5 border-red-500/20 text-center">
                <p className="text-[10px] text-amber-400 font-semibold uppercase tracking-wide">Part Number Found</p>
                {aiSuggestion.oem && (
                  <p className="text-2xl font-bold text-white mt-2">{aiSuggestion.oem}</p>
                )}
                {aiSuggestion.mpn && !aiSuggestion.oem && (
                  <p className="text-2xl font-bold text-white mt-2">{aiSuggestion.mpn}</p>
                )}
                <p className="text-xs text-slate-500 mt-2">Suggested - Needs Verification</p>
              </Card>

              <div className="space-y-2">
                <Button size="lg" className="w-full" onClick={() => {
                  if (aiSuggestion.oem) setOemPartNumber(aiSuggestion.oem);
                  if (aiSuggestion.mpn) setManufacturerPartNumber(aiSuggestion.mpn);
                  setStep('verify');
                  setTimeout(() => fetchComps(), 100);
                }} icon={<CheckCircle2 size={20} />}>
                  Confirm
                </Button>
                <Button size="lg" variant="secondary" className="w-full" onClick={() => setStep('manual')} icon={<Edit3 size={20} />}>
                  Enter Manually
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <Card className="p-5 text-center">
                <p className="text-sm text-slate-400">No part number found automatically.</p>
                <p className="text-xs text-slate-500 mt-1">Enter the part number manually to continue.</p>
              </Card>
              <Button size="lg" className="w-full" onClick={() => setStep('manual')} icon={<Edit3 size={20} />}>
                Enter Part Number Manually
              </Button>
            </div>
          )}
        </div>
      )}

      {/* ===== STEP: MANUAL ENTRY ===== */}
      {step === 'manual' && (
        <div className="space-y-5">
          <div className="text-center pt-2">
            <h2 className="text-xl font-bold text-white">Enter Part Number</h2>
            <p className="text-sm text-slate-400 mt-1">Type the OEM or manufacturer part number</p>
          </div>

          <div className="space-y-3">
            <div>
              <label className="text-[10px] text-slate-500 uppercase font-semibold tracking-wide">OEM Part Number</label>
              <input
                value={oemPartNumber}
                onChange={(e) => setOemPartNumber(e.target.value)}
                placeholder="Enter OEM part number"
                className="w-full bg-slate-800 border border-slate-700/50 rounded-xl px-4 py-4 text-white text-lg text-center mt-1 focus:border-red-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="text-[10px] text-slate-500 uppercase font-semibold tracking-wide">Manufacturer Part Number (optional)</label>
              <input
                value={manufacturerPartNumber}
                onChange={(e) => setManufacturerPartNumber(e.target.value)}
                placeholder="Enter MPN"
                className="w-full bg-slate-800 border border-slate-700/50 rounded-xl px-4 py-4 text-white text-lg text-center mt-1 focus:border-red-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="flex gap-2">
            <Button variant="secondary" size="lg" onClick={() => setStep('identify')} icon={<ArrowLeft size={18} />}>Back</Button>
            <Button size="lg" className="flex-1" onClick={() => {
              setStep('verify');
              setTimeout(() => fetchComps(), 100);
            }} icon={<ArrowRight size={18} />} disabled={!oemPartNumber && !manufacturerPartNumber}>
              Search & Verify
            </Button>
          </div>
        </div>
      )}

      {/* ===== STEP: VERIFY ===== */}
      {step === 'verify' && (
        <div className="space-y-5">
          <div className="text-center pt-2">
            <h2 className="text-xl font-bold text-white">Verify the Part</h2>
            <p className="text-sm text-slate-400 mt-1">Look at the photos — is this the same part?</p>
          </div>

          {/* Part number being searched */}
          <Card className="p-3 text-center">
            <p className="text-[10px] text-slate-500 uppercase font-semibold">Searching for</p>
            <p className="text-lg font-bold text-red-400">{oemPartNumber || manufacturerPartNumber || `${vehicle.year} ${vehicle.make} ${vehicle.model} ${part.name}`}</p>
          </Card>

          {compsLoading ? (
            <div className="flex flex-col items-center py-12">
              <Loader2 size={32} className="text-red-400 animate-spin" />
              <p className="text-slate-400 text-sm mt-3">Searching sold/completed listings...</p>
            </div>
          ) : comps.length === 0 ? (
            <div className="flex flex-col items-center text-center py-12">
              <Search size={36} className="text-slate-700" strokeWidth={1.5} />
              <p className="text-slate-500 text-sm mt-3">No comparables found</p>
              <Button variant="secondary" size="sm" className="mt-4" onClick={() => { setCompsSearched(false); fetchComps(); }} icon={<RefreshCw size={14} />}>
                Search Again
              </Button>
            </div>
          ) : (
            <>
              {/* Comp listings for visual verification */}
              <div className="space-y-3">
                {comps.slice(0, 6).map((c, i) => (
                  <Card key={i} className="p-3">
                    <div className="flex gap-3">
                      {c.photoUrl ? (
                        <img src={c.photoUrl} alt={c.title} className="w-20 h-20 rounded-xl object-cover flex-shrink-0 bg-slate-800" />
                      ) : (
                        <div className="w-20 h-20 rounded-xl bg-slate-800 flex items-center justify-center flex-shrink-0">
                          <ImageIcon size={20} className="text-slate-600" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-white line-clamp-2">{c.title}</p>
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                          <Badge color={c.isOem ? 'green' : 'slate'}>{c.isOem ? 'OEM' : 'Aftermarket'}</Badge>
                          <Badge color={c.isNew ? 'blue' : 'amber'}>{c.isNew ? 'New' : 'Used'}</Badge>
                          <Badge color={c.isSold ? 'cyan' : 'slate'}>{c.isSold ? 'Sold' : 'Active'}</Badge>
                        </div>
                        <div className="flex items-center justify-between mt-2">
                          <p className="text-emerald-400 font-bold text-sm">{formatCurrency(c.price)}</p>
                          {c.soldDate && <p className="text-[10px] text-slate-500">{c.soldDate}</p>}
                        </div>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>

              <div className="space-y-2">
                <Button size="lg" className="w-full" onClick={() => {
                  generateListingInfo();
                  setStep('listing');
                }} icon={<CheckCircle2 size={20} />}>
                  Confirm Match
                </Button>
                <Button size="lg" variant="secondary" className="w-full" onClick={() => setStep('manual')} icon={<Search size={20} />}>
                  Not the Same Part / Search Again
                </Button>
              </div>
            </>
          )}

          <Button variant="ghost" size="sm" className="w-full" onClick={() => { setStep('listing'); generateListingInfo(); }}>
            Skip — No Comps Needed
          </Button>
        </div>
      )}

      {/* ===== STEP: LISTING INFO ===== */}
      {step === 'listing' && (
        <div className="space-y-5">
          <div className="text-center pt-2">
            <h2 className="text-xl font-bold text-white">Listing Information</h2>
            <p className="text-sm text-slate-400 mt-1">Review the auto-generated listing details</p>
          </div>

          <Card className="p-4 space-y-3">
            <div>
              <p className="text-[10px] text-slate-500 uppercase font-semibold">eBay Title</p>
              <p className="text-sm text-white mt-1">{suggestedTitle || `${vehicle.year} ${vehicle.make} ${vehicle.model} ${part.name} - OEM Used`}</p>
            </div>
            <div className="border-t border-slate-700/50 pt-3">
              <p className="text-[10px] text-slate-500 uppercase font-semibold">Part Number (OEM)</p>
              <p className="text-sm text-white mt-1">{oemPartNumber || 'Not set'}</p>
            </div>
            {manufacturerPartNumber && (
              <div className="border-t border-slate-700/50 pt-3">
                <p className="text-[10px] text-slate-500 uppercase font-semibold">Manufacturer Part Number</p>
                <p className="text-sm text-white mt-1">{manufacturerPartNumber}</p>
              </div>
            )}
            {interchangeNumber && (
              <div className="border-t border-slate-700/50 pt-3">
                <p className="text-[10px] text-slate-500 uppercase font-semibold">Interchange Number</p>
                <p className="text-sm text-white mt-1">{interchangeNumber}</p>
              </div>
            )}
            <div className="border-t border-slate-700/50 pt-3">
              <p className="text-[10px] text-slate-500 uppercase font-semibold">Condition</p>
              <p className="text-sm text-white mt-1">{part.condition}</p>
            </div>
          </Card>

          {/* Show comparables summary if available */}
          {comps.length > 0 && (
            <Card className="p-3">
              <p className="text-[10px] text-slate-500 uppercase font-semibold mb-2">Based on {comps.length} sold comparable{comps.length !== 1 ? 's' : ''}</p>
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <DollarSign size={14} className="text-emerald-400" />
                <span>Avg sold: {formatCurrency(Math.round(comps.filter(c => c.isSold).reduce((sum, c) => sum + c.price, 0) / Math.max(comps.filter(c => c.isSold).length, 1)))}</span>
              </div>
            </Card>
          )}

          <div className="flex gap-2">
            <Button variant="secondary" size="lg" onClick={() => setStep('verify')} icon={<ArrowLeft size={18} />}>Back</Button>
            <Button size="lg" className="flex-1" onClick={() => setStep('sku')} icon={<ArrowRight size={18} />}>
              Continue to SKU
            </Button>
          </div>
        </div>
      )}

      {/* ===== STEP: CUSTOM SKU ===== */}
      {step === 'sku' && (
        <div className="space-y-5">
          <div className="text-center pt-2">
            <h2 className="text-xl font-bold text-white">Custom SKU</h2>
            <p className="text-sm text-slate-400 mt-1">Enter a unique SKU for this part</p>
          </div>

          {skuConfirmed && skuSaved ? (
            <Card className="p-5 bg-emerald-500/5 border-emerald-500/20 text-center">
              <div className="flex items-center justify-center gap-2">
                <Tag size={20} className="text-emerald-400" />
                <p className="text-2xl font-bold text-white font-mono">{customSku}</p>
              </div>
              <p className="text-xs text-emerald-400 mt-2">SKU saved to this part</p>
              <Button variant="secondary" size="sm" className="mt-4" onClick={handleSkuEdit} icon={<Edit3 size={14} />}>
                Edit SKU
              </Button>
            </Card>
          ) : (
            <div className="space-y-3">
              <div>
                <label className="text-[10px] text-slate-500 uppercase font-semibold tracking-wide">Custom SKU</label>
                <input
                  value={customSku}
                  onChange={(e) => { setCustomSku(e.target.value); setSkuDuplicate(false); }}
                  placeholder="Enter a unique SKU"
                  className="w-full bg-slate-800 border border-slate-700/50 rounded-xl px-4 py-4 text-white text-lg text-center mt-1 font-mono focus:border-red-500 focus:outline-none"
                  autoFocus
                />
              </div>
              {skuDuplicate && (
                <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-xl">
                  <AlertTriangle size={16} className="text-red-400 flex-shrink-0" />
                  <p className="text-xs text-red-300">This SKU is already used by another part. Choose a different one.</p>
                </div>
              )}
              <Button
                size="lg"
                className="w-full"
                onClick={handleSkuConfirm}
                disabled={!customSku.trim() || skuChecking}
                icon={skuChecking ? <Loader2 size={20} className="animate-spin" /> : <CheckCircle2 size={20} />}
              >
                {skuChecking ? 'Checking...' : 'Confirm SKU'}
              </Button>
            </div>
          )}

          <div className="flex gap-2">
            <Button variant="secondary" size="lg" onClick={() => setStep('listing')} icon={<ArrowLeft size={18} />}>Back</Button>
            <Button size="lg" className="flex-1" onClick={() => setStep('price')} disabled={!skuConfirmed} icon={<ArrowRight size={18} />}>
              Continue to Price
            </Button>
          </div>
        </div>
      )}

  {/* ===== STEP: PRICE ===== */}
      {step === 'price' && (
        <div className="space-y-5">
          <div className="text-center pt-2">
            <h2 className="text-xl font-bold text-white">Set the Price</h2>
          </div>

          {!editingPrice ? (
            <Card className="p-8 text-center bg-emerald-500/5 border-emerald-500/20">
              <p className="text-[10px] text-slate-500 uppercase font-semibold">Suggested Price</p>
              <p className="text-4xl font-bold text-emerald-400 mt-2">{formatCurrency(parseFloat(price) || part.recommendedPrice)}</p>
              {comps.filter(c => c.isOem && !c.isNew && c.isSold).length > 0 && (
                <p className="text-xs text-slate-500 mt-2">
                  Based on {comps.filter(c => c.isOem && !c.isNew && c.isSold).length} sold OEM used listing{comps.filter(c => c.isOem && !c.isNew && c.isSold).length !== 1 ? 's' : ''}
                </p>
              )}
            </Card>
          ) : (
            <Card className="p-6">
              <label className="text-[10px] text-slate-500 uppercase font-semibold tracking-wide">Enter Price</label>
              <div className="flex items-center gap-2 mt-2">
                <span className="text-2xl font-bold text-slate-400">$</span>
                <input
                  type="number"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  className="flex-1 bg-slate-800 border border-slate-700/50 rounded-xl px-4 py-4 text-white text-2xl font-bold focus:border-red-500 focus:outline-none"
                  autoFocus
                />
              </div>
            </Card>
          )}

          <div className="space-y-2">
            {!editingPrice ? (
              <>
                <Button size="lg" className="w-full" onClick={() => setStep('shipping')} icon={<CheckCircle2 size={20} />}>
                  Confirm Price
                </Button>
                <Button size="lg" variant="secondary" className="w-full" onClick={() => setEditingPrice(true)} icon={<Edit3 size={20} />}>
                  Change Price
                </Button>
              </>
            ) : (
              <Button size="lg" className="w-full" onClick={() => { setEditingPrice(false); setStep('shipping'); }} icon={<CheckCircle2 size={20} />}>
                Save Price
              </Button>
            )}
          </div>

          <Button variant="ghost" size="sm" className="w-full" onClick={() => { setStep('sku'); }}>
            <ChevronLeft size={16} className="mr-1" /> Back
          </Button>
        </div>
      )}

      {/* ===== STEP: SHIPPING ===== */}
      {step === 'shipping' && (
        <div className="space-y-5">
          <div className="text-center pt-2">
            <h2 className="text-xl font-bold text-white">Shipping</h2>
          </div>

          <Card className="p-6 text-center">
            <div className="flex items-center justify-center gap-2 mb-3">
              <Truck size={24} className={shippingType === 'buyer_pays' ? 'text-red-400' : 'text-emerald-400'} />
              <p className="text-lg font-bold text-white">
                {shippingType === 'buyer_pays' ? 'Buyer Pays Shipping' : 'Free Shipping'}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-4">
              <div className="p-2.5 bg-slate-900/50 rounded-xl">
                <p className="text-[10px] text-slate-500 uppercase font-semibold">Handling Time</p>
                <p className="text-sm text-white mt-0.5">{handlingDays} Business Days</p>
              </div>
              <div className="p-2.5 bg-slate-900/50 rounded-xl">
                <p className="text-[10px] text-slate-500 uppercase font-semibold">Ship To</p>
                <p className="text-sm text-white mt-0.5">United States Only</p>
              </div>
            </div>
          </Card>

          <div className="space-y-2">
            <Button size="lg" className="w-full" onClick={() => setStep('photos')} icon={<CheckCircle2 size={20} />}>
              Confirm
            </Button>
            {shippingType === 'buyer_pays' && (
              <Button size="lg" variant="secondary" className="w-full" onClick={() => setShippingType('free')}>
                Change to Free Shipping
              </Button>
            )}
            {shippingType === 'free' && (
              <Button size="lg" variant="secondary" className="w-full" onClick={() => setShippingType('buyer_pays')}>
                Change to Buyer Pays Shipping
              </Button>
            )}
          </div>

          <Button variant="ghost" size="sm" className="w-full" onClick={() => setStep('price')}>
            <ChevronLeft size={16} className="mr-1" /> Back
          </Button>
        </div>
      )}

      {/* ===== STEP: PHOTOS ===== */}
      {step === 'photos' && (
        <div className="space-y-5">
          <div className="text-center pt-2">
            <h2 className="text-xl font-bold text-white">Photos</h2>
            <p className="text-sm text-slate-400 mt-1">Take or upload photos of the actual part</p>
          </div>

          {photoUrls.length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              {photoUrls.map((url, i) => (
                <div key={i} className="relative group aspect-square rounded-xl overflow-hidden bg-slate-800">
                  <img src={url} alt={`Part photo ${i + 1}`} className="w-full h-full object-cover" />
                  <button
                    onClick={() => handleDeletePhoto(i)}
                    className="absolute top-1 right-1 w-7 h-7 rounded-full bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Trash2 size={14} className="text-white" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col items-center justify-center gap-2 py-8 rounded-xl bg-slate-800/60 border border-slate-700/50 border-dashed cursor-pointer hover:border-red-500 transition-colors">
              {uploading ? (
                <Loader2 size={28} className="text-red-400 animate-spin" />
              ) : (
                <Camera size={28} className="text-slate-400" />
              )}
              <span className="text-sm text-slate-400 font-semibold">{uploading ? 'Uploading...' : 'Take Photo'}</span>
              <input type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={(e) => e.target.files && handleUploadPhotos(e.target.files)} />
            </label>
            <label className="flex flex-col items-center justify-center gap-2 py-8 rounded-xl bg-slate-800/60 border border-slate-700/50 border-dashed cursor-pointer hover:border-red-500 transition-colors">
              <Upload size={28} className="text-slate-400" />
              <span className="text-sm text-slate-400 font-semibold">Upload Photos</span>
              <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => e.target.files && handleUploadPhotos(e.target.files)} />
            </label>
          </div>

          <div className="flex gap-2">
            <Button variant="secondary" size="lg" onClick={() => setStep('shipping')} icon={<ArrowLeft size={18} />}>Back</Button>
            <Button size="lg" className="flex-1" onClick={() => setStep('ready')} icon={<ArrowRight size={18} />}>
              {photoUrls.length > 0 ? 'Continue' : 'Skip for Now'}
            </Button>
          </div>
        </div>
      )}

      {/* ===== STEP: READY ===== */}
      {step === 'ready' && (
        <div className="space-y-5">
          <div className="text-center pt-2">
            <h2 className="text-xl font-bold text-white">Ready for eBay</h2>
            <p className="text-sm text-slate-400 mt-1">Review the summary and save as ready</p>
          </div>

          <Card className="p-4 space-y-3">
            <ReviewRow label="Part" value={part.name} />
            <ReviewRow label="Vehicle" value={vehicleLabelString(vehicle)} />
            <ReviewRow label="Title" value={suggestedTitle || `${vehicle.year} ${vehicle.make} ${vehicle.model} ${part.name} - OEM Used`} />
            {oemPartNumber && <ReviewRow label="OEM Number" value={oemPartNumber} verified={aiVerified.oem === 'confirmed'} needsVerify={!!aiSuggestion?.oem && aiVerified.oem !== 'confirmed'} />}
            {manufacturerPartNumber && <ReviewRow label="MPN" value={manufacturerPartNumber} verified={aiVerified.mpn === 'confirmed'} needsVerify={!!aiSuggestion?.mpn && aiVerified.mpn !== 'confirmed'} />}
            <ReviewRow label="Price" value={formatCurrency(parseFloat(price) || part.recommendedPrice)} />
            <ReviewRow label="Shipping" value={shippingType === 'buyer_pays' ? 'Buyer Pays' : 'Free Shipping'} />
            <ReviewRow label="Handling" value={`${handlingDays} Business Days`} />
            <ReviewRow label="Ship To" value="United States Only" />
            <ReviewRow label="Photos" value={`${photoUrls.length} photo(s)`} />
            <ReviewRow label="Condition" value={part.condition} />
            <ReviewRow label="SKU" value={customSku || 'Not set'} verified={skuConfirmed} />
          </Card>

          {((aiSuggestion?.oem && aiVerified.oem !== 'confirmed') || (aiSuggestion?.mpn && aiVerified.mpn !== 'confirmed')) && (
            <div className="flex items-center gap-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl">
              <AlertTriangle size={16} className="text-amber-400 flex-shrink-0" />
              <p className="text-xs text-amber-300">AI-suggested part numbers are not verified. Confirm them before publishing.</p>
            </div>
          )}

          <div className="flex gap-2">
            <Button variant="secondary" size="lg" onClick={() => setStep('photos')} icon={<ArrowLeft size={18} />}>Back</Button>
            <Button size="lg" className="flex-1" onClick={handleCreateReady} disabled={creating} icon={creating ? <Loader2 size={20} className="animate-spin" /> : <PackageCheck size={20} />}>
              {creating ? 'Saving...' : 'Save as Ready for eBay'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function StepIndicator({ stepIndex }: { currentStep: Step; stepIndex: number }) {
  const labels = ['Identify', 'Verify', 'Listing', 'SKU', 'Price', 'Shipping', 'Photos', 'Ready'];
  return (
    <div>
      <div className="flex items-center gap-1">
        {labels.map((_, i) => (
          <div key={i} className={`flex-1 h-1.5 rounded-full ${i <= stepIndex - 1 ? 'bg-amber-500' : 'bg-slate-700/50'}`} />
        ))}
      </div>
      <div className="flex justify-between text-[9px] text-slate-500 font-semibold uppercase tracking-wide mt-1.5">
        {labels.map((label, i) => (
          <span key={label} className={i <= stepIndex - 1 ? 'text-amber-400' : ''}>{label}</span>
        ))}
      </div>
    </div>
  );
}

function ReviewRow({ label, value, verified, needsVerify }: { label: string; value: string; verified?: boolean; needsVerify?: boolean }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-slate-500 text-xs">{label}</span>
      <div className="flex items-center gap-1.5">
        <span className="text-white font-semibold text-right">{value}</span>
        {verified && <CheckCircle2 size={14} className="text-emerald-400" />}
        {needsVerify && <AlertTriangle size={14} className="text-amber-400" />}
      </div>
    </div>
  );
}

function generateLocalComps(part: DismantlePart, vehicle: Vehicle): CompResult[] {
  const comps: CompResult[] = [];
  const basePrice = part.valuation.marketValue;

  for (const vc of part.valuation.comps) {
    comps.push({
      title: vc.title,
      price: vc.price,
      condition: vc.tier.includes('used') ? 'Used' : 'New',
      source: vc.source,
      matchConfidence: part.valuation.confidence > 60 ? 'high' : part.valuation.confidence > 40 ? 'medium' : 'low',
      isOem: !vc.tier.includes('aftermarket'),
      isNew: vc.tier.includes('new'),
      isSold: vc.tier.includes('sold'),
    });
  }

  if (comps.length === 0) {
    comps.push({
      title: `${vehicle.year} ${vehicle.make} ${vehicle.model} ${part.name} - OEM Used (estimated)`,
      price: basePrice,
      condition: 'Used',
      source: 'Estimate',
      matchConfidence: 'low',
      isOem: true,
      isNew: false,
      isSold: true,
    });
  }

  return comps;
}
