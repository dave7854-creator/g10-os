import { useState, useEffect, useCallback, useRef } from 'react';
import {
  ShieldCheck, LogOut, Lock, Car, DollarSign, Camera, FileText, Users, History,
  Search, Plus, ChevronLeft, ChevronRight, Trash2, AlertTriangle,
  TrendingUp, Archive, Store, Loader2, X,
  CheckCircle2, Clock, MapPin, User as UserIcon,
  ShieldAlert, Monitor, Power, BadgeCheck, BarChart3, Settings, Printer,
} from 'lucide-react';
import { supabase } from '@/supabaseClient';
import { toTitleCase } from '@/utils/textCase';
import { MessageButton } from '@/messaging/MessageButton';
import { ModuleMessageLink } from '@/messaging/ModuleMessageLink';
import { Card, Badge, Button, ProgressBar, formatCurrency } from '@/components/ui';
import type { Screen } from '@/types';
import { ModuleNav, type NavTab } from '@/components/ModuleNav';
import {
  ConfirmDeleteDialog, DeleteAllArchivedButton, ArchiveItemActions,
  type ConfirmDeleteState,
} from '@/components/ArchiveManager';
import { PrintTowingNotice, NoticeTemplateManager, NoticeSnapshotViewer } from './PrintTowingNotice';
import {
  canAccess, canDelete, canManageUsers, canAccessSecuritySettings, canSeeFinancials,
  canReleaseVehicles, canEditImpounds, hashPin, isSessionExpired,
  getInactivityTimeoutMs,
} from './auth';
import type {
  TowingUser, TowingSession, TowingImpound, TowingOwner, TowingLienHolder,
  TowingFee, TowingPayment, TowingPhoto, TowingNotice, TowingHistoryEntry,
  TowingPage, TowingRole,
} from './types';

interface TowingAppProps {
  user: TowingUser;
  session: TowingSession;
  onLock: () => void;
  onBack: () => void;
  onNavigate?: (s: Screen) => void;
}

