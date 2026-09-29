import { useState, useEffect, useCallback } from 'react';
import {
  ChevronLeft, ChevronRight, User, Clock, Loader2, Download, Lock, AlertCircle,
  Activity, Edit3, Trash2, Plus, History, X, Check, AlertTriangle, Shield,
} from 'lucide-react';
import { Card, Badge, Button } from '@/components/ui';
import { supabase } from '@/supabaseClient';
import { restoreSession } from '@/auth/sessionService';
import type { Screen } from '@/types';

interface Employee {
  id: string;
  name: string;
  role: string;
}

interface TimeClock {
  id: string;
  employee_id: string;
  clock_in: string;
  clock_out: string | null;
  edited_by: string | null;
  edited_at: string | null;
}

interface AuditEntry {
  id: string;
  time_clock_id: string | null;
  employee_id: string | null;
  employee_name: string | null;
  action: string;
  old_clock_in: string | null;
  old_clock_out: string | null;
  new_clock_in: string | null;
  new_clock_out: string | null;
  changed_by: string | null;
  changed_by_name: string | null;
  reason: string | null;
  created_at: string;
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MAX_HOURS_PER_ENTRY = 16;
const MAX_HOURS_PER_DAY = 24;
const TZ = 'America/Denver';
const DOW_MAP: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };

function formatTime(s: string): string {
  return new Date(s).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: TZ });
}

function formatDate(s: string): string {
  return new Date(s).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: TZ });
}

function formatDateTime(s: string): string {
  return new Date(s).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: TZ });
}

function calcHours(clockIn: string, clockOut: string | null): number {
  const end = clockOut ? new Date(clockOut).getTime() : Date.now();
  return Math.max(0, (end - new Date(clockIn).getTime()) / (1000 * 60 * 60));
}

function formatHours(h: number): string {
  const whole = Math.floor(h);
  const mins = Math.round((h - whole) * 60);
  return `${whole}h ${mins}m`;
}

function getWeekStart(offset: number): Date {
  const parts = new Date().toLocaleDateString('en-US', { timeZone: TZ, year: 'numeric', month: 'numeric', day: 'numeric' });
  const [month, day, year] = parts.split('/').map(Number);
  const denverDate = new Date(year, month - 1, day);
  const diff = denverDate.getDate() - denverDate.getDay() + offset * 7;
  return new Date(year, month - 1, diff, 0, 0, 0, 0);
}

function getWeekEnd(start: Date): Date {
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return end;
}

function getPayPeriodStart(): Date {
  const parts = new Date().toLocaleDateString('en-US', { timeZone: TZ, year: 'numeric', month: 'numeric', day: 'numeric' });
  const [month, day, year] = parts.split('/').map(Number);
  const denverDate = new Date(year, month - 1, day);
  const diff = denverDate.getDate() - denverDate.getDay();
  const thisWeekStart = new Date(year, month - 1, diff, 0, 0, 0, 0);
  const weeksSinceEpoch = Math.floor(thisWeekStart.getTime() / (7 * 24 * 60 * 60 * 1000));
  if (weeksSinceEpoch % 2 === 0) {
    return thisWeekStart;
  }
  const prev = new Date(thisWeekStart);
  prev.setDate(prev.getDate() - 7);
  return prev;
}

function getDayOfWeek(s: string): number {
  const weekday = new Date(s).toLocaleDateString('en-US', { weekday: 'short', timeZone: TZ });
  return DOW_MAP[weekday] ?? 0;
}

function toLocalDateTimeInput(date: Date): string {
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60000);
  return local.toISOString().slice(0, 16);
}

type ModalMode = null | 'edit' | 'add';

