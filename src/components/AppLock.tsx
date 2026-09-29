import { useState, useEffect, useCallback } from 'react';
import { Lock, Loader2, AlertCircle, UserCog } from 'lucide-react';
import { supabase } from '@/supabaseClient';
import { PinPad } from '@/components/PinPad';
import { saveSession, type SessionUser } from '@/auth/sessionService';

export interface AppEmployee {
  id: string;
  name: string;
  pin_code: string;
  role: string;
  active: boolean;
  created_at: string;
}

export function AppLock({ onUnlock }: { onUnlock: (emp: AppEmployee) => void }) {
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);
  const [hasManager, setHasManager] = useState<boolean | null>(null);
  const [showSetup, setShowSetup] = useState(false);
  const [setupName, setSetupName] = useState('');
  const [setupPin, setSetupPin] = useState('');
  const [setupError, setSetupError] = useState('');
  const [creating, setCreating] = useState(false);

  const checkManager = useCallback(async () => {
    const { data } = await supabase.from('employees').select('*').eq('active', true);
    const emps = (data ?? []) as AppEmployee[];
    setHasManager(emps.some((e) => e.role === 'manager'));
  }, []);

  useEffect(() => {
    checkManager();
  }, [checkManager]);

  const tryUnlock = async (pin: string) => {
    setChecking(true);
    setError('');
    const { data } = await supabase.from('employees').select('*').eq('active', true);
    const emps = (data ?? []) as AppEmployee[];
    const match = emps.find((e) => e.pin_code === pin);
    if (match) {
      const sessionUser: SessionUser = {
        id: match.id,
        name: match.name,
        role: match.role,
        pin_code: match.pin_code,
        active: match.active,
        source: 'employees',
      };
      saveSession(sessionUser);
      onUnlock(match);
    } else {
      setError('Incorrect passcode');
    }
    setChecking(false);
  };

  const createFirstManager = async () => {
    if (!setupName.trim() || setupPin.length !== 4) {
      setSetupError('Name and 4-digit PIN are required.');
      return;
    }
    setCreating(true);
    setSetupError('');
    const { error: insertError } = await supabase.from('employees').insert({
      name: setupName.trim(),
      pin_code: setupPin.trim(),
      role: 'manager',
      active: true,
    });
    if (insertError) {
      setSetupError('Could not create account. Try again.');
      setCreating(false);
      return;
    }
    const { data: newEmp } = await supabase
      .from('employees')
      .select('*')
      .eq('pin_code', setupPin.trim())
      .eq('active', true)
      .single();
    setCreating(false);
    setShowSetup(false);
    if (newEmp) {
      const emp = newEmp as AppEmployee;
      const sessionUser: SessionUser = {
        id: emp.id,
        name: emp.name,
        role: emp.role,
        pin_code: emp.pin_code,
        active: emp.active,
        source: 'employees',
      };
      saveSession(sessionUser);
      onUnlock(emp);
    }
  };

  if (hasManager === null) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-red-500/30 border-t-red-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (showSetup || hasManager === false) {
    return (
      <div className="fixed inset-0 bg-black flex flex-col items-center justify-center px-6">
        <div className="w-full max-w-sm space-y-6">
          <div className="text-center">
            <div className="w-16 h-16 rounded-full bg-red-500/15 flex items-center justify-center mx-auto mb-4">
              <UserCog size={32} className="text-red-400" />
            </div>
            <h1 className="text-2xl font-semibold text-white">First-Time Setup</h1>
            <p className="text-gray-500 text-sm mt-1">Create your first manager account to get started.</p>
          </div>

          {setupError && (
            <div className="flex items-center gap-2 px-3 py-2.5 bg-red-500/10 border border-red-500/20 rounded-xl">
              <AlertCircle size={16} className="text-red-400" />
              <p className="text-red-300 text-sm">{setupError}</p>
            </div>
          )}

          <div className="space-y-3">
            <input
              type="text"
              value={setupName}
              onChange={(e) => setSetupName(e.target.value)}
              placeholder="Full name"
              className="w-full bg-gray-900/60 border border-gray-700/50 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-600 outline-none focus:border-red-500"
            />
            <input
              type="tel"
              inputMode="numeric"
              value={setupPin}
              onChange={(e) => {
                setSetupPin(e.target.value.replace(/\D/g, '').slice(0, 4));
                setSetupError('');
              }}
              placeholder="4-digit PIN"
              className="w-full text-center text-lg font-bold tracking-[0.4em] bg-gray-900/60 border border-gray-700/50 rounded-xl px-4 py-3 text-white placeholder-gray-600 outline-none focus:border-red-500"
            />
          </div>

          <button
            onClick={createFirstManager}
            disabled={creating || !setupName.trim() || setupPin.length !== 4}
            className="w-full bg-red-600 text-white font-semibold py-3.5 rounded-2xl active:scale-[0.97] transition-all disabled:opacity-40 shadow-lg shadow-red-600/20 flex items-center justify-center gap-2"
          >
            {creating ? <Loader2 size={20} className="animate-spin" /> : null}
            {creating ? 'Creating...' : 'Create Manager & Sign In'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <PinPad
      onSubmit={tryUnlock}
      error={error}
      checking={checking}
      maxLength={4}
      autoSubmit
      title="Enter Passcode"
      icon={<Lock size={28} className="text-red-400" />}
    />
  );
}