const TOWING_TABS: NavTab[] = [
  { id: 'dashboard', label: 'Home', icon: ShieldCheck },
  { id: 'active-impounds', label: 'Active', icon: Car },
  { id: 'released', label: 'Released', icon: CheckCircle2 },
  { id: 'title-obtained', label: 'Title', icon: BadgeCheck },
  { id: 'junkyard', label: 'Junkyard', icon: Archive },
  { id: 'for-sale', label: 'For Sale', icon: Store },
  { id: 'archived-impounds', label: 'Archived', icon: Archive },
  { id: 'notices', label: 'Notices', icon: FileText },
  { id: 'reports', label: 'Reports', icon: BarChart3 },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export function TowingApp({ user, session, onLock, onBack, onNavigate }: TowingAppProps) {
  const [page, setPage] = useState<TowingPage>('dashboard');
  const [selectedImpoundId, setSelectedImpoundId] = useState<string | null>(null);
  const [autoLocked, setAutoLocked] = useState(false);
  const [sessionState, setSessionState] = useState<TowingSession>(session);
  const lastActivityRef = useRef<number>(Date.now());

  useEffect(() => {
    const checkActivity = () => {
      if (Date.now() - lastActivityRef.current > getInactivityTimeoutMs()) {
        setAutoLocked(true);
        (async () => {
          await supabase.from('towing_sessions')
            .update({ ended_at: new Date().toISOString(), ended_reason: 'auto_lock_timeout' })
            .eq('id', sessionState.id);
          sessionStorage.removeItem('towing_session_token');
        })();
      }
    };
    const interval = setInterval(checkActivity, 30000);
    return () => clearInterval(interval);
  }, [sessionState.id]);

  const updateActivity = useCallback(async () => {
    lastActivityRef.current = Date.now();
    const now = new Date().toISOString();
    setSessionState((prev) => ({ ...prev, last_activity: now }));
    await supabase.from('towing_sessions').update({ last_activity: now }).eq('id', sessionState.id);
  }, [sessionState.id]);

  useEffect(() => {
    const handler = () => updateActivity();
    window.addEventListener('click', handler);
    window.addEventListener('keydown', handler);
    window.addEventListener('touchstart', handler);
    return () => {
      window.removeEventListener('click', handler);
      window.removeEventListener('keydown', handler);
      window.removeEventListener('touchstart', handler);
    };
  }, [updateActivity]);

  const handleLogout = async () => {
    await supabase.from('towing_sessions')
      .update({ ended_at: new Date().toISOString(), ended_reason: 'manual_logout' })
      .eq('id', sessionState.id);
    sessionStorage.removeItem('towing_session_token');
    onLock();
  };

  if (autoLocked) {
    return (
      <div className="px-4 pt-14 pb-nav-safe flex flex-col items-center justify-center min-h-[60vh]">
        <div className="w-full max-w-sm text-center space-y-5">
          <div className="w-16 h-16 rounded-2xl bg-amber-500/15 flex items-center justify-center mx-auto">
            <Lock size={32} className="text-amber-400" />
          </div>
          <h1 className="text-xl font-bold text-white">Auto-Locked</h1>
          <p className="text-slate-400 text-sm">You've been inactive. Enter your PIN to continue.</p>
          <Button onClick={onLock} size="lg" className="w-full">Unlock</Button>
        </div>
      </div>
    );
  }

  const roleColors: Record<TowingRole, string> = {
    administrator: 'text-red-400 bg-red-500/15',
    manager: 'text-red-400 bg-red-500/15',
    office_staff: 'text-cyan-400 bg-cyan-500/15',
    driver: 'text-amber-400 bg-amber-500/15',
  };
  const roleLabels: Record<TowingRole, string> = {
    administrator: 'Admin', manager: 'Manager', office_staff: 'Office', driver: 'Driver',
  };

  const visibleTabs = TOWING_TABS.filter((tab) => canAccess(user.role, tab.id as TowingPage));

  if (!canAccess(user.role, page)) {
    setPage('dashboard');
    return null;
  }

  return (
    <>
      <ModuleNav
        title="Towing"
        subtitle="Impound Management"
        tabs={visibleTabs}
        current={page}
        onNavigate={(id) => setPage(id as TowingPage)}
        onExit={onBack}
        exitLabel="Back to Home"
      />
      <div className="lg:pl-60">
        <div className="max-w-7xl mx-auto">
          <div className="px-4 pt-14 pb-nav-safe lg:px-8 lg:pt-8 space-y-4 animate-fade-in">
            {/* Mobile header — hidden on desktop since sidebar has title */}
            <div className="flex items-center justify-between lg:hidden">
              <div>
                <h1 className="text-2xl font-bold text-white">Towing</h1>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-slate-400 text-sm">{user.name}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-semibold ${roleColors[user.role]}`}>
                    {roleLabels[user.role]}
                  </span>
                </div>
              </div>
              <button onClick={handleLogout} className="w-9 h-9 rounded-full bg-slate-800 flex items-center justify-center active:scale-90 transition-transform">
                <LogOut size={16} className="text-slate-400" />
              </button>
            </div>

            {/* Content */}
            <TowingContent
              page={page}
              user={user}
              sessionId={sessionState.id}
              selectedImpoundId={selectedImpoundId}
              onNavigate={(p) => { setPage(p); }}
              onSelectImpound={(id) => { setSelectedImpoundId(id); setPage('impound-detail'); }}
              onLock={onLock}
              onScreenNavigate={onNavigate}
            />
          </div>
        </div>
      </div>
    </>
  );
}

// ===== CONTENT ROUTER =====
function TowingContent({ page, user, sessionId, selectedImpoundId, onNavigate, onSelectImpound, onLock, onScreenNavigate }: {
  page: TowingPage; user: TowingUser; sessionId: string;
  selectedImpoundId: string | null;
  onNavigate: (p: TowingPage) => void;
  onSelectImpound: (id: string) => void;
  onLock: () => void;
  onScreenNavigate?: (s: Screen) => void;
}) {
  switch (page) {
    case 'dashboard': return <DashboardPage user={user} onNavigate={onNavigate} onScreenNavigate={onScreenNavigate} />;
    case 'active-impounds': return <ImpoundListPage user={user} status="active_impound" onSelectImpound={onSelectImpound} />;
    case 'released': return <ImpoundListPage user={user} status="released" onSelectImpound={onSelectImpound} />;
    case 'title-obtained': return <ImpoundListPage user={user} status="title_obtained" onSelectImpound={onSelectImpound} />;
    case 'junkyard': return <ImpoundListPage user={user} status="junkyard" onSelectImpound={onSelectImpound} />;
    case 'for-sale': return <ImpoundListPage user={user} status="for_sale" onSelectImpound={onSelectImpound} />;
    case 'archived-impounds': return <ArchivedImpoundsPage user={user} />;
    case 'reports': return <ReportsPage user={user} />;
    case 'new-impound': return <NewImpoundPage user={user} onNavigate={onNavigate} />;
    case 'impound-detail': return <ImpoundDetailPage user={user} impoundId={selectedImpoundId} onNavigate={onNavigate} />;
    case 'payments': return <PaymentsPage user={user} />;
    case 'fees': return <FeesPage user={user} />;
    case 'photos': return <PhotosPage user={user} />;
    case 'owners': return <OwnersPage user={user} />;
    case 'lien-holders': return <LienHoldersPage user={user} />;
    case 'notices': return <NoticesPage user={user} />;
    case 'history': return <HistoryPage user={user} />;
    case 'user-management': return <UserManagementPage user={user} />;
    case 'security-settings': return <SecuritySettingsPage user={user} />;
    case 'sessions': return <SessionsPage user={user} sessionId={sessionId} />;
    case 'settings': return <TowingSettingsPage user={user} onNavigate={onNavigate} />;
  }
}

// ===== DASHBOARD =====
function DashboardPage({ user, onNavigate, onScreenNavigate }: { user: TowingUser; onNavigate: (p: TowingPage) => void; onScreenNavigate?: (s: Screen) => void }) {
  const [stats, setStats] = useState({ active: 0, released: 0, titleObtained: 0, junkyard: 0, forSale: 0, totalFees: 0, totalPayments: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { count: active } = await supabase.from('towing_impounds').select('*', { count: 'exact', head: true }).eq('vehicle_status', 'active_impound');
      const { count: released } = await supabase.from('towing_impounds').select('*', { count: 'exact', head: true }).eq('vehicle_status', 'released');
      const { count: titleObtained } = await supabase.from('towing_impounds').select('*', { count: 'exact', head: true }).eq('vehicle_status', 'title_obtained');
      const { count: junkyard } = await supabase.from('towing_impounds').select('*', { count: 'exact', head: true }).eq('vehicle_status', 'junkyard');
      const { count: forSale } = await supabase.from('towing_impounds').select('*', { count: 'exact', head: true }).eq('vehicle_status', 'for_sale');
      const { data: fees } = await supabase.from('towing_fees').select('amount');
      const { data: payments } = await supabase.from('towing_payments').select('amount');
      setStats({
        active: active ?? 0, released: released ?? 0, titleObtained: titleObtained ?? 0,
        junkyard: junkyard ?? 0, forSale: forSale ?? 0,
        totalFees: (fees ?? []).reduce((s, f) => s + Number(f.amount), 0),
        totalPayments: (payments ?? []).reduce((s, p) => s + Number(p.amount), 0),
      });
      setLoading(false);
    })();
  }, []);

  const cards: { page: TowingPage; label: string; icon: typeof Car; count: number; color: string }[] = [
    { page: 'active-impounds', label: 'Active Impounds', icon: Car, count: stats.active, color: 'text-red-400 bg-red-500/15' },
    { page: 'released', label: 'Released', icon: CheckCircle2, count: stats.released, color: 'text-emerald-400 bg-emerald-500/15' },
    { page: 'title-obtained', label: 'Title Obtained', icon: BadgeCheck, count: stats.titleObtained, color: 'text-cyan-400 bg-cyan-500/15' },
    { page: 'junkyard', label: 'Junk Yard', icon: Archive, count: stats.junkyard, color: 'text-slate-400 bg-slate-500/15' },
    { page: 'for-sale', label: 'For Sale', icon: Store, count: stats.forSale, color: 'text-amber-400 bg-amber-500/15' },
  ];

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {cards.map((c) => {
          if (!canAccess(user.role, c.page)) return null;
          const Icon = c.icon;
          return (
            <Card key={c.page} onClick={() => onNavigate(c.page)} className="p-4">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${c.color}`}>
                <Icon size={20} />
              </div>
              <p className="text-2xl font-bold text-white">{c.count}</p>
              <p className="text-xs text-slate-500">{c.label}</p>
            </Card>
          );
        })}
      </div>

      <Button onClick={() => onNavigate('new-impound')} size="lg" className="w-full" icon={<Plus size={20} />}>
        New Impound
      </Button>

      <ModuleMessageLink module="towing" onNavigate={onScreenNavigate ?? (() => {})} />

      {canSeeFinancials(user.role) && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <DollarSign size={16} className="text-amber-400" />
              <span className="text-xs text-slate-500 font-semibold">Total Fees</span>
            </div>
            <p className="text-xl font-bold text-amber-400">{formatCurrency(stats.totalFees)}</p>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <DollarSign size={16} className="text-emerald-400" />
              <span className="text-xs text-slate-500 font-semibold">Total Payments</span>
            </div>
            <p className="text-xl font-bold text-emerald-400">{formatCurrency(stats.totalPayments)}</p>
          </Card>
        </div>
      )}

      {canManageUsers(user.role) && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Card onClick={() => onNavigate('user-management')} className="p-4 flex items-center gap-3">
            <Users size={20} className="text-slate-400" />
            <span className="text-sm font-semibold text-white">User Management</span>
            <ChevronRight size={18} className="text-slate-600 ml-auto" />
          </Card>
          <Card onClick={() => onNavigate('security-settings')} className="p-4 flex items-center gap-3">
            <ShieldCheck size={20} className="text-slate-400" />
            <span className="text-sm font-semibold text-white">Security Settings</span>
            <ChevronRight size={18} className="text-slate-600 ml-auto" />
          </Card>
          <Card onClick={() => onNavigate('sessions')} className="p-4 flex items-center gap-3">
            <Monitor size={20} className="text-slate-400" />
            <span className="text-sm font-semibold text-white">Active Sessions</span>
            <ChevronRight size={18} className="text-slate-600 ml-auto" />
          </Card>
        </div>
      )}
    </div>
  );
}

// ===== IMPOUND LIST (shared by all status tabs) =====
function ImpoundListPage({ user, status, onSelectImpound }: { user: TowingUser; status: string; onSelectImpound: (id: string) => void }) {
  const [impounds, setImpounds] = useState<TowingImpound[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('towing_impounds').select('*').eq('vehicle_status', status).order('created_at', { ascending: false });
      setImpounds((data ?? []) as TowingImpound[]);
      setLoading(false);
    })();
  }, [status]);

  const filtered = impounds.filter((v) => {
    const q = query.toLowerCase();
    return !q || `${v.year} ${v.make} ${v.model}`.toLowerCase().includes(q) || (v.vin ?? '').toLowerCase().includes(q) || (v.plate ?? '').toLowerCase().includes(q);
  });

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-4">
      <SearchBar value={query} onChange={setQuery} placeholder="Search make, model, VIN, plate..." />
      {filtered.length === 0 ? (
        <EmptyState text="No vehicles found" />
      ) : (
        <div className="space-y-1.5">
          {filtered.map((v) => (
            <Card key={v.id} onClick={() => onSelectImpound(v.id)} className="p-3.5 flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-slate-700/40 flex items-center justify-center flex-shrink-0">
                <Car size={20} className="text-slate-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white font-bold text-sm truncate">{v.year} {v.make} {v.model}</p>
                <p className="text-xs text-slate-500 mt-0.5 truncate">{v.color} · {v.plate || 'No plate'} · {v.vin || 'No VIN'}</p>
              </div>
              <div className="flex flex-col items-end gap-1 flex-shrink-0">
                <StatusPill status={v.vehicle_status} />
                <span className="text-xs text-slate-500">{new Date(v.tow_date).toLocaleDateString()}</span>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ===== ARCHIVED IMPOUNDS PAGE =====
function ArchivedImpoundsPage({ user }: { user: TowingUser }) {
  const [impounds, setImpounds] = useState<TowingImpound[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDeleteState>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase.from('towing_impounds').select('*').eq('vehicle_status', 'archived').order('created_at', { ascending: false });
    setImpounds((data ?? []) as TowingImpound[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = impounds.filter((v) => {
    const q = query.toLowerCase();
    return !q || `${v.year} ${v.make} ${v.model}`.toLowerCase().includes(q) || (v.vin ?? '').toLowerCase().includes(q) || (v.plate ?? '').toLowerCase().includes(q);
  });

  const handleRestore = async (v: TowingImpound) => {
    await supabase.from('towing_impounds').update({ vehicle_status: 'active_impound' }).eq('id', v.id);
    await supabase.from('towing_history').insert({
      impound_id: v.id, action: 'restored', performed_by: user.id,
      details: `Restored from archive to active impound`,
    });
    load();
  };

  const handleConfirmDelete = async () => {
    if (!confirmDialog) return;
    setDeleting(true);
    if (confirmDialog.type === 'delete') {
      await supabase.from('towing_impounds').delete().eq('id', confirmDialog.id);
    } else if (confirmDialog.type === 'deleteAll') {
      await supabase.from('towing_impounds').delete().eq('vehicle_status', 'archived');
    }
    setDeleting(false);
    setConfirmDialog(null);
    load();
  };

  const impoundLabel = (v: TowingImpound) => `${v.year ?? ''} ${v.make ?? ''} ${v.model ?? ''}`.trim() || v.vin || v.plate || 'Unknown';

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-4">
      <SearchBar value={query} onChange={setQuery} placeholder="Search make, model, VIN, plate..." />

      {impounds.length > 0 && (
        <DeleteAllArchivedButton count={impounds.length} itemLabel="Impounds" onClick={() => setConfirmDialog({ type: 'deleteAll', count: impounds.length })} />
      )}

      {filtered.length === 0 ? (
        <EmptyState text="No archived impounds" />
      ) : (
        <div className="space-y-1.5">
          {filtered.map((v) => (
            <Card key={v.id} className="p-3.5 opacity-60">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-slate-700/40 flex items-center justify-center flex-shrink-0">
                  <Car size={20} className="text-slate-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white font-bold text-sm truncate">{v.year} {v.make} {v.model}</p>
                  <p className="text-xs text-slate-500 mt-0.5 truncate">{v.color} · {v.plate || 'No plate'} · {v.vin || 'No VIN'}</p>
                </div>
                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                  <StatusPill status={v.vehicle_status} />
                  <span className="text-xs text-slate-500">{new Date(v.tow_date).toLocaleDateString()}</span>
                </div>
              </div>
              <ArchiveItemActions
                onRestore={() => handleRestore(v)}
                onDelete={() => setConfirmDialog({ type: 'delete', id: v.id, name: impoundLabel(v) })}
              />
            </Card>
          ))}
        </div>
      )}

      {confirmDialog && (
        <ConfirmDeleteDialog
          state={confirmDialog}
          deleting={deleting}
          itemLabel="Impound"
          onCancel={() => setConfirmDialog(null)}
          onConfirm={handleConfirmDelete}
        />
      )}
    </div>
  );
}

// ===== REPORTS =====
function ReportsPage({ user }: { user: TowingUser }) {
  const [stats, setStats] = useState({ totalImpounds: 0, totalFees: 0, totalPayments: 0, balance: 0, byStatus: {} as Record<string, number> });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: imps } = await supabase.from('towing_impounds').select('vehicle_status');
      const { data: fees } = await supabase.from('towing_fees').select('amount');
      const { data: payments } = await supabase.from('towing_payments').select('amount');
      const totalFees = (fees ?? []).reduce((s, f) => s + Number(f.amount), 0);
      const totalPayments = (payments ?? []).reduce((s, p) => s + Number(p.amount), 0);
      const byStatus: Record<string, number> = {};
      (imps ?? []).forEach((i) => { byStatus[i.vehicle_status] = (byStatus[i.vehicle_status] ?? 0) + 1; });
      setStats({ totalImpounds: (imps ?? []).length, totalFees, totalPayments, balance: totalFees - totalPayments, byStatus });
      setLoading(false);
    })();
  }, []);

  if (loading) return <LoadingSpinner />;

  const statusLabels: Record<string, string> = {
    active_impound: 'Active Impounds', released: 'Released', title_obtained: 'Title Obtained',
    junkyard: 'Junk Yard', for_sale: 'For Sale', archived: 'Archived',
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <BarChart3 size={16} className="text-red-400" />
            <span className="text-xs text-slate-500 font-semibold">Total Impounds</span>
          </div>
          <p className="text-2xl font-bold text-white">{stats.totalImpounds}</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp size={16} className="text-amber-400" />
            <span className="text-xs text-slate-500 font-semibold">Outstanding Balance</span>
          </div>
          <p className="text-2xl font-bold text-red-400">{formatCurrency(stats.balance)}</p>
        </Card>
      </div>

      <Card className="p-4">
        <h3 className="text-sm font-bold text-white mb-3">By Status</h3>
        <div className="space-y-2">
          {Object.entries(statusLabels).map(([key, label]) => (
            <div key={key} className="flex items-center justify-between py-2 border-b border-slate-700/30 last:border-0">
              <span className="text-sm text-slate-400">{label}</span>
              <span className="text-sm font-bold text-white">{stats.byStatus[key] ?? 0}</span>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="p-4">
          <span className="text-xs text-slate-500 font-semibold">Total Fees Assessed</span>
          <p className="text-xl font-bold text-amber-400 mt-1">{formatCurrency(stats.totalFees)}</p>
        </Card>
        <Card className="p-4">
          <span className="text-xs text-slate-500 font-semibold">Total Payments Collected</span>
          <p className="text-xl font-bold text-emerald-400 mt-1">{formatCurrency(stats.totalPayments)}</p>
        </Card>
      </div>
    </div>
  );
}

// ===== NEW IMPOUND =====
function NewImpoundPage({ user, onNavigate }: { user: TowingUser; onNavigate: (p: TowingPage) => void }) {
  const [form, setForm] = useState({
    vin: '', year: '', make: '', model: '', color: '', plate: '',
    towLocation: '', pickupLocation: '', towReason: '', notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    if (saving || saved) return;
    if (!form.make || !form.model) return;
    setSaving(true);
    const { data } = await supabase.from('towing_impounds').insert({
      vin: form.vin || null, year: form.year || null, make: toTitleCase(form.make), model: toTitleCase(form.model),
      color: form.color ? toTitleCase(form.color) : null, plate: form.plate || null,
      tow_location: form.towLocation ? toTitleCase(form.towLocation) : null, pickup_location: form.pickupLocation ? toTitleCase(form.pickupLocation) : null,
      tow_reason: form.towReason ? toTitleCase(form.towReason) : null, notes: form.notes ? toTitleCase(form.notes) : null,
      vehicle_status: 'active_impound', created_by: user.id, driver_id: user.role === 'driver' ? user.id : null,
    }).select().maybeSingle();
    if (data) {
      await supabase.from('towing_history').insert({
        impound_id: data.id, action: 'created', performed_by: user.id,
        details: `Impound created for ${form.year} ${form.make} ${form.model}`,
      });
    }
    setSaved(true);
    setSaving(false);
  };

  if (saved) {
    return (
      <div className="space-y-5">
        <SuccessMessage title="Impound Created" message="The vehicle has been added to active impounds." />
        <div className="flex gap-3">
          <Button variant="secondary" className="flex-1" onClick={() => { setForm({ vin: '', year: '', make: '', model: '', color: '', plate: '', towLocation: '', pickupLocation: '', towReason: '', notes: '' }); setSaved(false); }}>
            Add Another
          </Button>
          <Button className="flex-1" onClick={() => onNavigate('dashboard')}>Done</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="p-4 space-y-3">
        <Field label="VIN" value={form.vin} onChange={(v) => setForm({ ...form, vin: v.toUpperCase() })} placeholder="17-char VIN" />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Year" value={form.year} onChange={(v) => setForm({ ...form, year: v })} placeholder="2015" />
          <Field label="Make" value={form.make} onChange={(v) => setForm({ ...form, make: v })} placeholder="Toyota" />
          <Field label="Model" value={form.model} onChange={(v) => setForm({ ...form, model: v })} placeholder="Camry" />
          <Field label="Color" value={form.color} onChange={(v) => setForm({ ...form, color: v })} placeholder="Silver" />
        </div>
        <Field label="Plate" value={form.plate} onChange={(v) => setForm({ ...form, plate: v.toUpperCase() })} placeholder="ABC123" />
      </Card>

      <Card className="p-4 space-y-3">
        <Field label="Tow Location" value={form.towLocation} onChange={(v) => setForm({ ...form, towLocation: v })} placeholder="Where vehicle was towed from" />
        <Field label="Pickup Location" value={form.pickupLocation} onChange={(v) => setForm({ ...form, pickupLocation: v })} placeholder="Where vehicle is stored" />
        <Field label="Tow Reason" value={form.towReason} onChange={(v) => setForm({ ...form, towReason: v })} placeholder="Reason for tow" />
        <TextArea label="Notes" value={form.notes} onChange={(v) => setForm({ ...form, notes: v })} placeholder="Additional details" />
      </Card>

      <Button onClick={handleSave} size="lg" className="w-full" disabled={saving || !form.make || !form.model}
        icon={saving ? <Loader2 size={20} className="animate-spin" /> : <Plus size={20} />}>
        {saving ? 'Saving...' : 'Create Impound'}
      </Button>
    </div>
  );
}

// ===== IMPOUND DETAIL =====
function ImpoundDetailPage({ user, impoundId, onNavigate }: { user: TowingUser; impoundId: string | null; onNavigate: (p: TowingPage) => void }) {
  const [impound, setImpound] = useState<TowingImpound | null>(null);
  const [owners, setOwners] = useState<TowingOwner[]>([]);
  const [liens, setLiens] = useState<TowingLienHolder[]>([]);
  const [fees, setFees] = useState<TowingFee[]>([]);
  const [payments, setPayments] = useState<TowingPayment[]>([]);
  const [photos, setPhotos] = useState<TowingPhoto[]>([]);
  const [notices, setNotices] = useState<TowingNotice[]>([]);
  const [history, setHistory] = useState<TowingHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddFee, setShowAddFee] = useState(false);
  const [showAddPayment, setShowAddPayment] = useState(false);
  const [showAddOwner, setShowAddOwner] = useState(false);
  const [showAddLien, setShowAddLien] = useState(false);
  const [showAddNotice, setShowAddNotice] = useState(false);
  const [confirmRelease, setConfirmRelease] = useState(false);
  const [showPrintNotice, setShowPrintNotice] = useState(false);

  useEffect(() => {
    (async () => {
      if (!impoundId) { setLoading(false); return; }
      const { data: imp } = await supabase.from('towing_impounds').select('*').eq('id', impoundId).maybeSingle();
      if (!imp) { setLoading(false); return; }
      const impoundData = imp as TowingImpound;
      setImpound(impoundData);
      const [o, l, f, p, ph, n, h] = await Promise.all([
        supabase.from('towing_owners').select('*').eq('impound_id', impoundData.id),
        supabase.from('towing_lien_holders').select('*').eq('impound_id', impoundData.id),
        supabase.from('towing_fees').select('*').eq('impound_id', impoundData.id).order('created_at', { ascending: false }),
        supabase.from('towing_payments').select('*').eq('impound_id', impoundData.id).order('created_at', { ascending: false }),
        supabase.from('towing_photos').select('*').eq('impound_id', impoundData.id).order('created_at', { ascending: false }),
        supabase.from('towing_notices').select('*').eq('impound_id', impoundData.id).order('created_at', { ascending: false }),
        supabase.from('towing_history').select('*').eq('impound_id', impoundData.id).order('created_at', { ascending: false }),
      ]);
      setOwners((o.data ?? []) as TowingOwner[]);
      setLiens((l.data ?? []) as TowingLienHolder[]);
      setFees((f.data ?? []) as TowingFee[]);
      setPayments((p.data ?? []) as TowingPayment[]);
      setPhotos((ph.data ?? []) as TowingPhoto[]);
      setNotices((n.data ?? []) as TowingNotice[]);
      setHistory((h.data ?? []) as TowingHistoryEntry[]);
      setLoading(false);
    })();
  }, [impoundId]);

  const reloadRelated = async (id: string) => {
    const [o, l, f, p, ph, n, h] = await Promise.all([
      supabase.from('towing_owners').select('*').eq('impound_id', id),
      supabase.from('towing_lien_holders').select('*').eq('impound_id', id),
      supabase.from('towing_fees').select('*').eq('impound_id', id).order('created_at', { ascending: false }),
      supabase.from('towing_payments').select('*').eq('impound_id', id).order('created_at', { ascending: false }),
      supabase.from('towing_photos').select('*').eq('impound_id', id).order('created_at', { ascending: false }),
      supabase.from('towing_notices').select('*').eq('impound_id', id).order('created_at', { ascending: false }),
      supabase.from('towing_history').select('*').eq('impound_id', id).order('created_at', { ascending: false }),
    ]);
    setOwners((o.data ?? []) as TowingOwner[]);
    setLiens((l.data ?? []) as TowingLienHolder[]);
    setFees((f.data ?? []) as TowingFee[]);
    setPayments((p.data ?? []) as TowingPayment[]);
    setPhotos((ph.data ?? []) as TowingPhoto[]);
    setNotices((n.data ?? []) as TowingNotice[]);
    setHistory((h.data ?? []) as TowingHistoryEntry[]);
  };

  if (loading) return <LoadingSpinner />;
  if (!impound) return <EmptyState text="No impound selected" />;

  const totalFees = fees.reduce((s, f) => s + Number(f.amount), 0);
  const totalPayments = payments.reduce((s, p) => s + Number(p.amount), 0);
  const balance = totalFees - totalPayments;
  const impoundIdForRelated = impound.id;

  const handleRelease = async (releasedTo: string, releaseFee: string) => {
    await supabase.from('towing_impounds').update({
      vehicle_status: 'released', released_at: new Date().toISOString(),
      released_to: releasedTo, release_fee: releaseFee ? Number(releaseFee) : null,
    }).eq('id', impound.id);
    await supabase.from('towing_history').insert({
      impound_id: impound.id, action: 'released', performed_by: user.id,
      details: `Released to ${releasedTo}`,
    });
    setImpound({ ...impound, vehicle_status: 'released', released_at: new Date().toISOString(), released_to: releasedTo });
    setConfirmRelease(false);
  };

  const handleStatusChange = async (newStatus: string) => {
    await supabase.from('towing_impounds').update({ vehicle_status: newStatus }).eq('id', impound.id);
    await supabase.from('towing_history').insert({
      impound_id: impound.id, action: 'status_change', performed_by: user.id,
      details: `Status changed to ${newStatus}`,
    });
    setImpound({ ...impound, vehicle_status: newStatus as TowingImpound['vehicle_status'] });
  };

  return (
    <div className="space-y-4">
      {/* Vehicle header card — same style as VehicleProfileModal */}
      <Card className="overflow-hidden">
        <div className="h-32 bg-gradient-to-br from-slate-700 to-slate-800 flex items-center justify-center relative">
          <Car size={48} className="text-slate-500" strokeWidth={1} />
          <div className="absolute top-3 right-3">
            <StatusPill status={impound.vehicle_status} />
          </div>
        </div>
        <div className="p-4">
          <h2 className="text-lg font-bold text-white">{impound.year} {impound.make} {impound.model}</h2>
          <p className="text-sm text-slate-400 mt-0.5">{impound.color} · {impound.plate || 'No plate'}</p>
          <p className="text-xs text-slate-500 font-mono mt-1">{impound.vin || 'No VIN'}</p>
          <div className="grid grid-cols-2 gap-3 mt-4">
            <DetailItem icon={MapPin} label="Tow Location" value={impound.tow_location || 'N/A'} />
            <DetailItem icon={MapPin} label="Pickup Location" value={impound.pickup_location || 'N/A'} />
            <DetailItem icon={Clock} label="Tow Date" value={new Date(impound.tow_date).toLocaleDateString()} />
            <DetailItem icon={FileText} label="Reason" value={impound.tow_reason || 'N/A'} />
          </div>
          {impound.notes && <p className="text-xs text-slate-400 mt-3 pt-3 border-t border-slate-700/40">{impound.notes}</p>}
        </div>
      </Card>

      {canReleaseVehicles(user.role) && impound.vehicle_status === 'active_impound' && (
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" className="flex-1" onClick={() => handleStatusChange('junkyard')}>Junk Yard</Button>
          <Button variant="secondary" size="sm" className="flex-1" onClick={() => handleStatusChange('for_sale')}>For Sale</Button>
          <Button variant="secondary" size="sm" className="flex-1" onClick={() => handleStatusChange('title_obtained')}>Title</Button>
          <Button size="sm" className="flex-1" onClick={() => setConfirmRelease(true)}>Release</Button>
        </div>
      )}

      {canDelete(user.role) && impound.vehicle_status !== 'archived' && impound.vehicle_status !== 'active_impound' && (
        <Button variant="secondary" size="sm" className="w-full" onClick={() => handleStatusChange('archived')} icon={<Archive size={14} />}>
          Archive This Impound
        </Button>
      )}

      {confirmRelease && <ReleaseDialog onCancel={() => setConfirmRelease(false)} onConfirm={handleRelease} />}

      {canEditImpounds(user.role) && (
        <Button size="sm" className="w-full" onClick={() => setShowPrintNotice(true)} icon={<Printer size={14} />}>
          Print Towing Notice
        </Button>
      )}

      {/* Fees & Payments — using shared Card and Badge */}
      {canSeeFinancials(user.role) && (
        <>
          <SectionHeader icon={DollarSign} title="Fees & Payments" />
          <div className="grid grid-cols-3 gap-2">
            <Card className="p-2.5 text-center">
              <p className="text-[10px] text-slate-500 uppercase font-semibold">Fees</p>
              <p className="text-sm font-bold text-amber-400 mt-1">{formatCurrency(totalFees)}</p>
            </Card>
            <Card className="p-2.5 text-center">
              <p className="text-[10px] text-slate-500 uppercase font-semibold">Paid</p>
              <p className="text-sm font-bold text-emerald-400 mt-1">{formatCurrency(totalPayments)}</p>
            </Card>
            <Card className="p-2.5 text-center">
              <p className="text-[10px] text-slate-500 uppercase font-semibold">Balance</p>
              <p className={`text-sm font-bold mt-1 ${balance > 0 ? 'text-red-400' : 'text-slate-400'}`}>{formatCurrency(balance)}</p>
            </Card>
          </div>

          {fees.length > 0 && (
            <div className="space-y-2">
              {fees.map((f) => (
                <Card key={f.id} className="p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-bold text-white">{formatCurrency(Number(f.amount))}</p>
                      <p className="text-xs text-slate-500 capitalize">{f.fee_type} · {f.description || ''}</p>
                    </div>
                    {canDelete(user.role) && (
                      <button onClick={async () => { await supabase.from('towing_fees').delete().eq('id', f.id); reloadRelated(impoundIdForRelated); }}
                        className="w-7 h-7 rounded-lg bg-red-500/10 flex items-center justify-center active:scale-90 transition-transform">
                        <Trash2 size={12} className="text-red-400" />
                      </button>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          )}

          {payments.length > 0 && (
            <div className="space-y-2">
              {payments.map((p) => (
                <Card key={p.id} className="p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-bold text-white">{formatCurrency(Number(p.amount))}</p>
                      <p className="text-xs text-slate-500 capitalize">{p.method} · {p.reference || 'No ref'}</p>
                    </div>
                    {canDelete(user.role) && (
                      <button onClick={async () => { await supabase.from('towing_payments').delete().eq('id', p.id); reloadRelated(impoundIdForRelated); }}
                        className="w-7 h-7 rounded-lg bg-red-500/10 flex items-center justify-center active:scale-90 transition-transform">
                        <Trash2 size={12} className="text-red-400" />
                      </button>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          )}

          {canEditImpounds(user.role) && (
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" className="flex-1" onClick={() => setShowAddFee(true)}>+ Add Fee</Button>
              <Button variant="secondary" size="sm" className="flex-1" onClick={() => setShowAddPayment(true)}>+ Add Payment</Button>
            </div>
          )}
        </>
      )}

      {/* Photos */}
      <SectionHeader icon={Camera} title={`Photos (${photos.length})`} />
      {photos.length === 0 ? (
        <p className="text-xs text-slate-600 py-2">No photos uploaded</p>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {photos.map((p) => (
            <div key={p.id} className="aspect-square rounded-xl bg-slate-800 overflow-hidden">
              <img src={p.url} alt={p.caption ?? ''} className="w-full h-full object-cover" />
            </div>
          ))}
        </div>
      )}

      {/* Owners — using shared Card and form style */}
      <SectionHeader icon={UserIcon} title={`Owners (${owners.length})`} />
      {owners.length === 0 ? <p className="text-xs text-slate-600 py-2">No owner recorded</p> : owners.map((o) => (
        <Card key={o.id} className="p-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-bold text-white">{o.name || 'Unknown'}</p>
              <p className="text-xs text-slate-500 mt-0.5">{o.phone || 'No phone'} · {o.license_number || 'No license'}</p>
              {o.address && <p className="text-xs text-slate-500 mt-1">{o.address}</p>}
            </div>
            <div className="flex items-center gap-1.5">
              {o.phone && (
                <MessageButton
                  compact
                  module="towing"
                  contactName={o.name || 'Owner'}
                  contactPhone={o.phone}
                  recordId={impoundIdForRelated}
                  recordType="impound"
                  recordLabel={impound ? `${impound.year ?? ''} ${impound.make ?? ''} ${impound.model ?? ''}`.trim() : undefined}
                  vehicleLabel={impound ? `${impound.year ?? ''} ${impound.make ?? ''} ${impound.model ?? ''}`.trim() : undefined}
                />
              )}
              {canDelete(user.role) && (
                <button onClick={async () => { await supabase.from('towing_owners').delete().eq('id', o.id); reloadRelated(impoundIdForRelated); }}
                  className="w-7 h-7 rounded-lg bg-red-500/10 flex items-center justify-center active:scale-90 transition-transform">
                  <Trash2 size={12} className="text-red-400" />
                </button>
              )}
            </div>
          </div>
        </Card>
      ))}
      {canEditImpounds(user.role) && (
        <Button variant="secondary" size="sm" className="w-full" onClick={() => setShowAddOwner(true)}>+ Add Owner</Button>
      )}

      {/* Lien Holders */}
      <SectionHeader icon={FileText} title={`Lien Holders (${liens.length})`} />
      {liens.length === 0 ? <p className="text-xs text-slate-600 py-2">No lien holder recorded</p> : liens.map((l) => (
        <Card key={l.id} className="p-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-bold text-white">{l.name || 'Unknown'}</p>
              <p className="text-xs text-slate-500 mt-0.5">{l.phone || 'No phone'}</p>
              {l.address && <p className="text-xs text-slate-500 mt-1">{l.address}</p>}
            </div>
            <div className="flex items-center gap-1.5">
              {l.phone && (
                <MessageButton
                  compact
                  module="towing"
                  contactName={l.name || 'Lienholder'}
                  contactPhone={l.phone}
                  recordId={impoundIdForRelated}
                  recordType="impound"
                  recordLabel={impound ? `Lienholder: ${l.name ?? ''}`.trim() : undefined}
                  vehicleLabel={impound ? `${impound.year ?? ''} ${impound.make ?? ''} ${impound.model ?? ''}`.trim() : undefined}
                />
              )}
              {canDelete(user.role) && (
                <button onClick={async () => { await supabase.from('towing_lien_holders').delete().eq('id', l.id); reloadRelated(impoundIdForRelated); }}
                  className="w-7 h-7 rounded-lg bg-red-500/10 flex items-center justify-center active:scale-90 transition-transform">
                  <Trash2 size={12} className="text-red-400" />
                </button>
              )}
            </div>
          </div>
        </Card>
      ))}
      {canEditImpounds(user.role) && (
        <Button variant="secondary" size="sm" className="w-full" onClick={() => setShowAddLien(true)}>+ Add Lien Holder</Button>
      )}

      {/* Notices */}
      <SectionHeader icon={FileText} title={`Notices (${notices.length})`} />
      {notices.length === 0 ? <p className="text-xs text-slate-600 py-2">No notices sent</p> : notices.map((n) => (
        <Card key={n.id} className="p-4">
          <div className="flex items-center justify-between">
            <Badge color="cyan">{n.notice_type}</Badge>
            <span className="text-xs text-slate-500">{new Date(n.sent_date).toLocaleDateString()}</span>
          </div>
          {n.content && <p className="text-xs text-slate-500 mt-2">{n.content}</p>}
        </Card>
      ))}
      {canEditImpounds(user.role) && (
        <Button variant="secondary" size="sm" className="w-full" onClick={() => setShowAddNotice(true)}>+ Add Notice</Button>
      )}

      {/* Printed notice snapshots — frozen record of what was sent */}
      <div className="pt-2">
        <div className="flex items-center gap-2 pt-2">
          <Printer size={16} className="text-slate-400" />
          <h3 className="text-sm font-bold text-white">Printed Notice Records</h3>
        </div>
        <p className="text-xs text-slate-600 mt-1 mb-2">Frozen snapshots of exactly what was on each printed notice.</p>
        <NoticeSnapshotViewer impoundId={impoundIdForRelated} />
      </div>

      {/* History — same timeline style as VehiclesScreen */}
      <SectionHeader icon={History} title="History" />
      {history.length === 0 ? <p className="text-xs text-slate-600 py-2">No history recorded</p> : history.map((h) => (
        <div key={h.id} className="flex items-start gap-3 py-2">
          <div className="w-2 h-2 rounded-full bg-red-500 mt-1.5 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-white capitalize">{h.action.replace(/_/g, ' ')}</p>
            {h.details && <p className="text-xs text-slate-500">{h.details}</p>}
            <p className="text-[10px] text-slate-600 mt-0.5">{new Date(h.created_at).toLocaleString()}</p>
          </div>
        </div>
      ))}

      {/* Dialogs */}
      {showAddFee && <AddFeeDialog impoundId={impoundIdForRelated} userId={user.id} onClose={() => setShowAddFee(false)} onAdded={() => { setShowAddFee(false); reloadRelated(impoundIdForRelated); }} />}
      {showAddPayment && <AddPaymentDialog impoundId={impoundIdForRelated} userId={user.id} onClose={() => setShowAddPayment(false)} onAdded={() => { setShowAddPayment(false); reloadRelated(impoundIdForRelated); }} />}
      {showAddOwner && <AddOwnerDialog impoundId={impoundIdForRelated} userId={user.id} onClose={() => setShowAddOwner(false)} onAdded={() => { setShowAddOwner(false); reloadRelated(impoundIdForRelated); }} />}
      {showAddLien && <AddLienDialog impoundId={impoundIdForRelated} userId={user.id} onClose={() => setShowAddLien(false)} onAdded={() => { setShowAddLien(false); reloadRelated(impoundIdForRelated); }} />}
      {showAddNotice && <AddNoticeDialog impoundId={impoundIdForRelated} userId={user.id} onClose={() => setShowAddNotice(false)} onAdded={() => { setShowAddNotice(false); reloadRelated(impoundIdForRelated); }} />}
      {showPrintNotice && (
        <PrintTowingNotice
          impound={impound}
          owners={owners}
          liens={liens}
          fees={fees}
          payments={payments}
          userId={user.id}
          onPrinted={() => {}}
          onClose={() => setShowPrintNotice(false)}
        />
      )}
    </div>
  );
}

// ===== PAYMENTS PAGE =====
function PaymentsPage({ user }: { user: TowingUser }) {
  const [payments, setPayments] = useState<TowingPayment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('towing_payments').select('*').order('created_at', { ascending: false });
      setPayments((data ?? []) as TowingPayment[]);
      setLoading(false);
    })();
  }, []);

  if (loading) return <LoadingSpinner />;
  const total = payments.reduce((s, p) => s + Number(p.amount), 0);

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <p className="text-xs text-slate-500">Total Payments Collected</p>
        <p className="text-2xl font-bold text-emerald-400 mt-1">{formatCurrency(total)}</p>
      </Card>
      {payments.length === 0 ? <EmptyState text="No payments recorded" /> : payments.map((p) => (
        <Card key={p.id} className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-white">{formatCurrency(Number(p.amount))}</p>
              <p className="text-xs text-slate-500 capitalize">{p.method} · {p.reference || 'No ref'}</p>
            </div>
            <span className="text-xs text-slate-500">{new Date(p.created_at).toLocaleDateString()}</span>
          </div>
        </Card>
      ))}
    </div>
  );
}

// ===== FEES PAGE =====
function FeesPage({ user }: { user: TowingUser }) {
  const [fees, setFees] = useState<TowingFee[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('towing_fees').select('*').order('created_at', { ascending: false });
      setFees((data ?? []) as TowingFee[]);
      setLoading(false);
    })();
  }, []);

  if (loading) return <LoadingSpinner />;
  const total = fees.reduce((s, f) => s + Number(f.amount), 0);

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <p className="text-xs text-slate-500">Total Fees Assessed</p>
        <p className="text-2xl font-bold text-amber-400 mt-1">{formatCurrency(total)}</p>
      </Card>
      {fees.length === 0 ? <EmptyState text="No fees recorded" /> : fees.map((f) => (
        <Card key={f.id} className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-white">{formatCurrency(Number(f.amount))}</p>
              <p className="text-xs text-slate-500 capitalize">{f.fee_type} · {f.description || ''}</p>
            </div>
            <span className="text-xs text-slate-500">{new Date(f.created_at).toLocaleDateString()}</span>
          </div>
        </Card>
      ))}
    </div>
  );
}

// ===== PHOTOS PAGE =====
function PhotosPage({ user }: { user: TowingUser }) {
  const [photos, setPhotos] = useState<TowingPhoto[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('towing_photos').select('*').order('created_at', { ascending: false });
      setPhotos((data ?? []) as TowingPhoto[]);
      setLoading(false);
    })();
  }, []);

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-4">
      {photos.length === 0 ? <EmptyState text="No photos uploaded" /> : (
        <div className="grid grid-cols-2 gap-3">
          {photos.map((p) => (
            <Card key={p.id} className="overflow-hidden">
              <div className="aspect-video"><img src={p.url} alt={p.caption ?? ''} className="w-full h-full object-cover" /></div>
              {p.caption && <p className="text-xs text-slate-500 p-2">{p.caption}</p>}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ===== OWNERS PAGE =====
function OwnersPage({ user }: { user: TowingUser }) {
  const [owners, setOwners] = useState<(TowingOwner & { impound?: TowingImpound })[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('towing_owners').select('*, towing_impounds(*)').order('created_at', { ascending: false });
      setOwners((data ?? []) as (TowingOwner & { impound?: TowingImpound })[]);
      setLoading(false);
    })();
  }, []);

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-4">
      {owners.length === 0 ? <EmptyState text="No owners recorded" /> : owners.map((o) => (
        <Card key={o.id} className="p-4">
          <p className="text-sm font-bold text-white">{o.name || 'Unknown'}</p>
          <p className="text-xs text-slate-500 mt-0.5">{o.phone || 'No phone'} · {o.license_number || 'No license'}</p>
          {o.address && <p className="text-xs text-slate-500 mt-1">{o.address}</p>}
        </Card>
      ))}
    </div>
  );
}

// ===== LIEN HOLDERS PAGE =====
function LienHoldersPage({ user }: { user: TowingUser }) {
  const [liens, setLiens] = useState<TowingLienHolder[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('towing_lien_holders').select('*').order('created_at', { ascending: false });
      setLiens((data ?? []) as TowingLienHolder[]);
      setLoading(false);
    })();
  }, []);

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-4">
      {liens.length === 0 ? <EmptyState text="No lien holders recorded" /> : liens.map((l) => (
        <Card key={l.id} className="p-4">
          <p className="text-sm font-bold text-white">{l.name || 'Unknown'}</p>
          <p className="text-xs text-slate-500 mt-0.5">{l.phone || 'No phone'}</p>
          {l.address && <p className="text-xs text-slate-500 mt-1">{l.address}</p>}
        </Card>
      ))}
    </div>
  );
}

// ===== NOTICES PAGE =====
function NoticesPage({ user }: { user: TowingUser }) {
  const [notices, setNotices] = useState<TowingNotice[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('towing_notices').select('*').order('created_at', { ascending: false });
      setNotices((data ?? []) as TowingNotice[]);
      setLoading(false);
    })();
  }, []);

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-4">
      {notices.length === 0 ? <EmptyState text="No notices sent" /> : notices.map((n) => (
        <Card key={n.id} className="p-4">
          <div className="flex items-center justify-between">
            <Badge color="cyan">{n.notice_type}</Badge>
            <span className="text-xs text-slate-500">{new Date(n.sent_date).toLocaleDateString()}</span>
          </div>
          {n.content && <p className="text-xs text-slate-500 mt-2">{n.content}</p>}
        </Card>
      ))}
    </div>
  );
}

// ===== HISTORY PAGE =====
function HistoryPage({ user }: { user: TowingUser }) {
  const [history, setHistory] = useState<TowingHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('towing_history').select('*').order('created_at', { ascending: false });
      setHistory((data ?? []) as TowingHistoryEntry[]);
      setLoading(false);
    })();
  }, []);

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-4">
      {history.length === 0 ? <EmptyState text="No history recorded" /> : history.map((h) => (
        <div key={h.id} className="flex items-start gap-3 py-2">
          <div className="w-2 h-2 rounded-full bg-red-500 mt-1.5 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-white capitalize">{h.action.replace(/_/g, ' ')}</p>
            {h.details && <p className="text-xs text-slate-500">{h.details}</p>}
            <p className="text-[10px] text-slate-600 mt-0.5">{new Date(h.created_at).toLocaleString()}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ===== TOWING SETTINGS PAGE =====
function TowingSettingsPage({ user, onNavigate }: { user: TowingUser; onNavigate: (p: TowingPage) => void }) {
  const [showTemplates, setShowTemplates] = useState(false);

  if (showTemplates) {
    return (
      <div className="space-y-3">
        <button onClick={() => setShowTemplates(false)} className="flex items-center gap-1 text-slate-400 text-sm -ml-1">
          <ChevronLeft size={18} /> Back to Settings
        </button>
        <div className="flex items-center gap-2 pt-2">
          <FileText size={16} className="text-slate-400" />
          <h3 className="text-sm font-bold text-white">Notice Templates</h3>
        </div>
        <NoticeTemplateManager user={user} />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <Card onClick={() => setShowTemplates(true)} className="p-4 flex items-center gap-3">
        <Printer size={20} className="text-slate-400" />
        <div>
          <span className="text-sm font-semibold text-white block">Notice Templates</span>
          <span className="text-xs text-slate-500">Edit wording for printed towing notices</span>
        </div>
        <ChevronRight size={18} className="text-slate-600 ml-auto" />
      </Card>
      {canManageUsers(user.role) && (
        <>
          <Card onClick={() => onNavigate('user-management')} className="p-4 flex items-center gap-3">
            <Users size={20} className="text-slate-400" />
            <span className="text-sm font-semibold text-white">User Management</span>
            <ChevronRight size={18} className="text-slate-600 ml-auto" />
          </Card>
          <Card onClick={() => onNavigate('security-settings')} className="p-4 flex items-center gap-3">
            <ShieldCheck size={20} className="text-slate-400" />
            <span className="text-sm font-semibold text-white">Security Settings</span>
            <ChevronRight size={18} className="text-slate-600 ml-auto" />
          </Card>
          <Card onClick={() => onNavigate('sessions')} className="p-4 flex items-center gap-3">
            <Monitor size={20} className="text-slate-400" />
            <span className="text-sm font-semibold text-white">Active Sessions</span>
            <ChevronRight size={18} className="text-slate-600 ml-auto" />
          </Card>
        </>
      )}
      <Card className="p-4 flex items-center gap-3">
        <History size={20} className="text-slate-400" />
        <span className="text-sm font-semibold text-white">Audit History</span>
        <ChevronRight size={18} className="text-slate-600 ml-auto" onClick={() => onNavigate('history')} />
      </Card>
    </div>
  );
}

// ===== USER MANAGEMENT =====
function UserManagementPage({ user }: { user: TowingUser }) {
  const [users, setUsers] = useState<TowingUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPin, setNewPin] = useState('');
  const [newRole, setNewRole] = useState<TowingRole>('office_staff');
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase.from('towing_users').select('*').order('created_at', { ascending: false });
    setUsers((data ?? []) as TowingUser[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const addUser = async () => {
    if (adding || !newName.trim() || newPin.length < 4) return;
    setAdding(true);
    const pinHash = await hashPin(newPin);
    await supabase.from('towing_users').insert({ name: toTitleCase(newName.trim()), pin_hash: pinHash, role: newRole, active: true });
    setAdding(false); setShowAdd(false); setNewName(''); setNewPin('');
    load();
  };

  const toggleActive = async (u: TowingUser) => {
    await supabase.from('towing_users').update({ active: !u.active }).eq('id', u.id);
    load();
  };

  const resetLockout = async (u: TowingUser) => {
    await supabase.from('towing_users').update({ failed_attempts: 0, locked_until: null }).eq('id', u.id);
    load();
  };

  if (loading) return <LoadingSpinner />;

  const roleColors: Record<TowingRole, string> = {
    administrator: 'text-red-400 bg-red-500/15',
    manager: 'text-red-400 bg-red-500/15',
    office_staff: 'text-cyan-400 bg-cyan-500/15',
    driver: 'text-amber-400 bg-amber-500/15',
  };
  const roleLabels: Record<TowingRole, string> = {
    administrator: 'Admin', manager: 'Manager', office_staff: 'Office Staff', driver: 'Driver',
  };

  return (
    <div className="space-y-4">
      <Button onClick={() => setShowAdd(true)} className="w-full" icon={<Plus size={18} />}>Add User</Button>

      {showAdd && (
        <Card className="p-4 space-y-3">
          <Field label="Name" value={newName} onChange={setNewName} placeholder="Full name" />
          <Field label="PIN (4 digits)" value={newPin} onChange={(v) => setNewPin(v.replace(/\D/g, '').slice(0, 4))} placeholder="1234" />
          <div>
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide block mb-1.5">Role</label>
            <select value={newRole} onChange={(e) => setNewRole(e.target.value as TowingRole)}
              className="w-full bg-slate-900/80 border border-slate-700/50 rounded-xl px-3 py-2.5 text-white text-sm">
              <option value="administrator">Administrator</option>
              <option value="manager">Manager</option>
              <option value="office_staff">Office Staff</option>
              <option value="driver">Driver</option>
            </select>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button className="flex-1" onClick={addUser} disabled={adding || !newName.trim() || newPin.length !== 4}
              icon={adding ? <Loader2 size={16} className="animate-spin" /> : undefined}>Add</Button>
          </div>
        </Card>
      )}

      {users.map((u) => (
        <Card key={u.id} className="p-4">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2">
                <p className="text-sm font-bold text-white">{u.name}</p>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-semibold ${roleColors[u.role]}`}>{roleLabels[u.role]}</span>
                {!u.active && <Badge color="slate">Inactive</Badge>}
              </div>
              {u.failed_attempts > 0 && <p className="text-xs text-amber-400 mt-1">{u.failed_attempts} failed attempts</p>}
              {u.locked_until && new Date(u.locked_until).getTime() > Date.now() && <p className="text-xs text-red-400 mt-1">Locked</p>}
            </div>
            <div className="flex gap-2">
              {u.locked_until && <button onClick={() => resetLockout(u)} className="text-xs text-red-400 font-semibold">Reset Lock</button>}
              <button onClick={() => toggleActive(u)} className="text-xs text-slate-400 font-semibold">{u.active ? 'Deactivate' : 'Activate'}</button>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

// ===== SECURITY SETTINGS =====
function SecuritySettingsPage({ user }: { user: TowingUser }) {
  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="space-y-3">
          <h3 className="text-sm font-bold text-white">Security Configuration</h3>
          <SecurityRow label="Auto-lock timeout" value={`${Math.round(getInactivityTimeoutMs() / 60000)} minutes`} />
          <SecurityRow label="Lockout after bad attempts" value="5 attempts" />
          <SecurityRow label="Lockout duration" value="5 minutes" />
          <SecurityRow label="PIN requirements" value="4 digits, numeric" />
          <SecurityRow label="Session enforcement" value="Single active session per user" />
          <SecurityRow label="PIN storage" value="SHA-256 salted hash (never plaintext)" />
        </div>
      </Card>
      <Card className="p-4">
        <div className="flex items-center gap-3">
          <ShieldAlert size={18} className="text-amber-400" />
          <p className="text-xs text-slate-400">These settings are system-level and enforced across all towing module users. Future updates will allow per-role customization and multi-factor authentication.</p>
        </div>
      </Card>
    </div>
  );
}

function SecurityRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-slate-800/60 last:border-0">
      <span className="text-sm text-slate-500">{label}</span>
      <span className="text-sm text-white font-medium">{value}</span>
    </div>
  );
}

