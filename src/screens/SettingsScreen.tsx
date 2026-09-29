import { useState } from 'react';
import {
  Settings, Plus, ChevronLeft, ChevronUp, ChevronDown, Trash2, Pencil, X, Check,
  Palette, Flag, Workflow, LogOut, User, Clock, MessageSquare, CreditCard, Store,
  ArrowLeft,
} from 'lucide-react';
import { Card, Button } from '@/components/ui';
import { toTitleCase } from '@/utils/textCase';
import { getSessionTimeout, setSessionTimeout } from '@/auth/sessionService';
import { MessagingSettings } from '@/messaging/MessagingSettings';
import { PaymentSettings } from '@/payments/PaymentSettings';
import { EbaySettings } from '@/ebay/EbaySettings';
import type { Screen, VehicleStore, VehicleStatusConfig, StatusColor, WorkflowType } from '@/types';

const COLORS: StatusColor[] = ['blue', 'green', 'amber', 'red', 'slate', 'cyan'];

const COLOR_STYLES: Record<StatusColor, string> = {
  blue: 'bg-red-500 text-white',
  green: 'bg-emerald-500 text-white',
  amber: 'bg-amber-500 text-white',
  red: 'bg-red-500 text-white',
  slate: 'bg-slate-500 text-white',
  cyan: 'bg-cyan-500 text-white',
};

const WORKFLOWS: { id: WorkflowType; label: string; desc: string }[] = [
  { id: 'release', label: 'Release', desc: 'Capture release fee + signature' },
  { id: 'sold', label: 'Sold', desc: 'Capture buyer info + price' },
  { id: 'scrapped', label: 'Scrapped', desc: 'Capture yard, weight, payout' },
];

type SettingsSection = 'statuses' | 'security' | 'messaging' | 'payments' | 'ebay';

interface SectionDef {
  id: SettingsSection;
  label: string;
  desc: string;
  icon: React.ReactNode;
  iconBg: string;
  category: 'general' | 'integrations';
}

const SECTIONS: SectionDef[] = [
  { id: 'statuses', label: 'Vehicle Statuses', desc: 'Manage workflow statuses & colors', icon: <Workflow size={20} />, iconBg: 'bg-amber-500/15', category: 'general' },
  { id: 'security', label: 'Auto-Lock & Security', desc: 'Inactivity timeout & PIN lock', icon: <Clock size={20} />, iconBg: 'bg-red-500/15', category: 'general' },
  { id: 'messaging', label: 'Messaging', desc: 'SMS provider for Shop, Towing & Parts', icon: <MessageSquare size={20} />, iconBg: 'bg-slate-700', category: 'integrations' },
  { id: 'payments', label: 'Payments', desc: 'Square, PayPal, Venmo, Cash App & links', icon: <CreditCard size={20} />, iconBg: 'bg-emerald-500/15', category: 'integrations' },
  { id: 'ebay', label: 'eBay Motors', desc: 'Publish parts listings to eBay', icon: <Store size={20} />, iconBg: 'bg-red-500/15', category: 'integrations' },
];

