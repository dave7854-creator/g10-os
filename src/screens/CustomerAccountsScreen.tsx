import { useState, useEffect, useCallback } from 'react';
import {
  ChevronLeft, Search, Plus, User, Mail, Phone, Car, FileText, DollarSign,
  X, Loader2, Check, ShieldCheck, ShieldOff, Send, KeyRound, Pencil,
  AlertCircle, Clock, CreditCard, Truck, Package, Link2, CarFront,
} from 'lucide-react';
import { Card, Badge, Button } from '@/components/ui';
import { toTitleCase } from '@/utils/textCase';
import type { Screen } from '@/types';
import type { AppEmployee } from '@/components/AppLock';
import {
  managerListCustomers, managerGetCustomer, managerCreateCustomer,
  managerUpdateCustomer, managerEnablePortal, managerDisablePortal,
  managerSendInvite, managerSendPasswordReset,
  managerDuplicateCheck, managerLinkTowing, managerLinkInquiry,
  managerAddVehicle, managerLinkVehicle,
  managerCreateLogin, managerSetPassword, managerChangeUsername,
  type ManagerCustomer, type ManagerCustomerDetail,
} from '@/shop/managerApi';

interface CustomerAccountsScreenProps {
  onNavigate: (s: Screen) => void;
  employee: AppEmployee;
}