// ===== SESSIONS =====
function SessionsPage({ user, sessionId }: { user: TowingUser; sessionId: string }) {
  const [sessions, setSessions] = useState<TowingSession[]>([]);
  const [users, setUsers] = useState<Map<string, TowingUser>>(new Map());
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data: s } = await supabase.from('towing_sessions').select('*').is('ended_at', null).order('started_at', { ascending: false });
    const { data: u } = await supabase.from('towing_users').select('*');
    setSessions((s ?? []) as TowingSession[]);
    setUsers(new Map((u ?? []).map((u) => [u.id, u as TowingUser])));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const forceLogout = async (s: TowingSession) => {
    await supabase.from('towing_sessions').update({ ended_at: new Date().toISOString(), ended_reason: 'forced_logout' }).eq('id', s.id);
    load();
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-4">
      {sessions.length === 0 ? <EmptyState text="No active sessions" /> : sessions.map((s) => {
        const u = users.get(s.user_id);
        const isMe = s.id === sessionId;
        const startTime = new Date(s.started_at);
        const lastAct = new Date(s.last_activity);
        return (
          <Card key={s.id} className="p-4">
            <div className="flex items-start justify-between mb-2">
              <div>
                <p className="text-sm font-bold text-white">{u?.name ?? 'Unknown'}</p>
                <p className="text-xs text-slate-500 capitalize">{u?.role ?? ''}</p>
              </div>
              {isMe && <Badge color="blue">This device</Badge>}
            </div>
            <div className="space-y-1 text-xs text-slate-500">
              <div className="flex items-center gap-2"><Monitor size={12} /> {s.device_name ?? 'Unknown'}</div>
              <div className="flex items-center gap-2"><Clock size={12} /> Started: {startTime.toLocaleDateString()} {startTime.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</div>
              <div className="flex items-center gap-2"><Clock size={12} /> Last active: {lastAct.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</div>
            </div>
            {!isMe && (
              <Button variant="danger" size="sm" className="w-full mt-3" onClick={() => forceLogout(s)} icon={<Power size={14} />}>
                Force Logout
              </Button>
            )}
          </Card>
        );
      })}
    </div>
  );
}

// ===== SHARED UI HELPERS (local, matching app style) =====
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
    <div className="flex flex-col items-center text-center py-16">
      <Car size={48} className="text-slate-700" strokeWidth={1.5} />
      <p className="text-slate-500 text-sm mt-3">{text}</p>
    </div>
  );
}