export function SettingsScreen({ onNavigate, store, onLock, employeeName }: { onNavigate: (s: Screen) => void; store: VehicleStore; onLock: () => void; employeeName: string }) {
  const [activeSection, setActiveSection] = useState<SettingsSection | null>(null);

  const generalSections = SECTIONS.filter((s) => s.category === 'general');
  const integrationSections = SECTIONS.filter((s) => s.category === 'integrations');

  const renderSection = () => {
    if (!activeSection) return null;
    const section = SECTIONS.find((s) => s.id === activeSection)!;

    return (
      <div className="lg:col-span-2 animate-fade-in">
        <button
          onClick={() => setActiveSection(null)}
          className="flex items-center gap-1.5 text-slate-400 text-sm hover:text-white transition-colors mb-4 lg:hidden"
        >
          <ArrowLeft size={18} /> Back to Settings
        </button>

        {activeSection === 'statuses' && (
          <StatusesSection store={store} />
        )}
        {activeSection === 'security' && (
          <SecuritySection onLock={onLock} />
        )}
        {activeSection === 'messaging' && (
          <MessagingSettings />
        )}
        {activeSection === 'payments' && (
          <PaymentSettings onBack={() => setActiveSection(null)} />
        )}
        {activeSection === 'ebay' && (
          <EbaySettings onBack={() => setActiveSection(null)} />
        )}
      </div>
    );
  };

  const renderMenu = () => (
    <div className="space-y-5 lg:col-span-2 animate-fade-in">
      {/* General */}
      <div>
        <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-2 px-1">General</p>
        <div className="space-y-2">
          {generalSections.map((s) => (
            <SectionRow key={s.id} section={s} onClick={() => setActiveSection(s.id)} />
          ))}
        </div>
      </div>

      {/* Integrations */}
      <div>
        <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-2 px-1">Integrations</p>
        <div className="space-y-2">
          {integrationSections.map((s) => (
            <SectionRow key={s.id} section={s} onClick={() => setActiveSection(s.id)} />
          ))}
        </div>
      </div>

      {/* Sign Out */}
      <div className="pt-2">
        <button
          onClick={() => { if (confirm('Sign out? You will need to enter your PIN again.')) onLock(); }}
          className="w-full flex items-center justify-center gap-2 px-4 py-3.5 text-sm font-semibold text-red-400 bg-red-500/10 border border-red-500/20 rounded-2xl active:scale-[0.97] transition-all"
        >
          <LogOut size={18} /> Sign Out
        </button>
      </div>
    </div>
  );

  return (
    <div className="px-4 pt-14 pb-nav-safe lg:px-8 lg:pt-8 space-y-5 animate-fade-in">
      <button onClick={() => onNavigate('home')} className="flex items-center gap-1 text-slate-400 text-sm -ml-1 lg:hidden">
        <ChevronLeft size={18} /> Back
      </button>

      <div className="flex items-center gap-2">
        <Settings size={24} className="text-red-400" />
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-white">Settings</h1>
          <p className="text-slate-400 text-sm mt-0.5">
            {activeSection ? SECTIONS.find((s) => s.id === activeSection)?.label : 'Manage your shop configuration'}
          </p>
        </div>
        <div className="flex items-center gap-2 px-2.5 py-1.5 bg-slate-800/60 border border-slate-700/50 rounded-xl">
          <User size={14} className="text-red-400" />
          <span className="text-xs font-semibold text-slate-300">{employeeName}</span>
        </div>
      </div>

      {/* Desktop: sidebar + content. Mobile: menu or section */}
      <div className="lg:grid lg:grid-cols-[280px_1fr] lg:gap-6">
        {/* Desktop sidebar nav */}
        {activeSection && (
          <div className="hidden lg:block space-y-1">
            <button
              onClick={() => setActiveSection(null)}
              className="flex items-center gap-1.5 text-slate-400 text-sm hover:text-white transition-colors mb-3 w-full"
            >
              <ArrowLeft size={16} /> Back to Settings
            </button>
            {SECTIONS.map((s) => (
              <button
                key={s.id}
                onClick={() => setActiveSection(s.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all text-left ${
                  activeSection === s.id
                    ? 'bg-red-600/15 text-white border border-red-500/30'
                    : 'text-slate-400 hover:bg-slate-800/50 border border-transparent'
                }`}
              >
                <span className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${s.iconBg}`}>
                  {s.icon}
                </span>
                {s.label}
              </button>
            ))}
          </div>
        )}

        {/* Mobile: show menu or active section */}
        {!activeSection && renderMenu()}

        {/* Desktop: show menu in main area when no section selected */}
        {!activeSection && (
          <div className="hidden lg:block" />
        )}

        {/* Active section content */}
        {activeSection && renderSection()}
      </div>
    </div>
  );
}

function SectionRow({ section, onClick }: { section: SectionDef; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 p-3.5 bg-slate-900/80 border border-slate-800 rounded-2xl hover:border-slate-700 hover:bg-slate-800/60 active:scale-[0.98] transition-all text-left group"
    >
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${section.iconBg}`}>
        {section.icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-white">{section.label}</p>
        <p className="text-xs text-slate-500">{section.desc}</p>
      </div>
      <ChevronLeft size={18} className="text-slate-600 rotate-180 group-hover:text-slate-400 transition-colors flex-shrink-0" />
    </button>
  );
}

// ===== VEHICLE STATUSES SECTION =====
function StatusesSection({ store }: { store: VehicleStore }) {
  const [editing, setEditing] = useState<VehicleStatusConfig | null>(null);
  const [adding, setAdding] = useState(false);

  const { statusConfigs } = store;
  const sorted = [...statusConfigs].sort((a, b) => a.sortOrder - b.sortOrder);

  const handleMove = (id: string, dir: -1 | 1) => {
    const idx = sorted.findIndex((c) => c.id === id);
    const swapIdx = idx + dir;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;
    const newOrder = sorted.map((c) => c.id);
    [newOrder[idx], newOrder[swapIdx]] = [newOrder[swapIdx], newOrder[idx]];
    store.reorderStatusConfigs(newOrder);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 p-2.5 bg-red-500/10 border border-red-500/20 rounded-xl">
        <Workflow size={14} className="text-red-400 flex-shrink-0" />
        <p className="text-xs text-red-300">Customize the statuses vehicles move through. Assign workflow actions to capture data on status change.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {sorted.map((config, idx) => (
          <Card key={config.id} className="p-4">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${COLOR_STYLES[config.color]}`}>
                <span className="text-sm font-bold">{idx + 1}</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-white font-bold text-sm">{config.name}</p>
                  {config.isDefault && (
                    <span className="flex items-center gap-1 text-[10px] text-red-400 font-semibold">
                      <Flag size={10} /> Default
                    </span>
                  )}
                  {config.workflow && (
                    <span className="flex items-center gap-1 text-[10px] text-amber-400 font-semibold">
                      <Workflow size={10} /> {config.workflow}
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 mt-0.5 font-mono">{config.slug}</p>
              </div>
              <div className="flex flex-col gap-1">
                <button
                  onClick={() => handleMove(config.id, -1)}
                  disabled={idx === 0}
                  className="w-7 h-7 rounded-lg bg-slate-700/50 flex items-center justify-center disabled:opacity-30 active:scale-90 transition-transform"
                >
                  <ChevronUp size={16} className="text-slate-400" />
                </button>
                <button
                  onClick={() => handleMove(config.id, 1)}
                  disabled={idx === sorted.length - 1}
                  className="w-7 h-7 rounded-lg bg-slate-700/50 flex items-center justify-center disabled:opacity-30 active:scale-90 transition-transform"
                >
                  <ChevronDown size={16} className="text-slate-400" />
                </button>
              </div>
            </div>
            <div className="flex items-center gap-2 mt-3 pt-3 border-t border-slate-700/40">
              <button
                onClick={() => setEditing(config)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-700/50 text-slate-300 text-xs font-semibold active:scale-95 transition-transform"
              >
                <Pencil size={12} /> Edit
              </button>
              <button
                onClick={() => {
                  if (confirm(`Delete "${config.name}"? Vehicles with this status will keep it until changed.`)) {
                    store.deleteStatusConfig(config.id);
                  }
                }}
                disabled={sorted.length <= 1}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 text-xs font-semibold active:scale-95 transition-transform disabled:opacity-30"
              >
                <Trash2 size={12} /> Delete
              </button>
            </div>
          </Card>
        ))}
      </div>

      <Button onClick={() => setAdding(true)} variant="secondary" size="lg" className="w-full" icon={<Plus size={20} />}>
        Add New Status
      </Button>

      {(editing || adding) && (
        <StatusEditor
          config={editing}
          onClose={() => { setEditing(null); setAdding(false); }}
          onSave={async (data) => {
            const normalizedData = { ...data, name: data.name ? toTitleCase(data.name) : data.name };
            if (editing) {
              await store.updateStatusConfig(editing.id, normalizedData);
            } else {
              await store.addStatusConfig({
                name: toTitleCase(data.name ?? 'New Status'),
                slug: data.slug ?? '',
                color: data.color ?? 'slate',
                sortOrder: sorted.length,
                isDefault: data.isDefault ?? false,
                workflow: data.workflow ?? null,
                isArchived: false,
              });
            }
            setEditing(null);
            setAdding(false);
          }}
        />
      )}
    </div>
  );
}

