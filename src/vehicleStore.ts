import { useState, useCallback, useMemo, useEffect } from 'react';
import type { Vehicle, DismantlePart, Order, VehicleStore, VehicleStatus, OrderStatus, PartStatus, EbayPartStatus, PartDetails, PulledStatus, VehicleStatusConfig, StatusLog, WorkflowData } from './types';
import { generateDismantleParts } from './data';
import { supabase } from './supabaseClient';

interface DbVehicle {
  id: string;
  vin: string;
  year: number;
  make: string;
  model: string;
  trim: string;
  color: string;
  status: string;
  location: string;
  intake_date: string;
  estimated_value: number;
  mileage: number;
  engine: string;
  transmission: string;
  body_style: string;
  drive_type: string;
  fuel_type: string;
  plant: string;
  condition: string;
  parts_total: number;
  parts_pulled: number;
  data_source: string;
}

interface DbOrder {
  id: string;
  vehicle_id: string;
  order_number: string;
  buyer: string;
  buyer_location: string;
  part_name: string;
  sale_price: number;
  shipping_cost: number;
  status: string;
  carrier: string;
  tracking_number: string;
  order_date: string;
  tote_id: string;
}

interface DbPartStatus {
  part_id: string;
  vehicle_id: string;
  status: string;
  ebay_status?: string | null;
}

interface DbPartValuation {
  part_id: string;
  vehicle_id: string;
  adjusted_value: number | null;
  notes: string;
}

interface DbPartDetails {
  part_id: string;
  vehicle_id: string;
  part_name: string | null;
  category: string | null;
  sku: string | null;
  tote_id: string | null;
  condition: string | null;
  pulled_status: string;
  quantity: number;
  pre_buyers: string | null;
  price: number | null;
  oem_part_number: string | null;
  manufacturer_part_number: string | null;
  interchange_number: string | null;
  notes: string | null;
  side: string | null;
  color: string | null;
  weight_lbs: number | null;
  dimensions: string | null;
  photos: string[];
}

interface DbStatusConfig {
  id: string;
  name: string;
  slug: string;
  color: string;
  sort_order: number;
  is_default: boolean;
  workflow: string | null;
  is_archived: boolean;
}

interface DbStatusLog {
  id: string;
  vehicle_id: string;
  from_status: string;
  to_status: string;
  user: string;
  notes: string;
  workflow_data: WorkflowData | null;
  created_at: string;
}

function mapVehicle(v: DbVehicle): Vehicle {
  return {
    id: v.id,
    vin: v.vin,
    year: v.year,
    make: v.make,
    model: v.model,
    trim: v.trim,
    color: v.color,
    status: v.status,
    location: v.location,
    intakeDate: v.intake_date ?? '',
    estimatedValue: Number(v.estimated_value),
    mileage: v.mileage,
    engine: v.engine,
    transmission: v.transmission,
    bodyStyle: v.body_style,
    driveType: v.drive_type,
    fuelType: v.fuel_type,
    plant: v.plant,
    condition: v.condition,
    partsTotal: v.parts_total,
    partsPulled: v.parts_pulled,
    dataSource: (v.data_source === 'nhtsa' ? 'nhtsa' : 'manual') as 'nhtsa' | 'manual',
  };
}

function mapOrder(o: DbOrder): Order {
  return {
    id: o.id,
    vehicleId: o.vehicle_id,
    orderNumber: o.order_number,
    buyer: o.buyer,
    buyerLocation: o.buyer_location,
    partName: o.part_name,
    salePrice: Number(o.sale_price),
    shippingCost: Number(o.shipping_cost),
    status: o.status as OrderStatus,
    carrier: o.carrier,
    trackingNumber: o.tracking_number,
    date: o.order_date ?? '',
    toteId: o.tote_id,
  };
}

