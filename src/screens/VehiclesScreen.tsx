import { useState, useMemo } from 'react';
import { Search, X, Car, ChevronLeft, MapPin, Gauge, Cog, Fuel, CarFront, CircuitBoard, Factory, History, Clock, User, Archive, Trash2, RotateCcw } from 'lucide-react';
import { Card, ProgressBar, formatCurrency } from '@/components/ui';
import { StatusBadge } from '@/components/StatusBadge';
import { StatusDropdown } from '@/components/StatusDropdown';
import { WorkflowModal } from '@/components/WorkflowModal';
import { ConfirmDeleteDialog, type ConfirmDeleteState } from '@/components/ArchiveManager';
import { generateDismantleParts, vehicleLabelString } from '@/data';
import type { Screen, Vehicle, VehicleStore, Order, VehicleStatusConfig, WorkflowType, WorkflowData } from '@/types';

type ConfirmDialog = ConfirmDeleteState;

export function VehiclesScreen({ onNavigate, store }: { onNavigate: (s: Screen) => void; store: VehicleStore }) {
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [includeArchived, setIncludeArchived] = useState(false);
  const [selected, setSelected] = useState<Vehicle | null>(null);
  const [workflow, setWorkflow] = useState<{ type: WorkflowType; statusName: string; config: VehicleStatusConfig } | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialog>(null);
  const [deleting, setDeleting] = useState(false);

  const { vehicles, loading, statusConfigs } = store;

  const sortedConfigs = [...statusConfigs].sort((a, b) => a.sortOrder - b.sortOrder);
  const archivedSlug = statusConfigs.find((c) => c.isArchived)?.slug ?? 'archived';
  const defaultSlug = statusConfigs.find((c) => c.isDefault)?.slug ?? 'in-yard';
  const archivedVehicles = vehicles.filter((v) => v.status === archivedSlug);

  const filtered = useMemo(() => {
    return vehicles.filter((v) => {
      const isArchived = v.status === archivedSlug;
      if (isArchived && !includeArchived) return false;
      const q = query.toLowerCase();
      const matchesQuery = !q || `${v.year} ${v.make} ${v.model}`.toLowerCase().includes(q) || v.vin.toLowerCase().includes(q) || v.location.toLowerCase().includes(q);
      const matchesFilter = statusFilter === 'all' || v.status === statusFilter;
      return matchesQuery && matchesFilter;
    });
  }, [vehicles, query, statusFilter, includeArchived, archivedSlug]);

  if (loading) {
    return (
      <div className="px-4 pt-14 pb-nav-safe lg:px-8 lg:pt-8 flex flex-col items-center justify-center min-h-[60vh]">
        <div className="w-12 h-12 border-4 border-red-500/30 border-t-red-500 rounded-full animate-spin" />
        <p className="text-slate-400 text-sm mt-4">Loading vehicles...</p>
      </div>
    );
  }

  const filters = [{ id: 'all', label: 'All' }, ...sortedConfigs.filter((c) => !c.isArchived || includeArchived).map((c) => ({ id: c.slug, label: c.name }))];

  const handleSelect = (v: Vehicle) => {
    store.selectVehicle(v.id);
    onNavigate('dismantling');
  };

  const handleStatusSelect = (vehicle: Vehicle, statusSlug: string, config: VehicleStatusConfig) => {
    if (config.workflow) {
      setWorkflow({ type: config.workflow, statusName: config.name, config });
    } else {
      store.changeVehicleStatus(vehicle.id, statusSlug, '');
      if (vehicle.status === archivedSlug) {
        store.selectVehicle(vehicle.id);
      }
    }
  };

  const handleWorkflowConfirm = (data: WorkflowData, notes: string) => {
    if (selected && workflow) {
      store.changeVehicleStatus(selected.id, workflow.config.slug, notes, data);
      setSelected({ ...selected, status: workflow.config.slug });
    }
    setWorkflow(null);
  };

  const handleRestore = (v: Vehicle) => {
    store.changeVehicleStatus(v.id, defaultSlug, 'Restored from archive');
    store.selectVehicle(v.id);
  };

  const handleConfirmDelete = async () => {
    if (!confirmDialog) return;
    setDeleting(true);
    if (confirmDialog.type === 'delete') {
      await store.deleteVehicle(confirmDialog.id);
      if (selected && selected.id === confirmDialog.id) setSelected(null);
    } else if (confirmDialog.type === 'deleteAll') {
      await store.deleteAllArchivedVehicles(archivedSlug);
    }
    setDeleting(false);
    setConfirmDialog(null);
  };

  return (
    <div className="px-4 pt-14 pb-nav-safe lg:px-8 lg:pt-8 space-y-4 animate-fade-in">
      <button onClick={() => onNavigate('home')} className="flex items-center gap-1 text-slate-400 text-sm -ml-1 lg:hidden">
        <ChevronLeft size={18} /> Back
      </button>

      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Vehicles</h1>
          <p className="text-slate-400 text-sm mt-0.5">{vehicles.filter((v) => v.status !== archivedSlug).length} active · {archivedVehicles.length} archived</p>
        </div>
      </div>

      <div className="relative">
        <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by make, model, VIN, or location..."
          className="w-full bg-slate-800/60 border border-slate-700/50 rounded-xl pl-11 pr-10 py-3.5 text-white text-sm placeholder:text-slate-500 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/20 transition-all"
        />
        {query && (
          <button onClick={() => setQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2">
            <X size={18} className="text-slate-500" />
          </button>
        )}
      </div>

      <div className="flex items-center gap-2">
        <div className="flex gap-2 overflow-x-auto scrollbar-hide flex-1">
          {filters.map((f) => (
            <button
              key={f.id}
              onClick={() => setStatusFilter(f.id)}
              className={`flex-shrink-0 px-4 py-2 rounded-full text-xs font-semibold transition-all ${
                statusFilter === f.id ? 'bg-red-600 text-white' : 'bg-slate-800/60 text-slate-400 border border-slate-700/50'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <button
          onClick={() => setIncludeArchived(!includeArchived)}
          className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-semibold transition-all ${
            includeArchived ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : 'bg-slate-800/60 text-slate-400 border border-slate-700/50'
          }`}
        >
          <Archive size={14} />
          Archived
        </button>
      </div>

      {includeArchived && archivedVehicles.length > 0 && (
        <button
          onClick={() => setConfirmDialog({ type: 'deleteAll', count: archivedVehicles.length })}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl active:scale-[0.98] transition-transform"
        >
          <Trash2 size={14} /> Delete All Archived Vehicles ({archivedVehicles.length})
        </button>
      )}

      {filtered.length === 0 && (
        <div className="flex flex-col items-center text-center py-16">
          <Car size={48} className="text-slate-700" strokeWidth={1.5} />
          <p className="text-slate-500 text-sm mt-3">No vehicles found</p>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {filtered.map((v) => {
          const isArchived = v.status === archivedSlug;
          return (
            <Card key={v.id} className={`p-4 ${isArchived ? 'opacity-60' : ''}`}>
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1 min-w-0" onClick={() => setSelected(v)}>
                  <p className="text-white font-bold truncate">{v.year} {v.make} {v.model}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{v.location} · {v.condition}</p>
                </div>
                <StatusDropdown
                  currentStatus={v.status}
                  configs={sortedConfigs}
                  onSelect={(slug, config) => handleStatusSelect(v, slug, config)}
                />
              </div>
              {isArchived && (
                <div className="flex gap-2 mb-2">
                  <button
                    onClick={() => handleRestore(v)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-amber-500/15 text-amber-400 text-xs font-semibold active:scale-95 transition-transform"
                  >
                    <RotateCcw size={14} /> Restore to Active
                  </button>
                  <button
                    onClick={() => setConfirmDialog({ type: 'delete', id: v.id, name: vehicleLabelString(v) })}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-red-500/15 text-red-400 text-xs font-semibold active:scale-95 transition-transform"
                  >
                    <Trash2 size={14} /> Delete Permanently
                  </button>
                </div>
              )}
              <div className="flex items-center justify-between mb-1.5" onClick={() => setSelected(v)}>
                <span className="text-xs text-slate-500 font-medium">Dismantling Progress</span>
                <span className="text-xs text-slate-400 font-semibold">{v.partsPulled}/{v.partsTotal || '—'}</span>
              </div>
              <ProgressBar value={v.partsPulled} total={v.partsTotal} />
              <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-700/40" onClick={() => setSelected(v)}>
                <span className="text-xs text-slate-500 font-mono">{v.vin}</span>
                <span className="text-sm font-bold text-emerald-400">{formatCurrency(v.estimatedValue)} (est.)</span>
              </div>
            </Card>
          );
        })}
      </div>

      {selected && (
        <VehicleProfileModal
          vehicle={selected}
          orders={store.orders}
          statusConfigs={sortedConfigs}
          statusLogs={store.statusLogs.filter((l) => l.vehicleId === selected.id)}
          onClose={() => setSelected(null)}
          onSelect={() => handleSelect(selected)}
          onStatusChange={(slug, config) => handleStatusSelect(selected, slug, config)}
        />
      )}

      {workflow && (
        <WorkflowModal
          workflowType={workflow.type}
          statusName={workflow.statusName}
          onClose={() => setWorkflow(null)}
          onConfirm={handleWorkflowConfirm}
        />
      )}

      {confirmDialog && (
        <ConfirmDeleteDialog
          state={confirmDialog}
          deleting={deleting}
          itemLabel="Vehicle"
          onCancel={() => setConfirmDialog(null)}
          onConfirm={handleConfirmDelete}
        />
      )}
    </div>
  );
}

function VehicleProfileModal({
  vehicle, orders, statusConfigs, statusLogs, onClose, onSelect, onStatusChange,
}: {
  vehicle: Vehicle;
  orders: Order[];
  statusConfigs: VehicleStatusConfig[];
  statusLogs: { id: string; fromStatus: string; toStatus: string; user: string; notes: string; workflowData: WorkflowData | null; createdAt: string }[];
  onClose: () => void;
  onSelect: () => void;
  onStatusChange: (status: string, config: VehicleStatusConfig) => void;
}) {
  const parts = generateDismantleParts(vehicle, orders);
  const pulledCount = parts.filter((p) => p.status !== 'available').length;

  const specs = [
    { icon: Gauge, label: 'Mileage', value: vehicle.mileage ? `${vehicle.mileage.toLocaleString()} mi` : 'N/A' },
    { icon: Fuel, label: 'Engine', value: vehicle.engine },
    { icon: Cog, label: 'Transmission', value: vehicle.transmission },
    { icon: CarFront, label: 'Body Style', value: vehicle.bodyStyle },
    { icon: CircuitBoard, label: 'Drive Type', value: vehicle.driveType },
    { icon: Gauge, label: 'Fuel Type', value: vehicle.fuelType },
  ];

  const details = [
    { label: 'VIN', value: vehicle.vin },
    { label: 'Trim', value: vehicle.trim },
    { label: 'Color', value: vehicle.color },
    { label: 'Condition', value: vehicle.condition },
    { label: 'Location', value: vehicle.location },
    { label: 'Intake Date', value: vehicle.intakeDate },
    { label: 'Parts Total', value: String(parts.length) },
    { label: 'Parts Pulled', value: String(pulledCount) },
    { label: 'Est. Value', value: `${formatCurrency(vehicle.estimatedValue)} (est.)` },
    { label: 'Assembly Plant', value: vehicle.plant },
  ];

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' · ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center lg:items-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in" />
      <div
        className="relative w-full max-w-md lg:max-w-2xl bg-slate-900 rounded-t-3xl lg:rounded-2xl border-t lg:border border-slate-700/50 max-h-[85vh] overflow-y-auto scrollbar-hide animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-slate-900/95 backdrop-blur-xl px-4 pt-4 pb-3 border-b border-slate-800 flex items-center justify-between z-10">
          <h2 className="text-lg font-bold text-white">Vehicle Profile</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center">
            <X size={18} className="text-slate-400" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div className="h-40 rounded-2xl bg-gradient-to-br from-slate-700 to-slate-800 flex items-center justify-center relative">
            <Car size={48} className="text-slate-500" strokeWidth={1} />
            <div className="absolute top-3 right-3">
              <StatusDropdown
                currentStatus={vehicle.status}
                configs={statusConfigs}
                onSelect={(slug, config) => onStatusChange(slug, config)}
              />
            </div>
          </div>

          <div>
            <h3 className="text-xl font-bold text-white">{vehicle.year} {vehicle.make} {vehicle.model}</h3>
            <p className="text-sm text-slate-400 mt-1">{vehicle.trim}</p>
            <p className="text-xs text-slate-500 font-mono mt-1">{vehicle.vin}</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {specs.map((s) => {
              const Icon = s.icon;
              return (
                <div key={s.label} className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-slate-700/50 flex items-center justify-center flex-shrink-0">
                    <Icon size={16} className="text-slate-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] text-slate-500 uppercase font-semibold tracking-wide">{s.label}</p>
                    <p className="text-sm text-white font-medium truncate">{s.value}</p>
                  </div>
                </div>
              );
            })}
          </div>

          {vehicle.plant !== 'N/A' && (
            <div className="flex items-center gap-2 p-2.5 bg-slate-800/40 rounded-xl">
              <Factory size={14} className="text-slate-500 flex-shrink-0" />
              <span className="text-xs text-slate-400">Assembly Plant: {vehicle.plant}</span>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-slate-500 font-semibold">Dismantling Progress</span>
              <span className="text-xs text-white font-bold">{pulledCount} / {parts.length}</span>
            </div>
            <ProgressBar value={pulledCount} total={parts.length} />
          </div>

          <div className="space-y-0.5">
            {details.map((d) => (
              <div key={d.label} className="flex items-center justify-between py-2.5 border-b border-slate-800/60">
                <span className="text-sm text-slate-500">{d.label}</span>
                <span className="text-sm text-white font-medium text-right max-w-[60%] truncate">{d.value}</span>
              </div>
            ))}
          </div>

          {statusLogs.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <History size={14} className="text-slate-400" />
                <p className="text-[10px] text-slate-500 uppercase font-semibold tracking-wide">Status History</p>
              </div>
              <div className="space-y-2">
                {statusLogs.slice(0, 10).map((log) => {
                  const fromConfig = statusConfigs.find((c) => c.slug === log.fromStatus);
                  const toConfig = statusConfigs.find((c) => c.slug === log.toStatus);
                  return (
                    <div key={log.id} className="flex items-start gap-3 p-2.5 bg-slate-800/40 rounded-xl">
                      <div className="flex flex-col items-center pt-1">
                        <div className="w-2 h-2 rounded-full bg-red-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs text-slate-400">{fromConfig?.name ?? log.fromStatus}</span>
                          <span className="text-slate-600 text-xs">→</span>
                          <StatusBadge status={log.toStatus} configs={statusConfigs} />
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-[11px] text-slate-500">
                          <span className="flex items-center gap-1"><Clock size={10} /> {formatDate(log.createdAt)}</span>
                          <span className="flex items-center gap-1"><User size={10} /> {log.user}</span>
                        </div>
                        {log.notes && <p className="text-[11px] text-slate-400 mt-1 italic">"{log.notes}"</p>}
                        {log.workflowData?.release && (
                          <p className="text-[11px] text-amber-400 mt-1">Release fee: ${log.workflowData.release.releaseFee} · Signed by: {log.workflowData.release.signature}</p>
                        )}
                        {log.workflowData?.sold && (
                          <p className="text-[11px] text-emerald-400 mt-1">Buyer: {log.workflowData.sold.buyerName} · ${log.workflowData.sold.salePrice}</p>
                        )}
                        {log.workflowData?.scrapped && (
                          <p className="text-[11px] text-red-400 mt-1">Yard: {log.workflowData.scrapped.yard} · {log.workflowData.scrapped.weight} lbs · ${log.workflowData.scrapped.payout}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <button
            onClick={onSelect}
            className="w-full bg-red-600 rounded-xl py-3 text-sm font-bold text-white active:scale-[0.98] transition-transform flex items-center justify-center gap-2"
          >
            <MapPin size={18} /> Open Dismantle Plan
          </button>
        </div>
      </div>
    </div>
  );
}