export function TimesheetScreen({ onNavigate }: { onNavigate: (s: Screen) => void }) {
  void onNavigate;

  const [unlocked, setUnlocked] = useState(false);
  const [managerPin, setManagerPin] = useState('');
  const [managerEmp, setManagerEmp] = useState<Employee | null>(null);
  const [pinError, setPinError] = useState('');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [allClocks, setAllClocks] = useState<TimeClock[]>([]);
  const [allActivities, setAllActivities] = useState<WorkActivity[]>([]);
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([]);
  const [weekOffset, setWeekOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [expandedEmp, setExpandedEmp] = useState<string | null>(null);
  const [showAuditLog, setShowAuditLog] = useState(false);

  // Auto-unlock if there's already a valid admin/manager session —
  // prevents re-challenging an authenticated admin for the Time Sheet PIN.
  useEffect(() => {
    const session = restoreSession();
    if (session && !session.user.role.includes('employee')) {
      setManagerEmp({ id: session.user.id, name: session.user.name, role: session.user.role });
      setUnlocked(true);
    }
  }, []);

  // Modal state
  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [editingEntry, setEditingEntry] = useState<TimeClock | null>(null);
  const [editingEmpName, setEditingEmpName] = useState('');
  const [addEmployeeId, setAddEmployeeId] = useState<string>('');
  const [addClockIn, setAddClockIn] = useState('');
  const [addClockOut, setAddClockOut] = useState('');
  const [editClockIn, setEditClockIn] = useState('');
  const [editClockOut, setEditClockOut] = useState('');
  const [editReason, setEditReason] = useState('');
  const [actionError, setActionError] = useState('');
  const [saving, setSaving] = useState(false);

  // Top-level add entry (with employee selector)
  const [showAddEntry, setShowAddEntry] = useState(false);

  const weekStart = getWeekStart(weekOffset);
  const weekEnd = getWeekEnd(weekStart);
  const payPeriodStart = getPayPeriodStart();

  const tryUnlock = async () => {
    setPinError('');
    const { data: managers } = await supabase
      .from('employees')
      .select('id, name, role, pin_code')
      .eq('role', 'manager')
      .eq('active', true);
    const matched = (managers ?? []).find((m: Employee & { pin_code: string }) => m.pin_code === managerPin && managerPin.length === 4);
    if (matched) {
      setManagerEmp({ id: matched.id, name: matched.name, role: matched.role });
      setUnlocked(true);
      setManagerPin('');
    } else {
      setPinError('Incorrect manager PIN.');
      setManagerPin('');
    }
  };

  const fetchData = useCallback(async () => {
    setLoading(true);
    const { data: emps } = await supabase.from('employees').select('id, name, role').order('name');
    setEmployees(emps ?? []);

    const { data: clocks } = await supabase
      .from('time_clocks')
      .select('id, employee_id, clock_in, clock_out, edited_by, edited_at')
      .gte('clock_in', weekStart.toISOString())
      .lte('clock_in', weekEnd.toISOString())
      .order('clock_in', { ascending: true });
    setAllClocks((clocks ?? []) as TimeClock[]);

    const { data: acts } = await supabase
      .from('work_activities')
      .select('id, employee_id, description, created_at')
      .gte('created_at', weekStart.toISOString())
      .lte('created_at', weekEnd.toISOString())
      .order('created_at', { ascending: true });
    setAllActivities(acts ?? []);

    setLoading(false);
  }, [weekStart.toISOString(), weekEnd.toISOString()]);

  const fetchAuditLog = useCallback(async () => {
    const { data } = await supabase
      .from('time_clock_audit_log')
      .select('*')
      .gte('created_at', weekStart.toISOString())
      .lte('created_at', weekEnd.toISOString())
      .order('created_at', { ascending: false });
    setAuditLog((data ?? []) as AuditEntry[]);
  }, [weekStart.toISOString(), weekEnd.toISOString()]);

  useEffect(() => {
    if (unlocked) fetchData();
  }, [unlocked, fetchData]);

  useEffect(() => {
    if (unlocked) fetchAuditLog();
  }, [unlocked, fetchAuditLog]);

  const clocksByEmployee = allClocks.reduce<Record<string, TimeClock[]>>((acc, tc) => {
    if (!acc[tc.employee_id]) acc[tc.employee_id] = [];
    acc[tc.employee_id].push(tc);
    return acc;
  }, {});

  const activitiesByEmployee = allActivities.reduce<Record<string, WorkActivity[]>>((acc, act) => {
    if (!acc[act.employee_id]) acc[act.employee_id] = [];
    acc[act.employee_id].push(act);
    return acc;
  }, {});

  const getDayHours = (empId: string, dayIdx: number): number => {
    const dayStart = new Date(weekStart);
    dayStart.setDate(dayStart.getDate() + dayIdx);
    const dayEnd = new Date(dayStart);
    dayEnd.setHours(23, 59, 59, 999);

    return Math.min(MAX_HOURS_PER_DAY, (clocksByEmployee[empId] ?? [])
      .filter((tc) => {
        const ci = new Date(tc.clock_in);
        return ci >= dayStart && ci <= dayEnd;
      })
      .reduce((sum, tc) => sum + calcHours(tc.clock_in, tc.clock_out), 0));
  };

  const getWeekTotal = (empId: string): number => {
    return (clocksByEmployee[empId] ?? []).reduce((sum, tc) => sum + calcHours(tc.clock_in, tc.clock_out), 0);
  };

  const grandTotal = employees.reduce((sum, emp) => sum + getWeekTotal(emp.id), 0);

  // Pay-period total across all employees
  const payPeriodTotal = allClocks
    .filter((tc) => new Date(tc.clock_in) >= payPeriodStart)
    .reduce((sum, tc) => sum + calcHours(tc.clock_in, tc.clock_out), 0);

  const weekLabel = `${weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: TZ })} – ${weekEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: TZ })}`;
  const payPeriodLabel = `${payPeriodStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: TZ })} – ${weekEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: TZ })}`;

  const getEntryFlags = (tc: TimeClock): string[] => {
    const flags: string[] = [];
    const hrs = calcHours(tc.clock_in, tc.clock_out);
    if (hrs > MAX_HOURS_PER_ENTRY) {
      flags.push(`${hrs.toFixed(1)}h exceeds ${MAX_HOURS_PER_ENTRY}h limit`);
    }
    if (tc.clock_out && new Date(tc.clock_out) < new Date(tc.clock_in)) {
      flags.push('Clock out is before clock in');
    }
    if (!tc.clock_out) {
      if (hrs > MAX_HOURS_PER_ENTRY) {
        flags.push(`Open entry running ${hrs.toFixed(1)}h — likely forgotten clock-out`);
      }
    }
    return flags;
  };

  const getEmployeeOpenShiftCount = (empId: string): number => {
    return (clocksByEmployee[empId] ?? []).filter(tc => !tc.clock_out).length;
  };

  // ===== ACTIONS =====
  const openEditModal = (tc: TimeClock, empName: string) => {
    setEditingEntry(tc);
    setEditingEmpName(empName);
    setEditClockIn(toLocalDateTimeInput(new Date(tc.clock_in)));
    setEditClockOut(tc.clock_out ? toLocalDateTimeInput(new Date(tc.clock_out)) : '');
    setEditReason('');
    setActionError('');
    setModalMode('edit');
  };

  const openAddModalForEmployee = (empId: string) => {
    setAddEmployeeId(empId);
    setAddClockIn('');
    setAddClockOut('');
    setActionError('');
    setModalMode('add');
  };

  const openAddEntryTopLevel = () => {
    setAddEmployeeId(employees[0]?.id ?? '');
    setAddClockIn('');
    setAddClockOut('');
    setActionError('');
    setShowAddEntry(true);
    setModalMode('add');
  };

  const closeModal = () => {
    setModalMode(null);
    setEditingEntry(null);
    setShowAddEntry(false);
    setActionError('');
    setEditReason('');
  };

  const handleSaveEdit = async () => {
    if (!editingEntry || !managerEmp) return;
    setActionError('');

    const newIn = new Date(editClockIn);
    const newOut = editClockOut ? new Date(editClockOut) : null;

    if (isNaN(newIn.getTime())) {
      setActionError('Invalid clock-in time');
      return;
    }
    if (newOut && newOut < newIn) {
      setActionError('Clock-out cannot be before clock-in');
      return;
    }
    if (newOut && (newOut.getTime() - newIn.getTime()) / (1000 * 60 * 60) > MAX_HOURS_PER_ENTRY) {
      setActionError(`Entry exceeds ${MAX_HOURS_PER_ENTRY}h limit. Use multiple entries if needed.`);
      return;
    }

    setSaving(true);

    const empId = editingEntry.employee_id;
    const empName = employees.find((e) => e.id === empId)?.name ?? 'Unknown';

    await supabase.from('time_clock_audit_log').insert({
      time_clock_id: editingEntry.id,
      employee_id: empId,
      employee_name: empName,
      action: 'updated',
      old_clock_in: editingEntry.clock_in,
      old_clock_out: editingEntry.clock_out,
      new_clock_in: newIn.toISOString(),
      new_clock_out: newOut ? newOut.toISOString() : null,
      changed_by: managerEmp.id,
      changed_by_name: managerEmp.name,
      reason: editReason || null,
    });

    await supabase.from('time_clocks').update({
      clock_in: newIn.toISOString(),
      clock_out: newOut ? newOut.toISOString() : null,
      edited_by: managerEmp.id,
      edited_at: new Date().toISOString(),
    }).eq('id', editingEntry.id);

    setSaving(false);
    closeModal();
    fetchData();
    fetchAuditLog();
  };

  const handleDeleteEntry = async (tc: TimeClock) => {
    if (!managerEmp) return;
    const empName = employees.find((e) => e.id === tc.employee_id)?.name ?? 'Unknown';
    if (!confirm(`Delete this entry?\n${formatDate(tc.clock_in)} — ${formatTime(tc.clock_in)}${tc.clock_out ? ' → ' + formatTime(tc.clock_out) : ' (still clocked in)'}\nThis cannot be undone.`)) return;

    setSaving(true);

    await supabase.from('time_clock_audit_log').insert({
      time_clock_id: tc.id,
      employee_id: tc.employee_id,
      employee_name: empName,
      action: 'deleted',
      old_clock_in: tc.clock_in,
      old_clock_out: tc.clock_out,
      new_clock_in: null,
      new_clock_out: null,
      changed_by: managerEmp.id,
      changed_by_name: managerEmp.name,
      reason: 'Manager deleted entry',
    });

    await supabase.from('time_clocks').delete().eq('id', tc.id);

    setSaving(false);
    fetchData();
    fetchAuditLog();
  };

  const handleAddEntry = async () => {
    if (!managerEmp || !addEmployeeId) return;
    setActionError('');

    const newIn = new Date(addClockIn);
    const newOut = addClockOut ? new Date(addClockOut) : null;

    if (isNaN(newIn.getTime())) {
      setActionError('Invalid clock-in time');
      return;
    }
    if (newOut && newOut < newIn) {
      setActionError('Clock-out cannot be before clock-in');
      return;
    }
    if (newOut && (newOut.getTime() - newIn.getTime()) / (1000 * 60 * 60) > MAX_HOURS_PER_ENTRY) {
      setActionError(`Entry exceeds ${MAX_HOURS_PER_ENTRY}h limit. Use multiple entries if needed.`);
      return;
    }

    // Check for overlapping open entry
    const { data: openEntry } = await supabase
      .from('time_clocks')
      .select('id')
      .eq('employee_id', addEmployeeId)
      .is('clock_out', null)
      .maybeSingle();
    if (openEntry && !newOut) {
      setActionError('This employee already has an open clock-in. Clock it out or set a clock-out time.');
      return;
    }

    setSaving(true);

    const empName = employees.find((e) => e.id === addEmployeeId)?.name ?? 'Unknown';

    const { data: created } = await supabase
      .from('time_clocks')
      .insert({
        employee_id: addEmployeeId,
        clock_in: newIn.toISOString(),
        clock_out: newOut ? newOut.toISOString() : null,
      })
      .select('id')
      .single();

    if (created) {
      await supabase.from('time_clock_audit_log').insert({
        time_clock_id: created.id,
        employee_id: addEmployeeId,
        employee_name: empName,
        action: 'created',
        old_clock_in: null,
        old_clock_out: null,
        new_clock_in: newIn.toISOString(),
        new_clock_out: newOut ? newOut.toISOString() : null,
        changed_by: managerEmp.id,
        changed_by_name: managerEmp.name,
        reason: 'Manager added time entry',
      });
    }

    setSaving(false);
    closeModal();
    fetchData();
    fetchAuditLog();
  };

  const exportCSV = () => {
    const rows = ['Employee,Day,Clock In,Clock Out,Hours,Flags'];
    employees.forEach((emp) => {
      const clocks = clocksByEmployee[emp.id] ?? [];
      if (clocks.length === 0) {
        rows.push(`"${emp.name}",-,-,-,0,`);
        return;
      }
      clocks.forEach((tc) => {
        const dayName = DAYS[getDayOfWeek(tc.clock_in)];
        const hours = calcHours(tc.clock_in, tc.clock_out).toFixed(2);
        const flags = getEntryFlags(tc).join('; ');
        rows.push(`"${emp.name}",${dayName},${formatTime(tc.clock_in)},${tc.clock_out ? formatTime(tc.clock_out) : 'Active'},${hours},"${flags}"`);
      });
    });
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `timesheet-${weekLabel.replace(/[^a-zA-Z0-9]/g, '_')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ===== MANAGER PIN GATE =====
  if (!unlocked) {
    return (
      <div className="px-4 pt-14 pb-nav-safe lg:px-8 lg:pt-8 space-y-5 animate-fade-in">
        <div>
          <h1 className="text-2xl font-bold text-white">Timesheet</h1>
          <p className="text-slate-400 text-sm mt-0.5">Manager access required</p>
        </div>

        <Card className="p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/15 flex items-center justify-center">
              <Lock size={18} className="text-amber-400" />
            </div>
            <div>
              <p className="text-sm font-bold text-white">Manager PIN Required</p>
              <p className="text-xs text-slate-500">Enter the manager PIN to view and edit all employee timesheets</p>
            </div>
          </div>

          {pinError && (
            <div className="flex items-center gap-2 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-xl">
              <AlertCircle size={14} className="text-red-400" />
              <p className="text-red-300 text-xs">{pinError}</p>
            </div>
          )}

          <input
            type="tel"
            inputMode="numeric"
            value={managerPin}
            onChange={(e) => { setManagerPin(e.target.value.replace(/\D/g, '').slice(0, 4)); setPinError(''); }}
            onKeyDown={(e) => { if (e.key === 'Enter' && managerPin.length >= 3) tryUnlock(); }}
            placeholder="Manager PIN"
            className="w-full text-center text-xl font-bold tracking-[0.5em] bg-slate-900/60 border border-slate-700/50 rounded-xl px-4 py-3 text-white placeholder-slate-600 outline-none focus:border-amber-500"
            autoFocus
          />
          <Button variant="secondary" className="w-full" onClick={tryUnlock} disabled={managerPin.length < 3}>Unlock Timesheet</Button>
        </Card>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="px-4 pt-14 pb-nav-safe lg:px-8 lg:pt-8 flex flex-col items-center justify-center min-h-[60vh]">
        <div className="w-12 h-12 border-4 border-red-500/30 border-t-red-500 rounded-full animate-spin" />
        <p className="text-slate-400 text-sm mt-4">Loading timesheet...</p>
      </div>
    );
  }

  // ===== AUDIT LOG VIEW =====
  if (showAuditLog) {
    return (
      <div className="px-4 pt-14 pb-nav-safe lg:px-8 lg:pt-8 space-y-5 animate-fade-in">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button onClick={() => setShowAuditLog(false)} className="text-slate-400">
              <ChevronLeft size={20} />
            </button>
            <h1 className="text-xl font-bold text-white">Audit History</h1>
          </div>
          <Badge color="slate">{weekLabel}</Badge>
        </div>

        <p className="text-sm text-slate-400">Every manager edit, addition, and deletion is recorded here.</p>

        {auditLog.length === 0 ? (
          <Card className="p-8 text-center">
            <History size={32} className="text-slate-700 mx-auto mb-3" />
            <p className="text-slate-500 text-sm">No changes this week.</p>
          </Card>
        ) : (
          <div className="space-y-2">
            {auditLog.map((entry) => (
              <Card key={entry.id} className="p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {entry.action === 'created' && <Plus size={14} className="text-emerald-400" />}
                    {entry.action === 'updated' && <Edit3 size={14} className="text-amber-400" />}
                    {entry.action === 'deleted' && <Trash2 size={14} className="text-red-400" />}
                    <span className="text-xs font-bold text-white capitalize">{entry.action}</span>
                    <span className="text-[10px] text-red-400 font-semibold">{entry.employee_name ?? 'Unknown'}</span>
                  </div>
                  <span className="text-[10px] text-slate-500">{formatDateTime(entry.created_at)}</span>
                </div>
                <div className="space-y-1 pl-6">
                  {entry.old_clock_in && (
                    <p className="text-[11px] text-slate-500">
                      Was: {formatDateTime(entry.old_clock_in)}{entry.old_clock_out ? ' → ' + formatTime(entry.old_clock_out) : ' (open)'}
                    </p>
                  )}
                  {entry.new_clock_in && (
                    <p className="text-[11px] text-slate-300">
                      Now: {formatDateTime(entry.new_clock_in)}{entry.new_clock_out ? ' → ' + formatTime(entry.new_clock_out) : ' (open)'}
                    </p>
                  )}
                  <p className="text-[10px] text-red-400">
                    By {entry.changed_by_name ?? 'Unknown'}
                    {entry.reason ? ` · ${entry.reason}` : ''}
                  </p>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ===== EDIT MODAL =====
  if (modalMode === 'edit' && editingEntry) {
    return (
      <div className="fixed inset-0 z-[60] flex items-end justify-center lg:items-center">
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={closeModal} />
        <div className="relative w-full max-w-md bg-slate-900 rounded-t-3xl lg:rounded-2xl border-t lg:border border-slate-700/50 p-5 space-y-4 animate-slide-up">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-white">Edit Time Entry</h2>
            <button onClick={closeModal} className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center">
              <X size={18} className="text-slate-400" />
            </button>
          </div>
          <p className="text-xs text-slate-500">{editingEmpName}</p>

          {actionError && (
            <div className="flex items-center gap-2 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-xl">
              <AlertCircle size={14} className="text-red-400" />
              <p className="text-red-300 text-xs">{actionError}</p>
            </div>
          )}

          <div>
            <label className="text-[10px] text-slate-500 uppercase font-semibold block mb-1">Clock In (date & time)</label>
            <input
              type="datetime-local"
              value={editClockIn}
              onChange={(e) => setEditClockIn(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700/50 rounded-xl px-3 py-2.5 text-white text-sm focus:border-red-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="text-[10px] text-slate-500 uppercase font-semibold block mb-1">Clock Out (date & time)</label>
            <input
              type="datetime-local"
              value={editClockOut}
              onChange={(e) => setEditClockOut(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700/50 rounded-xl px-3 py-2.5 text-white text-sm focus:border-red-500 focus:outline-none"
            />
            <p className="text-[10px] text-slate-600 mt-1">Leave empty if employee is still clocked in.</p>
          </div>
          <div>
            <label className="text-[10px] text-slate-500 uppercase font-semibold block mb-1">Reason (optional)</label>
            <input
              type="text"
              value={editReason}
              onChange={(e) => setEditReason(e.target.value)}
              placeholder="e.g. Employee forgot to clock out"
              className="w-full bg-slate-800 border border-slate-700/50 rounded-xl px-3 py-2.5 text-white text-sm focus:border-red-500 focus:outline-none"
            />
          </div>

          <div className="flex gap-2">
            <Button variant="danger" className="flex-1" onClick={() => { handleDeleteEntry(editingEntry); closeModal(); }} disabled={saving}>
              <Trash2 size={16} /> Delete Entry
            </Button>
            <Button variant="secondary" className="flex-1" onClick={closeModal} disabled={saving}>
              Cancel
            </Button>
            <Button className="flex-1" onClick={handleSaveEdit} disabled={saving} icon={saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}>
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ===== ADD ENTRY MODAL =====
  if (modalMode === 'add') {
    const empName = showAddEntry
      ? (employees.find((e) => e.id === addEmployeeId)?.name ?? '')
      : (employees.find((e) => e.id === addEmployeeId)?.name ?? '');
    return (
      <div className="fixed inset-0 z-[60] flex items-end justify-center lg:items-center">
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={closeModal} />
        <div className="relative w-full max-w-md bg-slate-900 rounded-t-3xl lg:rounded-2xl border-t lg:border border-slate-700/50 p-5 space-y-4 animate-slide-up">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-white">Add Time Entry</h2>
            <button onClick={closeModal} className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center">
              <X size={18} className="text-slate-400" />
            </button>
          </div>

          {actionError && (
            <div className="flex items-center gap-2 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-xl">
              <AlertCircle size={14} className="text-red-400" />
              <p className="text-red-300 text-xs">{actionError}</p>
            </div>
          )}

          {showAddEntry && (
            <div>
              <label className="text-[10px] text-slate-500 uppercase font-semibold block mb-1">Employee</label>
              <select
                value={addEmployeeId}
                onChange={(e) => setAddEmployeeId(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700/50 rounded-xl px-3 py-2.5 text-white text-sm focus:border-red-500 focus:outline-none"
              >
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>{emp.name}</option>
                ))}
              </select>
            </div>
          )}
          {!showAddEntry && <p className="text-xs text-slate-500">{empName}</p>}

          <div>
            <label className="text-[10px] text-slate-500 uppercase font-semibold block mb-1">Clock In (date & time)</label>
            <input
              type="datetime-local"
              value={addClockIn}
              onChange={(e) => setAddClockIn(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700/50 rounded-xl px-3 py-2.5 text-white text-sm focus:border-red-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="text-[10px] text-slate-500 uppercase font-semibold block mb-1">Clock Out (optional)</label>
            <input
              type="datetime-local"
              value={addClockOut}
              onChange={(e) => setAddClockOut(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700/50 rounded-xl px-3 py-2.5 text-white text-sm focus:border-red-500 focus:outline-none"
            />
            <p className="text-[10px] text-slate-600 mt-1">Leave empty if employee is still clocked in.</p>
          </div>

          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={closeModal} disabled={saving}>
              Cancel
            </Button>
            <Button className="flex-1" onClick={handleAddEntry} disabled={saving || !addClockIn} icon={saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}>
              {saving ? 'Adding...' : 'Add Entry'}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ===== MAIN TIMESHEET VIEW =====
  return (
    <div className="px-4 pt-14 pb-nav-safe lg:px-8 lg:pt-8 space-y-5 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Timesheet</h1>
          <p className="text-slate-400 text-sm mt-0.5">Weekly hours by employee</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => setShowAuditLog(true)} className="text-slate-400 text-sm font-semibold flex items-center gap-1">
            <History size={14} /> Audit
          </button>
          <button onClick={() => setUnlocked(false)} className="text-slate-400 text-sm font-semibold">Lock</button>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <button
          onClick={() => setWeekOffset((v) => v - 1)}
          className="w-10 h-10 rounded-xl bg-slate-800/60 border border-slate-700/50 flex items-center justify-center active:scale-90 transition-transform"
        >
          <ChevronLeft size={20} className="text-slate-400" />
        </button>
        <div className="text-center">
          <p className="text-sm font-bold text-white">{weekOffset === 0 ? 'This Week' : weekOffset < 0 ? `${Math.abs(weekOffset)} Week${Math.abs(weekOffset) > 1 ? 's' : ''} Ago` : 'Upcoming'}</p>
          <p className="text-xs text-slate-500">{weekLabel}</p>
        </div>
        <button
          onClick={() => setWeekOffset((v) => v + 1)}
          className="w-10 h-10 rounded-xl bg-slate-800/60 border border-slate-700/50 flex items-center justify-center active:scale-90 transition-transform"
        >
          <ChevronRight size={20} className="text-slate-400" />
        </button>
      </div>

      {/* Stats: weekly + pay-period */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="p-3">
          <p className="text-[10px] text-slate-500 uppercase font-semibold tracking-wide">Weekly Total</p>
          <p className="text-xl font-bold text-red-400 mt-1">{formatHours(grandTotal)}</p>
        </Card>
        <Card className="p-3">
          <p className="text-[10px] text-slate-500 uppercase font-semibold tracking-wide">Pay Period</p>
          <p className="text-xl font-bold text-emerald-400 mt-1">{formatHours(payPeriodTotal)}</p>
          <p className="text-[9px] text-slate-600 mt-0.5">{payPeriodLabel}</p>
        </Card>
        <Card className="p-3 flex flex-col justify-center">
          <Button variant="secondary" size="sm" onClick={exportCSV} icon={<Download size={14} />}>Export CSV</Button>
          <Button size="sm" className="mt-2" onClick={openAddEntryTopLevel} icon={<Plus size={14} />}>Add Entry</Button>
        </Card>
      </div>

      <div className="overflow-x-auto scrollbar-hide -mx-4 px-4">
        <div className="min-w-[320px] lg:min-w-0">
          <div className="grid grid-cols-8 gap-1 mb-2 px-2">
            <div className="text-[10px] text-slate-500 uppercase font-semibold tracking-wide">Employee</div>
            {Array.from({ length: 7 }).map((_, dayIdx) => {
              const dayDate = new Date(weekStart);
              dayDate.setDate(dayDate.getDate() + dayIdx);
              const dayName = dayDate.toLocaleDateString('en-US', { weekday: 'short', timeZone: TZ });
              return (
                <div key={dayIdx} className="text-[10px] text-slate-500 uppercase font-semibold tracking-wide text-center">{dayName}</div>
              );
            })}
          </div>
          <div className="space-y-1.5">
            {employees.map((emp) => {
              const weekTotal = getWeekTotal(emp.id);
              const isExpanded = expandedEmp === emp.id;
              const empActivities = activitiesByEmployee[emp.id] ?? [];
              const empClocks = clocksByEmployee[emp.id] ?? [];
              const hasFlags = empClocks.some((tc) => getEntryFlags(tc).length > 0);
              const openShiftCount = getEmployeeOpenShiftCount(emp.id);

              return (
                <div key={emp.id}>
                  <Card
                    onClick={() => setExpandedEmp(isExpanded ? null : emp.id)}
                    className="p-2.5 grid grid-cols-8 gap-1 items-center cursor-pointer"
                  >
                    <div className="min-w-0 flex items-center gap-1.5">
                      {hasFlags && <AlertTriangle size={12} className="text-amber-400 flex-shrink-0" />}
                      {openShiftCount > 1 && <AlertTriangle size={12} className="text-red-400 flex-shrink-0" />}
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-white truncate">{emp.name}</p>
                        <p className="text-[10px] text-red-400">{formatHours(weekTotal)}</p>
                      </div>
                    </div>
                    {DAYS.map((_, dayIdx) => {
                      const hrs = getDayHours(emp.id, dayIdx);
                      const over16 = hrs > MAX_HOURS_PER_ENTRY;
                      return (
                        <div key={dayIdx} className="text-center">
                          <span className={`text-[11px] font-semibold ${over16 ? 'text-amber-400' : hrs > 0 ? 'text-slate-300' : 'text-slate-700'}`}>
                            {hrs > 0 ? hrs.toFixed(1) : '—'}
                          </span>
                        </div>
                      );
                    })}
                  </Card>

                  {isExpanded && (
                    <div className="mt-1.5 space-y-1.5 pl-3 pr-2">
                      {empClocks.map((tc) => {
                        const dayName = DAYS[getDayOfWeek(tc.clock_in)];
                        const hrs = calcHours(tc.clock_in, tc.clock_out);
                        const tcDate = new Date(tc.clock_in);
                        const tcDateEnd = tc.clock_out ? new Date(tc.clock_out) : null;
                        const clockActivities = empActivities.filter((a) => {
                          const actDate = new Date(a.created_at);
                          return actDate >= tcDate && (!tcDateEnd || actDate <= tcDateEnd);
                        });
                        const flags = getEntryFlags(tc);
                        return (
                          <div key={tc.id} className="py-2 px-3 bg-slate-900/40 rounded-lg space-y-2">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="text-[10px] text-slate-500 font-semibold w-10 flex-shrink-0">{dayName}</span>
                                <Clock size={12} className="text-red-400 flex-shrink-0" />
                                <span className="text-xs text-white whitespace-nowrap">{formatTime(tc.clock_in)}</span>
                                <span className="text-slate-600 text-xs">→</span>
                                <span className="text-xs text-white whitespace-nowrap">{tc.clock_out ? formatTime(tc.clock_out) : 'Active'}</span>
                              </div>
                              <div className="flex items-center gap-2 flex-shrink-0">
                                <Badge color={tc.clock_out ? 'slate' : 'green'}>{formatHours(hrs)}</Badge>
                                <button
                                  onClick={(e) => { e.stopPropagation(); openEditModal(tc, emp.name); }}
                                  className="text-slate-400 active:scale-90 transition-transform p-1"
                                  title="Edit entry"
                                >
                                  <Edit3 size={14} />
                                </button>
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleDeleteEntry(tc); }}
                                  className="text-red-400/70 active:scale-90 transition-transform p-1"
                                  title="Delete entry"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </div>

                            {flags.length > 0 && (
                              <div className="flex items-start gap-1.5 pl-5">
                                <AlertTriangle size={12} className="text-amber-400 mt-0.5 flex-shrink-0" />
                                <div className="space-y-0.5">
                                  {flags.map((flag, i) => (
                                    <p key={i} className="text-[11px] text-amber-300">{flag}</p>
                                  ))}
                                </div>
                              </div>
                            )}

                            {openShiftCount > 1 && !tc.clock_out && (
                              <div className="flex items-start gap-1.5 pl-5">
                                <AlertTriangle size={12} className="text-red-400 mt-0.5 flex-shrink-0" />
                                <p className="text-[11px] text-red-300">Multiple Open Shifts - Needs Correction</p>
                              </div>
                            )}

                            {tc.edited_at && (
                              <div className="flex items-center gap-1 pl-5">
                                <Shield size={10} className="text-slate-600" />
                                <p className="text-[10px] text-slate-600">Edited by manager {formatDateTime(tc.edited_at)}</p>
                              </div>
                            )}

                            {clockActivities.length > 0 && (
                              <div className="space-y-1 pl-5">
                                {clockActivities.map((act) => (
                                  <div key={act.id} className="flex items-start gap-1.5">
                                    <Activity size={10} className="text-slate-600 mt-0.5 flex-shrink-0" />
                                    <span className="text-[11px] text-slate-400 break-words">{act.description}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                      {empClocks.length === 0 && (
                        <p className="text-xs text-slate-600 py-2 px-3">No entries this week.</p>
                      )}
                      <button
                        onClick={() => openAddModalForEmployee(emp.id)}
                        className="w-full flex items-center justify-center gap-1.5 py-2 px-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-xs font-semibold active:scale-95 transition-transform"
                      >
                        <Plus size={12} /> Add Time Entry for {emp.name}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {employees.length === 0 && (
        <div className="text-center py-16">
          <User size={48} className="text-slate-700 mx-auto" strokeWidth={1.5} />
          <p className="text-slate-500 text-sm mt-3">No employees yet</p>
          <p className="text-slate-600 text-xs mt-1">Add employees from the Clock In screen to see timesheets.</p>
        </div>
      )}
    </div>
  );
}

interface WorkActivity {
  id: string;
  employee_id: string;
  description: string;
  created_at: string;
}
