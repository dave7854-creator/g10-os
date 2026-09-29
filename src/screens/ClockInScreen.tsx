import { useState, useEffect, useCallback } from 'react';
import { Clock, LogIn, LogOut, User, Loader2, CheckCircle2, AlertCircle, Plus, Trash2, Edit3, ClipboardList, Activity, X } from 'lucide-react';
import { Card, Button, Badge } from '@/components/ui';
import { supabase } from '@/supabaseClient';
import { toTitleCase } from '@/utils/textCase';
import type { Screen } from '@/types';

interface Employee {
  id: string;
  name: string;
  pin_code: string;
  role: string;
  active: boolean;
  created_at: string;
}

interface TimeClock {
  id: string;
  employee_id: string;
  clock_in: string;
  clock_out: string | null;
}

interface WorkActivity {
  id: string;
  employee_id: string;
  description: string;
  created_at: string;
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function formatTime(s: string): string {
  return new Date(s).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function formatDate(s: string): string {
  return new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getWeekStart(d: Date = new Date()): Date {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day;
  date.setDate(diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

function getDayOfWeek(date: Date): number {
  const d = date.getDay();
  return d === 0 ? 6 : d - 1;
}

function calcHours(clockIn: string, clockOut: string | null): number {
  const end = clockOut ? new Date(clockOut).getTime() : Date.now();
  return (end - new Date(clockIn).getTime()) / (1000 * 60 * 60);
}

function formatHours(h: number): string {
  const whole = Math.floor(h);
  const mins = Math.round((h - whole) * 60);
  return `${whole}h ${mins}m`;
}

export function ClockInScreen({ onNavigate, initialEmployee, onLock }: { onNavigate: (s: Screen) => void; initialEmployee: Employee; onLock: () => void }) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loggedInEmp, setLoggedInEmp] = useState<Employee | null>(initialEmployee);
  const [selectedEmp, setSelectedEmp] = useState<Employee | null>(null);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');
  const [currentClock, setCurrentClock] = useState<TimeClock | null>(null);
  const [multipleOpenShifts, setMultipleOpenShifts] = useState(false);
  const [todayEntries, setTodayEntries] = useState<TimeClock[]>([]);
  const [weekEntries, setWeekEntries] = useState<TimeClock[]>([]);
  const [weekHours, setWeekHours] = useState(0);
  const [todayActivities, setTodayActivities] = useState<WorkActivity[]>([]);
  const [activityInput, setActivityInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [showMyTimesheet, setShowMyTimesheet] = useState(false);

  const [showManage, setShowManage] = useState(false);
  const [manageEmployees, setManageEmployees] = useState<Employee[]>([]);
  const [managerPinInput, setManagerPinInput] = useState('');
  const [managerPinError, setManagerPinError] = useState('');
  const [manageUnlocked, setManageUnlocked] = useState(false);
  const [hasManager, setHasManager] = useState(false);
  const [checkingManager, setCheckingManager] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPin, setNewPin] = useState('');
  const [newRole, setNewRole] = useState('employee');
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editPin, setEditPin] = useState('');
  const [editRole, setEditRole] = useState('employee');

  void onNavigate;
  void onLock;

  const fetchEmployees = useCallback(async () => {
    const { data } = await supabase.from('employees').select('*').eq('active', true).order('name');
    setEmployees((data ?? []) as Employee[]);
  }, []);

  useEffect(() => {
    fetchEmployees().finally(() => setLoading(false));
  }, [fetchEmployees]);

  const fetchDashboardData = useCallback(async (empId: string) => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const weekStart = getWeekStart().toISOString();

    // Query ALL open shifts — use .limit(1).maybeSingle() to avoid errors when
    // multiple open shifts exist from the prior bug. We take the first one as
    // the "current" clock and flag the duplicate condition for manager review.
    const { data: openClocks } = await supabase
      .from('time_clocks')
      .select('*')
      .eq('employee_id', empId)
      .is('clock_out', null)
      .order('clock_in', { ascending: false });
    const openList = (openClocks ?? []) as TimeClock[];
    setMultipleOpenShifts(openList.length > 1);
    setCurrentClock(openList[0] ?? null);

    const { data: today } = await supabase
      .from('time_clocks')
      .select('*')
      .eq('employee_id', empId)
      .gte('clock_in', todayStart)
      .order('clock_in', { ascending: false });
    setTodayEntries((today ?? []) as TimeClock[]);

    const { data: week } = await supabase
      .from('time_clocks')
      .select('*')
      .eq('employee_id', empId)
      .gte('clock_in', weekStart)
      .order('clock_in', { ascending: true });
    setWeekEntries((week ?? []) as TimeClock[]);
    const totalHrs = (week ?? []).reduce((sum, tc) => sum + calcHours(tc.clock_in, tc.clock_out), 0);
    setWeekHours(totalHrs);

    const { data: acts } = await supabase
      .from('work_activities')
      .select('*')
      .eq('employee_id', empId)
      .gte('created_at', todayStart)
      .order('created_at', { ascending: false });
    setTodayActivities((acts ?? []) as WorkActivity[]);
  }, []);

  useEffect(() => {
    if (!loggedInEmp) return;
    fetchDashboardData(loggedInEmp.id);
    const interval = setInterval(() => fetchDashboardData(loggedInEmp.id), 60000);
    return () => clearInterval(interval);
  }, [loggedInEmp, fetchDashboardData]);

  const handlePinLogin = async () => {
    if (!selectedEmp) return;
    setPinError('');
    if (pinInput.length !== 4 || pinInput !== selectedEmp.pin_code) {
      setPinError('Incorrect PIN. Try again.');
      setPinInput('');
      return;
    }
    setLoggedInEmp(selectedEmp);
    setSelectedEmp(null);
    setPinInput('');
    setSuccessMsg('');
    setPinError('');
  };

  const handleClockToggle = async () => {
    if (!loggedInEmp) return;
    setActionLoading(true);
    try {
      if (currentClock) {
        // CLOCK OUT — update the existing open record, don't create a new one
        await supabase
          .from('time_clocks')
          .update({ clock_out: new Date().toISOString() })
          .eq('id', currentClock.id);
        setSuccessMsg(`Clocked out at ${formatTime(new Date().toISOString())}`);
        setCurrentClock(null);
        await fetchDashboardData(loggedInEmp.id);
      } else {
        // CLOCK IN — check the database for any existing open shift FIRST.
        // Never rely on screen state alone; always query the DB.
        const { data: existing } = await supabase
          .from('time_clocks')
          .select('id, clock_in')
          .eq('employee_id', loggedInEmp.id)
          .is('clock_out', null)
          .order('clock_in', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (existing) {
          // An open shift already exists — treat as clocked in, show clock out
          setPinError('You are already clocked in.');
          await fetchDashboardData(loggedInEmp.id);
          setActionLoading(false);
          return;
        }
        // No open shift — safe to create one
        const { data, error: insertError } = await supabase
          .from('time_clocks')
          .insert({ employee_id: loggedInEmp.id })
          .select('*')
          .single();
        if (insertError) {
          // Database-level unique index may have rejected this if a race occurred
          setPinError('Could not clock in — you may already be clocked in. Refreshing...');
          await fetchDashboardData(loggedInEmp.id);
          setActionLoading(false);
          return;
        }
        setCurrentClock(data as TimeClock);
        setSuccessMsg(`Clocked in at ${formatTime(new Date().toISOString())}`);
        await fetchDashboardData(loggedInEmp.id);
      }
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch {
      setPinError('Something went wrong. Try again.');
      await fetchDashboardData(loggedInEmp.id);
    } finally {
      setActionLoading(false);
    }
  };

  const addActivity = async () => {
    if (!loggedInEmp || !activityInput.trim()) return;
    const desc = toTitleCase(activityInput.trim());
    setActivityInput('');
    await supabase.from('work_activities').insert({
      employee_id: loggedInEmp.id,
      description: desc,
      clock_id: currentClock?.id ?? null,
    });
    fetchDashboardData(loggedInEmp.id);
  };

  const deleteActivity = async (id: string) => {
    await supabase.from('work_activities').delete().eq('id', id);
    if (loggedInEmp) fetchDashboardData(loggedInEmp.id);
  };

  const handleLogout = () => {
    onLock();
  };

  const openManage = async () => {
    setShowManage(true);
    setManageUnlocked(false);
    setManagerPinInput('');
    setManagerPinError('');
    setCheckingManager(true);
    const { data: all } = await supabase.from('employees').select('*').order('name');
    const allEmps = (all ?? []) as Employee[];
    setManageEmployees(allEmps);
    const found = allEmps.some((e) => e.role === 'manager');
    setHasManager(found);
    if (!found) {
      setManageUnlocked(true);
      setNewRole('manager');
    }
    setCheckingManager(false);
  };

  const tryManagerAccess = async () => {
    const { data: managers } = await supabase
      .from('employees')
      .select('*')
      .eq('role', 'manager')
      .eq('active', true);
    const matched = (managers ?? []).some((m: Employee) => m.pin_code === managerPinInput && managerPinInput.length === 4);
    if (matched) {
      setManageUnlocked(true);
      setManagerPinError('');
      setManagerPinInput('');
      fetchManageEmployees();
    } else {
      setManagerPinError('Incorrect manager PIN.');
      setManagerPinInput('');
    }
  };

  const fetchManageEmployees = async () => {
    const { data } = await supabase.from('employees').select('*').order('name');
    setManageEmployees((data ?? []) as Employee[]);
  };

  const addEmployee = async () => {
    if (!newName.trim() || newPin.length !== 4) return;
    await supabase.from('employees').insert({ name: toTitleCase(newName.trim()), pin_code: newPin.trim(), role: newRole });
    setNewName('');
    setNewPin('');
    setNewRole('employee');
    fetchManageEmployees();
    fetchEmployees();
    if (newRole === 'manager') setHasManager(true);
  };

  const saveEdit = async (id: string) => {
    if (!editName.trim() || editPin.length !== 4) return;
    await supabase.from('employees').update({ name: toTitleCase(editName.trim()), pin_code: editPin.trim(), role: editRole }).eq('id', id);
    setEditId(null);
    fetchManageEmployees();
    fetchEmployees();
  };

  const deleteEmployee = async (id: string) => {
    await supabase.from('employees').delete().eq('id', id);
    fetchManageEmployees();
    fetchEmployees();
  };

  if (loading) {
    return (
      <div className="px-4 pt-14 pb-nav-safe lg:px-8 lg:pt-8 flex flex-col items-center justify-center min-h-[60vh]">
        <div className="w-12 h-12 border-4 border-red-500/30 border-t-red-500 rounded-full animate-spin" />
        <p className="text-slate-400 text-sm mt-4">Loading...</p>
      </div>
    );
  }

  // ===== MANAGE MODE =====
  if (showManage) {
    return (
      <div className="px-4 pt-14 pb-nav-safe lg:px-8 lg:pt-8 space-y-5 animate-fade-in">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Manage Employees</h1>
            <p className="text-slate-400 text-sm mt-0.5">Add, edit, or remove staff</p>
          </div>
          <button onClick={() => { setShowManage(false); setManageUnlocked(false); setManagerPinInput(''); setManagerPinError(''); }} className="text-red-400 text-sm font-semibold">Done</button>
        </div>

        {checkingManager ? (
          <Card className="p-8 flex items-center justify-center">
            <Loader2 size={24} className="text-red-400 animate-spin" />
          </Card>
        ) : !manageUnlocked ? (
          <Card className="p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/15 flex items-center justify-center">
                <User size={18} className="text-amber-400" />
              </div>
              <div>
                <p className="text-sm font-bold text-white">Manager Access Required</p>
                <p className="text-xs text-slate-500">Enter the manager PIN to manage employees</p>
              </div>
            </div>
            {managerPinError && (
              <div className="flex items-center gap-2 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-xl">
                <AlertCircle size={14} className="text-red-400" />
                <p className="text-red-300 text-xs">{managerPinError}</p>
              </div>
            )}
            <input
              type="tel"
              inputMode="numeric"
              value={managerPinInput}
              onChange={(e) => { setManagerPinInput(e.target.value.replace(/\D/g, '').slice(0, 4)); setManagerPinError(''); }}
              onKeyDown={(e) => { if (e.key === 'Enter' && managerPinInput.length === 4) tryManagerAccess(); }}
              placeholder="Manager PIN"
              className="w-full text-center text-xl font-bold tracking-[0.5em] bg-slate-900/60 border border-slate-700/50 rounded-xl px-4 py-3 text-white placeholder-slate-600 outline-none focus:border-amber-500"
              autoFocus
            />
            <Button variant="secondary" className="w-full" onClick={tryManagerAccess} disabled={managerPinInput.length !== 4}>Unlock</Button>
          </Card>
        ) : (
          <>
            {!hasManager && (
              <div className="flex items-center gap-2 px-3 py-2.5 bg-red-500/10 border border-red-500/20 rounded-xl">
                <AlertCircle size={14} className="text-red-400" />
                <p className="text-red-300 text-xs">First-time setup: create your first manager account below. This person will manage employees and timesheets.</p>
              </div>
            )}
            <Card className="p-4 space-y-3">
              <p className="text-[10px] text-slate-500 uppercase font-semibold tracking-wide">Add New Employee</p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Full name"
                  className="flex-1 bg-slate-900/60 border border-slate-700/50 rounded-xl px-3 py-2.5 text-sm text-white placeholder-slate-600 outline-none focus:border-red-500"
                />
                <input
                  type="text"
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  placeholder="4-digit PIN"
                  className="w-28 bg-slate-900/60 border border-slate-700/50 rounded-xl px-3 py-2.5 text-sm text-white placeholder-slate-600 outline-none focus:border-red-500 text-center"
                />
              </div>
              <div className="flex gap-2">
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value)}
                  className="flex-1 bg-slate-900/60 border border-slate-700/50 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-red-500"
                >
                  <option value="employee">Employee</option>
                  <option value="manager">Manager</option>
                </select>
                <Button onClick={addEmployee} size="md" icon={<Plus size={16} />}>Add</Button>
              </div>
            </Card>

            <div className="space-y-2">
              {manageEmployees.map((emp) => (
                <Card key={emp.id} className="p-3 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-red-500/15 flex items-center justify-center flex-shrink-0">
                    <User size={18} className="text-red-400" />
                  </div>
                  {editId === emp.id ? (
                    <div className="flex-1 space-y-2">
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="flex-1 bg-slate-900/60 border border-slate-700/50 rounded-lg px-2 py-1.5 text-sm text-white outline-none focus:border-red-500"
                        />
                        <input
                          type="text"
                          value={editPin}
                          onChange={(e) => setEditPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                          className="w-20 bg-slate-900/60 border border-slate-700/50 rounded-lg px-2 py-1.5 text-sm text-white outline-none focus:border-red-500 text-center"
                        />
                      </div>
                      <div className="flex gap-2">
                        <select
                          value={editRole}
                          onChange={(e) => setEditRole(e.target.value)}
                          className="flex-1 bg-slate-900/60 border border-slate-700/50 rounded-lg px-2 py-1.5 text-sm text-white outline-none"
                        >
                          <option value="employee">Employee</option>
                          <option value="manager">Manager</option>
                        </select>
                        <Button size="sm" onClick={() => saveEdit(emp.id)}>Save</Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-white truncate">{emp.name}</p>
                        <p className="text-xs text-slate-500">PIN: {emp.pin_code} · {emp.role}</p>
                      </div>
                      <button onClick={() => { setEditId(emp.id); setEditName(emp.name); setEditPin(emp.pin_code); setEditRole(emp.role); }} className="text-slate-400 active:scale-90 transition-transform">
                        <Edit3 size={16} />
                      </button>
                      <button onClick={() => deleteEmployee(emp.id)} className="text-red-400 active:scale-90 transition-transform">
                        <Trash2 size={16} />
                      </button>
                    </>
                  )}
                </Card>
              ))}
              {manageEmployees.length === 0 && (
                <p className="text-center text-slate-500 text-sm py-8">No employees yet. Add one above.</p>
              )}
            </div>
          </>
        )}
      </div>
    );
  }

  // ===== EMPLOYEE DASHBOARD (logged in) =====
  if (loggedInEmp) {
    const todayTotal = todayEntries.reduce((sum, tc) => sum + calcHours(tc.clock_in, tc.clock_out), 0);
    const weekDayTotals = DAYS.map((_, dayIdx) => {
      const dayStart = new Date(getWeekStart());
      dayStart.setDate(dayStart.getDate() + dayIdx);
      const dayEnd = new Date(dayStart);
      dayEnd.setHours(23, 59, 59, 999);
      return weekEntries
        .filter((tc) => { const ci = new Date(tc.clock_in); return ci >= dayStart && ci <= dayEnd; })
        .reduce((sum, tc) => sum + calcHours(tc.clock_in, tc.clock_out), 0);
    });

    return (
      <div className="px-4 pt-14 pb-nav-safe lg:px-8 lg:pt-8 space-y-5 animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-red-500/15 flex items-center justify-center">
              <User size={20} className="text-red-400" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white">{loggedInEmp.name}</h1>
              <p className="text-xs text-slate-500">{formatDate(new Date().toISOString())}</p>
            </div>
          </div>
          <button onClick={handleLogout} className="text-slate-400 text-sm font-semibold flex items-center gap-1">
            <LogOut size={14} /> Exit
          </button>
        </div>

        {/* Clock status circle */}
        <div className="flex flex-col items-center py-2">
          <div className={`w-40 h-40 rounded-full flex items-center justify-center mb-4 transition-all ${currentClock ? 'bg-emerald-500/10 border-2 border-emerald-500/30' : 'bg-red-500/10 border-2 border-red-500/30'}`}>
            {currentClock ? (
              <div className="text-center">
                <p className="text-emerald-400 text-xs font-semibold uppercase tracking-wide">Clocked In</p>
                <p className="text-white text-2xl font-bold mt-1">{formatTime(currentClock.clock_in)}</p>
                <p className="text-slate-400 text-xs mt-1">{formatHours(calcHours(currentClock.clock_in, null))} elapsed</p>
              </div>
            ) : (
              <div className="text-center">
                <Clock size={36} className="text-red-400 mx-auto" />
                <p className="text-slate-400 text-xs mt-2">Not clocked in</p>
              </div>
            )}
          </div>

          {successMsg && (
            <div className="flex items-center gap-2 mb-3 px-4 py-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
              <CheckCircle2 size={16} className="text-emerald-400" />
              <p className="text-emerald-300 text-sm font-medium">{successMsg}</p>
            </div>
          )}

          {pinError && (
            <div className="flex items-center gap-2 mb-3 px-4 py-2.5 bg-red-500/10 border border-red-500/20 rounded-xl">
              <AlertCircle size={16} className="text-red-400" />
              <p className="text-red-300 text-sm font-medium">{pinError}</p>
            </div>
          )}

          {multipleOpenShifts && (
            <div className="flex items-center gap-2 mb-3 px-4 py-2.5 bg-amber-500/10 border border-amber-500/20 rounded-xl">
              <AlertCircle size={16} className="text-amber-400" />
              <p className="text-amber-300 text-sm font-medium">Multiple open shifts detected — see your manager to correct.</p>
            </div>
          )}

          <Button
            onClick={handleClockToggle}
            disabled={actionLoading}
            size="lg"
            variant={currentClock ? 'danger' : 'primary'}
            icon={actionLoading ? <Loader2 size={20} className="animate-spin" /> : currentClock ? <LogOut size={20} /> : <LogIn size={20} />}
            className="w-48"
          >
            {actionLoading ? 'Please wait...' : currentClock ? 'Clock Out' : 'Clock In'}
          </Button>
        </div>

        {/* Today + Week summary */}
        <div className="grid grid-cols-2 gap-3">
          <Card className="p-3 text-center">
            <p className="text-[10px] text-slate-500 uppercase font-semibold tracking-wide">Today</p>
            <p className="text-lg font-bold text-white mt-1">{formatHours(todayTotal)}</p>
          </Card>
          <Card className="p-3 text-center">
            <p className="text-[10px] text-slate-500 uppercase font-semibold tracking-wide">This Week</p>
            <p className="text-lg font-bold text-red-400 mt-1">{formatHours(weekHours)}</p>
          </Card>
        </div>

        {/* Work activity log */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 px-1">
            <Activity size={14} className="text-slate-400" />
            <p className="text-[10px] text-slate-500 uppercase font-semibold tracking-wide">Work Activity Log</p>
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={activityInput}
              onChange={(e) => setActivityInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && activityInput.trim()) addActivity(); }}
              placeholder="What are you working on?"
              className="flex-1 bg-slate-900/60 border border-slate-700/50 rounded-xl px-3 py-2.5 text-sm text-white placeholder-slate-600 outline-none focus:border-red-500"
            />
            <Button onClick={addActivity} size="md" icon={<Plus size={16} />}>Log</Button>
          </div>
          {todayActivities.length > 0 && (
            <div className="space-y-1.5">
              {todayActivities.map((act) => (
                <div key={act.id} className="flex items-start gap-2 py-2 px-3 bg-slate-900/40 rounded-lg">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white break-words">{act.description}</p>
                    <p className="text-[10px] text-slate-600 mt-0.5">{formatTime(act.created_at)}</p>
                  </div>
                  <button onClick={() => deleteActivity(act.id)} className="text-slate-600 active:scale-90 transition-transform flex-shrink-0 mt-0.5">
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Today's entries */}
        {todayEntries.length > 0 && (
          <div className="space-y-2">
            <p className="text-[10px] text-slate-500 uppercase font-semibold tracking-wide px-1">Today's Clock Entries</p>
            {todayEntries.map((tc) => (
              <Card key={tc.id} className="p-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <LogIn size={14} className="text-red-400" />
                  <span className="text-sm text-white">{formatTime(tc.clock_in)}</span>
                  {tc.clock_out && (
                    <>
                      <LogOut size={14} className="text-red-400 ml-2" />
                      <span className="text-sm text-white">{formatTime(tc.clock_out)}</span>
                    </>
                  )}
                </div>
                <Badge color={tc.clock_out ? 'slate' : 'green'}>
                  {formatHours(calcHours(tc.clock_in, tc.clock_out))}
                </Badge>
              </Card>
            ))}
          </div>
        )}

        {/* My Timesheet (read-only) */}
        <div className="space-y-2">
          <button
            onClick={() => setShowMyTimesheet(!showMyTimesheet)}
            className="w-full flex items-center justify-between p-3 bg-slate-800/60 border border-slate-700/50 rounded-xl"
          >
            <div className="flex items-center gap-2">
              <ClipboardList size={16} className="text-slate-400" />
              <span className="text-sm font-bold text-white">My Timesheet</span>
            </div>
            <span className="text-xs text-slate-500">{showMyTimesheet ? 'Hide' : 'View'}</span>
          </button>

          {showMyTimesheet && (
            <Card className="p-3 space-y-3">
              <div className="grid grid-cols-8 gap-1">
                <div className="text-[9px] text-slate-500 uppercase font-semibold">Day</div>
                {DAYS.map((d) => (
                  <div key={d} className="text-[9px] text-slate-500 uppercase font-semibold text-center">{d}</div>
                ))}
              </div>
              <div className="grid grid-cols-8 gap-1 items-center">
                <div className="text-[10px] text-red-400 font-bold">{formatHours(weekHours)}</div>
                {weekDayTotals.map((hrs, i) => (
                  <div key={i} className="text-center">
                    <span className={`text-[11px] font-semibold ${hrs > 0 ? 'text-slate-300' : 'text-slate-700'}`}>
                      {hrs > 0 ? hrs.toFixed(1) : '—'}
                    </span>
                  </div>
                ))}
              </div>
              <div className="space-y-1.5 pt-2 border-t border-slate-700/30">
                {weekEntries.map((tc) => {
                  const dayName = DAYS[getDayOfWeek(new Date(tc.clock_in))];
                  return (
                    <div key={tc.id} className="flex items-center justify-between py-1.5 px-2 bg-slate-900/40 rounded-lg">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-slate-500 font-semibold w-8">{dayName}</span>
                        <Clock size={11} className="text-red-400" />
                        <span className="text-xs text-white">{formatTime(tc.clock_in)}</span>
                        <span className="text-slate-600 text-xs">→</span>
                        <span className="text-xs text-white">{tc.clock_out ? formatTime(tc.clock_out) : 'Active'}</span>
                      </div>
                      <Badge color={tc.clock_out ? 'slate' : 'green'}>{formatHours(calcHours(tc.clock_in, tc.clock_out))}</Badge>
                    </div>
                  );
                })}
                {weekEntries.length === 0 && (
                  <p className="text-xs text-slate-600 py-2 text-center">No entries this week.</p>
                )}
              </div>
              <p className="text-[10px] text-slate-600 text-center">Read-only — contact your manager to correct entries.</p>
            </Card>
          )}
        </div>
      </div>
    );
  }

  // ===== PIN ENTRY (name selected, not logged in) =====
  if (selectedEmp) {
    return (
      <div className="px-4 pt-14 pb-nav-safe lg:px-8 lg:pt-8 space-y-5 animate-fade-in">
        <div className="flex items-center justify-between">
          <button onClick={() => { setSelectedEmp(null); setPinInput(''); setPinError(''); }} className="text-red-400 text-sm font-semibold">Back</button>
          <p className="text-xs text-slate-500">{formatDate(new Date().toISOString())}</p>
        </div>

        <div className="text-center pt-4">
          <div className="w-16 h-16 rounded-2xl bg-red-500/15 flex items-center justify-center mx-auto mb-3">
            <User size={32} className="text-red-400" />
          </div>
          <h1 className="text-xl font-bold text-white">{selectedEmp.name}</h1>
          <p className="text-slate-400 text-sm mt-0.5">Enter your PIN to sign in</p>
        </div>

        <div className="flex flex-col items-center py-4">
          {pinError && (
            <div className="flex items-center gap-2 mb-4 px-4 py-2.5 bg-red-500/10 border border-red-500/20 rounded-xl">
              <AlertCircle size={16} className="text-red-400" />
              <p className="text-red-300 text-sm font-medium">{pinError}</p>
            </div>
          )}

          <input
            type="tel"
            inputMode="numeric"
            value={pinInput}
            onChange={(e) => { setPinInput(e.target.value.replace(/\D/g, '').slice(0, 4)); setPinError(''); }}
            onKeyDown={(e) => { if (e.key === 'Enter' && pinInput.length === 4) handlePinLogin(); }}
            placeholder="Enter PIN"
            className="w-36 text-center text-2xl font-bold tracking-[0.5em] bg-slate-900/60 border border-slate-700/50 rounded-xl px-4 py-3 text-white placeholder-slate-600 outline-none focus:border-red-500 mb-4"
            autoFocus
          />

          <Button
            onClick={handlePinLogin}
            disabled={pinInput.length !== 4}
            size="lg"
            className="w-48"
          >
            Sign In
          </Button>
        </div>
      </div>
    );
  }

  // ===== EMPLOYEE SELECT (default) =====
  return (
    <div className="px-4 pt-14 pb-nav-safe lg:px-8 lg:pt-8 space-y-5 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Clock In</h1>
          <p className="text-slate-400 text-sm mt-0.5">Select your name to sign in</p>
        </div>
        <button onClick={openManage} className="text-red-400 text-sm font-semibold">Manage</button>
      </div>

      <div className="space-y-2">
        {employees.map((emp) => (
          <Card key={emp.id} onClick={() => { setSelectedEmp(emp); setPinInput(''); setPinError(''); }} className="p-4 flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-red-500/15 flex items-center justify-center flex-shrink-0">
              <User size={20} className="text-red-400" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold text-white">{emp.name}</p>
              <p className="text-xs text-slate-500">{emp.role === 'manager' ? 'Manager' : 'Employee'}</p>
            </div>
            <Clock size={18} className="text-slate-600" />
          </Card>
        ))}
        {employees.length === 0 && (
          <div className="text-center py-16">
            <User size={48} className="text-slate-700 mx-auto" strokeWidth={1.5} />
            <p className="text-slate-500 text-sm mt-3">No employees set up yet</p>
            <Button className="mt-4" onClick={openManage} icon={<Plus size={16} />}>Add Employees</Button>
          </div>
        )}
      </div>
    </div>
  );
}