// ===== SECURITY SECTION =====
function SecuritySection({ onLock }: { onLock: () => void }) {
  const [timeoutMinutes, setTimeoutMinutes] = useState(Math.round(getSessionTimeout() / 60000));

  const handleTimeoutChange = (minutes: number) => {
    setTimeoutMinutes(minutes);
    setSessionTimeout(minutes * 60 * 1000);
  };

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/15 flex items-center justify-center flex-shrink-0">
            <Clock size={18} className="text-amber-400" />
          </div>
          <div>
            <p className="text-sm font-bold text-white">Auto-Lock Timeout</p>
            <p className="text-xs text-slate-500">How long before the app locks from inactivity</p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          {[1, 5, 15, 30, 60].map((m) => (
            <button
              key={m}
              onClick={() => handleTimeoutChange(m)}
              className={`px-3 py-2 rounded-xl text-sm font-semibold transition-all active:scale-95 ${
                timeoutMinutes === m
                  ? 'bg-red-600 text-white'
                  : 'bg-slate-800/60 text-slate-400 border border-slate-700/50'
              }`}
            >
              {m < 60 ? `${m} min` : '1 hr'}
            </button>
          ))}
        </div>
      </Card>

      <button
        onClick={() => { if (confirm('Sign out? You will need to enter your PIN again.')) onLock(); }}
        className="w-full flex items-center justify-center gap-2 px-4 py-3.5 text-sm font-semibold text-red-400 bg-red-500/10 border border-red-500/20 rounded-2xl active:scale-[0.97] transition-all"
      >
        <LogOut size={18} /> Sign Out
      </button>
    </div>
  );
}