function mapStatusConfig(c: DbStatusConfig): VehicleStatusConfig {
  return {
    id: c.id,
    name: c.name,
    slug: c.slug,
    color: c.color as VehicleStatusConfig['color'],
    sortOrder: c.sort_order,
    isDefault: c.is_default,
    workflow: c.workflow as VehicleStatusConfig['workflow'],
    isArchived: c.is_archived,
  };
}

function mapStatusLog(l: DbStatusLog): StatusLog {
  return {
    id: l.id,
    vehicleId: l.vehicle_id,
    fromStatus: l.from_status,
    toStatus: l.to_status,
    user: l.user,
    notes: l.notes,
    workflowData: l.workflow_data,
    createdAt: l.created_at,
  };
}

function slugify(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'status';
}

export function useVehicleStore(): VehicleStore {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [partStatuses, setPartStatuses] = useState<Record<string, PartStatus>>({});
  const [partEbayStatuses, setPartEbayStatuses] = useState<Record<string, EbayPartStatus>>({});
  const [partValuations, setPartValuations] = useState<Record<string, { adjustedValue: number | null; notes: string }>>({});
  const [partDetailsMap, setPartDetailsMap] = useState<Record<string, PartDetails>>({});
  const [statusConfigs, setStatusConfigs] = useState<VehicleStatusConfig[]>([]);
  const [statusLogs, setStatusLogs] = useState<StatusLog[]>([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [selectedPartId, setSelectedPartId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadVehicles = useCallback(async () => {
    const { data, error } = await supabase.from('vehicles').select('*').order('created_at', { ascending: false });
    if (error) { console.error('Failed to load vehicles:', error.message); return; }
    setVehicles((data ?? []).map(mapVehicle));
  }, []);

  const loadOrders = useCallback(async () => {
    const { data, error } = await supabase.from('orders').select('*').order('created_at', { ascending: false });
    if (error) { console.error('Failed to load orders:', error.message); return; }
    setOrders((data ?? []).map(mapOrder));
  }, []);

  const loadPartValuations = useCallback(async () => {
    const { data, error } = await supabase.from('part_valuations').select('part_id, vehicle_id, adjusted_value, notes');
    if (error) { console.error('Failed to load part valuations:', error.message); return; }
    const map: Record<string, { adjustedValue: number | null; notes: string }> = {};
    for (const row of (data ?? []) as DbPartValuation[]) {
      map[row.part_id] = { adjustedValue: row.adjusted_value !== null ? Number(row.adjusted_value) : null, notes: row.notes ?? '' };
    }
    setPartValuations(map);
  }, []);

  const loadPartStatuses = useCallback(async () => {
    const { data, error } = await supabase.from('part_statuses').select('part_id, vehicle_id, status, ebay_status');
    if (error) { console.error('Failed to load part statuses:', error.message); return; }
    const statusMap: Record<string, PartStatus> = {};
    const ebayMap: Record<string, EbayPartStatus> = {};
    for (const row of (data ?? []) as DbPartStatus[]) {
      statusMap[row.part_id] = row.status as PartStatus;
      if (row.ebay_status) ebayMap[row.part_id] = row.ebay_status as EbayPartStatus;
    }
    setPartStatuses(statusMap);
    setPartEbayStatuses(ebayMap);
  }, []);

  const loadPartDetails = useCallback(async () => {
    const { data, error } = await supabase.from('part_details').select('*');
    if (error) { console.error('Failed to load part details:', error.message); return; }
    const map: Record<string, PartDetails> = {};
    for (const row of (data ?? []) as DbPartDetails[]) {
      map[row.part_id] = {
        partName: row.part_name ?? undefined,
        category: row.category ?? undefined,
        sku: row.sku ?? undefined,
        toteId: row.tote_id ?? undefined,
        condition: row.condition ?? undefined,
        pulledStatus: (row.pulled_status === 'pulled' ? 'pulled' : 'not_pulled') as PulledStatus,
        quantity: row.quantity,
        preBuyers: row.pre_buyers ?? undefined,
        price: row.price !== null ? Number(row.price) : null,
        oemPartNumber: row.oem_part_number ?? undefined,
        manufacturerPartNumber: row.manufacturer_part_number ?? undefined,
        interchangeNumber: row.interchange_number ?? undefined,
        notes: row.notes ?? undefined,
        side: row.side ?? undefined,
        color: row.color ?? undefined,
        weightLbs: row.weight_lbs !== null ? Number(row.weight_lbs) : null,
        dimensions: row.dimensions ?? undefined,
        photoUrls: row.photos ?? [],
      };
    }
    setPartDetailsMap(map);
  }, []);

  const loadStatusConfigs = useCallback(async () => {
    const { data, error } = await supabase.from('vehicle_statuses').select('*').order('sort_order', { ascending: true });
    if (error) { console.error('Failed to load status configs:', error.message); return; }
    setStatusConfigs((data ?? []).map(mapStatusConfig));
  }, []);

  const loadStatusLogs = useCallback(async () => {
    const { data, error } = await supabase.from('vehicle_status_logs').select('*').order('created_at', { ascending: false });
    if (error) { console.error('Failed to load status logs:', error.message); return; }
    setStatusLogs((data ?? []).map(mapStatusLog));
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await Promise.all([loadVehicles(), loadOrders(), loadPartStatuses(), loadPartValuations(), loadPartDetails(), loadStatusConfigs(), loadStatusLogs()]);
      } catch (err) {
        console.error('Store load failed:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [loadVehicles, loadOrders, loadPartStatuses, loadPartValuations, loadPartDetails, loadStatusConfigs, loadStatusLogs]);

  useEffect(() => {
    if (!loading && !selectedVehicleId && vehicles.length > 0) {
      const candidate = vehicles.find((v) => v.status === 'dismantling')
        ?? vehicles.find((v) => v.status === 'in-yard')
        ?? vehicles[0];
      if (candidate) setSelectedVehicleId(candidate.id);
    }
  }, [loading, selectedVehicleId, vehicles]);

  const parts = useMemo<DismantlePart[]>(() => {
    return vehicles.flatMap((v) => generateDismantleParts(v, orders, partStatuses, partValuations, partEbayStatuses, partDetailsMap));
  }, [vehicles, orders, partStatuses, partValuations, partEbayStatuses, partDetailsMap]);

  const selectedVehicle = useMemo(
    () => vehicles.find((v) => v.id === selectedVehicleId) ?? null,
    [vehicles, selectedVehicleId]
  );

  const selectVehicle = useCallback((id: string | null) => {
    setSelectedVehicleId(id);
    setSelectedPartId(null);
  }, []);

  const selectPart = useCallback((partId: string | null, vehicleId?: string | null) => {
    setSelectedPartId(partId);
    if (vehicleId !== undefined) setSelectedVehicleId(vehicleId);
  }, []);

  const addVehicle = useCallback(async (v: Vehicle) => {
    const insertData = {
      id: v.id, vin: v.vin, year: v.year, make: v.make, model: v.model, trim: v.trim,
      color: v.color, status: v.status, location: v.location, intake_date: v.intakeDate,
      estimated_value: v.estimatedValue, mileage: v.mileage, engine: v.engine,
      transmission: v.transmission, body_style: v.bodyStyle, drive_type: v.driveType,
      fuel_type: v.fuelType, plant: v.plant, condition: v.condition,
      parts_total: v.partsTotal, parts_pulled: v.partsPulled, data_source: v.dataSource,
    };
    const { data, error } = await supabase.from('vehicles').insert(insertData).select().maybeSingle();
    if (error) throw new Error(`Failed to save vehicle: ${error.message}`);
    if (data) {
      const mapped = mapVehicle(data);
      setVehicles((prev) => {
        const existing = prev.find((p) => p.id === mapped.id);
        if (existing) return prev.map((p) => (p.id === mapped.id ? mapped : p));
        return [mapped, ...prev];
      });
      setSelectedVehicleId(mapped.id);
    }
  }, []);

  const updateVehicle = useCallback(async (id: string, patch: Partial<Vehicle>) => {
    const dbPatch: Record<string, unknown> = {};
    if (patch.status !== undefined) dbPatch.status = patch.status;
    if (patch.partsPulled !== undefined) dbPatch.parts_pulled = patch.partsPulled;
    if (patch.partsTotal !== undefined) dbPatch.parts_total = patch.partsTotal;
    if (patch.estimatedValue !== undefined) dbPatch.estimated_value = patch.estimatedValue;
    if (patch.location !== undefined) dbPatch.location = patch.location;
    if (patch.condition !== undefined) dbPatch.condition = patch.condition;
    const { error } = await supabase.from('vehicles').update(dbPatch).eq('id', id);
    if (error) { console.error('Failed to update vehicle:', error.message); return; }
    setVehicles((prev) => prev.map((v) => (v.id === id ? { ...v, ...patch } : v)));
  }, []);

  const updatePartStatus = useCallback(async (partId: string, vehicleId: string, status: PartStatus) => {
    setPartStatuses((prev) => ({ ...prev, [partId]: status }));
    const { error } = await supabase.from('part_statuses').upsert({ part_id: partId, vehicle_id: vehicleId, status, updated_at: new Date().toISOString() });
    if (error) { console.error('Failed to save part status:', error.message); return; }
    setPartStatuses((prev) => {
      const removedCount = Object.entries(prev).filter(([pid, s]) => pid.startsWith(`${vehicleId}-p`) && s !== 'available').length;
      setVehicles((vs) => vs.map((v) => v.id === vehicleId ? { ...v, partsPulled: removedCount } : v));
      supabase.from('vehicles').update({ parts_pulled: removedCount }).eq('id', vehicleId)
        .then(({ error: e }) => { if (e) console.error('Failed to update partsPulled:', e.message); });
      return prev;
    });
  }, []);

  const updatePartEbayStatus = useCallback(async (partId: string, vehicleId: string, ebayStatus: EbayPartStatus) => {
    setPartEbayStatuses((prev) => ({ ...prev, [partId]: ebayStatus }));
    const { error } = await supabase.from('part_statuses').upsert({
      part_id: partId, vehicle_id: vehicleId, ebay_status: ebayStatus, updated_at: new Date().toISOString(),
    });
    if (error) { console.error('Failed to save part eBay status:', error.message); }
  }, []);

  const updatePartDetails = useCallback(async (partId: string, vehicleId: string, details: Partial<PartDetails>) => {
    setPartDetailsMap((prev) => ({
      ...prev,
      [partId]: { ...prev[partId] ?? { pulledStatus: 'not_pulled', quantity: 1, photoUrls: [] }, ...details },
    }));
    const dbData: Record<string, unknown> = {
      part_id: partId, vehicle_id: vehicleId, updated_at: new Date().toISOString(),
    };
    if (details.partName !== undefined) dbData.part_name = details.partName;
    if (details.category !== undefined) dbData.category = details.category;
    if (details.sku !== undefined) dbData.sku = details.sku;
    if (details.toteId !== undefined) dbData.tote_id = details.toteId;
    if (details.condition !== undefined) dbData.condition = details.condition;
    if (details.pulledStatus !== undefined) dbData.pulled_status = details.pulledStatus;
    if (details.quantity !== undefined) dbData.quantity = details.quantity;
    if (details.preBuyers !== undefined) dbData.pre_buyers = details.preBuyers;
    if (details.price !== undefined) dbData.price = details.price;
    if (details.oemPartNumber !== undefined) dbData.oem_part_number = details.oemPartNumber;
    if (details.manufacturerPartNumber !== undefined) dbData.manufacturer_part_number = details.manufacturerPartNumber;
    if (details.interchangeNumber !== undefined) dbData.interchange_number = details.interchangeNumber;
    if (details.notes !== undefined) dbData.notes = details.notes;
    if (details.side !== undefined) dbData.side = details.side;
    if (details.color !== undefined) dbData.color = details.color;
    if (details.weightLbs !== undefined) dbData.weight_lbs = details.weightLbs;
    if (details.dimensions !== undefined) dbData.dimensions = details.dimensions;
    if (details.photoUrls !== undefined) dbData.photos = details.photoUrls;
    const { error } = await supabase.from('part_details').upsert(dbData);
    if (error) { console.error('Failed to save part details:', error.message); }
  }, []);

  const setPartValuation = useCallback(async (partId: string, vehicleId: string, adjustedValue: number | null, notes: string) => {
    setPartValuations((prev) => ({ ...prev, [partId]: { adjustedValue, notes } }));
    const { error } = await supabase.from('part_valuations').upsert({
      part_id: partId, vehicle_id: vehicleId, adjusted_value: adjustedValue, notes, updated_at: new Date().toISOString(),
    });
    if (error) { console.error('Failed to save part valuation:', error.message); }
  }, []);

  const markOrderShipped = useCallback(async (orderId: string) => {
    const trackingNumber = 'TRK' + Math.floor(Math.random() * 10000000);
    const { error } = await supabase.from('orders').update({ status: 'shipped', tracking_number: trackingNumber }).eq('id', orderId);
    if (error) { console.error('Failed to mark order shipped:', error.message); return; }
    setOrders((prev) => prev.map((o) => o.id === orderId ? { ...o, status: 'shipped', trackingNumber } : o));
  }, []);

  const changeVehicleStatus = useCallback(async (vehicleId: string, toStatus: string, notes: string, workflowData?: WorkflowData) => {
    const vehicle = vehicles.find((v) => v.id === vehicleId);
    if (!vehicle) return;
    const fromStatus = vehicle.status;

    const { error: updateError } = await supabase.from('vehicles').update({ status: toStatus }).eq('id', vehicleId);
    if (updateError) { console.error('Failed to update vehicle status:', updateError.message); return; }

    const { error: logError } = await supabase.from('vehicle_status_logs').insert({
      vehicle_id: vehicleId,
      from_status: fromStatus,
      to_status: toStatus,
      user: 'admin',
      notes,
      workflow_data: workflowData ?? null,
    });
    if (logError) { console.error('Failed to log status change:', logError.message); }

    setVehicles((prev) => prev.map((v) => v.id === vehicleId ? { ...v, status: toStatus } : v));

    const { data: newLog } = await supabase.from('vehicle_status_logs')
      .select('*').eq('vehicle_id', vehicleId).order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (newLog) {
      setStatusLogs((prev) => [mapStatusLog(newLog as DbStatusLog), ...prev]);
    }
  }, [vehicles]);

  const addStatusConfig = useCallback(async (config: Omit<VehicleStatusConfig, 'id'>) => {
    const slug = config.slug || slugify(config.name);
    const insertData = {
      name: config.name, slug, color: config.color,
      sort_order: config.sortOrder, is_default: config.isDefault, workflow: config.workflow,
    };
    if (config.isDefault) {
      await supabase.from('vehicle_statuses').update({ is_default: false }).neq('slug', slug);
      setStatusConfigs((prev) => prev.map((c) => ({ ...c, isDefault: false })));
    }
    const { data, error } = await supabase.from('vehicle_statuses').insert(insertData).select().maybeSingle();
    if (error) { console.error('Failed to add status:', error.message); return; }
    if (data) setStatusConfigs((prev) => [...prev, mapStatusConfig(data as DbStatusConfig)]);
  }, []);

  const updateStatusConfig = useCallback(async (id: string, patch: Partial<VehicleStatusConfig>) => {
    const dbPatch: Record<string, unknown> = {};
    if (patch.name !== undefined) dbPatch.name = patch.name;
    if (patch.color !== undefined) dbPatch.color = patch.color;
    if (patch.sortOrder !== undefined) dbPatch.sort_order = patch.sortOrder;
    if (patch.isDefault !== undefined) {
      dbPatch.is_default = patch.isDefault;
      if (patch.isDefault) {
        const current = statusConfigs.find((c) => c.id === id);
        if (current) {
          await supabase.from('vehicle_statuses').update({ is_default: false }).neq('slug', current.slug);
          setStatusConfigs((prev) => prev.map((c) => c.id !== id ? { ...c, isDefault: false } : c));
        }
      }
    }
    if (patch.workflow !== undefined) dbPatch.workflow = patch.workflow;
    const { error } = await supabase.from('vehicle_statuses').update(dbPatch).eq('id', id);
    if (error) { console.error('Failed to update status:', error.message); return; }
    setStatusConfigs((prev) => prev.map((c) => c.id === id ? { ...c, ...patch } : c));
  }, [statusConfigs]);

  const deleteStatusConfig = useCallback(async (id: string) => {
    const config = statusConfigs.find((c) => c.id === id);
    if (!config) return;
    const { error } = await supabase.from('vehicle_statuses').delete().eq('id', id);
    if (error) { console.error('Failed to delete status:', error.message); return; }
    setStatusConfigs((prev) => prev.filter((c) => c.id !== id));
  }, [statusConfigs]);

  const reorderStatusConfigs = useCallback(async (ids: string[]) => {
    for (let i = 0; i < ids.length; i++) {
      await supabase.from('vehicle_statuses').update({ sort_order: i }).eq('id', ids[i]);
    }
    setStatusConfigs((prev) => {
      const map = new Map(prev.map((c) => [c.id, c]));
      return ids.map((id) => ({ ...(map.get(id) as VehicleStatusConfig), sortOrder: ids.indexOf(id) }));
    });
  }, []);

  const deleteVehicle = useCallback(async (id: string) => {
    await supabase.from('vehicle_status_logs').delete().eq('vehicle_id', id);
    await supabase.from('part_statuses').delete().eq('vehicle_id', id);
    await supabase.from('part_valuations').delete().eq('vehicle_id', id);
    await supabase.from('part_details').delete().eq('vehicle_id', id);
    await supabase.from('orders').delete().eq('vehicle_id', id);
    const { error } = await supabase.from('vehicles').delete().eq('id', id);
    if (error) { console.error('Failed to delete vehicle:', error.message); return; }
    setVehicles((prev) => prev.filter((v) => v.id !== id));
    setSelectedVehicleId((prev) => prev === id ? null : prev);
  }, []);

  const deleteAllArchivedVehicles = useCallback(async (archivedSlug: string) => {
    const archived = vehicles.filter((v) => v.status === archivedSlug);
    const ids = archived.map((v) => v.id);
    if (ids.length === 0) return;
    await supabase.from('vehicle_status_logs').delete().in('vehicle_id', ids);
    await supabase.from('part_statuses').delete().in('vehicle_id', ids);
    await supabase.from('part_valuations').delete().in('vehicle_id', ids);
    await supabase.from('part_details').delete().in('vehicle_id', ids);
    await supabase.from('orders').delete().in('vehicle_id', ids);
    const { error } = await supabase.from('vehicles').delete().in('id', ids);
    if (error) { console.error('Failed to delete archived vehicles:', error.message); return; }
    setVehicles((prev) => prev.filter((v) => v.status !== archivedSlug));
  }, [vehicles]);

  return {
    vehicles, parts, orders, statusConfigs, statusLogs,
    selectedVehicleId, selectedPartId, selectedVehicle, loading,
    selectVehicle, selectPart, addVehicle, updateVehicle, updatePartStatus, updatePartEbayStatus, updatePartDetails, setPartValuation, markOrderShipped,
    changeVehicleStatus, addStatusConfig, updateStatusConfig, deleteStatusConfig, reorderStatusConfigs,
    deleteVehicle, deleteAllArchivedVehicles,
  };
}
