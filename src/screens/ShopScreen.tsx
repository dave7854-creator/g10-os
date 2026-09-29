import { useState, useEffect, useCallback, useRef } from 'react';
import {
  ChevronLeft, Search, Plus, Car, User, FileText, Wrench, Clock, DollarSign,
  X, Loader2, Check, ChevronRight, AlertCircle, Settings, ScanLine, Camera,
  CameraOff, Trash2, Pencil, Zap, TrendingUp, ShieldAlert, ExternalLink,
  KeyRound, CheckCircle2, Building2, Users, ClipboardList, Package, Sparkles,
  Printer, Mail, MessageSquare, CreditCard, Wallet, Receipt, Filter,
  CircleDot, ArrowRight, Plug, Send, Copy, Stethoscope,
} from 'lucide-react';
import { supabase } from '@/supabaseClient';
import { Card, Badge, Button } from '@/components/ui';
import { ModuleNav, type NavTab } from '@/components/ModuleNav';
import { decodeVin } from '@/vinDecoder';
import { toTitleCase } from '@/utils/textCase';
import { MessageButton } from '@/messaging/MessageButton';
import { ModuleMessageLink } from '@/messaging/ModuleMessageLink';
import { PaymentSettings as SharedPaymentSettings } from '@/payments/PaymentSettings';
import { RepairInfoScreen } from '@/shop/RepairInfoScreen';
import type { Screen } from '@/types';

// ===== TYPES =====
interface ShopCustomer {
  id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  created_at: string;
}

export interface ShopVehicle {
  id: string;
  customer_id: string | null;
  vin: string | null;
  year: string | null;
  make: string | null;
  model: string | null;
  trim: string | null;
  engine: string | null;
  transmission: string | null;
  drivetrain: string | null;
  fuel_type: string | null;
  body_style: string | null;
  mileage: number | null;
  vin_decoded: boolean;
}

export interface ShopLaborOp {
  id: string;
  work_order_id: string;
  operation_description: string;
  book_hours: number;
  charged_hours: number;
  labor_rate: number;
  labor_total: number;
  data_source: string;
  search_query: string | null;
  retrieved_at: string | null;
  display_order: number;
  is_ai_estimate?: boolean;
  confidence?: 'high' | 'medium' | 'low' | null;
  assumptions?: string[] | null;
}

export interface ShopWorkOrder {
  id: string;
  work_order_number: string;
  customer_id: string | null;
  vehicle_id: string | null;
  status: string;
  subtotal: number;
  tax: number;
  total: number;
  balance_due: number;
  shop_supplies: number;
  invoice_date: string | null;
  payment_status: string;
  notes: string | null;
  created_at: string;
}

interface ShopPayment {
  id: string;
  work_order_id: string;
  amount: number;
  method: string;
  reference: string | null;
  notes: string | null;
  created_at: string;
  square_transaction_id: string | null;
  payment_status: string;
  processor: string | null;
}

interface PaymentConfig {
  id: number;
  square_enabled: boolean;
  square_location_id: string | null;
  square_app_id: string | null;
  square_environment: string | null;
  square_display_name: string | null;
  paypal_enabled: boolean;
  paypal_client_id: string | null;
  paypal_display_name: string | null;
  venmo_enabled: boolean;
  venmo_link: string | null;
  venmo_display_name: string | null;
  cashapp_enabled: boolean;
  cashapp_link: string | null;
  cashapp_display_name: string | null;
  manual_link_enabled: boolean;
  manual_link_url: string | null;
  manual_link_display_name: string | null;
}

const WO_WORKFLOW: { id: string; label: string; color: string }[] = [
  { id: 'estimate', label: 'Estimate', color: 'blue' },
  { id: 'approved', label: 'Approved', color: 'cyan' },
  { id: 'in_progress', label: 'In Progress', color: 'amber' },
  { id: 'waiting_parts', label: 'Waiting Parts', color: 'orange' },
  { id: 'completed', label: 'Completed', color: 'emerald' },
  { id: 'invoiced', label: 'Invoiced', color: 'slate' },
  { id: 'partially_paid', label: 'Partially Paid', color: 'cyan' },
  { id: 'paid', label: 'Paid', color: 'green' },
];

const STATUS_COLOR_MAP: Record<string, string> = {
  blue: 'bg-red-500/15 text-red-400 border-red-500/20',
  cyan: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/20',
  amber: 'bg-amber-500/15 text-amber-400 border-amber-500/20',
  orange: 'bg-orange-500/15 text-orange-400 border-orange-500/20',
  emerald: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
  slate: 'bg-slate-600/20 text-slate-300 border-slate-600/30',
  green: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
  red: 'bg-red-500/15 text-red-400 border-red-500/20',
};

function statusBadgeClass(status: string): string {
  const wf = WO_WORKFLOW.find((w) => w.id === status);
  return wf ? STATUS_COLOR_MAP[wf.color] : STATUS_COLOR_MAP.slate;
}

interface LaborResult {
  description: string;
  bookHours: number;
  confidence?: 'high' | 'medium' | 'low';
  assumptions?: string[];
}

interface LaborSearchResponse {
  connected: boolean;
  provider?: string;
  results: LaborResult[];
  cached?: boolean;
  error?: string;
  message?: string;
  source?: 'book' | 'ai_estimate';
  confidence?: 'high' | 'medium' | 'low';
  assumptions?: string[];
}

interface ProviderConfig {
  id: string;
  provider_name: string;
  api_base_url: string | null;
  is_active: boolean;
  cache_allowed: boolean;
}

interface ShopSettings {
  id: number;
  labor_rate: number;
  tax_rate: number;
}

export interface ShopPart {
  id: string;
  work_order_id: string;
  part_number: string | null;
  description: string;
  cost: number;
  markup_percent: number;
  sell_price: number;
  supplier: string | null;
  core_charge: number;
  is_taxable: boolean;
  in_stock: boolean;
  is_ai_suggested: boolean;
  display_order: number;
}

interface AIPartSuggestion {
  description: string;
  part_number: string;
  estimated_cost: number;
  supplier: string;
  is_taxable: boolean;
  core_charge: number;
}

interface PartSuggestionResponse {
  suggestions: AIPartSuggestion[];
  repairType: string;
  vehicle: string;
  source: string;
  confidence: string;
  message: string;
  assumptions: string[];
}

type ShopView = 'dashboard' | 'work-orders' | 'new-wo' | 'wo-detail' | 'customers' | 'shop-settings' | 'payment-settings' | 'repair-info';

const SHOP_TABS: NavTab[] = [
  { id: 'dashboard', label: 'Home', icon: Wrench },
  { id: 'work-orders', label: 'Work Orders', icon: ClipboardList },
  { id: 'new-wo', label: 'New WO', icon: Plus },
  { id: 'customers', label: 'Customers', icon: Users },
  { id: 'shop-settings', label: 'Settings', icon: Settings },
];