function SearchBar({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="relative">
      <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="w-full bg-slate-800/60 border border-slate-700/50 rounded-xl pl-11 pr-10 py-3.5 text-white text-sm placeholder:text-slate-500 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/20 transition-all" />
      {value && (
        <button onClick={() => onChange('')} className="absolute right-3 top-1/2 -translate-y-1/2">
          <X size={18} className="text-slate-500" />
        </button>
      )}
    </div>
  );
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide block mb-1.5">{label}</label>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="w-full bg-slate-900/80 border border-slate-700/50 rounded-xl px-3 py-2.5 text-white text-sm placeholder:text-slate-600 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/20 transition-all" />
    </div>
  );
}

function TextArea({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide block mb-1.5">{label}</label>
      <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="w-full bg-slate-900/80 border border-slate-700/50 rounded-xl px-3 py-2.5 text-white text-sm placeholder:text-slate-600 focus:border-red-500 focus:outline-none transition-all min-h-20 resize-vertical" />
    </div>
  );
}

function SectionHeader({ icon: Icon, title }: { icon: typeof Car; title: string }) {
  return (
    <div className="flex items-center gap-2 pt-2">
      <Icon size={16} className="text-slate-400" />
      <h3 className="text-sm font-bold text-white">{title}</h3>
    </div>
  );
}