export function CustomerAccountsScreen({ onNavigate, employee }: CustomerAccountsScreenProps) {
  const [customers, setCustomers] = useState<ManagerCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedCustomer, setSelectedCustomer] = useState<ManagerCustomerDetail | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await managerListCustomers(employee.id);
      setCustomers(data);
    } catch (err: any) {
      setActionMessage({ type: 'error', text: `Unable to load customers: ${err.message || 'Unknown error'}` });
    }
    setLoading(false);
  }, [employee.id]);

  useEffect(() => { loadData(); }, [loadData]);

  const openCustomer = async (c: ManagerCustomer) => {
    try {
      const detail = await managerGetCustomer(employee.id, c.id);
      setSelectedCustomer(detail);
    } catch (err: any) {
      setActionMessage({ type: 'error', text: `Failed to load customer details: ${err.message || 'Unknown error'}` });
    }
  };

  const handleAction = async (fn: () => Promise<{ success: boolean; error?: string; message?: string }>, successMsg: string) => {
    setActionLoading(true);
    setActionMessage(null);
    try {
      const result = await fn();
      if (result.success) {
        setActionMessage({ type: 'success', text: result.message || successMsg });
        if (selectedCustomer) {
          try {
            const detail = await managerGetCustomer(employee.id, selectedCustomer.customer.id);
            setSelectedCustomer(detail);
          } catch {}
        }
        loadData();
      } else {
        setActionMessage({ type: 'error', text: result.error || 'Action failed' });
      }
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err.message || 'An unexpected error occurred' });
    } finally {
      setActionLoading(false);
    }
  };

  const filtered = customers.filter((c) => {
    const matchesStatus = statusFilter === 'all' || c.portal_status === statusFilter;
    const q = query.toLowerCase();
    const matchesQuery = !q ||
      `${c.first_name} ${c.last_name}`.toLowerCase().includes(q) ||
      (c.phone ?? '').includes(q) ||
      (c.email ?? '').toLowerCase().includes(q) ||
      (c.vehicles ?? []).some(v => (v.vin ?? '').toLowerCase().includes(q));
    return matchesStatus && matchesQuery;
  });

  const statusOptions = [
    { id: 'all', label: 'All' },
    { id: 'none', label: 'No Portal' },
    { id: 'setup_incomplete', label: 'Setup Incomplete' },
    { id: 'active', label: 'Active' },
    { id: 'disabled', label: 'Disabled' },
  ];

  // ===== CUSTOMER DETAIL VIEW =====
  if (selectedCustomer) {
    return (
      <CustomerDetail
        detail={selectedCustomer}
        employeeId={employee.id}
        onBack={() => { setSelectedCustomer(null); loadData(); }}
        onAction={handleAction}
        actionLoading={actionLoading}
        actionMessage={actionMessage}
        onClearMessage={() => setActionMessage(null)}
      />
    );
  }

  // ===== ADD CUSTOMER FORM =====
  if (showAdd) {
    return (
      <AddCustomerForm
        employeeId={employee.id}
        onBack={() => setShowAdd(false)}
        onCreated={() => { setShowAdd(false); loadData(); }}
      />
    );
  }

  // ===== LIST VIEW =====
  return (
    <div className="px-4 pt-14 pb-nav-safe lg:px-8 lg:pt-8 space-y-5 animate-fade-in">
      <button onClick={() => onNavigate('home')} className="flex items-center gap-1 text-slate-400 text-sm -ml-1 lg:hidden">
        <ChevronLeft size={18} /> Back
      </button>

      <div className="flex items-center gap-2">
        <User size={24} className="text-cyan-400" />
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-white">Customer Accounts</h1>
          <p className="text-slate-400 text-sm mt-0.5">Manage customers & portal access</p>
        </div>
        <Button onClick={() => setShowAdd(true)} size="sm" icon={<Plus size={16} />}>Add</Button>
      </div>

      {actionMessage && (
        <div className={`flex items-center gap-2 p-3 rounded-xl text-sm ${
          actionMessage.type === 'success'
            ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-300'
            : 'bg-red-500/10 border border-red-500/20 text-red-300'
        }`}>
          <AlertCircle size={16} className="flex-shrink-0" />
          <span className="flex-1">{actionMessage.text}</span>
          <button onClick={() => setActionMessage(null)}><X size={14} /></button>
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name, phone, email, or VIN..."
          className="w-full bg-slate-900/80 border border-slate-700/50 rounded-xl pl-10 pr-4 py-2.5 text-white text-sm placeholder-slate-600 focus:border-cyan-500 focus:outline-none"
        />
      </div>

      {/* Status filter chips */}
      <div className="flex gap-1.5 overflow-x-auto scrollbar-hide -mx-1 px-1 pb-1">
        {statusOptions.map((f) => (
          <button
            key={f.id}
            onClick={() => setStatusFilter(f.id)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all ${
              statusFilter === f.id
                ? 'bg-cyan-600 text-white'
                : 'bg-slate-800/60 text-slate-400 border border-slate-700/50'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 size={24} className="text-slate-500 animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center text-center py-12">
          <User size={40} className="text-slate-700" strokeWidth={1.5} />
          <p className="text-slate-500 text-sm mt-3">No customers found</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((c) => (
            <Card key={c.id} onClick={() => openCustomer(c)} className="p-4">
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-cyan-500/15 flex items-center justify-center flex-shrink-0">
                    <User size={18} className="text-cyan-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-white truncate">{c.first_name} {c.last_name}</p>
                    <p className="text-xs text-slate-500 truncate">{c.phone ?? 'No phone'}</p>
                  </div>
                </div>
                <PortalStatusBadge status={c.portal_status} />
              </div>
              <div className="space-y-1">
                {c.email && (
                  <p className="text-xs text-slate-500 flex items-center gap-1.5 truncate">
                    <Mail size={12} className="flex-shrink-0" /> {c.email}
                  </p>
                )}
                {c.vehicles.length > 0 && (
                  <p className="text-xs text-slate-500 flex items-center gap-1.5">
                    <Car size={12} className="flex-shrink-0" /> {c.vehicles.length} vehicle{c.vehicles.length > 1 ? 's' : ''}
                    {c.vehicles[0]?.vin && <span className="text-slate-600">· {c.vehicles[0].vin.slice(0, 8)}...</span>}
                  </p>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ===== PORTAL STATUS BADGE =====
function PortalStatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; color: string }> = {
    none: { label: 'No Portal', color: 'bg-slate-600/20 text-slate-400 border-slate-600/30' },
    active: { label: 'Active', color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20' },
    disabled: { label: 'Disabled', color: 'bg-red-500/15 text-red-400 border-red-500/20' },
    setup_incomplete: { label: 'Setup Incomplete', color: 'bg-amber-500/15 text-amber-400 border-amber-500/20' },
  };
  const c = config[status] || config.none;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border whitespace-nowrap ${c.color}`}>
      {status === 'active' && <ShieldCheck size={10} />}
      {status === 'disabled' && <ShieldOff size={10} />}
      {c.label}
    </span>
  );
}

// ===== CUSTOMER DETAIL =====
function CustomerDetail({
  detail, employeeId, onBack, onAction, actionLoading, actionMessage, onClearMessage,
}: {
  detail: ManagerCustomerDetail;
  employeeId: string;
  onBack: () => void;
  onAction: (fn: () => Promise<any>, msg: string) => void;
  actionLoading: boolean;
  actionMessage: { type: 'success' | 'error'; text: string } | null;
  onClearMessage: () => void;
}) {
  const { customer, portal_link, vehicles, workOrders, payments, towing, unlinkedTowing, inquiries } = detail;
  const [editing, setEditing] = useState(false);
  const [showAddVehicle, setShowAddVehicle] = useState(false);
  const [showCreateLogin, setShowCreateLogin] = useState(false);
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [showChangeUsername, setShowChangeUsername] = useState(false);
  const [form, setForm] = useState({
    first_name: customer.first_name,
    last_name: customer.last_name,
    phone: customer.phone ?? '',
    email: customer.email ?? '',
    address: customer.address ?? '',
  });
  const [editUsername, setEditUsername] = useState(portal_link?.username || '');
  const [editPassword, setEditPassword] = useState('');
  const [editConfirmPassword, setEditConfirmPassword] = useState('');

  const estimates = workOrders.filter((w: any) => w.status === 'estimate');
  const activeRepairs = workOrders.filter((w: any) => ['approved', 'in_progress', 'waiting_parts'].includes(w.status));
  const invoices = workOrders.filter((w: any) => ['invoiced', 'partially_paid', 'paid'].includes(w.status));
  const balanceDue = invoices.reduce((sum: number, inv: any) => sum + Number(inv.balance_due || 0), 0);
  const totalPaid = payments.reduce((sum: number, p: any) => sum + Number(p.amount || 0), 0);

  const handleSave = async () => {
    await onAction(
      () => managerUpdateCustomer(employeeId, customer.id, form),
      'Customer updated',
    );
    setEditing(false);
  };

  const portalStatus = portal_link
    ? (portal_link.portal_status === 'disabled' ? 'disabled' : !portal_link.setup_complete ? 'setup_incomplete' : 'active')
    : 'none';

  return (
    <div className="px-4 pt-14 pb-nav-safe lg:px-8 lg:pt-8 space-y-5 animate-fade-in">
      <button onClick={onBack} className="flex items-center gap-1 text-slate-400 text-sm -ml-1">
        <ChevronLeft size={18} /> Back to Customers
      </button>

      {actionMessage && (
        <div className={`flex items-center gap-2 p-3 rounded-xl text-sm ${
          actionMessage.type === 'success'
            ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-300'
            : 'bg-red-500/10 border border-red-500/20 text-red-300'
        }`}>
          <AlertCircle size={16} className="flex-shrink-0" />
          <span className="flex-1">{actionMessage.text}</span>
          <button onClick={onClearMessage}><X size={14} /></button>
        </div>
      )}

      {/* Customer header */}
      <div className="flex items-start gap-3">
        <div className="w-14 h-14 rounded-2xl bg-cyan-500/15 flex items-center justify-center flex-shrink-0">
          <User size={28} className="text-cyan-400" />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-white">{customer.first_name} {customer.last_name}</h1>
          <div className="flex items-center gap-2 mt-1">
            <PortalStatusBadge status={portalStatus} />
            {portal_link?.last_login_at && (
              <span className="text-xs text-slate-500 flex items-center gap-1">
                <Clock size={10} /> Last login: {new Date(portal_link.last_login_at).toLocaleDateString()}
              </span>
            )}
          </div>
        </div>
        <Button variant="secondary" size="sm" onClick={() => setEditing(!editing)} icon={<Pencil size={14} />}>
          {editing ? 'Cancel' : 'Edit'}
        </Button>
      </div>

      {/* Customer info / edit form */}
      {editing ? (
        <Card className="p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <FormField label="First Name" value={form.first_name} onChange={(v) => setForm({ ...form, first_name: v })} />
            <FormField label="Last Name" value={form.last_name} onChange={(v) => setForm({ ...form, last_name: v })} />
          </div>
          <FormField label="Phone" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} />
          <FormField label="Email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} />
          <FormField label="Address" value={form.address} onChange={(v) => setForm({ ...form, address: v })} />

          <div className="pt-2 border-t border-slate-700/40">
            <p className="text-xs font-semibold text-cyan-400 uppercase tracking-wide mb-3">Portal Login</p>
            <FormField label="Username" value={editUsername} onChange={(v) => setEditUsername(v.toLowerCase().replace(/[^a-z0-9_.-]/g, ''))} placeholder="john.doe" />
            <div className="mt-3">
              <FormField label="New Password" type="password" value={editPassword} onChange={setEditPassword} placeholder="Leave blank to keep current" />
            </div>
            <div className="mt-3">
              <FormField label="Confirm Password" type="password" value={editConfirmPassword} onChange={setEditConfirmPassword} placeholder="Re-enter new password" />
            </div>
            {portal_link && (
              <div className="mt-3">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setShowResetPassword(true)}
                  disabled={actionLoading}
                  icon={<KeyRound size={14} />}
                >
                  Reset Password
                </Button>
              </div>
            )}
          </div>

          <Button onClick={handleSave} disabled={actionLoading} className="w-full"
            icon={actionLoading ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}>
            Save Changes
          </Button>
        </Card>
      ) : (
        <Card className="p-4 space-y-2">
          <InfoRow icon={<Phone size={14} />} label="Phone" value={customer.phone || '—'} />
          <InfoRow icon={<Mail size={14} />} label="Email" value={customer.email || '—'} />
          <InfoRow icon={<User size={14} />} label="Address" value={customer.address || '—'} />
        </Card>
      )}

      {/* Portal access controls */}
      <div>
        <h2 className="text-sm font-bold text-white flex items-center gap-2 mb-3">
          <ShieldCheck size={16} className="text-cyan-400" /> Portal Access
        </h2>
        <Card className="p-4 space-y-3">
          {portalStatus === 'none' && (
            <div className="flex items-center gap-3 p-3 bg-slate-800/40 rounded-xl">
              <ShieldOff size={20} className="text-slate-500 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-slate-300">No portal account</p>
                <p className="text-xs text-slate-500">Enable portal access to let this customer log in</p>
              </div>
            </div>
          )}

          {portalStatus === 'setup_incomplete' && (
            <div className="flex items-center gap-3 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl">
              <AlertCircle size={20} className="text-amber-400 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-amber-300">Setup incomplete</p>
                <p className="text-xs text-slate-500">Customer hasn't completed their account setup yet</p>
              </div>
            </div>
          )}

          {portalStatus === 'active' && (
            <div className="flex items-center gap-3 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
              <ShieldCheck size={20} className="text-emerald-400 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-emerald-300">Portal active</p>
                <p className="text-xs text-slate-500">Customer can sign in with email + password</p>
              </div>
            </div>
          )}

          {portalStatus === 'disabled' && (
            <div className="flex items-center gap-3 p-3 bg-red-500/10 border border-red-500/20 rounded-xl">
              <ShieldOff size={20} className="text-red-400 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-red-300">Portal disabled</p>
                <p className="text-xs text-slate-500">Customer cannot sign in. Data is preserved.</p>
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {portalStatus === 'none' && (
              <>
                <Button
                  onClick={() => setShowCreateLogin(true)}
                  disabled={actionLoading}
                  icon={<KeyRound size={14} />}
                >
                  Create Customer Login
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => onAction(
                    () => managerEnablePortal(employeeId, customer.id, customer.email || undefined),
                    'Portal invite sent',
                  )}
                  disabled={actionLoading || !customer.email}
                  icon={<Send size={14} />}
                >
                  Send Email Invite
                </Button>
              </>
            )}

            {portalStatus === 'setup_incomplete' && (
              <>
                <Button
                  onClick={() => setShowCreateLogin(true)}
                  disabled={actionLoading}
                  icon={<KeyRound size={14} />}
                >
                  Set Login Credentials
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => onAction(
                    () => managerSendInvite(employeeId, customer.id),
                    'Invitation resent',
                  )}
                  disabled={actionLoading}
                  icon={<Send size={14} />}
                >
                  Resend Invitation
                </Button>
              </>
            )}

            {portalStatus === 'active' && (
              <>
                {portal_link?.username && (
                  <Button
                    variant="secondary"
                    onClick={() => setShowChangeUsername(true)}
                    disabled={actionLoading}
                    icon={<User size={14} />}
                  >
                    Change Username
                  </Button>
                )}
                <Button
                  variant="secondary"
                  onClick={() => setShowResetPassword(true)}
                  disabled={actionLoading}
                  icon={<KeyRound size={14} />}
                >
                  Reset Password
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => onAction(
                    () => managerSendPasswordReset(employeeId, customer.id),
                    'Password reset email sent',
                  )}
                  disabled={actionLoading}
                  icon={<Send size={14} />}
                >
                  Send Reset Email
                </Button>
                <Button
                  variant="danger"
                  onClick={() => {
                    if (confirm('Disable portal access? The customer will not be able to log in. All data is preserved.')) {
                      onAction(
                        () => managerDisablePortal(employeeId, customer.id),
                        'Portal access disabled',
                      );
                    }
                  }}
                  disabled={actionLoading}
                  icon={<ShieldOff size={14} />}
                >
                  Disable
                </Button>
              </>
            )}

            {portalStatus === 'disabled' && (
              <Button
                onClick={() => onAction(
                  () => managerEnablePortal(employeeId, customer.id, customer.email || undefined),
                  'Portal access re-enabled',
                )}
                disabled={actionLoading}
                icon={<ShieldCheck size={14} />}
              >
                Re-enable Portal
              </Button>
            )}
          </div>

          {!customer.email && portalStatus === 'none' && (
            <p className="text-xs text-amber-400">Add an email address to enable portal access</p>
          )}
        </Card>
      </div>

      {/* Vehicles */}
      <div>
        <h2 className="text-sm font-bold text-white flex items-center gap-2 mb-3">
          <Car size={16} className="text-cyan-400" /> Vehicles ({vehicles.length})
        </h2>
        {vehicles.length === 0 ? (
          <p className="text-xs text-slate-500 px-1">No vehicles associated</p>
        ) : (
          <div className="space-y-2">
            {vehicles.map((v: any) => (
              <Card key={v.id} className="p-3 flex items-center gap-3">
                <Car size={18} className="text-slate-500 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white">{v.year} {v.make} {v.model}</p>
                  {v.vin && <p className="text-xs text-slate-500 font-mono">{v.vin}</p>}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Work Orders / Estimates */}
      <div>
        <h2 className="text-sm font-bold text-white flex items-center gap-2 mb-3">
          <FileText size={16} className="text-cyan-400" /> Work Orders ({workOrders.length})
        </h2>
        {workOrders.length === 0 ? (
          <p className="text-xs text-slate-500 px-1">No work orders</p>
        ) : (
          <div className="space-y-2">
            {workOrders.slice(0, 10).map((w: any) => (
              <Card key={w.id} className="p-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-white">{w.work_order_number}</p>
                  <p className="text-xs text-slate-500 capitalize">{w.status.replace('_', ' ')}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-emerald-400">${Number(w.total).toFixed(2)}</p>
                  {Number(w.balance_due) > 0 && <p className="text-xs text-red-400">Bal: ${Number(w.balance_due).toFixed(2)}</p>}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Payments summary */}
      <div>
        <h2 className="text-sm font-bold text-white flex items-center gap-2 mb-3">
          <CreditCard size={16} className="text-cyan-400" /> Payments
        </h2>
        <div className="grid grid-cols-2 gap-3">
          <Card className="p-3">
            <p className="text-xs text-slate-500">Total Paid</p>
            <p className="text-lg font-bold text-emerald-400">${totalPaid.toFixed(2)}</p>
          </Card>
          <Card className="p-3">
            <p className="text-xs text-slate-500">Balance Due</p>
            <p className="text-lg font-bold text-red-400">${balanceDue.toFixed(2)}</p>
          </Card>
        </div>
      </div>

      {/* Towing */}
      {(towing.length > 0 || (unlinkedTowing?.length > 0)) && (
        <div>
          <h2 className="text-sm font-bold text-white flex items-center gap-2 mb-3">
            <Truck size={16} className="text-cyan-400" /> Towing ({towing.length + (unlinkedTowing?.length || 0)})
          </h2>
          <div className="space-y-2">
            {towing.map((t: any) => (
              <Card key={t.id} className="p-3 flex items-center gap-3">
                <Truck size={18} className="text-slate-500 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white">{t.year} {t.make} {t.model}</p>
                  <p className="text-xs text-slate-500">
                    {t.tow_date && new Date(t.tow_date).toLocaleDateString()} · {t.tow_location || '—'}
                    {t.vin && <> · VIN: {t.vin.slice(0, 8)}...</>}
                  </p>
                </div>
                {t.vehicle_status && <span className="text-xs text-slate-500 capitalize">{t.vehicle_status}</span>}
              </Card>
            ))}
            {unlinkedTowing?.map((t: any) => (
              <Card key={t.id} className="p-3 flex items-center gap-3 border-amber-500/20">
                <Truck size={18} className="text-amber-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white">{t.year} {t.make} {t.model}</p>
                  <p className="text-xs text-amber-400">
                    VIN matches this customer's vehicle · not yet linked
                  </p>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => onAction(
                    () => managerLinkTowing(employeeId, t.id, customer.id),
                    'Towing record linked to customer',
                  )}
                  disabled={actionLoading}
                  icon={<Link2 size={14} />}
                >Link</Button>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Parts Inquiries */}
      {inquiries.length > 0 && (
        <div>
          <h2 className="text-sm font-bold text-white flex items-center gap-2 mb-3">
            <Package size={16} className="text-cyan-400" /> Parts Requests ({inquiries.length})
          </h2>
          <div className="space-y-2">
            {inquiries.map((inq: any) => (
              <Card key={inq.id} className="p-3 flex items-center gap-3">
                <Package size={18} className="text-slate-500 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white truncate">{inq.part_needed}</p>
                  <p className="text-xs text-slate-500">
                    {inq.year} {inq.make} {inq.model} · {inq.status}
                  </p>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Vehicle Actions */}
      <div>
        <h2 className="text-sm font-bold text-white flex items-center gap-2 mb-3">
          <CarFront size={16} className="text-cyan-400" /> Vehicle Actions
        </h2>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            onClick={() => setShowAddVehicle(true)}
            icon={<Plus size={14} />}
          >Add Vehicle</Button>
        </div>
        {showAddVehicle && (
          <AddVehicleForm
            employeeId={employeeId}
            customerId={customer.id}
            onBack={() => setShowAddVehicle(false)}
            onAdded={() => {
              setShowAddVehicle(false);
            }}
          />
        )}
      </div>

      {/* Create Login Modal */}
      {showCreateLogin && (
        <CreateLoginModal
          employeeId={employeeId}
          customerId={customer.id}
          customerEmail={customer.email || ''}
          existingUsername={portal_link?.username || ''}
          onBack={() => setShowCreateLogin(false)}
          onSuccess={() => { setShowCreateLogin(false); onAction(async () => ({ success: true }), ''); }}
        />
      )}

      {/* Reset Password Modal */}
      {showResetPassword && (
        <ResetPasswordModal
          employeeId={employeeId}
          customerId={customer.id}
          onBack={() => setShowResetPassword(false)}
          onSuccess={() => { setShowResetPassword(false); onAction(async () => ({ success: true, message: 'Password updated successfully.' }), ''); }}
        />
      )}

      {/* Change Username Modal */}
      {showChangeUsername && (
        <ChangeUsernameModal
          employeeId={employeeId}
          customerId={customer.id}
          currentUsername={portal_link?.username || ''}
          onBack={() => setShowChangeUsername(false)}
          onSuccess={() => { setShowChangeUsername(false); onAction(async () => ({ success: true, message: 'Username updated.' }), ''); }}
        />
      )}
    </div>
  );
}

// ===== ADD CUSTOMER FORM =====
function AddCustomerForm({ employeeId, onBack, onCreated }: { employeeId: string; onBack: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({ first_name: '', last_name: '', phone: '', email: '', address: '' });
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [duplicates, setDuplicates] = useState<any[] | null>(null);

  const handleSave = async () => {
    if (!form.first_name.trim() || !form.last_name.trim()) {
      setError('First name and last name are required');
      return;
    }
    if (password && password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    if (password && password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (password && !username.trim()) {
      setError('Username is required when setting a password');
      return;
    }
    setSaving(true);
    setError('');
    setDuplicates(null);

    try {
      // Step 1: Create the customer record (always works independently of portal)
      const result = await managerCreateCustomer(employeeId, {
        first_name: toTitleCase(form.first_name),
        last_name: toTitleCase(form.last_name),
        phone: form.phone || undefined,
        email: form.email || undefined,
        address: toTitleCase(form.address) || undefined,
      });

      if (!result.success) {
        if (result.duplicates) {
          setDuplicates(result.duplicates);
          setSaving(false);
          return;
        }
        setError(result.error || 'Unable to create customer');
        setSaving(false);
        return;
      }

      // Step 2: If portal credentials provided, create the login account
      if (username.trim() && password && result.customer?.id) {
        try {
          const loginResult = await managerCreateLogin(employeeId, result.customer.id, {
            username: username.trim(),
            password,
            email: form.email || undefined,
          });
          if (!loginResult.success) {
            setError(`Customer created, but portal login failed: ${loginResult.error || 'Unknown error'}`);
            setSaving(false);
            return;
          }
        } catch (loginErr: any) {
          console.error('Portal login creation error:', loginErr);
          setError(`Customer created, but portal login failed: ${loginErr.message || 'Network error'}`);
          setSaving(false);
          return;
        }
      }

      setSaving(false);
      onCreated();
    } catch (err: any) {
      console.error('AddCustomerForm handleSave error:', err);
      setError(err.message || 'An unexpected error occurred while creating the customer');
      setSaving(false);
    }
  };

  return (
    <div className="px-4 pt-14 pb-nav-safe lg:px-8 lg:pt-8 space-y-5 animate-fade-in">
      <button onClick={onBack} className="flex items-center gap-1 text-slate-400 text-sm -ml-1">
        <ChevronLeft size={18} /> Back to Customers
      </button>

      <h1 className="text-xl font-bold text-white">Add Customer</h1>

      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-300 text-sm">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {duplicates && duplicates.length > 0 && (
        <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl space-y-3">
          <div className="flex items-center gap-2 text-amber-300 text-sm font-semibold">
            <AlertCircle size={16} /> Possible Existing Customer
          </div>
          {duplicates.map((d: any) => (
            <div key={d.id} className="flex items-center justify-between gap-3 p-2 bg-slate-800/40 rounded-lg">
              <div>
                <p className="text-sm font-semibold text-white">{d.first_name} {d.last_name}</p>
                <p className="text-xs text-slate-500">{d.phone} {d.email && `· ${d.email}`}</p>
              </div>
              <span className="text-xs text-amber-400 font-semibold capitalize">{d.match_type.replace('_', ' ')}</span>
            </div>
          ))}
          <p className="text-xs text-slate-400">A customer with matching phone, email, or name already exists. Go back and search for them, or create a new customer if this is a different person.</p>
          <Button onClick={() => setDuplicates(null)} variant="secondary" className="w-full">Go Back</Button>
        </div>
      )}

      <Card className="p-4 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <FormField label="First Name" value={form.first_name} onChange={(v) => setForm({ ...form, first_name: v })} placeholder="John" />
          <FormField label="Last Name" value={form.last_name} onChange={(v) => setForm({ ...form, last_name: v })} placeholder="Smith" />
        </div>
        <FormField label="Phone" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} placeholder="555-1234" />
        <FormField label="Email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} placeholder="john@email.com" />
        <FormField label="Address" value={form.address} onChange={(v) => setForm({ ...form, address: v })} placeholder="123 Main St" />

        <div className="pt-2 border-t border-slate-700/40">
          <p className="text-xs font-semibold text-cyan-400 uppercase tracking-wide mb-3">Portal Login (optional)</p>
          <FormField label="Username" value={username} onChange={(v) => setUsername(v.toLowerCase().replace(/[^a-z0-9_.-]/g, ''))} placeholder="john.doe" />
          <div className="mt-3">
            <FormField label="Password" type="password" value={password} onChange={setPassword} placeholder="At least 6 characters" />
          </div>
          <div className="mt-3">
            <FormField label="Confirm Password" type="password" value={confirmPassword} onChange={setConfirmPassword} placeholder="Re-enter password" />
          </div>
        </div>

        <Button onClick={handleSave} disabled={saving} className="w-full"
          icon={saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}>
          {saving ? 'Creating...' : 'Add Customer'}
        </Button>
      </Card>
    </div>
  );
}

// ===== SHARED UI HELPERS =====
function FormField({ label, value, onChange, placeholder, type = 'text' }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) {
  return (
    <div>
      <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide block mb-1.5">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-slate-900/80 border border-slate-700/50 rounded-xl px-3 py-2.5 text-white text-sm placeholder-slate-600 focus:border-cyan-500 focus:outline-none"
      />
    </div>
  );
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-slate-500 flex-shrink-0">{icon}</span>
      <span className="text-xs text-slate-500 font-semibold w-16">{label}</span>
      <span className="text-sm text-white flex-1 truncate">{value}</span>
    </div>
  );
}

// ===== CREATE LOGIN MODAL =====
function CreateLoginModal({ employeeId, customerId, customerEmail, existingUsername, onBack, onSuccess }: {
  employeeId: string;
  customerId: string;
  customerEmail: string;
  existingUsername: string;
  onBack: () => void;
  onSuccess: () => void;
}) {
  const [username, setUsername] = useState(existingUsername || '');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [requireChange, setRequireChange] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleCreate = async () => {
    if (!username.trim()) { setError('Username is required'); return; }
    if (password.length < 6) { setError('Password must be at least 6 characters'); return; }
    if (password !== confirmPassword) { setError('Passwords do not match'); return; }
    setSaving(true);
    setError('');
    const result = await managerCreateLogin(employeeId, customerId, {
      username: username.trim(),
      password,
      email: customerEmail || undefined,
      require_change: requireChange,
    });
    setSaving(false);
    if (result.success) {
      onSuccess();
    } else {
      setError(result.error || 'Unable to create login');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onBack}>
      <Card className="p-5 space-y-4 max-w-md w-full" onClick={(e: any) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">Create Customer Login</h2>
          <button onClick={onBack}><X size={18} className="text-slate-400" /></button>
        </div>

        {error && (
          <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-300 text-sm">
            <AlertCircle size={16} /> {error}
          </div>
        )}

        <FormField label="Username" value={username} onChange={(v) => setUsername(v.toLowerCase().replace(/[^a-z0-9_.-]/g, ''))} placeholder="john.doe" />
        <FormField label="Email (for account)" value={customerEmail} onChange={() => {}} placeholder="customer@email.com" />

        <div>
          <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide block mb-1.5">Temporary Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 6 characters"
            className="w-full bg-slate-900/80 border border-slate-700/50 rounded-xl px-3 py-2.5 text-white text-sm placeholder-slate-600 focus:border-cyan-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide block mb-1.5">Confirm Password</label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Re-enter password"
            className="w-full bg-slate-900/80 border border-slate-700/50 rounded-xl px-3 py-2.5 text-white text-sm placeholder-slate-600 focus:border-cyan-500 focus:outline-none"
          />
        </div>

        <label className="flex items-center gap-2 text-sm text-slate-400 cursor-pointer">
          <input type="checkbox" checked={requireChange} onChange={(e) => setRequireChange(e.target.checked)} className="accent-cyan-500" />
          Require customer to change password at next login
        </label>

        <div className="flex gap-2">
          <Button onClick={handleCreate} disabled={saving} className="flex-1"
            icon={saving ? <Loader2 size={16} className="animate-spin" /> : <KeyRound size={16} />}>
            {saving ? 'Creating...' : 'Create Login'}
          </Button>
          <Button variant="secondary" onClick={onBack}>Cancel</Button>
        </div>

        {!customerEmail && (
          <p className="text-xs text-amber-400">This customer has no email. Add an email address in the edit form first.</p>
        )}
      </Card>
    </div>
  );
}

// ===== RESET PASSWORD MODAL =====
function ResetPasswordModal({ employeeId, customerId, onBack, onSuccess }: {
  employeeId: string;
  customerId: string;
  onBack: () => void;
  onSuccess: () => void;
}) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [requireChange, setRequireChange] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleReset = async () => {
    if (password.length < 6) { setError('Password must be at least 6 characters'); return; }
    if (password !== confirmPassword) { setError('Passwords do not match'); return; }
    setSaving(true);
    setError('');
    const result = await managerSetPassword(employeeId, customerId, password, requireChange);
    setSaving(false);
    if (result.success) {
      onSuccess();
    } else {
      setError(result.error || 'Unable to reset password');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onBack}>
      <Card className="p-5 space-y-4 max-w-md w-full" onClick={(e: any) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">Reset Customer Password</h2>
          <button onClick={onBack}><X size={18} className="text-slate-400" /></button>
        </div>

        {error && (
          <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-300 text-sm">
            <AlertCircle size={16} /> {error}
          </div>
        )}

        <div>
          <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide block mb-1.5">New Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 6 characters"
            className="w-full bg-slate-900/80 border border-slate-700/50 rounded-xl px-3 py-2.5 text-white text-sm placeholder-slate-600 focus:border-cyan-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide block mb-1.5">Confirm Password</label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Re-enter password"
            className="w-full bg-slate-900/80 border border-slate-700/50 rounded-xl px-3 py-2.5 text-white text-sm placeholder-slate-600 focus:border-cyan-500 focus:outline-none"
          />
        </div>

        <label className="flex items-center gap-2 text-sm text-slate-400 cursor-pointer">
          <input type="checkbox" checked={requireChange} onChange={(e) => setRequireChange(e.target.checked)} className="accent-cyan-500" />
          Require customer to change password at next login
        </label>

        <div className="flex gap-2">
          <Button onClick={handleReset} disabled={saving} className="flex-1"
            icon={saving ? <Loader2 size={16} className="animate-spin" /> : <KeyRound size={16} />}>
            {saving ? 'Resetting...' : 'Reset Password'}
          </Button>
          <Button variant="secondary" onClick={onBack}>Cancel</Button>
        </div>
      </Card>
    </div>
  );
}

// ===== CHANGE USERNAME MODAL =====
function ChangeUsernameModal({ employeeId, customerId, currentUsername, onBack, onSuccess }: {
  employeeId: string;
  customerId: string;
  currentUsername: string;
  onBack: () => void;
  onSuccess: () => void;
}) {
  const [username, setUsername] = useState(currentUsername);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleChange = async () => {
    if (!username.trim()) { setError('Username is required'); return; }
    setSaving(true);
    setError('');
    const result = await managerChangeUsername(employeeId, customerId, username.trim());
    setSaving(false);
    if (result.success) {
      onSuccess();
    } else {
      setError(result.error || 'Unable to change username');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onBack}>
      <Card className="p-5 space-y-4 max-w-md w-full" onClick={(e: any) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">Change Username</h2>
          <button onClick={onBack}><X size={18} className="text-slate-400" /></button>
        </div>

        {error && (
          <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-300 text-sm">
            <AlertCircle size={16} /> {error}
          </div>
        )}

        <FormField label="New Username" value={username} onChange={(v) => setUsername(v.toLowerCase().replace(/[^a-z0-9_.-]/g, ''))} placeholder="john.doe" />

        <div className="flex gap-2">
          <Button onClick={handleChange} disabled={saving} className="flex-1"
            icon={saving ? <Loader2 size={16} className="animate-spin" /> : <User size={16} />}>
            {saving ? 'Saving...' : 'Update Username'}
          </Button>
          <Button variant="secondary" onClick={onBack}>Cancel</Button>
        </div>
      </Card>
    </div>
  );
}

// ===== ADD VEHICLE FORM =====
function AddVehicleForm({ employeeId, customerId, onBack, onAdded }: { employeeId: string; customerId: string; onBack: () => void; onAdded: () => void }) {
  const [form, setForm] = useState({ vin: '', year: '', make: '', model: '', trim: '', color: '', plate: '', mileage: '', engine: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [existingVehicle, setExistingVehicle] = useState<any | null>(null);

  const handleSave = async () => {
    if (!form.vin.trim() && !form.make.trim()) {
      setError('VIN or make/model is required');
      return;
    }
    setSaving(true);
    setError('');
    setExistingVehicle(null);
    const result = await managerAddVehicle(employeeId, {
      customer_id: customerId,
      vin: form.vin.trim().toUpperCase() || undefined,
      year: form.year || undefined,
      make: form.make.trim() || undefined,
      model: form.model.trim() || undefined,
      trim: form.trim || undefined,
      color: form.color || undefined,
      plate: form.plate.trim().toUpperCase() || undefined,
      mileage: form.mileage ? parseInt(form.mileage) : undefined,
      engine: form.engine || undefined,
    });
    setSaving(false);
    if (result.success) {
      onAdded();
    } else if (result.existing_vehicle) {
      setExistingVehicle(result.existing_vehicle);
    } else {
      setError(result.error || 'Unable to add vehicle');
    }
  };

  return (
    <Card className="p-4 space-y-3 mt-3">
      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-300 text-sm">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {existingVehicle && (
        <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl space-y-3">
          <div className="flex items-center gap-2 text-amber-300 text-sm font-semibold">
            <AlertCircle size={16} /> A vehicle with this VIN already exists
          </div>
          <p className="text-xs text-slate-400">Would you like to link this existing vehicle to this customer instead?</p>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              onClick={async () => {
                const linkResult = await managerLinkVehicle(employeeId, existingVehicle.id, customerId);
                if (linkResult.success) {
                  onAdded();
                } else {
                  setError(linkResult.error || 'Unable to link vehicle');
                }
              }}
              icon={<Link2 size={14} />}
            >Link Existing Vehicle</Button>
            <Button variant="secondary" onClick={() => setExistingVehicle(null)}>Cancel</Button>
          </div>
        </div>
      )}

      {!existingVehicle && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="VIN" value={form.vin} onChange={(v) => setForm({ ...form, vin: v.toUpperCase() })} placeholder="1ABC123..." />
            <FormField label="Year" value={form.year} onChange={(v) => setForm({ ...form, year: v })} placeholder="2015" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Make" value={form.make} onChange={(v) => setForm({ ...form, make: v })} placeholder="Chevrolet" />
            <FormField label="Model" value={form.model} onChange={(v) => setForm({ ...form, model: v })} placeholder="Silverado" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Plate" value={form.plate} onChange={(v) => setForm({ ...form, plate: v.toUpperCase() })} placeholder="ABC123" />
            <FormField label="Color" value={form.color} onChange={(v) => setForm({ ...form, color: v })} placeholder="Black" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Mileage" value={form.mileage} onChange={(v) => setForm({ ...form, mileage: v.replace(/\D/g, '') })} placeholder="125000" />
            <FormField label="Engine" value={form.engine} onChange={(v) => setForm({ ...form, engine: v })} placeholder="5.3L V8" />
          </div>
          <div className="flex gap-2">
            <Button onClick={handleSave} disabled={saving} className="flex-1"
              icon={saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}>
              {saving ? 'Adding...' : 'Add Vehicle'}
            </Button>
            <Button variant="secondary" onClick={onBack}>Cancel</Button>
          </div>
        </>
      )}
    </Card>
  );
}