// ===== MAIN COMPONENT =====
export function ShopScreen({ onNavigate }: { onNavigate: (s: Screen) => void }) {
  const [view, setView] = useState<ShopView>('dashboard');
  const [workOrders, setWorkOrders] = useState<ShopWorkOrder[]>([]);
  const [customers, setCustomers] = useState<ShopCustomer[]>([]);
  const [settings, setSettings] = useState<ShopSettings | null>(null);
  const [provider, setProvider] = useState<ProviderConfig | null>(null);
  const [activeWO, setActiveWO] = useState<ShopWorkOrder | null>(null);
  const [repairInfoVehicle, setRepairInfoVehicle] = useState<ShopVehicle | null>(null);
  const [loading, setLoading] = useState(true);
  const [paymentsByWO, setPaymentsByWO] = useState<Record<string, ShopPayment[]>>({});
  const [paymentConfig, setPaymentConfig] = useState<PaymentConfig | null>(null);

  const loadData = useCallback(async () => {
    const [woRes, custRes, setRes, provRes, payRes, payConfRes] = await Promise.all([
      supabase.from('shop_work_orders').select('*').order('created_at', { ascending: false }),
      supabase.from('shop_customers').select('*').order('created_at', { ascending: false }),
      supabase.from('shop_settings').select('*').eq('id', 1).maybeSingle(),
      supabase.from('shop_labor_provider_config').select('id, provider_name, api_base_url, is_active, cache_allowed').eq('is_active', true).maybeSingle(),
      supabase.from('shop_payments').select('*').order('created_at', { ascending: false }),
      supabase.from('shop_payment_config').select('*').eq('id', 1).maybeSingle(),
    ]);
    setWorkOrders((woRes.data ?? []) as ShopWorkOrder[]);
    setCustomers((custRes.data ?? []) as ShopCustomer[]);
    setSettings(setRes.data as ShopSettings | null);
    setProvider(provRes.data as ProviderConfig | null);
    const payMap: Record<string, ShopPayment[]> = {};
    for (const p of (payRes.data ?? []) as ShopPayment[]) {
      if (!payMap[p.work_order_id]) payMap[p.work_order_id] = [];
      payMap[p.work_order_id].push(p);
    }
    setPaymentsByWO(payMap);
    setPaymentConfig(payConfRes.data as PaymentConfig | null);
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const laborRate = settings?.labor_rate ?? 185;

  const isSubView = view === 'wo-detail' || view === 'repair-info';

  return (
    <>
      <ModuleNav
        title="Shop"
        subtitle="Work Orders & Estimates"
        tabs={SHOP_TABS}
        current={view}
        onNavigate={(id) => setView(id as ShopView)}
        onExit={() => onNavigate('home')}
        exitLabel="Back to Home"
      />
      <div className="lg:pl-60">
        <div className="max-w-7xl mx-auto">
          <div className="px-4 pt-14 pb-nav-safe lg:px-8 lg:pt-8 space-y-5 animate-fade-in">
            {/* Mobile header for sub-views */}
            {isSubView && (
              <button onClick={() => { setView('dashboard'); loadData(); }} className="flex items-center gap-1 text-slate-400 text-sm -ml-1 lg:hidden">
                <ChevronLeft size={18} /> Back to Shop
              </button>
            )}

            {view === 'dashboard' && (
              <ShopDashboard
                workOrders={workOrders}
                paymentsByWO={paymentsByWO}
                provider={provider}
                laborRate={laborRate}
                loading={loading}
                onNewWO={() => setView('new-wo')}
                onOpenWO={(wo) => { setActiveWO(wo); setView('wo-detail'); }}
                onViewAll={() => setView('work-orders')}
                onSettings={() => setView('shop-settings')}
                onCustomers={() => setView('customers')}
                onMessages={onNavigate}
              />
            )}

            {view === 'work-orders' && (
              <WorkOrdersList
                workOrders={workOrders}
                customers={customers}
                paymentsByWO={paymentsByWO}
                onBack={() => setView('dashboard')}
                onOpenWO={(wo) => { setActiveWO(wo); setView('wo-detail'); }}
                onNewWO={() => setView('new-wo')}
              />
            )}

            {view === 'new-wo' && (
              <NewWorkOrder
                customers={customers}
                laborRate={laborRate}
                onCustomers={() => setView('customers')}
                onCreated={(wo) => { setActiveWO(wo); setView('wo-detail'); loadData(); }}
                onBack={() => setView('dashboard')}
              />
            )}

            {view === 'wo-detail' && activeWO && (
              <WorkOrderDetail
                wo={activeWO}
                provider={provider}
                laborRate={laborRate}
                taxRate={settings?.tax_rate ?? 0}
                payments={paymentsByWO[activeWO.id] ?? []}
                onBack={() => { setView('dashboard'); loadData(); }}
                onChanged={() => loadData()}
                onRepairInfo={(vehicle) => { setRepairInfoVehicle(vehicle); setView('repair-info'); }}
              />
            )}

            {view === 'repair-info' && (
              <RepairInfoScreen
                vehicle={repairInfoVehicle}
                workOrder={activeWO}
                laborRate={laborRate}
                onBack={() => { setView('wo-detail'); loadData(); }}
                onChanged={() => loadData()}
              />
            )}

            {view === 'customers' && (
              <CustomersManagement
                customers={customers}
                onBack={() => setView('dashboard')}
                onChanged={() => loadData()}
              />
            )}

            {view === 'shop-settings' && (
              <ShopSettingsView
                settings={settings}
                provider={provider}
                onBack={() => setView('dashboard')}
                onSave={async (rate, tax) => {
                  await supabase.from('shop_settings').upsert({ id: 1, labor_rate: rate, tax_rate: tax, updated_at: new Date().toISOString() });
                  loadData();
                }}
                onProviderChanged={() => loadData()}
                onPaymentSettings={() => setView('payment-settings')}
              />
            )}

            {view === 'payment-settings' && (
              <SharedPaymentSettings onBack={() => setView('shop-settings')} />
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// ===== DASHBOARD =====
function ShopDashboard({
  workOrders, paymentsByWO, provider, laborRate, loading, onNewWO, onOpenWO, onViewAll, onSettings, onCustomers, onMessages,
}: {
  workOrders: ShopWorkOrder[];
  paymentsByWO: Record<string, ShopPayment[]>;
  provider: ProviderConfig | null;
  laborRate: number;
  loading: boolean;
  onNewWO: () => void;
  onOpenWO: (wo: ShopWorkOrder) => void;
  onViewAll: () => void;
  onSettings: () => void;
  onCustomers: () => void;
  onMessages: (s: Screen) => void;
}) {
  const counts = {
    open: workOrders.filter((w) => ['approved', 'in_progress', 'waiting_parts'].includes(w.status)).length,
    estimate: workOrders.filter((w) => w.status === 'estimate').length,
    waiting: workOrders.filter((w) => w.status === 'waiting_parts').length,
    completed: workOrders.filter((w) => ['completed', 'invoiced'].includes(w.status)).length,
    unpaid: workOrders.filter((w) => {
      const paid = (paymentsByWO[w.id] ?? []).reduce((s, p) => s + Number(p.amount), 0);
      return w.status !== 'paid' && Number(w.total) > 0 && paid < Number(w.total);
    }).length,
  };

  if (loading) return <LoadingSpinner />;

  const counterCards = [
    { label: 'Estimates', value: counts.estimate, icon: FileText, color: 'text-red-400', bg: 'bg-red-500/15' },
    { label: 'Open', value: counts.open, icon: Wrench, color: 'text-amber-400', bg: 'bg-amber-500/15' },
    { label: 'Waiting', value: counts.waiting, icon: Clock, color: 'text-orange-400', bg: 'bg-orange-500/15' },
    { label: 'Completed', value: counts.completed, icon: CheckCircle2, color: 'text-emerald-400', bg: 'bg-emerald-500/15' },
    { label: 'Unpaid', value: counts.unpaid, icon: DollarSign, color: 'text-red-400', bg: 'bg-red-500/15' },
  ];

  return (
    <>
      <div className="flex items-center gap-2">
        <Wrench size={24} className="text-red-400" />
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-white">Shop Management</h1>
          <p className="text-slate-400 text-sm mt-0.5">Estimates, work orders & labor times</p>
        </div>
      </div>

      {/* Summary counters */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {counterCards.map((c) => {
          const Icon = c.icon;
          return (
            <button
              key={c.label}
              onClick={onViewAll}
              className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-4 text-left active:scale-[0.97] lg:hover:border-slate-600/60 transition-all"
            >
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-2 ${c.bg}`}>
                <Icon size={20} className={c.color} />
              </div>
              <p className="text-2xl font-bold text-white">{c.value}</p>
              <p className="text-xs text-slate-500">{c.label}</p>
            </button>
          );
        })}
      </div>

      {!provider && (
        <div className="flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl">
          <Zap size={20} className="text-red-400 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-bold text-red-300">AI Estimates Active</p>
            <p className="text-xs text-slate-400 mt-0.5">No licensed provider connected. Labor searches return AI-generated estimates. Connect a provider in Settings → Integrations.</p>
          </div>
          <button onClick={onSettings} className="px-3 py-2 rounded-lg bg-red-500/20 text-red-300 text-xs font-semibold active:scale-95 transition-transform">
            Setup
          </button>
        </div>
      )}

      {provider && (
        <div className="flex items-center gap-3 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
          <CheckCircle2 size={16} className="text-emerald-400 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-xs font-semibold text-emerald-300">{provider.provider_name} connected</p>
            <p className="text-[10px] text-emerald-400/60">Labor-time search is active{provider.cache_allowed ? ' · caching enabled' : ''}</p>
          </div>
        </div>
      )}

      <button
        onClick={onNewWO}
        className="w-full bg-gradient-to-br from-red-600 to-red-700 rounded-3xl p-5 shadow-xl shadow-red-600/25 active:scale-[0.98] transition-transform flex items-center gap-4"
      >
        <div className="w-14 h-14 rounded-2xl bg-white/15 backdrop-blur flex items-center justify-center flex-shrink-0">
          <Plus size={28} className="text-white" strokeWidth={2.2} />
        </div>
        <div className="text-left flex-1">
          <p className="text-white font-bold text-lg">New Work Order</p>
          <p className="text-blue-200 text-sm">Create estimate with labor times</p>
        </div>
        <ChevronRight size={24} className="text-blue-200" />
      </button>

      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-white">Recent Work Orders</h2>
        <button onClick={onViewAll} className="text-xs text-red-400 font-semibold flex items-center gap-1">
          View All <ChevronRight size={14} />
        </button>
      </div>

      {workOrders.length === 0 ? (
        <div className="flex flex-col items-center text-center py-12">
          <FileText size={40} className="text-slate-700" strokeWidth={1.5} />
          <p className="text-slate-500 text-sm mt-3">No work orders yet</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {workOrders.slice(0, 6).map((wo) => (
            <Card key={wo.id} onClick={() => onOpenWO(wo)} className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-bold text-white">{wo.work_order_number}</p>
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border mt-1 ${statusBadgeClass(wo.status)}`}>
                    {WO_WORKFLOW.find((w) => w.id === wo.status)?.label ?? wo.status}
                  </span>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-emerald-400">${Number(wo.total).toFixed(2)}</p>
                  {Number(wo.balance_due) > 0 && (
                    <p className="text-[10px] text-red-400 font-semibold">Bal: ${Number(wo.balance_due).toFixed(2)}</p>
                  )}
                  <p className="text-[10px] text-slate-500">{new Date(wo.created_at).toLocaleDateString()}</p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <ModuleMessageLink module="shop" onNavigate={onMessages} />
        <Card onClick={onCustomers} className="p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-cyan-500/15 flex items-center justify-center flex-shrink-0">
            <User size={20} className="text-cyan-400" />
          </div>
          <div>
            <p className="text-sm font-bold text-white">Customers</p>
            <p className="text-xs text-slate-500">Manage customer list</p>
          </div>
        </Card>
        <Card onClick={onSettings} className="p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-slate-600/30 flex items-center justify-center flex-shrink-0">
            <Settings size={20} className="text-slate-300" />
          </div>
          <div>
            <p className="text-sm font-bold text-white">Settings</p>
            <p className="text-xs text-slate-500">Rates, tax & integrations</p>
          </div>
        </Card>
      </div>
    </>
  );
}

// ===== WORK ORDERS LIST =====
function WorkOrdersList({
  workOrders, customers, paymentsByWO, onBack, onOpenWO, onNewWO,
}: {
  workOrders: ShopWorkOrder[];
  customers: ShopCustomer[];
  paymentsByWO: Record<string, ShopPayment[]>;
  onBack: () => void;
  onOpenWO: (wo: ShopWorkOrder) => void;
  onNewWO: () => void;
}) {
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const customerName = (id: string | null) => {
    if (!id) return '—';
    const c = customers.find((c) => c.id === id);
    return c ? `${c.first_name} ${c.last_name}` : '—';
  };

  const filtered = workOrders.filter((wo) => {
    const matchesStatus = statusFilter === 'all' || wo.status === statusFilter;
    const q = query.toLowerCase();
    const matchesQuery = !q ||
      wo.work_order_number.toLowerCase().includes(q) ||
      customerName(wo.customer_id).toLowerCase().includes(q);
    return matchesStatus && matchesQuery;
  });

  const filterOptions = [
    { id: 'all', label: 'All' },
    ...WO_WORKFLOW.map((w) => ({ id: w.id, label: w.label })),
  ];

  return (
    <>
      <div className="flex items-center gap-2">
        <button onClick={onBack} className="text-slate-400"><ChevronLeft size={20} /></button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-white">Work Orders</h1>
          <p className="text-xs text-slate-500">{filtered.length} of {workOrders.length}</p>
        </div>
        <Button onClick={onNewWO} size="sm" icon={<Plus size={16} />}>New</Button>
      </div>

      <SearchBar value={query} onChange={setQuery} placeholder="Search by WO number or customer..." />

      {/* Status filter chips */}
      <div className="flex gap-1.5 overflow-x-auto scrollbar-hide -mx-1 px-1 pb-1">
        {filterOptions.map((f) => (
          <button
            key={f.id}
            onClick={() => setStatusFilter(f.id)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all active:scale-95 ${
              statusFilter === f.id
                ? 'bg-red-600 text-white'
                : 'bg-slate-800/60 text-slate-400 border border-slate-700/50'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState text="No work orders match your search" />
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden lg:block overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left border-b border-slate-700/50">
                  <th className="px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase">WO #</th>
                  <th className="px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase">Customer</th>
                  <th className="px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase">Status</th>
                  <th className="px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase text-right">Total</th>
                  <th className="px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase text-right">Balance</th>
                  <th className="px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase">Date</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((wo) => (
                  <tr
                    key={wo.id}
                    onClick={() => onOpenWO(wo)}
                    className="border-b border-slate-800/50 cursor-pointer hover:bg-slate-800/40 transition-colors"
                  >
                    <td className="px-3 py-3 text-sm font-bold text-white">{wo.work_order_number}</td>
                    <td className="px-3 py-3 text-sm text-slate-300">{customerName(wo.customer_id)}</td>
                    <td className="px-3 py-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${statusBadgeClass(wo.status)}`}>
                        {WO_WORKFLOW.find((w) => w.id === wo.status)?.label ?? wo.status}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-sm font-bold text-emerald-400 text-right">${Number(wo.total).toFixed(2)}</td>
                    <td className="px-3 py-3 text-sm text-right">
                      {Number(wo.balance_due) > 0 ? (
                        <span className="font-semibold text-red-400">${Number(wo.balance_due).toFixed(2)}</span>
                      ) : (
                        <span className="text-slate-600">$0.00</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-xs text-slate-500">{new Date(wo.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="lg:hidden space-y-2">
            {filtered.map((wo) => (
              <Card key={wo.id} onClick={() => onOpenWO(wo)} className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-bold text-white">{wo.work_order_number}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{customerName(wo.customer_id)}</p>
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border mt-1.5 ${statusBadgeClass(wo.status)}`}>
                      {WO_WORKFLOW.find((w) => w.id === wo.status)?.label ?? wo.status}
                    </span>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-emerald-400">${Number(wo.total).toFixed(2)}</p>
                    {Number(wo.balance_due) > 0 && (
                      <p className="text-[10px] text-red-400 font-semibold">Bal: ${Number(wo.balance_due).toFixed(2)}</p>
                    )}
                    <p className="text-[10px] text-slate-500 mt-0.5">{new Date(wo.created_at).toLocaleDateString()}</p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </>
      )}
    </>
  );
}

// ===== NEW WORK ORDER =====
function NewWorkOrder({
  customers, laborRate, onCustomers, onCreated, onBack,
}: {
  customers: ShopCustomer[];
  laborRate: number;
  onCustomers: () => void;
  onCreated: (wo: ShopWorkOrder) => void;
  onBack: () => void;
}) {
  const [step, setStep] = useState<'customer' | 'vehicle' | 'create'>('customer');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [vehicle, setVehicle] = useState<ShopVehicle | null>(null);
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    if (creating || !selectedCustomerId || !vehicle) return;
    setCreating(true);
    // Save vehicle if new
    let vehicleId = vehicle.id;
    if (!vehicle.customer_id) {
      const { data: vData } = await supabase.from('shop_vehicles').insert({
        customer_id: selectedCustomerId,
        vin: vehicle.vin, year: vehicle.year, make: vehicle.make, model: vehicle.model,
        trim: vehicle.trim, engine: vehicle.engine, transmission: vehicle.transmission,
        drivetrain: vehicle.drivetrain, fuel_type: vehicle.fuel_type, body_style: vehicle.body_style,
        mileage: vehicle.mileage, vin_decoded: vehicle.vin_decoded,
      }).select().maybeSingle();
      if (vData) vehicleId = vData.id;
    }
    // Generate WO number
    const count = await supabase.from('shop_work_orders').select('*', { count: 'exact', head: true });
    const woNum = `WO-${String((count.count ?? 0) + 1).padStart(4, '0')}`;
    const { data: woData } = await supabase.from('shop_work_orders').insert({
      work_order_number: woNum, customer_id: selectedCustomerId, vehicle_id: vehicleId,
      status: 'estimate', subtotal: 0, tax: 0, total: 0,
    }).select().maybeSingle();
    setCreating(false);
    if (woData) onCreated(woData as ShopWorkOrder);
  };

  return (
    <>
      <div className="flex items-center gap-2">
        <button onClick={onBack} className="text-slate-400"><ChevronLeft size={20} /></button>
        <h1 className="text-xl font-bold text-white">New Work Order</h1>
      </div>

      <Stepper step={step} />

      {step === 'customer' && (
        <CustomerStep
          customers={customers}
          selectedId={selectedCustomerId}
          onSelect={(id) => { setSelectedCustomerId(id); setStep('vehicle'); }}
          onAddCustomer={onCustomers}
        />
      )}

      {step === 'vehicle' && (
        <VehicleStep
          customerId={selectedCustomerId}
          onVehicleSet={(v) => { setVehicle(v); setStep('create'); }}
          onBack={() => setStep('customer')}
        />
      )}

      {step === 'create' && vehicle && (
        <CreateStep
          customer={customers.find((c) => c.id === selectedCustomerId)}
          vehicle={vehicle}
          laborRate={laborRate}
          creating={creating}
          onCreate={handleCreate}
          onBack={() => setStep('vehicle')}
        />
      )}
    </>
  );
}

function Stepper({ step }: { step: 'customer' | 'vehicle' | 'create' }) {
  const steps = [
    { id: 'customer', label: 'Customer', n: 1 },
    { id: 'vehicle', label: 'Vehicle', n: 2 },
    { id: 'create', label: 'Review', n: 3 },
  ];
  const currentIdx = steps.findIndex((s) => s.id === step);
  return (
    <div className="flex items-center gap-2">
      {steps.map((s, i) => (
        <div key={s.id} className="flex items-center gap-2 flex-1">
          <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
            i <= currentIdx ? 'bg-red-600 text-white' : 'bg-slate-800 text-slate-500'
          }`}>{s.n}</div>
          <span className={`text-xs font-semibold ${i <= currentIdx ? 'text-white' : 'text-slate-600'}`}>{s.label}</span>
          {i < steps.length - 1 && <div className={`h-0.5 flex-1 ${i < currentIdx ? 'bg-red-600' : 'bg-slate-800'}`} />}
        </div>
      ))}
    </div>
  );
}

function CustomerStep({
  customers, selectedId, onSelect, onAddCustomer,
}: {
  customers: ShopCustomer[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAddCustomer: () => void;
}) {
  const [query, setQuery] = useState('');
  const filtered = customers.filter((c) => {
    const q = query.toLowerCase();
    return !q || `${c.first_name} ${c.last_name}`.toLowerCase().includes(q) || (c.phone ?? '').includes(q);
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-white">Select Customer</h2>
        <button onClick={onAddCustomer} className="text-xs text-red-400 font-semibold flex items-center gap-1">
          <Plus size={14} /> Add New
        </button>
      </div>
      <SearchBar value={query} onChange={setQuery} placeholder="Search name or phone..." />
      {filtered.length === 0 ? (
        <EmptyState text="No customers found. Add one to get started." />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((c) => (
            <Card key={c.id} onClick={() => onSelect(c.id)} className={`p-4 ${selectedId === c.id ? 'border-red-500' : ''}`}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-red-500/15 flex items-center justify-center flex-shrink-0">
                  <User size={18} className="text-red-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-white">{c.first_name} {c.last_name}</p>
                  <p className="text-xs text-slate-500">{c.phone ?? 'No phone'}</p>
                </div>
                <ChevronRight size={18} className="text-slate-600" />
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function VehicleStep({ customerId, onVehicleSet, onBack }: {
  customerId: string | null;
  onVehicleSet: (v: ShopVehicle) => void;
  onBack: () => void;
}) {
  const [mode, setMode] = useState<'scan' | 'manual-vin' | 'manual-entry' | 'existing'>('existing');
  const [existingVehicles, setExistingVehicles] = useState<ShopVehicle[]>([]);
  const [vin, setVin] = useState('');
  const [decoding, setDecoding] = useState(false);
  const [decodeError, setDecodeError] = useState('');
  const [manual, setManual] = useState({ year: '', make: '', model: '', trim: '', engine: '', drivetrain: '', mileage: '' });

  useEffect(() => {
    if (customerId) {
      supabase.from('shop_vehicles').select('*').eq('customer_id', customerId).then(({ data }) => {
        setExistingVehicles((data ?? []) as ShopVehicle[]);
      });
    }
  }, [customerId]);

  const handleDecode = async () => {
    if (vin.length < 17) return;
    setDecoding(true); setDecodeError('');
    try {
      const result = await decodeVin(vin);
      const v: ShopVehicle = {
        id: crypto.randomUUID(), customer_id: null, vin: result.vin,
        year: String(result.year), make: result.make, model: result.model, trim: result.trim,
        engine: result.engine, transmission: result.transmission, drivetrain: result.driveType,
        fuel_type: result.fuelType, body_style: result.bodyStyle, mileage: 0, vin_decoded: true,
      };
      onVehicleSet(v);
    } catch (err) {
      setDecodeError(err instanceof Error ? err.message : 'Decode failed');
    }
    setDecoding(false);
  };

  const handleManual = () => {
    if (!manual.make || !manual.model) return;
    onVehicleSet({
      id: crypto.randomUUID(), customer_id: null, vin: null, year: manual.year, make: toTitleCase(manual.make),
      model: toTitleCase(manual.model), trim: manual.trim ? toTitleCase(manual.trim) : null, engine: manual.engine || null,
      transmission: null, drivetrain: manual.drivetrain || null, fuel_type: null, body_style: null,
      mileage: manual.mileage ? parseInt(manual.mileage) : 0, vin_decoded: false,
    });
  };

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="flex items-center gap-1 text-slate-400 text-sm">
        <ChevronLeft size={16} /> Back to customer
      </button>

      <div className="flex gap-1 p-1 bg-slate-800/60 rounded-xl border border-slate-700/50">
        {[
          { id: 'existing', label: 'Existing' },
          { id: 'scan', label: 'Scan VIN' },
          { id: 'manual-vin', label: 'Enter VIN' },
          { id: 'manual-entry', label: 'Manual' },
        ].map((m) => (
          <button key={m.id} onClick={() => setMode(m.id as typeof mode)}
            className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${mode === m.id ? 'bg-red-600 text-white' : 'text-slate-400'}`}>
            {m.label}
          </button>
        ))}
      </div>

      {mode === 'existing' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {existingVehicles.length === 0 ? (
            <EmptyState text="No existing vehicles for this customer. Use Scan VIN or Manual entry." />
          ) : existingVehicles.map((v) => (
            <Card key={v.id} onClick={() => onVehicleSet(v)} className="p-4">
              <div className="flex items-center gap-3">
                <Car size={20} className="text-slate-400" />
                <div className="flex-1">
                  <p className="text-sm font-bold text-white">{v.year} {v.make} {v.model}</p>
                  <p className="text-xs text-slate-500">{v.vin ?? 'No VIN'} · {v.engine ?? 'N/A'}</p>
                </div>
                <ChevronRight size={18} className="text-slate-600" />
              </div>
            </Card>
          ))}
        </div>
      )}

      {mode === 'scan' && (
        <VinScannerCamera
          onScan={(scannedVin) => { setVin(scannedVin); setMode('manual-vin'); }}
          onManualEntry={() => setMode('manual-entry')}
        />
      )}

      {mode === 'manual-vin' && (
        <Card className="p-4 space-y-3">
          <input value={vin} onChange={(e) => { setVin(e.target.value.toUpperCase()); setDecodeError(''); }}
            placeholder="Enter 17-character VIN" maxLength={17}
            className="w-full bg-slate-900/80 border border-slate-700/50 rounded-xl px-4 py-3.5 text-white text-base font-mono tracking-wider placeholder:text-slate-600 focus:border-red-500 focus:outline-none" />
          <Button onClick={handleDecode} size="lg" className="w-full" disabled={vin.length < 17 || decoding}
            icon={decoding ? <Loader2 size={20} className="animate-spin" /> : <Zap size={20} />}>
            {decoding ? 'Decoding...' : 'Decode VIN & Continue'}
          </Button>
          {decodeError && <ErrorBanner text={decodeError} />}
          <button onClick={() => setMode('manual-entry')} className="w-full text-center text-xs text-red-400 font-semibold">
            Enter vehicle manually instead
          </button>
        </Card>
      )}

      {mode === 'manual-entry' && (
        <Card className="p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Year" value={manual.year} onChange={(v) => setManual({ ...manual, year: v })} placeholder="2015" />
            <FormField label="Make" value={manual.make} onChange={(v) => setManual({ ...manual, make: v })} placeholder="Toyota" />
            <FormField label="Model" value={manual.model} onChange={(v) => setManual({ ...manual, model: v })} placeholder="Camry" />
            <FormField label="Trim" value={manual.trim} onChange={(v) => setManual({ ...manual, trim: v })} placeholder="SE" />
            <FormField label="Engine" value={manual.engine} onChange={(v) => setManual({ ...manual, engine: v })} placeholder="2.5L I4" />
            <FormField label="Drivetrain" value={manual.drivetrain} onChange={(v) => setManual({ ...manual, drivetrain: v })} placeholder="FWD" />
            <FormField label="Mileage" value={manual.mileage} onChange={(v) => setManual({ ...manual, mileage: v })} placeholder="95000" />
          </div>
          <Button onClick={handleManual} size="lg" className="w-full" disabled={!manual.make || !manual.model}
            icon={<Check size={20} />}>Continue</Button>
        </Card>
      )}
    </div>
  );
}

function CreateStep({
  customer, vehicle, laborRate, creating, onCreate, onBack,
}: {
  customer: ShopCustomer | undefined;
  vehicle: ShopVehicle;
  laborRate: number;
  creating: boolean;
  onCreate: () => void;
  onBack: () => void;
}) {
  return (
    <div className="space-y-4">
      <button onClick={onBack} className="flex items-center gap-1 text-slate-400 text-sm">
        <ChevronLeft size={16} /> Back to vehicle
      </button>

      <Card className="p-4">
        <div className="flex items-center gap-3 mb-3">
          <User size={18} className="text-red-400" />
          <p className="text-sm font-bold text-white">{customer?.first_name} {customer?.last_name}</p>
        </div>
        <div className="flex items-center gap-3">
          <Car size={18} className="text-amber-400" />
          <div>
            <p className="text-sm font-bold text-white">{vehicle.year} {vehicle.make} {vehicle.model}</p>
            <p className="text-xs text-slate-500">{vehicle.vin ?? 'No VIN'} · {vehicle.engine ?? 'N/A'}</p>
          </div>
        </div>
      </Card>

      <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-xl">
        <Clock size={14} className="text-red-400 flex-shrink-0" />
        <p className="text-xs text-red-300">Labor rate: ${laborRate.toFixed(0)}/hour. You can search and add labor operations after creating the work order.</p>
      </div>

      <Button onClick={onCreate} size="lg" className="w-full" disabled={creating}
        icon={creating ? <Loader2 size={20} className="animate-spin" /> : <FileText size={20} />}>
        {creating ? 'Creating...' : 'Create Work Order'}
      </Button>
    </div>
  );
}

// ===== WORK ORDER DETAIL =====
function WorkOrderDetail({
  wo, provider, laborRate, taxRate, payments, onBack, onChanged, onRepairInfo,
}: {
  wo: ShopWorkOrder;
  provider: ProviderConfig | null;
  laborRate: number;
  taxRate: number;
  payments: ShopPayment[];
  onBack: () => void;
  onChanged: () => void;
  onRepairInfo: (vehicle: ShopVehicle) => void;
}) {
  const [operations, setOperations] = useState<ShopLaborOp[]>([]);
  const [parts, setParts] = useState<ShopPart[]>([]);
  const [customer, setCustomer] = useState<ShopCustomer | null>(null);
  const [vehicle, setVehicle] = useState<ShopVehicle | null>(null);
  const [loading, setLoading] = useState(true);
  const [showSearch, setShowSearch] = useState(false);
  const [editingOp, setEditingOp] = useState<string | null>(null);
  const [showAddPart, setShowAddPart] = useState(false);
  const [showAISuggestions, setShowAISuggestions] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [showPrint, setShowPrint] = useState(false);
  const [showSendInvoice, setShowSendInvoice] = useState(false);
  const [repairTypeForAI, setRepairTypeForAI] = useState('');

  const loadData = useCallback(async () => {
    const [opsRes, partsRes, custRes, vehRes] = await Promise.all([
      supabase.from('shop_labor_operations').select('*').eq('work_order_id', wo.id).order('display_order', { ascending: true }),
      supabase.from('shop_parts').select('*').eq('work_order_id', wo.id).order('display_order', { ascending: true }),
      wo.customer_id ? supabase.from('shop_customers').select('*').eq('id', wo.customer_id).maybeSingle() : Promise.resolve({ data: null }),
      wo.vehicle_id ? supabase.from('shop_vehicles').select('*').eq('id', wo.vehicle_id).maybeSingle() : Promise.resolve({ data: null }),
    ]);
    setOperations((opsRes.data ?? []) as ShopLaborOp[]);
    setParts((partsRes.data ?? []) as ShopPart[]);
    setCustomer(custRes.data as ShopCustomer | null);
    setVehicle(vehRes.data as ShopVehicle | null);
    setLoading(false);
  }, [wo.id, wo.customer_id, wo.vehicle_id]);

  useEffect(() => { loadData(); }, [loadData]);

  const recalcAndSave = useCallback(async (ops: ShopLaborOp[], currentParts: ShopPart[]) => {
    const laborSubtotal = ops.reduce((s, o) => s + Number(o.labor_total), 0);
    const partsSellTotal = currentParts.reduce((s, p) => s + Number(p.sell_price), 0);
    const coreChargeTotal = currentParts.reduce((s, p) => s + Number(p.core_charge), 0);
    const taxablePartsTotal = currentParts.filter((p) => p.is_taxable).reduce((s, p) => s + Number(p.sell_price), 0);
    const tax = (laborSubtotal + taxablePartsTotal) * taxRate;
    const subtotal = laborSubtotal + partsSellTotal;
    const total = subtotal + tax + coreChargeTotal;
    const paidAmount = payments.reduce((s, p) => s + Number(p.amount), 0);
    const balanceDue = Math.max(0, total - paidAmount);
    await supabase.from('shop_work_orders').update({ subtotal, tax, total, balance_due: balanceDue, updated_at: new Date().toISOString() }).eq('id', wo.id);
    onChanged();
  }, [wo.id, onChanged, taxRate, payments]);

  const addOperation = async (result: LaborResult, searchQuery: string, source: 'book' | 'ai_estimate' = 'book') => {
    const laborTotal = result.bookHours * laborRate;
    const newOp = {
      work_order_id: wo.id,
      operation_description: toTitleCase(result.description),
      book_hours: result.bookHours,
      charged_hours: result.bookHours,
      labor_rate: laborRate,
      labor_total: laborTotal,
      data_source: source === 'ai_estimate' ? 'AI Estimate' : (provider?.provider_name ?? 'manual'),
      search_query: searchQuery,
      retrieved_at: new Date().toISOString(),
      display_order: operations.length,
      is_ai_estimate: source === 'ai_estimate',
      confidence: result.confidence ?? null,
      assumptions: result.assumptions ?? null,
    };
    const { data } = await supabase.from('shop_labor_operations').insert(newOp).select().maybeSingle();
    if (data) {
      const updated = [...operations, data as ShopLaborOp];
      setOperations(updated);
      recalcAndSave(updated, parts);
    }
    setShowSearch(false);
  };

  const updateOpHours = async (opId: string, newHours: number) => {
    const updated = operations.map((o) => {
      if (o.id === opId) {
        return { ...o, charged_hours: newHours, labor_total: newHours * Number(o.labor_rate) };
      }
      return o;
    });
    setOperations(updated);
    const op = updated.find((o) => o.id === opId);
    if (op) {
      await supabase.from('shop_labor_operations').update({
        charged_hours: newHours, labor_total: op.labor_total, updated_at: new Date().toISOString(),
      }).eq('id', opId);
    }
    recalcAndSave(updated, parts);
  };

  const deleteOp = async (opId: string) => {
    const updated = operations.filter((o) => o.id !== opId);
    setOperations(updated);
    await supabase.from('shop_labor_operations').delete().eq('id', opId);
    recalcAndSave(updated, parts);
  };

  // ===== PARTS CRUD =====
  const addPart = async (part: {
    part_number?: string; description: string; cost: number; markup_percent: number;
    supplier?: string; core_charge?: number; is_taxable?: boolean; in_stock?: boolean;
    is_ai_suggested?: boolean;
  }) => {
    const sellPrice = part.cost * (1 + part.markup_percent / 100);
    const newPart = {
      work_order_id: wo.id,
      part_number: part.part_number ?? null,
      description: part.description,
      cost: part.cost,
      markup_percent: part.markup_percent,
      sell_price: sellPrice,
      supplier: part.supplier ?? null,
      core_charge: part.core_charge ?? 0,
      is_taxable: part.is_taxable ?? true,
      in_stock: part.in_stock ?? false,
      is_ai_suggested: part.is_ai_suggested ?? false,
      display_order: parts.length,
    };
    const { data } = await supabase.from('shop_parts').insert(newPart).select().maybeSingle();
    if (data) {
      const updated = [...parts, data as ShopPart];
      setParts(updated);
      recalcAndSave(operations, updated);
    }
    setShowAddPart(false);
  };

  const updatePart = async (partId: string, changes: Partial<ShopPart>) => {
    const updated = parts.map((p) => {
      if (p.id === partId) {
        const merged = { ...p, ...changes };
        if (changes.cost !== undefined || changes.markup_percent !== undefined) {
          merged.sell_price = Number(merged.cost) * (1 + Number(merged.markup_percent) / 100);
        }
        return merged;
      }
      return p;
    });
    setParts(updated);
    const part = updated.find((p) => p.id === partId);
    if (part) {
      await supabase.from('shop_parts').update({
        part_number: part.part_number, description: part.description,
        cost: part.cost, markup_percent: part.markup_percent, sell_price: part.sell_price,
        supplier: part.supplier, core_charge: part.core_charge,
        is_taxable: part.is_taxable, in_stock: part.in_stock, is_ai_suggested: part.is_ai_suggested,
        updated_at: new Date().toISOString(),
      }).eq('id', partId);
    }
    recalcAndSave(operations, updated);
  };

  const deletePart = async (partId: string) => {
    const updated = parts.filter((p) => p.id !== partId);
    setParts(updated);
    await supabase.from('shop_parts').delete().eq('id', partId);
    recalcAndSave(operations, updated);
  };

  const addAISuggestedParts = async (suggestions: AIPartSuggestion[]) => {
    const newParts = suggestions.map((s, i) => ({
      work_order_id: wo.id,
      part_number: s.part_number,
      description: toTitleCase(s.description),
      cost: s.estimated_cost,
      markup_percent: 30,
      sell_price: s.estimated_cost * 1.3,
      supplier: toTitleCase(s.supplier),
      core_charge: s.core_charge,
      is_taxable: s.is_taxable,
      in_stock: false,
      is_ai_suggested: true,
      display_order: parts.length + i,
    }));
    const { data } = await supabase.from('shop_parts').insert(newParts).select();
    if (data) {
      const updated = [...parts, ...(data as ShopPart[])];
      setParts(updated);
      recalcAndSave(operations, updated);
    }
    setShowAISuggestions(false);
  };

  const convertSuggestionsToEstimate = async (suggestions: AIPartSuggestion[]) => {
    const newParts = suggestions.map((s, i) => ({
      work_order_id: wo.id,
      part_number: s.part_number,
      description: toTitleCase(s.description),
      cost: s.estimated_cost,
      markup_percent: 30,
      sell_price: s.estimated_cost * 1.3,
      supplier: toTitleCase(s.supplier),
      core_charge: s.core_charge,
      is_taxable: s.is_taxable,
      in_stock: false,
      is_ai_suggested: true,
      display_order: parts.length + i,
    }));
    const { data: partsData } = await supabase.from('shop_parts').insert(newParts).select();
    let updatedParts = parts;
    if (partsData) {
      updatedParts = [...parts, ...(partsData as ShopPart[])];
      setParts(updatedParts);
    }
    setShowAISuggestions(false);
    recalcAndSave(operations, updatedParts);
  };

  // ===== WORKFLOW STATUS =====
  const updateStatus = async (newStatus: string) => {
    await supabase.from('shop_work_orders').update({ status: newStatus, updated_at: new Date().toISOString() }).eq('id', wo.id);
    onChanged();
  };

  // ===== PAYMENTS =====
  const totalPaid = payments.reduce((s, p) => s + Number(p.amount), 0);
  const woTotal = Number(wo.total);
  const balanceDue = Math.max(0, woTotal - totalPaid);

  const addPayment = async (amount: number, method: string, reference: string, notes: string) => {
    await supabase.from('shop_payments').insert({
      work_order_id: wo.id, amount, method, reference: reference || null, notes: notes || null,
    });
    const newBalance = Math.max(0, woTotal - (totalPaid + amount));
    const newPayStatus = newBalance <= 0 && woTotal > 0 ? 'paid' : 'partially_paid';
    const newStatus = newBalance <= 0 && woTotal > 0 ? 'paid' : (wo.status === 'estimate' ? 'invoiced' : wo.status);
    await supabase.from('shop_work_orders').update({ balance_due: newBalance, status: newStatus, payment_status: newPayStatus, updated_at: new Date().toISOString() }).eq('id', wo.id);
    setShowPayment(false);
    onChanged();
  };

  const deletePayment = async (paymentId: string) => {
    await supabase.from('shop_payments').delete().eq('id', paymentId);
    const payment = payments.find((p) => p.id === paymentId);
    const remainingPaid = totalPaid - (payment ? Number(payment.amount) : 0);
    const newBalance = Math.max(0, woTotal - remainingPaid);
    await supabase.from('shop_work_orders').update({ balance_due: newBalance, updated_at: new Date().toISOString() }).eq('id', wo.id);
    onChanged();
  };

  const laborSubtotal = operations.reduce((s, o) => s + Number(o.labor_total), 0);
  const partsSellTotal = parts.reduce((s, p) => s + Number(p.sell_price), 0);
  const coreChargeTotal = parts.reduce((s, p) => s + Number(p.core_charge), 0);
  const totalBookHours = operations.reduce((s, o) => s + Number(o.book_hours), 0);
  const totalChargedHours = operations.reduce((s, o) => s + Number(o.charged_hours), 0);
  const taxableAmount = laborSubtotal + parts.filter((p) => p.is_taxable).reduce((s, p) => s + Number(p.sell_price), 0);
  const taxAmount = taxableAmount * taxRate;
  const grandTotal = laborSubtotal + partsSellTotal + taxAmount + coreChargeTotal;

  const currentStatusIdx = WO_WORKFLOW.findIndex((w) => w.id === wo.status);

  return (
    <>
      <div className="flex items-center gap-2">
        <button onClick={onBack} className="text-slate-400"><ChevronLeft size={20} /></button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-white">{wo.work_order_number}</h1>
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border mt-0.5 ${statusBadgeClass(wo.status)}`}>
            {WO_WORKFLOW.find((w) => w.id === wo.status)?.label ?? wo.status}
          </span>
        </div>
        <button onClick={() => setShowSendInvoice(true)} className="w-9 h-9 rounded-xl bg-red-600/20 border border-red-600/30 flex items-center justify-center active:scale-90 transition-transform">
          <Send size={18} className="text-red-400" />
        </button>
        <button onClick={() => setShowPrint(true)} className="w-9 h-9 rounded-xl bg-slate-800/60 border border-slate-700/50 flex items-center justify-center active:scale-90 transition-transform">
          <Printer size={18} className="text-slate-300" />
        </button>
        <Badge color="blue">${laborRate.toFixed(0)}/hr</Badge>
      </div>

      {/* WORKFLOW STEPPER */}
      <Card className="p-4">
        <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-3">Workflow Status</p>
        <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide pb-1">
          {WO_WORKFLOW.map((step, i) => {
            const isCurrent = step.id === wo.status;
            const isPast = currentStatusIdx >= 0 && i < currentStatusIdx;
            return (
              <button
                key={step.id}
                onClick={() => updateStatus(step.id)}
                className="flex items-center gap-1 flex-shrink-0"
              >
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold transition-all ${
                  isCurrent ? `ring-2 ring-${step.color}-500/40` : ''
                } ${
                  isCurrent ? STATUS_COLOR_MAP[step.color] :
                  isPast ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' :
                  'bg-slate-800 text-slate-600 border border-slate-700/50'
                }`}>
                  {isPast ? <Check size={10} /> : i + 1}
                </div>
                <span className={`text-[10px] font-semibold whitespace-nowrap ${isCurrent ? 'text-white' : 'text-slate-600'}`}>
                  {step.label}
                </span>
                {i < WO_WORKFLOW.length - 1 && <ArrowRight size={10} className="text-slate-700 flex-shrink-0" />}
              </button>
            );
          })}
        </div>
      </Card>

      {customer && (
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <User size={18} className="text-red-400" />
            <div className="flex-1">
              <p className="text-sm font-bold text-white">{customer.first_name} {customer.last_name}</p>
              <p className="text-xs text-slate-500">{customer.phone ?? 'No phone'} · {customer.email ?? 'No email'}</p>
            </div>
            {customer.phone && (
              <MessageButton
                compact
                module="shop"
                contactName={`${customer.first_name} ${customer.last_name}`}
                contactPhone={customer.phone}
                contactEmail={customer.email}
                recordId={wo.id}
                recordType="work_order"
                recordLabel={`WO ${wo.work_order_number}`}
                vehicleLabel={vehicle ? `${vehicle.year} ${vehicle.make} ${vehicle.model}` : undefined}
              />
            )}
          </div>
        </Card>
      )}

      {vehicle && (
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <Car size={18} className="text-amber-400" />
            <div className="flex-1">
              <p className="text-sm font-bold text-white">{vehicle.year} {vehicle.make} {vehicle.model}</p>
              <p className="text-xs text-slate-500">{vehicle.vin ?? 'No VIN'} · {vehicle.engine ?? 'N/A'} · {vehicle.drivetrain ?? 'N/A'}</p>
            </div>
            <button
              onClick={() => onRepairInfo(vehicle)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-red-600/20 border border-red-600/30 text-red-400 text-xs font-semibold active:scale-90 transition-transform"
            >
              <Stethoscope size={14} /> Repair Info
            </button>
          </div>
        </Card>
      )}

      {/* LABOR OPERATIONS */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-white">Labor Operations</h2>
          <span className="text-xs text-slate-500">{operations.length} lines</span>
        </div>

        {operations.length === 0 && !showSearch && (
          <div className="flex flex-col items-center text-center py-8">
            <Wrench size={32} className="text-slate-700" strokeWidth={1.5} />
            <p className="text-slate-500 text-sm mt-3">No labor operations yet</p>
            <p className="text-slate-600 text-xs mt-1">Tap "Add Labor Operation" to search and add operations</p>
          </div>
        )}

        {operations.map((op) => (
          <LaborOpCard
            key={op.id}
            op={op}
            editing={editingOp === op.id}
            onEdit={() => setEditingOp(op.id)}
            onCancelEdit={() => setEditingOp(null)}
            onHoursChange={(h) => { updateOpHours(op.id, h); setEditingOp(null); }}
            onDelete={() => deleteOp(op.id)}
          />
        ))}

        <button
          onClick={() => setShowSearch(true)}
          className="w-full bg-slate-800/60 border border-slate-700/50 border-dashed rounded-2xl py-3.5 text-sm font-semibold text-red-400 active:scale-[0.97] transition-transform flex items-center justify-center gap-2"
        >
          <Plus size={18} /> Add Labor Operation
        </button>
      </div>

      {/* PARTS SECTION */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-white flex items-center gap-2">
            <Package size={16} className="text-amber-400" />
            Parts
          </h2>
          <span className="text-xs text-slate-500">{parts.length} items</span>
        </div>

        {parts.length === 0 && !showAddPart && !showAISuggestions && (
          <div className="flex flex-col items-center text-center py-8">
            <Package size={32} className="text-slate-700" strokeWidth={1.5} />
            <p className="text-slate-500 text-sm mt-3">No parts added yet</p>
            <p className="text-slate-600 text-xs mt-1">Add parts manually or get AI suggestions</p>
          </div>
        )}

        {parts.map((part) => (
          <PartCard
            key={part.id}
            part={part}
            onUpdate={(changes) => updatePart(part.id, changes)}
            onDelete={() => deletePart(part.id)}
          />
        ))}

        <div className="flex gap-2">
          <button
            onClick={() => setShowAddPart(true)}
            className="flex-1 bg-slate-800/60 border border-slate-700/50 border-dashed rounded-2xl py-3.5 text-sm font-semibold text-red-400 active:scale-[0.97] transition-transform flex items-center justify-center gap-2"
          >
            <Plus size={18} /> Add Part
          </button>
          <button
            onClick={() => setShowAISuggestions(true)}
            className="flex-1 bg-amber-500/10 border border-amber-500/30 border-dashed rounded-2xl py-3.5 text-sm font-semibold text-amber-400 active:scale-[0.97] transition-transform flex items-center justify-center gap-2"
          >
            <Sparkles size={18} /> AI Suggested Parts
          </button>
        </div>
      </div>

      {/* TOTALS */}
      {(operations.length > 0 || parts.length > 0) && (
        <Card className="p-4 bg-gradient-to-br from-slate-800/80 to-slate-900/80">
          <div className="space-y-2">
            {operations.length > 0 && (
              <>
                <TotalRow label="Total Book Hours" value={`${totalBookHours.toFixed(2)} hrs`} />
                <TotalRow label="Total Charged Hours" value={`${totalChargedHours.toFixed(2)} hrs`} highlight />
                <TotalRow label="Labor Subtotal" value={`$${laborSubtotal.toFixed(2)}`} />
              </>
            )}
            {parts.length > 0 && (
              <>
                <div className="border-t border-slate-700/40 pt-2 mt-2">
                  <TotalRow label="Parts Subtotal" value={`$${partsSellTotal.toFixed(2)}`} />
                  {coreChargeTotal > 0 && (
                    <TotalRow label="Core Charges" value={`$${coreChargeTotal.toFixed(2)}`} />
                  )}
                </div>
              </>
            )}
            {taxAmount > 0 && (
              <TotalRow label="Tax" value={`$${taxAmount.toFixed(2)}`} />
            )}
            <div className="border-t border-slate-700/40 pt-2 mt-2">
              <TotalRow label="Grand Total" value={`$${grandTotal.toFixed(2)}`} large />
            </div>
            {totalPaid > 0 && (
              <>
                <TotalRow label="Total Paid" value={`$${totalPaid.toFixed(2)}`} />
                <div className="border-t border-slate-700/40 pt-2 mt-2">
                  <TotalRow label="Balance Due" value={`$${balanceDue.toFixed(2)}`} large />
                </div>
              </>
            )}
          </div>
        </Card>
      )}

      {/* PAYMENTS SECTION */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-white flex items-center gap-2">
            <CreditCard size={16} className="text-emerald-400" />
            Payments
          </h2>
          <span className="text-xs text-slate-500">
            {totalPaid > 0 ? `$${totalPaid.toFixed(2)} paid` : 'No payments'}
          </span>
        </div>

        {payments.length > 0 && (
          <div className="space-y-2">
            {payments.map((p) => (
              <Card key={p.id} className="p-3.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-emerald-500/15 flex items-center justify-center flex-shrink-0">
                      <Wallet size={16} className="text-emerald-400" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-white">${Number(p.amount).toFixed(2)}</p>
                      <p className="text-[10px] text-slate-500 capitalize">
                        {p.method}{p.processor ? ` · ${p.processor}` : ''}{p.reference ? ` · ${p.reference}` : ''} · {new Date(p.created_at).toLocaleDateString()}
                        {p.payment_status && p.payment_status !== 'completed' && <span className="text-amber-400"> · {p.payment_status}</span>}
                      </p>
                    </div>
                  </div>
                  <button onClick={() => deletePayment(p.id)} className="w-7 h-7 rounded-lg bg-red-500/10 flex items-center justify-center active:scale-90 transition-transform">
                    <Trash2 size={12} className="text-red-400" />
                  </button>
                </div>
              </Card>
            ))}
          </div>
        )}

        {balanceDue > 0 && (
          <button
            onClick={() => setShowPayment(true)}
            className="w-full bg-emerald-600/10 border border-emerald-600/30 border-dashed rounded-2xl py-3.5 text-sm font-semibold text-emerald-400 active:scale-[0.97] transition-transform flex items-center justify-center gap-2"
          >
            <Plus size={18} /> Record Payment
          </button>
        )}

        {balanceDue <= 0 && woTotal > 0 && (
          <div className="flex items-center gap-2 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
            <CheckCircle2 size={16} className="text-emerald-400" />
            <p className="text-xs font-semibold text-emerald-300">Paid in full</p>
          </div>
        )}
      </div>

      {showAddPart && (
        <AddPartModal onClose={() => setShowAddPart(false)} onAdd={addPart} />
      )}

      {showAISuggestions && (
        <AISuggestedPartsModal
          vehicle={vehicle}
          onClose={() => setShowAISuggestions(false)}
          onAddAll={addAISuggestedParts}
          onConvertToEstimate={convertSuggestionsToEstimate}
          existingPartsCount={parts.length}
        />
      )}

      {showPayment && (
        <AddPaymentModal
          balanceDue={balanceDue}
          onClose={() => setShowPayment(false)}
          onAdd={addPayment}
        />
      )}

      {showSendInvoice && (
        <SendInvoiceModal
          wo={wo}
          customer={customer}
          vehicle={vehicle}
          balanceDue={balanceDue}
          grandTotal={grandTotal}
          onClose={() => setShowSendInvoice(false)}
        />
      )}

      {showPrint && (
        <PrintWorkOrderModal
          wo={wo}
          customer={customer}
          vehicle={vehicle}
          operations={operations}
          parts={parts}
          payments={payments}
          laborSubtotal={laborSubtotal}
          partsSellTotal={partsSellTotal}
          coreChargeTotal={coreChargeTotal}
          taxAmount={taxAmount}
          grandTotal={grandTotal}
          totalPaid={totalPaid}
          balanceDue={balanceDue}
          onClose={() => setShowPrint(false)}
        />
      )}

      {showSearch && (
        <LaborSearchModal
          vehicle={vehicle}
          provider={provider}
          laborRate={laborRate}
          onClose={() => setShowSearch(false)}
          onAdd={addOperation}
        />
      )}
    </>
  );
}

function LaborOpCard({
  op, editing, onEdit, onCancelEdit, onHoursChange, onDelete,
}: {
  op: ShopLaborOp;
  editing: boolean;
  onEdit: () => void;
  onCancelEdit: () => void;
  onHoursChange: (hours: number) => void;
  onDelete: () => void;
}) {
  const [hoursInput, setHoursInput] = useState(String(op.charged_hours));

  const save = () => {
    const h = parseFloat(hoursInput);
    if (!isNaN(h) && h >= 0) onHoursChange(h);
    else onCancelEdit();
  };

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-white">{op.operation_description}</p>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {op.is_ai_estimate ? (
              <Badge color="blue">AI Estimate</Badge>
            ) : (
              <Badge color="slate">{op.data_source}</Badge>
            )}
            {op.confidence && op.is_ai_estimate && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-semibold ${
                op.confidence === 'high' ? 'text-emerald-400 bg-emerald-500/15' :
                op.confidence === 'medium' ? 'text-amber-400 bg-amber-500/15' :
                'text-orange-400 bg-orange-500/15'
              }`}>{op.confidence}</span>
            )}
            {Number(op.book_hours) !== Number(op.charged_hours) && (
              <span className="text-[10px] text-slate-500 font-semibold">
                {op.is_ai_estimate ? 'Est.' : 'Book'}: {Number(op.book_hours).toFixed(2)}h
              </span>
            )}
          </div>
        </div>
        <button onClick={onDelete} className="w-7 h-7 rounded-lg bg-red-500/10 flex items-center justify-center active:scale-90 transition-transform flex-shrink-0">
          <Trash2 size={14} className="text-red-400" />
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-slate-700/40">
        <div>
          <p className="text-[10px] text-slate-500 uppercase font-semibold">Hours</p>
          {editing ? (
            <div className="flex items-center gap-1">
              <input
                type="number" step="0.1" value={hoursInput}
                onChange={(e) => setHoursInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') onCancelEdit(); }}
                autoFocus
                className="w-full bg-slate-900/80 border border-red-500 rounded-lg px-2 py-1 text-sm text-white font-bold focus:outline-none"
              />
            </div>
          ) : (
            <button onClick={onEdit} className="text-left">
              <p className="text-sm font-bold text-white">{Number(op.charged_hours).toFixed(2)}</p>
              <p className="text-[10px] text-red-400">Tap to edit</p>
            </button>
          )}
        </div>
        <div>
          <p className="text-[10px] text-slate-500 uppercase font-semibold">Rate</p>
          <p className="text-sm font-bold text-white">${Number(op.labor_rate).toFixed(0)}</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] text-slate-500 uppercase font-semibold">Total</p>
          <p className="text-sm font-bold text-emerald-400">${Number(op.labor_total).toFixed(2)}</p>
        </div>
      </div>

      {editing && (
        <div className="flex gap-2 mt-2">
          <button onClick={onCancelEdit} className="flex-1 py-1.5 rounded-lg bg-slate-700/50 text-slate-300 text-xs font-semibold">Cancel</button>
          <button onClick={save} className="flex-1 py-1.5 rounded-lg bg-red-600 text-white text-xs font-bold">Save</button>
        </div>
      )}
    </Card>
  );
}

// ===== LABOR SEARCH MODAL =====
function LaborSearchModal({
  vehicle, provider, laborRate, onClose, onAdd,
}: {
  vehicle: ShopVehicle | null;
  provider: ProviderConfig | null;
  laborRate: number;
  onClose: () => void;
  onAdd: (result: LaborResult, searchQuery: string, source: 'book' | 'ai_estimate') => void;
}) {
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<LaborResult[]>([]);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState('');
  const [source, setSource] = useState<'book' | 'ai_estimate'>('book');
  const [overallConfidence, setOverallConfidence] = useState<'high' | 'medium' | 'low'>('high');
  const [overallAssumptions, setOverallAssumptions] = useState<string[]>([]);
  const [expandedAssumptions, setExpandedAssumptions] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const handleSearch = async () => {
    if (!query.trim() || searching) return;
    setSearching(true); setError(''); setResults([]); setSearched(false);

    try {
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/labor-times`;
      const resp = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: query.trim(),
          vehicle: {
            vin: vehicle?.vin ?? undefined,
            year: vehicle?.year ?? '',
            make: vehicle?.make ?? '',
            model: vehicle?.model ?? '',
            engine: vehicle?.engine ?? undefined,
            drivetrain: vehicle?.drivetrain ?? undefined,
          },
        }),
      });

      if (!resp.ok) throw new Error(`Search failed (${resp.status})`);
      const data: LaborSearchResponse = await resp.json();

      if (!data.connected) {
        if (data.source === 'ai_estimate') {
          setSource('ai_estimate');
          setResults(data.results);
          setOverallConfidence(data.confidence ?? 'medium');
          setOverallAssumptions(data.assumptions ?? []);
        } else {
          setError(data.message ?? 'Labor Data Provider Not Connected');
        }
      } else if (data.error) {
        setError(data.error);
      } else {
        setSource(data.source ?? 'book');
        setResults(data.results);
      }
      setSearched(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
      setSearched(true);
    }
    setSearching(false);
  };

  const quickSearches = [
    'Front brakes', 'Rear brakes', 'Alternator', 'Water pump', 'Starter',
    'Front wheel bearing', 'Radiator', 'Transmission R&R', 'Engine R&R',
    'Upper control arm', 'Ball joint',
  ];

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center lg:items-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-fade-in" />
      <div
        className="relative w-full max-w-md lg:max-w-2xl bg-slate-900 rounded-t-3xl lg:rounded-2xl border-t lg:border border-slate-700/50 max-h-[85vh] overflow-y-auto scrollbar-hide animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-slate-900/95 backdrop-blur-xl px-4 pt-4 pb-3 border-b border-slate-800 z-10">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Search size={18} className="text-red-400" />
              <h2 className="text-lg font-bold text-white">Search Labor Times</h2>
            </div>
            <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center">
              <X size={18} className="text-slate-400" />
            </button>
          </div>

          {vehicle && (
            <div className="flex items-center gap-2 mb-3 p-2 bg-slate-800/50 rounded-lg">
              <Car size={14} className="text-amber-400 flex-shrink-0" />
              <p className="text-xs text-slate-400">{vehicle.year} {vehicle.make} {vehicle.model} {vehicle.engine ?? ''}</p>
            </div>
          )}

          <div className="flex gap-2">
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(); }}
              placeholder="e.g. front brakes, alternator..."
              className="flex-1 bg-slate-800/60 border border-slate-700/50 rounded-xl px-3 py-2.5 text-white text-sm placeholder:text-slate-500 focus:border-red-500 focus:outline-none"
            />
            <Button onClick={handleSearch} disabled={searching || !query.trim()} size="md"
              icon={searching ? <Loader2 size={16} className="animate-spin" /> : undefined}>
              {searching ? '' : 'Search'}
            </Button>
          </div>
        </div>

        <div className="p-4 space-y-3">
          {/* Quick search suggestions */}
          {!searched && !searching && results.length === 0 && (
            <div className="space-y-2">
              <p className="text-xs text-slate-500 font-semibold">Quick searches:</p>
              <div className="flex flex-wrap gap-2">
                {quickSearches.map((qs) => (
                  <button key={qs} onClick={() => { setQuery(qs); }}
                    className="px-3 py-1.5 rounded-full bg-slate-800/60 border border-slate-700/50 text-xs text-slate-300 font-medium active:scale-95 transition-transform">
                    {qs}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* AI estimate banner */}
          {searched && source === 'ai_estimate' && results.length > 0 && (
            <div className="space-y-2">
              <div className={`flex items-start gap-2 p-3 rounded-xl border ${
                overallConfidence === 'high' ? 'bg-emerald-500/10 border-emerald-500/20' :
                overallConfidence === 'medium' ? 'bg-amber-500/10 border-amber-500/20' :
                'bg-orange-500/10 border-orange-500/20'
              }`}>
                <Zap size={16} className={`flex-shrink-0 mt-0.5 ${
                  overallConfidence === 'high' ? 'text-emerald-400' :
                  overallConfidence === 'medium' ? 'text-amber-400' : 'text-orange-400'
                }`} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-white">AI-Generated Estimate</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    Confidence: <span className={`font-semibold ${
                      overallConfidence === 'high' ? 'text-emerald-400' :
                      overallConfidence === 'medium' ? 'text-amber-400' : 'text-orange-400'
                    }`}>{overallConfidence}</span> · Not official book times
                  </p>
                  {overallAssumptions.length > 0 && (
                    <button
                      onClick={() => setExpandedAssumptions(expandedAssumptions === '__overall' ? null : '__overall')}
                      className="text-[10px] text-red-400 font-semibold mt-1"
                    >
                      {expandedAssumptions === '__overall' ? 'Hide assumptions' : `View assumptions (${overallAssumptions.length})`}
                    </button>
                  )}
                  {expandedAssumptions === '__overall' && (
                    <ul className="text-[10px] text-slate-400 mt-1 space-y-0.5 pl-3 list-disc">
                      {overallAssumptions.map((a, i) => <li key={i}>{a}</li>)}
                    </ul>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Provider not connected — informational only, search still works via AI */}
          {!provider && !searched && (
            <div className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-xl">
              <Zap size={16} className="text-red-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-red-300">AI estimates active</p>
                <p className="text-[10px] text-slate-400 mt-0.5">No licensed provider connected. Search returns AI-generated estimates with confidence levels. Connect a provider for official book times.</p>
              </div>
            </div>
          )}

          {/* Error */}
          {error && <ErrorBanner text={error} />}

          {/* Searching */}
          {searching && (
            <div className="flex flex-col items-center py-8">
              <Loader2 size={28} className="text-red-400 animate-spin" />
              <p className="text-slate-400 text-sm mt-3">Searching {provider?.provider_name ?? 'labor database'}...</p>
            </div>
          )}

          {/* Results */}
          {searched && !searching && results.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-slate-500 font-semibold">
                {results.length} operations found{provider ? ` · ${provider.provider_name}` : source === 'ai_estimate' ? ' · AI Estimate' : ''}
              </p>
              {results.map((r, i) => (
                <button key={i} onClick={() => onAdd(r, query.trim(), source)}
                  className="w-full text-left bg-slate-800/60 border border-slate-700/50 rounded-xl p-3.5 active:scale-[0.97] transition-transform">
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-white">{r.description}</p>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        {source === 'ai_estimate' ? (
                          <span className="text-xs text-slate-400">Est. {r.bookHours.toFixed(2)} hours</span>
                        ) : (
                          <span className="text-xs text-slate-400">Book time: {r.bookHours.toFixed(2)} hours</span>
                        )}
                        {r.confidence && source === 'ai_estimate' && (
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-semibold ${
                            r.confidence === 'high' ? 'text-emerald-400 bg-emerald-500/15' :
                            r.confidence === 'medium' ? 'text-amber-400 bg-amber-500/15' :
                            'text-orange-400 bg-orange-500/15'
                          }`}>{r.confidence}</span>
                        )}
                      </div>
                      {r.assumptions && r.assumptions.length > 0 && source === 'ai_estimate' && (
                        <button
                          onClick={(e) => { e.stopPropagation(); setExpandedAssumptions(expandedAssumptions === String(i) ? null : String(i)); }}
                          className="text-[10px] text-red-400 font-semibold mt-1"
                        >
                          {expandedAssumptions === String(i) ? 'Hide assumptions' : `Assumptions (${r.assumptions.length})`}
                        </button>
                      )}
                      {expandedAssumptions === String(i) && r.assumptions && (
                        <ul className="text-[10px] text-slate-400 mt-1 space-y-0.5 pl-3 list-disc">
                          {r.assumptions.map((a, ai) => <li key={ai}>{a}</li>)}
                        </ul>
                      )}
                    </div>
                    <div className="text-right flex-shrink-0 ml-3">
                      <p className="text-sm font-bold text-emerald-400">${(r.bookHours * laborRate).toFixed(2)}</p>
                      <p className="text-[10px] text-red-400">Tap to add</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* No results */}
          {searched && !searching && results.length === 0 && !error && (
            <div className="flex flex-col items-center text-center py-6">
              <Search size={28} className="text-slate-700" />
              <p className="text-slate-500 text-sm mt-3">No matching operations found</p>
              <p className="text-slate-600 text-xs mt-1">Try a different search term</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ===== PART CARD =====
function PartCard({
  part, onUpdate, onDelete,
}: {
  part: ShopPart;
  onUpdate: (changes: Partial<ShopPart>) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    description: part.description,
    part_number: part.part_number ?? '',
    cost: String(part.cost),
    markup_percent: String(part.markup_percent),
    supplier: part.supplier ?? '',
    core_charge: String(part.core_charge),
  });

  const save = () => {
    onUpdate({
      description: toTitleCase(form.description),
      part_number: form.part_number || null,
      cost: parseFloat(form.cost) || 0,
      markup_percent: parseFloat(form.markup_percent) || 0,
      supplier: toTitleCase(form.supplier) || null,
      core_charge: parseFloat(form.core_charge) || 0,
    });
    setEditing(false);
  };

  const sellPrice = Number(part.sell_price);
  const lineTotal = sellPrice + Number(part.core_charge);

  return (
    <Card className={`p-4 ${part.is_ai_suggested ? 'border-amber-500/30' : ''}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-bold text-white truncate">{part.description}</p>
            {part.is_ai_suggested && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-md font-semibold text-amber-400 bg-amber-500/15 flex items-center gap-1 flex-shrink-0">
                <Sparkles size={8} /> AI
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {part.part_number && <span className="text-[10px] text-slate-500 font-mono">#{part.part_number}</span>}
            {part.supplier && <span className="text-[10px] text-slate-500">{part.supplier}</span>}
            <button
              onClick={() => onUpdate({ in_stock: !part.in_stock })}
              className={`text-[10px] px-1.5 py-0.5 rounded-md font-semibold transition-colors ${
                part.in_stock ? 'text-emerald-400 bg-emerald-500/15' : 'text-slate-400 bg-slate-700/40'
              }`}
            >
              {part.in_stock ? 'In Stock' : 'Out'}
            </button>
            <button
              onClick={() => onUpdate({ is_taxable: !part.is_taxable })}
              className={`text-[10px] px-1.5 py-0.5 rounded-md font-semibold transition-colors ${
                part.is_taxable ? 'text-red-400 bg-red-500/15' : 'text-slate-400 bg-slate-700/40'
              }`}
            >
              {part.is_taxable ? 'Taxable' : 'Non-Tax'}
            </button>
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button onClick={() => setEditing(!editing)} className="w-7 h-7 rounded-lg bg-slate-700/40 flex items-center justify-center active:scale-90 transition-transform">
            <Pencil size={12} className="text-slate-400" />
          </button>
          <button onClick={onDelete} className="w-7 h-7 rounded-lg bg-red-500/10 flex items-center justify-center active:scale-90 transition-transform">
            <Trash2 size={14} className="text-red-400" />
          </button>
        </div>
      </div>

      {!editing ? (
        <div className="grid grid-cols-4 gap-2 mt-3 pt-3 border-t border-slate-700/40">
          <div>
            <p className="text-[10px] text-slate-500 uppercase font-semibold">Cost</p>
            <p className="text-sm font-bold text-white">${Number(part.cost).toFixed(2)}</p>
          </div>
          <div>
            <p className="text-[10px] text-slate-500 uppercase font-semibold">Markup</p>
            <p className="text-sm font-bold text-white">{Number(part.markup_percent).toFixed(0)}%</p>
          </div>
          <div>
            <p className="text-[10px] text-slate-500 uppercase font-semibold">Sale Price</p>
            <p className="text-sm font-bold text-white">${sellPrice.toFixed(2)}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] text-slate-500 uppercase font-semibold">Total</p>
            <p className="text-sm font-bold text-emerald-400">${lineTotal.toFixed(2)}</p>
          </div>
        </div>
      ) : (
        <div className="mt-3 pt-3 border-t border-slate-700/40 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <Field label="Description" value={form.description} onChange={(v) => setForm({ ...form, description: v })} />
            <Field label="Part Number" value={form.part_number} onChange={(v) => setForm({ ...form, part_number: v })} />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Field label="Cost ($)" value={form.cost} onChange={(v) => setForm({ ...form, cost: v })} type="number" />
            <Field label="Markup (%)" value={form.markup_percent} onChange={(v) => setForm({ ...form, markup_percent: v })} type="number" />
            <Field label="Core ($)" value={form.core_charge} onChange={(v) => setForm({ ...form, core_charge: v })} type="number" />
          </div>
          <Field label="Supplier" value={form.supplier} onChange={(v) => setForm({ ...form, supplier: v })} />
          <div className="flex gap-2">
            <button onClick={() => setEditing(false)} className="flex-1 py-2 rounded-lg bg-slate-700/50 text-slate-300 text-xs font-semibold">Cancel</button>
            <button onClick={save} className="flex-1 py-2 rounded-lg bg-red-600 text-white text-xs font-bold">Save</button>
          </div>
        </div>
      )}
    </Card>
  );
}

function Field({ label, value, onChange, type = 'text' }: {
  label: string; value: string; onChange: (v: string) => void; type?: string;
}) {
  return (
    <div>
      <p className="text-[10px] text-slate-500 uppercase font-semibold mb-1">{label}</p>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-slate-900/80 border border-slate-700/50 rounded-lg px-2.5 py-2 text-sm text-white focus:border-red-500 focus:outline-none"
      />
    </div>
  );
}

// ===== ADD PART MODAL =====
function AddPartModal({ onClose, onAdd }: {
  onClose: () => void;
  onAdd: (part: {
    part_number?: string; description: string; cost: number; markup_percent: number;
    supplier?: string; core_charge?: number; is_taxable?: boolean; in_stock?: boolean;
  }) => void;
}) {
  const [form, setForm] = useState({
    description: '', part_number: '', cost: '', markup_percent: '30',
    supplier: '', core_charge: '0',
  });
  const [isTaxable, setIsTaxable] = useState(true);
  const [inStock, setInStock] = useState(false);

  const handleAdd = () => {
    if (!form.description.trim() || !form.cost) return;
    onAdd({
      description: toTitleCase(form.description.trim()),
      part_number: form.part_number || undefined,
      cost: parseFloat(form.cost) || 0,
      markup_percent: parseFloat(form.markup_percent) || 0,
      supplier: toTitleCase(form.supplier) || undefined,
      core_charge: parseFloat(form.core_charge) || 0,
      is_taxable: isTaxable,
      in_stock: inStock,
    });
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center lg:items-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-fade-in" />
      <div
        className="relative w-full max-w-md bg-slate-900 rounded-t-3xl lg:rounded-2xl border-t lg:border border-slate-700/50 max-h-[85vh] overflow-y-auto scrollbar-hide animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-slate-900/95 backdrop-blur-xl px-4 pt-4 pb-3 border-b border-slate-800 z-10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Package size={18} className="text-red-400" />
              <h2 className="text-lg font-bold text-white">Add Part</h2>
            </div>
            <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center">
              <X size={18} className="text-slate-400" />
            </button>
          </div>
        </div>

        <div className="p-4 space-y-3">
          <Field label="Description" value={form.description} onChange={(v) => setForm({ ...form, description: v })} />
          <div className="grid grid-cols-2 gap-2">
            <Field label="Part Number" value={form.part_number} onChange={(v) => setForm({ ...form, part_number: v })} />
            <Field label="Supplier" value={form.supplier} onChange={(v) => setForm({ ...form, supplier: v })} />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Field label="Cost ($)" value={form.cost} onChange={(v) => setForm({ ...form, cost: v })} type="number" />
            <Field label="Markup (%)" value={form.markup_percent} onChange={(v) => setForm({ ...form, markup_percent: v })} type="number" />
            <Field label="Core ($)" value={form.core_charge} onChange={(v) => setForm({ ...form, core_charge: v })} type="number" />
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => setIsTaxable(!isTaxable)}
              className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                isTaxable ? 'bg-red-600 text-white' : 'bg-slate-800/60 text-slate-400 border border-slate-700/50'
              }`}
            >
              {isTaxable ? 'Taxable' : 'Non-Taxable'}
            </button>
            <button
              onClick={() => setInStock(!inStock)}
              className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                inStock ? 'bg-emerald-600 text-white' : 'bg-slate-800/60 text-slate-400 border border-slate-700/50'
              }`}
            >
              {inStock ? 'In Stock' : 'Out of Stock'}
            </button>
          </div>

          {form.cost && form.markup_percent && (
            <div className="p-3 bg-slate-800/50 rounded-xl flex items-center justify-between">
              <span className="text-xs text-slate-400">Sell price:</span>
              <span className="text-lg font-bold text-emerald-400">
                ${((parseFloat(form.cost) || 0) * (1 + (parseFloat(form.markup_percent) || 0) / 100)).toFixed(2)}
              </span>
            </div>
          )}

          <Button onClick={handleAdd} size="lg" className="w-full" disabled={!form.description.trim() || !form.cost}>
            <Plus size={18} /> Add Part
          </Button>
        </div>
      </div>
    </div>
  );
}

// ===== AI SUGGESTED PARTS MODAL =====
function AISuggestedPartsModal({
  vehicle, onClose, onAddAll, onConvertToEstimate, existingPartsCount,
}: {
  vehicle: ShopVehicle | null;
  onClose: () => void;
  onAddAll: (suggestions: AIPartSuggestion[]) => void;
  onConvertToEstimate: (suggestions: AIPartSuggestion[]) => void;
  existingPartsCount: number;
}) {
  const [repairType, setRepairType] = useState('');
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<AIPartSuggestion[]>([]);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [message, setMessage] = useState('');

  const handleSearch = async () => {
    if (!repairType.trim() || loading) return;
    setLoading(true); setError(''); setSuggestions([]); setSearched(false); setSelected(new Set()); setMessage('');

    try {
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/suggest-parts`;
      const resp = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          vehicle: {
            year: vehicle?.year ?? '',
            make: vehicle?.make ?? '',
            model: vehicle?.model ?? '',
            engine: vehicle?.engine ?? '',
            drivetrain: vehicle?.drivetrain ?? '',
            body_style: vehicle?.body_style ?? '',
          },
          repairType: repairType.trim(),
        }),
      });

      if (!resp.ok) throw new Error(`Request failed (${resp.status})`);
      const data: PartSuggestionResponse = await resp.json();

      if (!data.suggestions || data.suggestions.length === 0) {
        setError('No suggestions found. Try a different repair type.');
      } else {
        setSuggestions(data.suggestions);
        setMessage(data.message ?? '');
        setSelected(new Set(data.suggestions.map((_, i) => i)));
      }
      setSearched(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to get suggestions');
      setSearched(true);
    }
    setLoading(false);
  };

  const toggleSelect = (i: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i); else next.add(i);
      return next;
    });
  };

  const selectedSuggestions = suggestions.filter((_, i) => selected.has(i));
  const selectedTotal = selectedSuggestions.reduce((s, p) => s + p.estimated_cost * 1.3, 0);

  const quickRepairs = ['Front brakes', 'Rear brakes', 'Alternator', 'Water pump', 'Starter', 'Wheel bearing', 'Radiator', 'Oil change', 'Tune up', 'Ball joint', 'Suspension'];

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center lg:items-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-fade-in" />
      <div
        className="relative w-full max-w-md lg:max-w-2xl bg-slate-900 rounded-t-3xl lg:rounded-2xl border-t lg:border border-slate-700/50 max-h-[85vh] overflow-y-auto scrollbar-hide animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-slate-900/95 backdrop-blur-xl px-4 pt-4 pb-3 border-b border-slate-800 z-10">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Sparkles size={18} className="text-amber-400" />
              <h2 className="text-lg font-bold text-white">AI Suggested Parts</h2>
            </div>
            <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center">
              <X size={18} className="text-slate-400" />
            </button>
          </div>

          {vehicle && (
            <div className="flex items-center gap-2 mb-3 p-2 bg-slate-800/50 rounded-lg">
              <Car size={14} className="text-amber-400 flex-shrink-0" />
              <p className="text-xs text-slate-400">{vehicle.year} {vehicle.make} {vehicle.model} {vehicle.engine ?? ''}</p>
            </div>
          )}

          <div className="flex gap-2">
            <input
              value={repairType}
              onChange={(e) => setRepairType(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(); }}
              placeholder="e.g. front brakes, alternator..."
              className="flex-1 bg-slate-800/60 border border-slate-700/50 rounded-xl px-3 py-2.5 text-white text-sm placeholder:text-slate-500 focus:border-amber-500 focus:outline-none"
            />
            <Button onClick={handleSearch} disabled={loading || !repairType.trim()} size="md"
              icon={loading ? <Loader2 size={16} className="animate-spin" /> : undefined}>
              {loading ? '' : 'Suggest'}
            </Button>
          </div>
        </div>

        <div className="p-4 space-y-3">
          {!searched && !loading && suggestions.length === 0 && (
            <div className="space-y-2">
              <div className="flex items-start gap-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                <Sparkles size={16} className="text-amber-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-bold text-amber-300">AI Parts Suggestions</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">Enter a repair type to get commonly replaced parts with estimated costs. Prices are estimates — always verify with your supplier. Manual override is always allowed after adding.</p>
                </div>
              </div>
              <p className="text-xs text-slate-500 font-semibold">Quick repair types:</p>
              <div className="flex flex-wrap gap-2">
                {quickRepairs.map((qr) => (
                  <button key={qr} onClick={() => setRepairType(qr)}
                    className="px-3 py-1.5 rounded-full bg-slate-800/60 border border-slate-700/50 text-xs text-slate-300 font-medium active:scale-95 transition-transform">
                    {qr}
                  </button>
                ))}
              </div>
            </div>
          )}

          {error && <ErrorBanner text={error} />}

          {loading && (
            <div className="flex flex-col items-center py-8">
              <Loader2 size={28} className="text-amber-400 animate-spin" />
              <p className="text-slate-400 text-sm mt-3">Analyzing repair type and vehicle...</p>
            </div>
          )}

          {searched && !loading && suggestions.length > 0 && (
            <>
              {message && (
                <div className="flex items-start gap-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                  <Sparkles size={14} className="text-amber-400 flex-shrink-0 mt-0.5" />
                  <p className="text-[10px] text-amber-300">{message}</p>
                </div>
              )}

              <div className="space-y-2">
                {suggestions.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => toggleSelect(i)}
                    className={`w-full text-left rounded-xl p-3.5 border transition-all active:scale-[0.97] ${
                      selected.has(i)
                        ? 'bg-amber-500/10 border-amber-500/30'
                        : 'bg-slate-800/60 border-slate-700/50 opacity-50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 ${
                          selected.has(i) ? 'bg-amber-500 border-amber-500' : 'border-slate-600'
                        }`}>
                          {selected.has(i) && <Check size={12} className="text-slate-900" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-white truncate">{s.description}</p>
                          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                            <span className="text-[10px] text-slate-500 font-mono">#{s.part_number}</span>
                            <span className="text-[10px] text-slate-500">{s.supplier}</span>
                            {s.core_charge > 0 && <span className="text-[10px] text-slate-500">Core: ${s.core_charge}</span>}
                          </div>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-sm font-bold text-emerald-400">${(s.estimated_cost * 1.3).toFixed(2)}</p>
                        <p className="text-[10px] text-slate-500">est. ${s.estimated_cost.toFixed(2)} +30%</p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>

              {selectedSuggestions.length > 0 && (
                <div className="sticky bottom-0 bg-slate-900/95 backdrop-blur-xl -mx-4 px-4 py-3 border-t border-slate-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-400">{selectedSuggestions.length} parts selected</span>
                    <span className="text-lg font-bold text-emerald-400">${selectedTotal.toFixed(2)}</span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => onAddAll(selectedSuggestions)}
                      className="flex-1 py-3 rounded-xl bg-slate-800/80 border border-slate-700/50 text-white text-sm font-bold active:scale-[0.97] transition-transform flex items-center justify-center gap-2"
                    >
                      <Plus size={16} /> Add Selected Parts
                    </button>
                    <button
                      onClick={() => onConvertToEstimate(selectedSuggestions)}
                      className="flex-1 py-3 rounded-xl bg-amber-600 text-white text-sm font-bold active:scale-[0.97] transition-transform flex items-center justify-center gap-2 shadow-lg shadow-amber-600/20"
                    >
                      <FileText size={16} /> Convert to Estimate
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {searched && !loading && suggestions.length === 0 && !error && (
            <div className="flex flex-col items-center text-center py-6">
              <Package size={28} className="text-slate-700" />
              <p className="text-slate-500 text-sm mt-3">No parts suggestions found</p>
              <p className="text-slate-600 text-xs mt-1">Try a different repair type</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ===== CUSTOMERS MANAGEMENT =====
function CustomersManagement({ customers, onBack, onChanged }: {
  customers: ShopCustomer[];
  onBack: () => void;
  onChanged: () => void;
}) {
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ first_name: '', last_name: '', phone: '', email: '', address: '' });
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState('');

  const handleAdd = async () => {
    if (saving || !form.first_name) return;
    setSaving(true);
    await supabase.from('shop_customers').insert({
      first_name: toTitleCase(form.first_name), last_name: toTitleCase(form.last_name),
      phone: form.phone || null, email: form.email || null, address: toTitleCase(form.address) || null,
    });
    setSaving(false); setShowAdd(false);
    setForm({ first_name: '', last_name: '', phone: '', email: '', address: '' });
    onChanged();
  };

  const filtered = customers.filter((c) => {
    const q = query.toLowerCase();
    return !q || `${c.first_name} ${c.last_name}`.toLowerCase().includes(q) || (c.phone ?? '').includes(q);
  });

  return (
    <>
      <div className="flex items-center gap-2">
        <button onClick={onBack} className="text-slate-400"><ChevronLeft size={20} /></button>
        <h1 className="text-xl font-bold text-white">Customers</h1>
      </div>

      <Button onClick={() => setShowAdd(true)} className="w-full" icon={<Plus size={18} />}>Add Customer</Button>

      {showAdd && (
        <Card className="p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <FormField label="First Name" value={form.first_name} onChange={(v) => setForm({ ...form, first_name: v })} placeholder="John" />
            <FormField label="Last Name" value={form.last_name} onChange={(v) => setForm({ ...form, last_name: v })} placeholder="Smith" />
          </div>
          <FormField label="Phone" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} placeholder="555-1234" />
          <FormField label="Email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} placeholder="john@email.com" />
          <FormField label="Address" value={form.address} onChange={(v) => setForm({ ...form, address: v })} placeholder="123 Main St" />
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setShowAdd(false)} className="flex-1">Cancel</Button>
            <Button onClick={handleAdd} disabled={saving || !form.first_name} className="flex-1"
              icon={saving ? <Loader2 size={16} className="animate-spin" /> : undefined}>Add</Button>
          </div>
        </Card>
      )}

      <SearchBar value={query} onChange={setQuery} placeholder="Search customers..." />

      {filtered.length === 0 ? (
        <EmptyState text="No customers yet" />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((c) => (
            <Card key={c.id} className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-red-500/15 flex items-center justify-center flex-shrink-0">
                  <User size={18} className="text-red-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-white">{c.first_name} {c.last_name}</p>
                  <p className="text-xs text-slate-500">{c.phone ?? 'No phone'} · {c.email ?? 'No email'}</p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}

// ===== PROVIDER SETUP =====
function ProviderSetup({ provider, onBack, onChanged }: { provider: ProviderConfig | null; onBack: () => void; onChanged: () => void; }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    provider_name: '', api_base_url: '', api_key: '', api_secret: '', cache_allowed: true,
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (saving || !form.provider_name) return;
    setSaving(true);
    // Deactivate any existing active config
    await supabase.from('shop_labor_provider_config').update({ is_active: false }).eq('is_active', true);
    // Insert new config — credentials stored server-side, only accessed by edge function
    await supabase.from('shop_labor_provider_config').insert({
      provider_name: form.provider_name,
      api_base_url: form.api_base_url || null,
      api_key_encrypted: form.api_key || null,
      api_secret_encrypted: form.api_secret || null,
      is_active: true,
      cache_allowed: form.cache_allowed,
    });
    setSaving(false); setShowForm(false);
    setForm({ provider_name: '', api_base_url: '', api_key: '', api_secret: '', cache_allowed: true });
    onChanged();
  };

  const handleDisconnect = async () => {
    if (!provider) return;
    const providerId = provider.id;
    await supabase.from('shop_labor_provider_config').update({ is_active: false }).eq('id', providerId);
    onChanged();
  };

  return (
    <>
      <div className="flex items-center gap-2">
        <button onClick={onBack} className="text-slate-400"><ChevronLeft size={20} /></button>
        <h1 className="text-xl font-bold text-white">Labor Data Provider</h1>
      </div>

      <div className="flex items-center gap-3 p-3 bg-red-500/10 border border-red-500/20 rounded-xl">
        <ShieldAlert size={16} className="text-red-400 flex-shrink-0" />
        <p className="text-xs text-red-300">API credentials are stored securely on the server and never exposed in the browser. Only managers can configure providers.</p>
      </div>

      {provider && !showForm && (
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-emerald-500/15 flex items-center justify-center flex-shrink-0">
              <CheckCircle2 size={24} className="text-emerald-400" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold text-white">{provider?.provider_name}</p>
              <p className="text-xs text-slate-500">Active · {provider?.cache_allowed ? 'Caching enabled' : 'No caching'}</p>
            </div>
          </div>
          <div className="flex gap-2 mt-3 pt-3 border-t border-slate-700/40">
            <Button variant="secondary" size="sm" onClick={() => setShowForm(true)} className="flex-1">Change Provider</Button>
            <Button variant="danger" size="sm" onClick={handleDisconnect} className="flex-1">Disconnect</Button>
          </div>
        </Card>
      )}

      {showForm && (
        <Card className="p-4 space-y-3">
          <h3 className="text-sm font-bold text-white">Connect Labor Data Provider</h3>
          <div>
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide block mb-1.5">Provider Name</label>
            <select value={form.provider_name} onChange={(e) => setForm({ ...form, provider_name: e.target.value })}
              className="w-full bg-slate-900/80 border border-slate-700/50 rounded-xl px-3 py-2.5 text-white text-sm">
              <option value="">Select provider...</option>
              <option value="Mitchell1">Mitchell1 ProDemand</option>
              <option value="Alldata">ALLDATA</option>
              <option value="Chilton">Chilton</option>
              <option value="Custom">Custom / Other</option>
            </select>
          </div>
          <FormField label="API Base URL" value={form.api_base_url} onChange={(v) => setForm({ ...form, api_base_url: v })} placeholder="https://api.provider.com" />
          <FormField label="API Key" value={form.api_key} onChange={(v) => setForm({ ...form, api_key: v })} placeholder="Stored securely on server" />
          <FormField label="API Secret (optional)" value={form.api_secret} onChange={(v) => setForm({ ...form, api_secret: v })} placeholder="Stored securely on server" />
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.cache_allowed} onChange={(e) => setForm({ ...form, cache_allowed: e.target.checked })}
              className="w-4 h-4 rounded accent-red-600" />
            <span className="text-xs text-slate-400">Allow caching of labor results (check provider licensing)</span>
          </label>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setShowForm(false)} className="flex-1">Cancel</Button>
            <Button onClick={handleSave} disabled={saving || !form.provider_name} className="flex-1"
              icon={saving ? <Loader2 size={16} className="animate-spin" /> : undefined}>Connect</Button>
          </div>
        </Card>
      )}

      {!provider && !showForm && (
        <div className="flex flex-col items-center text-center py-8">
          <ShieldAlert size={36} className="text-amber-400" />
          <p className="text-sm font-bold text-amber-300 mt-3">No Provider Connected</p>
          <p className="text-xs text-slate-500 mt-1 max-w-xs">Connect an automotive labor-time API to enable real book time searches on work orders.</p>
          <Button onClick={() => setShowForm(true)} className="mt-4" icon={<KeyRound size={18} />}>Connect Provider</Button>
        </div>
      )}

      <div className="space-y-2">
        <p className="text-xs text-slate-500 font-semibold">Supported Providers:</p>
        {['Mitchell1 ProDemand', 'ALLDATA', 'Chilton', 'Custom API'].map((p) => (
          <div key={p} className="flex items-center gap-3 px-3 py-2.5 bg-slate-800/40 rounded-xl">
            <Building2 size={16} className="text-slate-500" />
            <span className="text-sm text-slate-400">{p}</span>
            <ExternalLink size={14} className="text-slate-600 ml-auto" />
          </div>
        ))}
      </div>
    </>
  );
}

// ===== SHOP SETTINGS =====
function ShopSettingsView({ settings, provider, onBack, onSave, onProviderChanged, onPaymentSettings }: {
  settings: ShopSettings | null;
  provider: ProviderConfig | null;
  onBack: () => void;
  onSave: (rate: number, tax: number) => void;
  onProviderChanged: () => void;
  onPaymentSettings: () => void;
}) {
  const [rate, setRate] = useState(String(settings?.labor_rate ?? 185));
  const [tax, setTax] = useState(String((settings?.tax_rate ?? 0) * 100));
  const [saving, setSaving] = useState(false);
  const [showIntegrations, setShowIntegrations] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    onSave(parseFloat(rate) || 185, (parseFloat(tax) || 0) / 100);
    setSaving(false);
  };

  if (showIntegrations) {
    return (
      <ProviderSetup
        provider={provider}
        onBack={() => setShowIntegrations(false)}
        onChanged={onProviderChanged}
      />
    );
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <button onClick={onBack} className="text-slate-400"><ChevronLeft size={20} /></button>
        <h1 className="text-xl font-bold text-white">Shop Settings</h1>
      </div>

      <Card className="p-4 space-y-4">
        <div>
          <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide block mb-1.5">Labor Rate ($/hour)</label>
          <input type="number" step="0.01" value={rate} onChange={(e) => setRate(e.target.value)}
            className="w-full bg-slate-900/80 border border-slate-700/50 rounded-xl px-3 py-3 text-white text-lg font-bold focus:border-red-500 focus:outline-none" />
          <p className="text-xs text-slate-500 mt-1">Default: $185/hour. Used for all labor calculations.</p>
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide block mb-1.5">Tax Rate (%)</label>
          <input type="number" step="0.01" value={tax} onChange={(e) => setTax(e.target.value)}
            className="w-full bg-slate-900/80 border border-slate-700/50 rounded-xl px-3 py-3 text-white text-lg font-bold focus:border-red-500 focus:outline-none" />
          <p className="text-xs text-slate-500 mt-1">Sales tax percentage applied to work order totals.</p>
        </div>
        <Button onClick={handleSave} size="lg" className="w-full" disabled={saving}
          icon={saving ? <Loader2 size={20} className="animate-spin" /> : <Check size={20} />}>
          {saving ? 'Saving...' : 'Save Settings'}
        </Button>
      </Card>

      {/* INTEGRATIONS */}
      <div>
        <h2 className="text-sm font-bold text-white flex items-center gap-2 mb-3">
          <Plug size={16} className="text-cyan-400" />
          Integrations
        </h2>
      </div>

      <Card onClick={() => setShowIntegrations(true)} className="p-4 flex items-center gap-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
          provider ? 'bg-emerald-500/15' : 'bg-slate-600/30'
        }`}>
          {provider ? <CheckCircle2 size={20} className="text-emerald-400" /> : <KeyRound size={20} className="text-slate-400" />}
        </div>
        <div className="flex-1">
          <p className="text-sm font-bold text-white">Labor Data Provider</p>
          <p className="text-xs text-slate-500">
            {provider ? `${provider.provider_name} connected` : 'Not connected — using AI estimates'}
          </p>
        </div>
        <ChevronRight size={18} className="text-slate-600" />
      </Card>

      {/* PAYMENTS */}
      <div>
        <h2 className="text-sm font-bold text-white flex items-center gap-2 mb-3">
          <CreditCard size={16} className="text-emerald-400" />
          Payments
        </h2>
      </div>

      <Card onClick={onPaymentSettings} className="p-4 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-emerald-500/15 flex items-center justify-center flex-shrink-0">
          <CreditCard size={20} className="text-emerald-400" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-bold text-white">Payment Processing</p>
          <p className="text-xs text-slate-500">Square, PayPal & Cash App settings</p>
        </div>
        <ChevronRight size={18} className="text-slate-600" />
      </Card>
    </>
  );
}


// ===== ADD PAYMENT MODAL =====
function AddPaymentModal({ balanceDue, onClose, onAdd }: {
  balanceDue: number;
  onClose: () => void;
  onAdd: (amount: number, method: string, reference: string, notes: string) => void;
}) {
  const [amount, setAmount] = useState(String(balanceDue.toFixed(2)));
  const [method, setMethod] = useState('cash');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');

  const methods = [
    { id: 'cash', label: 'Cash', icon: Wallet },
    { id: 'card', label: 'Card', icon: CreditCard },
    { id: 'check', label: 'Check', icon: Receipt },
    { id: 'transfer', label: 'Transfer', icon: ArrowRight },
    { id: 'other', label: 'Other', icon: DollarSign },
  ];

  const handleAdd = () => {
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) return;
    onAdd(amt, method, reference, notes);
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center lg:items-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-fade-in" />
      <div
        className="relative w-full max-w-md bg-slate-900 rounded-t-3xl lg:rounded-2xl border-t lg:border border-slate-700/50 max-h-[85vh] overflow-y-auto scrollbar-hide animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-slate-900/95 backdrop-blur-xl px-4 pt-4 pb-3 border-b border-slate-800 z-10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CreditCard size={18} className="text-emerald-400" />
              <h2 className="text-lg font-bold text-white">Record Payment</h2>
            </div>
            <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center">
              <X size={18} className="text-slate-400" />
            </button>
          </div>
        </div>

        <div className="p-4 space-y-3">
          <div className="p-3 bg-slate-800/50 rounded-xl flex items-center justify-between">
            <span className="text-xs text-slate-400">Balance Due:</span>
            <span className="text-lg font-bold text-red-400">${balanceDue.toFixed(2)}</span>
          </div>

          <div>
            <p className="text-[10px] text-slate-500 uppercase font-semibold mb-1">Amount ($)</p>
            <input
              type="number" step="0.01" value={amount}
              onChange={(e) => setAmount(e.target.value)}
              autoFocus
              className="w-full bg-slate-900/80 border border-slate-700/50 rounded-xl px-3 py-3 text-white text-lg font-bold focus:border-emerald-500 focus:outline-none"
            />
          </div>

          <div>
            <p className="text-[10px] text-slate-500 uppercase font-semibold mb-1.5">Payment Method</p>
            <div className="grid grid-cols-3 gap-2">
              {methods.map((m) => {
                const Icon = m.icon;
                return (
                  <button
                    key={m.id}
                    onClick={() => setMethod(m.id)}
                    className={`flex flex-col items-center gap-1 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                      method === m.id
                        ? 'bg-emerald-600 text-white'
                        : 'bg-slate-800/60 text-slate-400 border border-slate-700/50'
                    }`}
                  >
                    <Icon size={16} />
                    {m.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <p className="text-[10px] text-slate-500 uppercase font-semibold mb-1">Reference (check #, transaction ID)</p>
            <input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="Optional"
              className="w-full bg-slate-900/80 border border-slate-700/50 rounded-lg px-3 py-2.5 text-white text-sm placeholder:text-slate-600 focus:border-emerald-500 focus:outline-none"
            />
          </div>

          <div>
            <p className="text-[10px] text-slate-500 uppercase font-semibold mb-1">Notes</p>
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional"
              className="w-full bg-slate-900/80 border border-slate-700/50 rounded-lg px-3 py-2.5 text-white text-sm placeholder:text-slate-600 focus:border-emerald-500 focus:outline-none"
            />
          </div>

          <Button onClick={handleAdd} size="lg" className="w-full bg-emerald-600 active:bg-emerald-700 shadow-emerald-600/20"
            disabled={!amount || parseFloat(amount) <= 0}
            icon={<Check size={18} />}>
            Record Payment
          </Button>
        </div>
      </div>
    </div>
  );
}

// ===== PRINT WORK ORDER MODAL =====
function PrintWorkOrderModal({
  wo, customer, vehicle, operations, parts, payments,
  laborSubtotal, partsSellTotal, coreChargeTotal, taxAmount,
  grandTotal, totalPaid, balanceDue, onClose,
}: {
  wo: ShopWorkOrder;
  customer: ShopCustomer | null;
  vehicle: ShopVehicle | null;
  operations: ShopLaborOp[];
  parts: ShopPart[];
  payments: ShopPayment[];
  laborSubtotal: number;
  partsSellTotal: number;
  coreChargeTotal: number;
  taxAmount: number;
  grandTotal: number;
  totalPaid: number;
  balanceDue: number;
  onClose: () => void;
}) {
  const printRef = useRef<HTMLDivElement>(null);
  const [emailAddr, setEmailAddr] = useState(customer?.email ?? '');
  const [phoneNum, setPhoneNum] = useState(customer?.phone ?? '');
  const [sending, setSending] = useState<'email' | 'text' | null>(null);
  const [sendStatus, setSendStatus] = useState('');

  const handlePrint = () => {
    window.print();
  };

  const handleSavePDF = () => {
    // Use browser's print dialog which allows "Save as PDF"
    window.print();
  };

  const handleSendEmail = async () => {
    if (!emailAddr.trim()) return;
    setSending('email');
    setSendStatus('');
    // Generate mailto link with work order summary
    const subject = `Work Order ${wo.work_order_number} - Estimate`;
    const body = `Dear ${customer?.first_name ?? ''} ${customer?.last_name ?? ''},

Please find your work order summary below:

Work Order: ${wo.work_order_number}
Date: ${new Date(wo.created_at).toLocaleDateString()}

Vehicle: ${vehicle?.year ?? ''} ${vehicle?.make ?? ''} ${vehicle?.model ?? ''}

LABOR:
${operations.map((op) => `  - ${op.operation_description}: ${Number(op.charged_hours).toFixed(2)} hrs @ $${Number(op.labor_rate).toFixed(0)}/hr = $${Number(op.labor_total).toFixed(2)}`).join('\n')}

PARTS:
${parts.map((p) => `  - ${p.description}: $${Number(p.sell_price).toFixed(2)}`).join('\n')}

Labor Subtotal: $${laborSubtotal.toFixed(2)}
Parts Subtotal: $${partsSellTotal.toFixed(2)}
${coreChargeTotal > 0 ? `Core Charges: $${coreChargeTotal.toFixed(2)}\n` : ''}${taxAmount > 0 ? `Tax: $${taxAmount.toFixed(2)}\n` : ''}Grand Total: $${grandTotal.toFixed(2)}
${totalPaid > 0 ? `Payments: $${totalPaid.toFixed(2)}\nBalance Due: $${balanceDue.toFixed(2)}` : ''}

Thank you for your business!`;

    const mailto = `mailto:${emailAddr}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.location.href = mailto;
    setSendStatus('Email app opened');
    setSending(null);
  };

  const handleSendText = async () => {
    if (!phoneNum.trim()) return;
    setSending('text');
    setSendStatus('');
    const body = `Work Order ${wo.work_order_number}: Total $${grandTotal.toFixed(2)}${balanceDue > 0 ? `, Balance Due: $${balanceDue.toFixed(2)}` : ''}. Vehicle: ${vehicle?.year ?? ''} ${vehicle?.make ?? ''} ${vehicle?.model ?? ''}. Thank you!`;
    const sms = `sms:${phoneNum.replace(/[^0-9]/g, '')}?body=${encodeURIComponent(body)}`;
    window.location.href = sms;
    setSendStatus('Text app opened');
    setSending(null);
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center lg:items-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm animate-fade-in" />
      <div
        className="relative w-full max-w-2xl bg-slate-900 rounded-t-3xl lg:rounded-2xl border-t lg:border border-slate-700/50 max-h-[90vh] overflow-y-auto scrollbar-hide animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-slate-900/95 backdrop-blur-xl px-4 pt-4 pb-3 border-b border-slate-800 z-10 print-hide">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Printer size={18} className="text-red-400" />
              <h2 className="text-lg font-bold text-white">Print Work Order</h2>
            </div>
            <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center">
              <X size={18} className="text-slate-400" />
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <button onClick={handlePrint} className="flex flex-col items-center gap-1 py-3 rounded-xl bg-red-600 text-white text-xs font-bold active:scale-95 transition-transform">
              <Printer size={18} /> Print
            </button>
            <button onClick={handleSavePDF} className="flex flex-col items-center gap-1 py-3 rounded-xl bg-slate-700 text-white text-xs font-bold active:scale-95 transition-transform">
              <FileText size={18} /> Save PDF
            </button>
            <button onClick={handleSendEmail} disabled={sending !== null} className="flex flex-col items-center gap-1 py-3 rounded-xl bg-emerald-600 text-white text-xs font-bold active:scale-95 transition-transform">
              <Mail size={18} /> Email
            </button>
            <button onClick={handleSendText} disabled={sending !== null} className="flex flex-col items-center gap-1 py-3 rounded-xl bg-cyan-600 text-white text-xs font-bold active:scale-95 transition-transform">
              <MessageSquare size={18} /> Text
            </button>
          </div>

          {sendStatus && (
            <p className="text-xs text-emerald-400 font-semibold mt-2 text-center">{sendStatus}</p>
          )}
        </div>

        {/* Print preview - letter sized */}
        <div className="p-4 print-hide">
          <p className="text-xs text-slate-500 font-semibold mb-2">Preview:</p>
        </div>

        <div ref={printRef} className="print-area bg-white text-black mx-auto mb-4" style={{ maxWidth: '8.5in', padding: '0.75in' }}>
          <div className="border-b-2 border-black pb-4 mb-6">
            <div className="flex items-start justify-between">
              <div>
                <h1 className="text-2xl font-bold">Wolf Point Auto</h1>
                <p className="text-sm text-gray-600 mt-1">123 Main Street · Wolf Point, MT 59201</p>
                <p className="text-sm text-gray-600">(406) 555-0100</p>
              </div>
              <div className="text-right">
                <h2 className="text-xl font-bold">WORK ORDER</h2>
                <p className="text-sm font-semibold mt-1">{wo.work_order_number}</p>
                <p className="text-xs text-gray-500">{new Date(wo.created_at).toLocaleDateString()}</p>
                <p className="text-xs font-bold mt-1 uppercase">{WO_WORKFLOW.find((w) => w.id === wo.status)?.label ?? wo.status}</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6 mb-6">
            <div>
              <p className="text-xs font-bold uppercase text-gray-500 border-b border-gray-300 pb-1 mb-2">Customer</p>
              {customer && (
                <>
                  <p className="text-sm font-semibold">{customer.first_name} {customer.last_name}</p>
                  {customer.phone && <p className="text-xs text-gray-600">{customer.phone}</p>}
                  {customer.email && <p className="text-xs text-gray-600">{customer.email}</p>}
                  {customer.address && <p className="text-xs text-gray-600">{customer.address}</p>}
                </>
              )}
            </div>
            <div>
              <p className="text-xs font-bold uppercase text-gray-500 border-b border-gray-300 pb-1 mb-2">Vehicle</p>
              {vehicle && (
                <>
                  <p className="text-sm font-semibold">{vehicle.year} {vehicle.make} {vehicle.model}</p>
                  {vehicle.vin && <p className="text-xs text-gray-600">VIN: {vehicle.vin}</p>}
                  {vehicle.engine && <p className="text-xs text-gray-600">Engine: {vehicle.engine}</p>}
                  {vehicle.mileage ? <p className="text-xs text-gray-600">Mileage: {vehicle.mileage.toLocaleString()}</p> : null}
                </>
              )}
            </div>
          </div>

          {operations.length > 0 && (
            <div className="mb-6">
              <p className="text-xs font-bold uppercase text-gray-500 border-b border-gray-300 pb-1 mb-2">Labor</p>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-300">
                    <th className="text-left py-1.5 font-bold">Description</th>
                    <th className="text-right py-1.5 font-bold w-16">Hours</th>
                    <th className="text-right py-1.5 font-bold w-16">Rate</th>
                    <th className="text-right py-1.5 font-bold w-20">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {operations.map((op) => (
                    <tr key={op.id} className="border-b border-gray-100">
                      <td className="py-1.5">{op.operation_description}</td>
                      <td className="text-right py-1.5">{Number(op.charged_hours).toFixed(2)}</td>
                      <td className="text-right py-1.5">${Number(op.labor_rate).toFixed(0)}</td>
                      <td className="text-right py-1.5 font-semibold">${Number(op.labor_total).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {parts.length > 0 && (
            <div className="mb-6">
              <p className="text-xs font-bold uppercase text-gray-500 border-b border-gray-300 pb-1 mb-2">Parts</p>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-300">
                    <th className="text-left py-1.5 font-bold">Description</th>
                    <th className="text-left py-1.5 font-bold w-24">Part #</th>
                    <th className="text-right py-1.5 font-bold w-20">Price</th>
                    {coreChargeTotal > 0 && <th className="text-right py-1.5 font-bold w-16">Core</th>}
                  </tr>
                </thead>
                <tbody>
                  {parts.map((p) => (
                    <tr key={p.id} className="border-b border-gray-100">
                      <td className="py-1.5">{p.description}</td>
                      <td className="py-1.5 text-gray-600">{p.part_number ?? '—'}</td>
                      <td className="text-right py-1.5 font-semibold">${Number(p.sell_price).toFixed(2)}</td>
                      {coreChargeTotal > 0 && <td className="text-right py-1.5">{Number(p.core_charge) > 0 ? `$${Number(p.core_charge).toFixed(2)}` : '—'}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex justify-end mb-6">
            <div className="w-64 space-y-1">
              <div className="flex justify-between text-xs">
                <span>Labor Subtotal:</span>
                <span className="font-semibold">${laborSubtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span>Parts Subtotal:</span>
                <span className="font-semibold">${partsSellTotal.toFixed(2)}</span>
              </div>
              {coreChargeTotal > 0 && (
                <div className="flex justify-between text-xs">
                  <span>Core Charges:</span>
                  <span className="font-semibold">${coreChargeTotal.toFixed(2)}</span>
                </div>
              )}
              {taxAmount > 0 && (
                <div className="flex justify-between text-xs">
                  <span>Tax:</span>
                  <span className="font-semibold">${taxAmount.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm font-bold border-t-2 border-black pt-2">
                <span>Grand Total:</span>
                <span>${grandTotal.toFixed(2)}</span>
              </div>
              {totalPaid > 0 && (
                <>
                  <div className="flex justify-between text-xs">
                    <span>Payments:</span>
                    <span className="font-semibold">${totalPaid.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm font-bold border-t border-gray-400 pt-1">
                    <span>Balance Due:</span>
                    <span>${balanceDue.toFixed(2)}</span>
                  </div>
                </>
              )}
            </div>
          </div>

          {payments.length > 0 && (
            <div className="mb-6">
              <p className="text-xs font-bold uppercase text-gray-500 border-b border-gray-300 pb-1 mb-2">Payment History</p>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-300">
                    <th className="text-left py-1.5 font-bold">Date</th>
                    <th className="text-left py-1.5 font-bold">Method</th>
                    <th className="text-left py-1.5 font-bold">Reference</th>
                    <th className="text-right py-1.5 font-bold">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((p) => (
                    <tr key={p.id} className="border-b border-gray-100">
                      <td className="py-1.5">{new Date(p.created_at).toLocaleDateString()}</td>
                      <td className="py-1.5 capitalize">{p.method}</td>
                      <td className="py-1.5">{p.reference ?? '—'}</td>
                      <td className="text-right py-1.5 font-semibold">${Number(p.amount).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="border-t border-gray-300 pt-4">
            <p className="text-xs text-gray-500">
              Thank you for your business. All work is guaranteed for 12 months or 12,000 miles, whichever comes first.
            </p>
          </div>
        </div>

        {/* Email/text input area */}
        <div className="p-4 border-t border-slate-800 print-hide">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <p className="text-[10px] text-slate-500 uppercase font-semibold mb-1">Email to</p>
              <input value={emailAddr} onChange={(e) => setEmailAddr(e.target.value)} placeholder="customer@email.com"
                className="w-full bg-slate-800/60 border border-slate-700/50 rounded-lg px-3 py-2 text-white text-sm focus:border-emerald-500 focus:outline-none" />
            </div>
            <div>
              <p className="text-[10px] text-slate-500 uppercase font-semibold mb-1">Text to</p>
              <input value={phoneNum} onChange={(e) => setPhoneNum(e.target.value)} placeholder="555-1234"
                className="w-full bg-slate-800/60 border border-slate-700/50 rounded-lg px-3 py-2 text-white text-sm focus:border-cyan-500 focus:outline-none" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


// ===== SEND INVOICE MODAL =====
function SendInvoiceModal({
  wo, customer, vehicle, balanceDue, grandTotal, onClose,
}: {
  wo: ShopWorkOrder;
  customer: ShopCustomer | null;
  vehicle: ShopVehicle | null;
  balanceDue: number;
  grandTotal: number;
  onClose: () => void;
}) {
  const [token, setToken] = useState<string | null>(null);
  const [creating, setCreating] = useState(true);
  const [emailAddr, setEmailAddr] = useState(customer?.email ?? '');
  const [phoneNum, setPhoneNum] = useState(customer?.phone ?? '');
  const [copied, setCopied] = useState(false);
  const [sendStatus, setSendStatus] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/invoice-portal`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ work_order_id: wo.id }),
        });
        if (!resp.ok) throw new Error('Failed to create invoice link');
        const data = await resp.json();
        setToken(data.token);
      } catch {
        setSendStatus('Failed to create invoice link');
      }
      setCreating(false);
    })();
  }, [wo.id]);

  const invoiceUrl = token ? `${window.location.origin}/pay/invoice/${token}` : '';

  const handleCopyLink = async () => {
    if (!invoiceUrl) return;
    try {
      await navigator.clipboard.writeText(invoiceUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setSendStatus('Could not copy automatically — select and copy manually');
    }
  };

  const handleSendEmail = () => {
    if (!emailAddr.trim() || !invoiceUrl) return;
    const subject = `Invoice ${wo.work_order_number} from Wolf Point Auto`;
    const body = `Dear ${customer?.first_name ?? ''} ${customer?.last_name ?? ''},

You have an invoice from Wolf Point Auto:

Invoice: ${wo.work_order_number}
${vehicle ? `Vehicle: ${vehicle.year ?? ''} ${vehicle.make ?? ''} ${vehicle.model ?? ''}` : ''}
Total: $${grandTotal.toFixed(2)}
${balanceDue > 0 ? `Balance Due: $${balanceDue.toFixed(2)}` : 'Status: Paid in Full'}

To view your invoice and make a payment online, click here:
${invoiceUrl}

Thank you for your business!

Wolf Point Auto
(406) 555-0100`;
    window.location.href = `mailto:${emailAddr}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    setSendStatus('Email app opened');
  };

  const handleSendText = () => {
    if (!phoneNum.trim() || !invoiceUrl) return;
    const body = `Wolf Point Auto - Invoice ${wo.work_order_number}. ${balanceDue > 0 ? `Balance Due: $${balanceDue.toFixed(2)}. ` : ''}View & pay: ${invoiceUrl}`;
    window.location.href = `sms:${phoneNum.replace(/[^0-9]/g, '')}?body=${encodeURIComponent(body)}`;
    setSendStatus('Text app opened');
  };

  const handleMarkInvoiced = async () => {
    await supabase.from('shop_work_orders').update({
      status: 'invoiced',
      invoice_date: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', wo.id);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center lg:items-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm animate-fade-in" />
      <div
        className="relative w-full max-w-md bg-slate-900 rounded-t-3xl lg:rounded-2xl border-t lg:border border-slate-700/50 max-h-[90vh] overflow-y-auto scrollbar-hide animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-slate-900/95 backdrop-blur-xl px-4 pt-4 pb-3 border-b border-slate-800 z-10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Send size={18} className="text-red-400" />
              <h2 className="text-lg font-bold text-white">Send Invoice</h2>
            </div>
            <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center">
              <X size={18} className="text-slate-400" />
            </button>
          </div>
        </div>

        <div className="p-4 space-y-4">
          {creating ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 size={24} className="text-red-400 animate-spin" />
              <span className="text-sm text-slate-400 ml-2">Creating secure invoice link...</span>
            </div>
          ) : token ? (
            <>
              {/* Invoice info */}
              <div className="p-3 bg-slate-800/50 rounded-xl space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-500">Invoice</span>
                  <span className="text-sm font-bold text-white">{wo.work_order_number}</span>
                </div>
                {vehicle && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-500">Vehicle</span>
                    <span className="text-sm font-semibold text-white">{vehicle.year} {vehicle.make} {vehicle.model}</span>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-500">Total</span>
                  <span className="text-sm font-bold text-white">${grandTotal.toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-500">Balance Due</span>
                  <span className={`text-sm font-bold ${balanceDue > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                    ${balanceDue.toFixed(2)}
                  </span>
                </div>
              </div>

              {/* Payment link */}
              <div>
                <p className="text-[10px] text-slate-500 uppercase font-semibold mb-1.5">Secure Payment Link</p>
                <div className="flex items-center gap-2">
                  <input
                    readOnly value={invoiceUrl}
                    className="flex-1 bg-slate-950 border border-slate-700/50 rounded-lg px-3 py-2 text-xs text-slate-400 font-mono truncate"
                  />
                  <button
                    onClick={handleCopyLink}
                    className="w-9 h-9 rounded-lg bg-slate-800 border border-slate-700/50 flex items-center justify-center flex-shrink-0 active:scale-90 transition-transform"
                  >
                    {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} className="text-slate-400" />}
                  </button>
                </div>
                {copied && <p className="text-[10px] text-emerald-400 mt-1">Copied to clipboard!</p>}
              </div>

              {/* Send options */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={handleSendEmail}
                  disabled={!emailAddr.trim()}
                  className="flex flex-col items-center gap-1.5 py-3 rounded-xl bg-emerald-600 text-white text-xs font-bold disabled:opacity-40 active:scale-95 transition-transform"
                >
                  <Mail size={18} /> Email
                </button>
                <button
                  onClick={handleSendText}
                  disabled={!phoneNum.trim()}
                  className="flex flex-col items-center gap-1.5 py-3 rounded-xl bg-cyan-600 text-white text-xs font-bold disabled:opacity-40 active:scale-95 transition-transform"
                >
                  <MessageSquare size={18} /> Text
                </button>
              </div>

              {sendStatus && (
                <p className="text-xs text-emerald-400 font-semibold text-center">{sendStatus}</p>
              )}

              {/* Email/phone inputs */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="text-[10px] text-slate-500 uppercase font-semibold mb-1">Email to</p>
                  <input value={emailAddr} onChange={(e) => setEmailAddr(e.target.value)} placeholder="customer@email.com"
                    className="w-full bg-slate-800/60 border border-slate-700/50 rounded-lg px-3 py-2 text-white text-sm focus:border-emerald-500 focus:outline-none" />
                </div>
                <div>
                  <p className="text-[10px] text-slate-500 uppercase font-semibold mb-1">Text to</p>
                  <input value={phoneNum} onChange={(e) => setPhoneNum(e.target.value)} placeholder="555-1234"
                    className="w-full bg-slate-800/60 border border-slate-700/50 rounded-lg px-3 py-2 text-white text-sm focus:border-cyan-500 focus:outline-none" />
                </div>
              </div>

              <Button onClick={handleMarkInvoiced} size="lg" className="w-full" icon={<Check size={20} />}>
                Mark as Invoiced
              </Button>
              <p className="text-[10px] text-slate-600 text-center">
                The customer can view their invoice and pay online without logging in.
              </p>
            </>
          ) : (
            <div className="text-center py-8">
              <AlertCircle size={24} className="text-red-400 mx-auto mb-2" />
              <p className="text-sm text-red-300">{sendStatus || 'Failed to create invoice link'}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ===== SHARED COMPONENTS =====
function LoadingSpinner() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[40vh]">
      <div className="w-12 h-12 border-4 border-red-500/30 border-t-red-500 rounded-full animate-spin" />
      <p className="text-slate-400 text-sm mt-4">Loading...</p>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center text-center py-12">
      <Car size={40} className="text-slate-700" strokeWidth={1.5} />
      <p className="text-slate-500 text-sm mt-3">{text}</p>
    </div>
  );
}

function SearchBar({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="relative">
      <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="w-full bg-slate-800/60 border border-slate-700/50 rounded-xl pl-11 pr-4 py-3 text-white text-sm placeholder:text-slate-500 focus:border-red-500 focus:outline-none transition-all" />
    </div>
  );
}

function FormField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide block mb-1.5">{label}</label>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="w-full bg-slate-900/80 border border-slate-700/50 rounded-xl px-3 py-2.5 text-white text-sm placeholder:text-slate-600 focus:border-red-500 focus:outline-none transition-all" />
    </div>
  );
}

function ErrorBanner({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2.5 bg-red-500/10 border border-red-500/20 rounded-xl">
      <AlertCircle size={16} className="text-red-400 flex-shrink-0" />
      <p className="text-red-300 text-sm">{text}</p>
    </div>
  );
}

function TotalRow({ label, value, highlight, large }: { label: string; value: string; highlight?: boolean; large?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className={`${large ? 'text-sm font-bold text-white' : 'text-xs text-slate-500'}`}>{label}</span>
      <span className={`${large ? 'text-lg font-bold text-emerald-400' : highlight ? 'text-sm font-bold text-amber-400' : 'text-sm font-semibold text-white'}`}>{value}</span>
    </div>
  );
}

// ===== VIN SCANNER =====
function VinScannerCamera({ onScan, onManualEntry }: { onScan: (vin: string) => void; onManualEntry: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [cameraState, setCameraState] = useState<'idle' | 'starting' | 'active' | 'error' | 'unsupported'>('idle');
  const [manualVin, setManualVin] = useState('');
  const [showManual, setShowManual] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);
  const scanLoopRef = useRef(false);
  const lastScannedRef = useRef('');
  const lastScanTimeRef = useRef(0);

  const stopCamera = useCallback(() => {
    scanLoopRef.current = false;
    if (streamRef.current) { streamRef.current.getTracks().forEach((t) => t.stop()); streamRef.current = null; }
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraState('idle');
  }, []);

  useEffect(() => () => { stopCamera(); }, [stopCamera]);

  const startCamera = useCallback(async () => {
    setCameraState('starting');
    const hasBD = typeof window !== 'undefined' && 'BarcodeDetector' in window;
    if (!hasBD || !navigator.mediaDevices) {
      setCameraState('unsupported'); setShowManual(true); return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
      streamRef.current = stream;
      if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play(); }
      setCameraState('active');
      const Detector = (window as unknown as { BarcodeDetector: new (o: { formats: string[] }) => { detect: () => Promise<{ rawValue: string }[]> } }).BarcodeDetector;
      const detector = new Detector({ formats: ['code_39', 'code_128', 'ean_13', 'code_39_vin'] });
      scanLoopRef.current = true;
      const loop = async () => {
        if (!scanLoopRef.current || !videoRef.current) return;
        try {
          const barcodes = await detector.detect();
          if (barcodes.length > 0) {
            const raw = barcodes[0].rawValue.trim().toUpperCase();
            if (raw.length >= 17 && /^[A-HJ-NPR-Z0-9]{17}$/i.test(raw)) {
              const now = Date.now();
              if (raw !== lastScannedRef.current || now - lastScanTimeRef.current > 3000) {
                lastScannedRef.current = raw; lastScanTimeRef.current = now;
                stopCamera(); onScan(raw); return;
              }
            }
          }
        } catch { /* expected */ }
        if (scanLoopRef.current) requestAnimationFrame(loop);
      };
      loop();
    } catch {
      setCameraState('error'); setShowManual(true);
    }
  }, [onScan, stopCamera]);

  const handleManualSubmit = () => {
    const v = manualVin.trim().toUpperCase();
    if (v.length >= 17) { stopCamera(); onScan(v); }
  };

  return (
    <Card className="p-6 flex flex-col items-center text-center space-y-4">
      {cameraState === 'active' && (
        <div className="relative w-full h-48 rounded-2xl overflow-hidden bg-black border-2 border-red-500/40">
          <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
          <div className="absolute inset-x-4 h-0.5 bg-red-500 animate-pulse" style={{ top: '50%' }} />
          <button onClick={stopCamera} className="absolute top-3 right-3 w-9 h-9 rounded-full bg-black/60 flex items-center justify-center">
            <CameraOff size={18} className="text-white" />
          </button>
        </div>
      )}
      {cameraState === 'starting' && (
        <div className="w-full h-48 rounded-2xl bg-slate-900/80 border-2 border-dashed border-red-500/40 flex flex-col items-center justify-center">
          <Loader2 size={28} className="text-red-400 animate-spin" />
          <p className="text-slate-400 text-sm mt-3">Starting camera...</p>
        </div>
      )}
      {(cameraState === 'idle' || cameraState === 'error' || cameraState === 'unsupported') && (
        <div className="w-full h-40 rounded-2xl bg-slate-900/80 border-2 border-dashed border-red-500/40 flex flex-col items-center justify-center">
          <ScanLine size={40} className="text-red-500/60" strokeWidth={1.5} />
          <p className="text-slate-400 text-sm mt-4 max-w-xs">
            {cameraState === 'unsupported' ? 'Camera scanning not supported' : cameraState === 'error' ? 'Camera unavailable. Try again or enter VIN manually.' : 'Tap below to scan the VIN barcode'}
          </p>
        </div>
      )}
      {cameraState === 'idle' && (
        <Button onClick={startCamera} className="w-full" icon={<ScanLine size={18} />}>Open Camera Scanner</Button>
      )}
      {cameraState === 'error' && (
        <Button onClick={startCamera} variant="secondary" className="w-full" icon={<ScanLine size={18} />}>Retry Camera</Button>
      )}
      {showManual && (
        <div className="w-full space-y-2 pt-2 border-t border-slate-700/40">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide text-left">Manual VIN Entry</p>
          <div className="flex gap-2">
            <input value={manualVin} onChange={(e) => setManualVin(e.target.value.toUpperCase())}
              placeholder="17-character VIN" maxLength={17}
              className="flex-1 bg-slate-900/80 border border-slate-700/50 rounded-xl px-3 py-3 text-white text-sm font-mono tracking-wider placeholder:text-slate-600 focus:border-red-500 focus:outline-none text-center" />
            <Button onClick={handleManualSubmit} disabled={manualVin.length < 17}>Decode</Button>
          </div>
        </div>
      )}
      {!showManual && cameraState !== 'active' && (
        <button onClick={onManualEntry} className="text-red-400 text-sm font-semibold">Enter VIN manually instead</button>
      )}
    </Card>
  );
}