function DetailItem({ icon: Icon, label, value }: { icon: typeof Car; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2">
      <Icon size={14} className="text-slate-500 flex-shrink-0" />
      <div className="min-w-0">
        <p className="text-[10px] text-slate-500 uppercase font-semibold">{label}</p>
        <p className="text-xs text-white truncate">{value}</p>
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const colors: Record<string, string> = {
    active_impound: 'text-red-400 bg-red-500/15',
    released: 'text-emerald-400 bg-emerald-500/15',
    title_obtained: 'text-cyan-400 bg-cyan-500/15',
    junkyard: 'text-slate-400 bg-slate-500/15',
    for_sale: 'text-amber-400 bg-amber-500/15',
  };
  const labels: Record<string, string> = {
    active_impound: 'Active', released: 'Released', title_obtained: 'Title', junkyard: 'Junk Yard', for_sale: 'For Sale',
  };
  return <span className={`text-xs px-2.5 py-1 rounded-lg font-semibold ${colors[status] ?? 'text-slate-400 bg-slate-500/15'}`}>{labels[status] ?? status}</span>;
}

function SuccessMessage({ title, message }: { title: string; message: string }) {
  return (
    <div className="flex flex-col items-center text-center py-12">
      <div className="w-16 h-16 rounded-full bg-emerald-500/15 border-2 border-emerald-500/30 flex items-center justify-center mb-4">
        <CheckCircle2 size={32} className="text-emerald-400" />
      </div>
      <h2 className="text-lg font-bold text-white">{title}</h2>
      <p className="text-slate-400 text-sm mt-2 max-w-xs">{message}</p>
    </div>
  );
}

// ===== DIALOGS (bottom-sheet style matching app modals) =====
function ModalSheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center lg:items-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in" />
      <div className="relative w-full max-w-md lg:max-w-2xl bg-slate-900 rounded-t-3xl lg:rounded-2xl border-t lg:border border-slate-700/50 max-h-[85vh] overflow-y-auto scrollbar-hide animate-slide-up" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-slate-900/95 backdrop-blur-xl px-4 pt-4 pb-3 border-b border-slate-800 flex items-center justify-between z-10">
          <h2 className="text-lg font-bold text-white">{title}</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center">
            <X size={18} className="text-slate-400" />
          </button>
        </div>
        <div className="p-4 space-y-4">{children}</div>
      </div>
    </div>
  );
}