function StatusEditor({
  config,
  onClose,
  onSave,
}: {
  config: VehicleStatusConfig | null;
  onClose: () => void;
  onSave: (data: Partial<VehicleStatusConfig>) => void;
}) {
  const [name, setName] = useState(config?.name ?? '');
  const [color, setColor] = useState<StatusColor>(config?.color ?? 'slate');
  const [isDefault, setIsDefault] = useState(config?.isDefault ?? false);
  const [workflow, setWorkflow] = useState<WorkflowType | null>(config?.workflow ?? null);

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center lg:items-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in" />
      <div
        className="relative w-full max-w-md lg:max-w-2xl bg-slate-900 rounded-t-3xl lg:rounded-2xl border-t lg:border border-slate-700/50 max-h-[85vh] overflow-y-auto scrollbar-hide animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-slate-900/95 backdrop-blur-xl px-4 pt-4 pb-3 border-b border-slate-800 flex items-center justify-between z-10">
          <h2 className="text-lg font-bold text-white">{config ? 'Edit Status' : 'New Status'}</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center">
            <X size={18} className="text-slate-400" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div>
            <p className="text-[10px] text-slate-500 uppercase font-semibold tracking-wide mb-2">Status Name</p>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Released, Sold, Scrapped"
              className="w-full bg-slate-800/60 border border-slate-700/50 rounded-xl px-3 py-3 text-white text-sm placeholder:text-slate-500 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/20 transition-all"
            />
          </div>

          <div>
            <p className="text-[10px] text-slate-500 uppercase font-semibold tracking-wide mb-2 flex items-center gap-1">
              <Palette size={12} /> Color
            </p>
            <div className="flex gap-2">
              {COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={`w-10 h-10 rounded-xl transition-all active:scale-90 ${COLOR_STYLES[c]} ${color === c ? 'ring-2 ring-white ring-offset-2 ring-offset-slate-900' : 'opacity-60'}`}
                />
              ))}
            </div>
          </div>

          <div>
            <p className="text-[10px] text-slate-500 uppercase font-semibold tracking-wide mb-2 flex items-center gap-1">
              <Flag size={12} /> Default Status
            </p>
            <button
              onClick={() => setIsDefault(!isDefault)}
              className={`w-full flex items-center justify-between px-3 py-3 rounded-xl border transition-all ${
                isDefault ? 'bg-red-500/10 border-red-500/30 text-red-400' : 'bg-slate-800/60 border-slate-700/50 text-slate-400'
              }`}
            >
              <span className="text-sm font-semibold">Apply to new vehicles on intake</span>
              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${isDefault ? 'bg-red-600 border-red-600' : 'border-slate-600'}`}>
                {isDefault && <Check size={12} className="text-white" />}
              </div>
            </button>
          </div>

          <div>
            <p className="text-[10px] text-slate-500 uppercase font-semibold tracking-wide mb-2 flex items-center gap-1">
              <Workflow size={12} /> Workflow Action (optional)
            </p>
            <div className="space-y-2">
              <button
                onClick={() => setWorkflow(null)}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl border transition-all ${
                  workflow === null ? 'bg-slate-700/50 border-slate-600 text-white' : 'bg-slate-800/40 border-slate-700/40 text-slate-500'
                }`}
              >
                <span className="text-sm font-semibold">None</span>
                {workflow === null && <Check size={14} className="text-white" />}
              </button>
              {WORKFLOWS.map((w) => (
                <button
                  key={w.id}
                  onClick={() => setWorkflow(w.id)}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl border transition-all ${
                    workflow === w.id ? 'bg-amber-500/10 border-amber-500/30 text-amber-400' : 'bg-slate-800/40 border-slate-700/40 text-slate-500'
                  }`}
                >
                  <div className="text-left">
                    <p className="text-sm font-semibold">{w.label}</p>
                    <p className="text-[11px] text-slate-500">{w.desc}</p>
                  </div>
                  {workflow === w.id && <Check size={14} className="text-amber-400" />}
                </button>
              ))}
            </div>
          </div>

          <Button
            onClick={() => onSave({ name, color, isDefault, workflow })}
            size="lg"
            className="w-full"
            disabled={!name.trim()}
          >
            {config ? 'Save Changes' : 'Create Status'}
          </Button>
        </div>
      </div>
    </div>
  );
}