function ReleaseDialog({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: (releasedTo: string, releaseFee: string) => void }) {
  const [releasedTo, setReleasedTo] = useState('');
  const [releaseFee, setReleaseFee] = useState('');
  return (
    <ModalSheet title="Release Vehicle" onClose={onCancel}>
      <Field label="Released To" value={releasedTo} onChange={setReleasedTo} placeholder="Recipient name" />
      <Field label="Release Fee ($)" value={releaseFee} onChange={(v) => setReleaseFee(v.replace(/[^0-9.]/g, ''))} placeholder="0.00" />
      <div className="flex gap-3">
        <Button variant="secondary" className="flex-1" onClick={onCancel}>Cancel</Button>
        <Button className="flex-1" onClick={() => onConfirm(releasedTo, releaseFee)} disabled={!releasedTo.trim()}>Release</Button>
      </div>
    </ModalSheet>
  );
}

function AddFeeDialog({ impoundId, userId, onClose, onAdded }: { impoundId: string; userId: string; onClose: () => void; onAdded: () => void }) {
  const [feeType, setFeeType] = useState<TowingFee['fee_type']>('tow');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (saving || !amount) return;
    setSaving(true);
    await supabase.from('towing_fees').insert({ impound_id: impoundId, fee_type: toTitleCase(feeType), amount: Number(amount), description: description ? toTitleCase(description) : null, created_by: userId });
    setSaving(false); onAdded();
  };

  return (
    <ModalSheet title="Add Fee" onClose={onClose}>
      <div>
        <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide block mb-1.5">Fee Type</label>
        <select value={feeType} onChange={(e) => setFeeType(e.target.value as TowingFee['fee_type'])}
          className="w-full bg-slate-900/80 border border-slate-700/50 rounded-xl px-3 py-2.5 text-white text-sm">
          <option value="tow">Tow</option><option value="storage">Storage</option><option value="admin">Admin</option><option value="lien">Lien</option><option value="other">Other</option>
        </select>
      </div>
      <Field label="Amount ($)" value={amount} onChange={(v) => setAmount(v.replace(/[^0-9.]/g, ''))} placeholder="50.00" />
      <Field label="Description" value={description} onChange={setDescription} placeholder="Optional" />
      <div className="flex gap-3">
        <Button variant="secondary" className="flex-1" onClick={onClose}>Cancel</Button>
        <Button className="flex-1" onClick={handleSave} disabled={saving || !amount} icon={saving ? <Loader2 size={16} className="animate-spin" /> : undefined}>Save</Button>
      </div>
    </ModalSheet>
  );
}

function AddPaymentDialog({ impoundId, userId, onClose, onAdded }: { impoundId: string; userId: string; onClose: () => void; onAdded: () => void }) {
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<TowingPayment['method']>('cash');
  const [reference, setReference] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (saving || !amount) return;
    setSaving(true);
    await supabase.from('towing_payments').insert({ impound_id: impoundId, amount: Number(amount), method, reference: reference || null, created_by: userId });
    setSaving(false); onAdded();
  };

  return (
    <ModalSheet title="Add Payment" onClose={onClose}>
      <Field label="Amount ($)" value={amount} onChange={(v) => setAmount(v.replace(/[^0-9.]/g, ''))} placeholder="50.00" />
      <div>
        <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide block mb-1.5">Method</label>
        <select value={method} onChange={(e) => setMethod(e.target.value as TowingPayment['method'])}
          className="w-full bg-slate-900/80 border border-slate-700/50 rounded-xl px-3 py-2.5 text-white text-sm">
          <option value="cash">Cash</option><option value="card">Card</option><option value="check">Check</option><option value="other">Other</option>
        </select>
      </div>
      <Field label="Reference" value={reference} onChange={setReference} placeholder="Optional" />
      <div className="flex gap-3">
        <Button variant="secondary" className="flex-1" onClick={onClose}>Cancel</Button>
        <Button className="flex-1" onClick={handleSave} disabled={saving || !amount} icon={saving ? <Loader2 size={16} className="animate-spin" /> : undefined}>Save</Button>
      </div>
    </ModalSheet>
  );
}

function AddOwnerDialog({ impoundId, userId, onClose, onAdded }: { impoundId: string; userId: string; onClose: () => void; onAdded: () => void }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [license, setLicense] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (saving || !name.trim()) return;
    setSaving(true);
    await supabase.from('towing_owners').insert({ impound_id: impoundId, name: toTitleCase(name.trim()), phone: phone || null, address: address ? toTitleCase(address) : null, license_number: license || null });
    setSaving(false); onAdded();
  };

  return (
    <ModalSheet title="Add Owner" onClose={onClose}>
      <Field label="Name" value={name} onChange={setName} placeholder="Full name" />
      <Field label="Phone" value={phone} onChange={setPhone} placeholder="555-1234" />
      <Field label="License Number" value={license} onChange={setLicense} placeholder="DL number" />
      <Field label="Address" value={address} onChange={setAddress} placeholder="123 Main St" />
      <div className="flex gap-3">
        <Button variant="secondary" className="flex-1" onClick={onClose}>Cancel</Button>
        <Button className="flex-1" onClick={handleSave} disabled={saving || !name.trim()} icon={saving ? <Loader2 size={16} className="animate-spin" /> : undefined}>Save</Button>
      </div>
    </ModalSheet>
  );
}

function AddLienDialog({ impoundId, userId, onClose, onAdded }: { impoundId: string; userId: string; onClose: () => void; onAdded: () => void }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (saving || !name.trim()) return;
    setSaving(true);
    await supabase.from('towing_lien_holders').insert({ impound_id: impoundId, name: toTitleCase(name.trim()), phone: phone || null, address: address ? toTitleCase(address) : null });
    setSaving(false); onAdded();
  };

  return (
    <ModalSheet title="Add Lien Holder" onClose={onClose}>
      <Field label="Name" value={name} onChange={setName} placeholder="Lien holder name" />
      <Field label="Phone" value={phone} onChange={setPhone} placeholder="555-1234" />
      <Field label="Address" value={address} onChange={setAddress} placeholder="123 Main St" />
      <div className="flex gap-3">
        <Button variant="secondary" className="flex-1" onClick={onClose}>Cancel</Button>
        <Button className="flex-1" onClick={handleSave} disabled={saving || !name.trim()} icon={saving ? <Loader2 size={16} className="animate-spin" /> : undefined}>Save</Button>
      </div>
    </ModalSheet>
  );
}

function AddNoticeDialog({ impoundId, userId, onClose, onAdded }: { impoundId: string; userId: string; onClose: () => void; onAdded: () => void }) {
  const [noticeType, setNoticeType] = useState<TowingNotice['notice_type']>('towing');
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    await supabase.from('towing_notices').insert({ impound_id: impoundId, notice_type: noticeType, content: content || null, created_by: userId });
    setSaving(false); onAdded();
  };

  return (
    <ModalSheet title="Add Notice" onClose={onClose}>
      <div>
        <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide block mb-1.5">Notice Type</label>
        <select value={noticeType} onChange={(e) => setNoticeType(e.target.value as TowingNotice['notice_type'])}
          className="w-full bg-slate-900/80 border border-slate-700/50 rounded-xl px-3 py-2.5 text-white text-sm">
          <option value="towing">Towing</option><option value="lien">Lien</option><option value="abandonment">Abandonment</option><option value="sale">Sale</option><option value="other">Other</option>
        </select>
      </div>
      <TextArea label="Content" value={content} onChange={setContent} placeholder="Notice details" />
      <div className="flex gap-3">
        <Button variant="secondary" className="flex-1" onClick={onClose}>Cancel</Button>
        <Button className="flex-1" onClick={handleSave} disabled={saving} icon={saving ? <Loader2 size={16} className="animate-spin" /> : undefined}>Save</Button>
      </div>
    </ModalSheet>
  );
}
