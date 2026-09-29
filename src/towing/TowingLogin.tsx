import { useState, useEffect, useCallback } from 'react';
import { AlertCircle, Loader2, ShieldCheck, UserCog, ChevronLeft, Clock } from 'lucide-react';
import { supabase } from '@/supabaseClient';
import { PinPad } from '@/components/PinPad';
import {
  hashPin, verifyPin, generateSessionToken, getDeviceInfo, getDeviceName,
  isLocked, getLockoutRemaining,
  LOCKOUT_DURATION_MS, MAX_FAILED_ATTEMPTS,
} from './auth';
import { saveSession, getSessionTimeout, type SessionUser } from '@/auth/sessionService';
import type { TowingUser, TowingSession, TowingRole } from './types';

interface AuthState {
  user: TowingUser;
  session: TowingSession;
}

interface LoginLockProps {
  onAuthenticated: (state: AuthState) => void;
  onBack: () => void;
}

export function TowingLogin({ onAuthenticated, onBack }: LoginLockProps) {
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);
  const [hasAdmin, setHasAdmin] = useState<boolean | null>(null);
  const [showSetup, setShowSetup] = useState(false);
  const [setupName, setSetupName] = useState('');
  const [setupPin, setSetupPin] = useState('');
  const [setupError, setSetupError] = useState('');
  const [creating, setCreating] = useState(false);
  const [lockoutRemaining, setLockoutRemaining] = useState(0);

  const checkAdmin = useCallback(async () => {
    const { data } = await supabase.from('towing_users').select('*').eq('active', true);
    setHasAdmin((data ?? []).length > 0);
  }, []);

  useEffect(() => { checkAdmin(); }, [checkAdmin]);

  useEffect(() => {
    if (lockoutRemaining <= 0) return;
    const interval = setInterval(() => {
      setLockoutRemaining((prev) => Math.max(0, prev - 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [lockoutRemaining]);

  const createFirstAdmin = async () => {
    if (!setupName.trim() || setupPin.length !== 4) {
      setSetupError('Name and 4-digit PIN are required.');
      return;
    }
    setCreating(true); setSetupError('');
    const pinHash = await hashPin(setupPin);
    const { data, error: insertError } = await supabase
      .from('towing_users')
      .insert({ name: setupName.trim(), pin_hash: pinHash, role: 'administrator', active: true })
      .select().maybeSingle();
    if (insertError || !data) { setSetupError('Could not create admin account.'); setCreating(false); return; }
    setCreating(false); setShowSetup(false); setHasAdmin(true);
    await attemptLogin(setupPin);
  };

  const attemptLogin = async (pinToTry: string) => {
    setChecking(true); setError('');
    const { data: users } = await supabase.from('towing_users').select('*').eq('active', true);
    const allUsers = (users ?? []) as TowingUser[];

    for (const u of allUsers) {
      if (isLocked(u.locked_until)) {
        const remaining = getLockoutRemaining(u.locked_until);
        setLockoutRemaining(remaining);
        setError(`Account locked. Try again in ${Math.ceil(remaining / 60000)} minute(s).`);
        setChecking(false); return;
      }
      const match = await verifyPin(pinToTry, (u as unknown as { pin_hash: string }).pin_hash);
      if (match) {
        if (u.failed_attempts > 0) {
          await supabase.from('towing_users').update({ failed_attempts: 0, locked_until: null }).eq('id', u.id);
        }
        const token = generateSessionToken();
        const now = new Date().toISOString();
        const { data: session } = await supabase
          .from('towing_sessions')
          .insert({
            user_id: u.id, session_token: token,
            device_info: getDeviceInfo(), device_name: getDeviceName(),
            started_at: now, last_activity: now,
          })
          .select().maybeSingle();
        if (!session) { setError('Failed to create session.'); setChecking(false); return; }
        sessionStorage.setItem('towing_session_token', token);

        const sessionUser: SessionUser = {
          id: u.id, name: u.name, role: u.role, active: u.active,
          source: 'towing_users',
        };
        saveSession(sessionUser);

        setChecking(false);
        onAuthenticated({ user: u, session: session as TowingSession });
        return;
      }
    }

    if (allUsers.length > 0) {
      const firstUser = allUsers[0];
      const newAttempts = firstUser.failed_attempts + 1;
      if (newAttempts >= MAX_FAILED_ATTEMPTS) {
        await supabase.from('towing_users').update({
          failed_attempts: newAttempts,
          locked_until: new Date(Date.now() + LOCKOUT_DURATION_MS).toISOString(),
        }).eq('id', firstUser.id);
        setLockoutRemaining(LOCKOUT_DURATION_MS);
        setError(`Too many failed attempts. Account locked for 5 minutes.`);
      } else {
        await supabase.from('towing_users').update({ failed_attempts: newAttempts }).eq('id', firstUser.id);
        setError(`Invalid PIN. ${MAX_FAILED_ATTEMPTS - newAttempts} attempt(s) remaining.`);
      }
    } else {
      setError('Invalid PIN.');
    }
    setChecking(false);
  };

  if (hasAdmin === null) {
    return (
      <div className="px-4 pt-14 pb-nav-safe flex flex-col items-center justify-center min-h-[60vh]">
        <div className="w-12 h-12 border-4 border-red-500/30 border-t-red-500 rounded-full animate-spin" />
        <p className="text-slate-400 text-sm mt-4">Loading towing module...</p>
      </div>
    );
  }

  if (showSetup || hasAdmin === false) {
    return (
      <div className="px-4 pt-14 pb-nav-safe space-y-5 animate-fade-in">
        <button onClick={onBack} className="flex items-center gap-1 text-slate-400 text-sm -ml-1">
          <ChevronLeft size={18} /> Back to App
        </button>
        <div className="flex flex-col items-center justify-center pt-4">
          <div className="w-full max-w-sm space-y-6">
            <div className="text-center">
              <div className="w-16 h-16 rounded-2xl bg-red-500/15 flex items-center justify-center mx-auto mb-4">
                <UserCog size={32} className="text-red-400" />
              </div>
              <h1 className="text-2xl font-bold text-white">Towing Module Setup</h1>
              <p className="text-slate-400 text-sm mt-1">Create your first administrator account.</p>
            </div>

            {setupError && (
              <div className="flex items-center gap-2 px-3 py-2.5 bg-red-500/10 border border-red-500/20 rounded-xl justify-center">
                <AlertCircle size={16} className="text-red-400" />
                <p className="text-red-300 text-sm">{setupError}</p>
              </div>
            )}

            <div className="space-y-3">
              <input type="text" value={setupName} onChange={(e) => setSetupName(e.target.value)} placeholder="Full name"
                className="w-full bg-slate-900/60 border border-slate-700/50 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-600 outline-none focus:border-red-500" />
              <input type="tel" inputMode="numeric" value={setupPin}
                onChange={(e) => { setSetupPin(e.target.value.replace(/\D/g, '').slice(0, 4)); setSetupError(''); }}
                placeholder="4-digit PIN"
                className="w-full text-center text-lg font-bold tracking-[0.4em] bg-slate-900/60 border border-slate-700/50 rounded-xl px-4 py-3 text-white placeholder-slate-600 outline-none focus:border-red-500" />
              <p className="text-xs text-slate-500 text-center">This PIN will be required to access the towing module.</p>
            </div>

            <button onClick={createFirstAdmin} disabled={creating || !setupName.trim() || setupPin.length !== 4}
              className="w-full bg-red-600 text-white font-semibold py-3.5 rounded-2xl active:scale-[0.97] transition-all disabled:opacity-40 shadow-lg shadow-red-600/20 flex items-center justify-center gap-2">
              {creating ? <Loader2 size={20} className="animate-spin" /> : null}
              {creating ? 'Creating...' : 'Create Admin & Enter'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const lockoutMinutes = Math.ceil(lockoutRemaining / 60000);

  return (
    <div className="px-4 pt-14 pb-nav-safe space-y-5 animate-fade-in">
      <button onClick={onBack} className="flex items-center gap-1 text-slate-400 text-sm -ml-1">
        <ChevronLeft size={18} /> Back to App
      </button>
      <div className="flex flex-col items-center justify-center pt-4">
        <PinPad
          onSubmit={attemptLogin}
          error={error}
          checking={checking}
          disabled={lockoutRemaining > 0}
          maxLength={4}
          autoSubmit
          title="Towing Module"
          subtitle="Enter your PIN to access"
          icon={<ShieldCheck size={28} className="text-red-400" />}
        />
        {lockoutRemaining > 0 && (
          <div className="flex items-center justify-center gap-2 text-amber-400 mt-4">
            <Clock size={14} />
            <span className="text-sm font-semibold">Locked: {lockoutMinutes} min remaining</span>
          </div>
        )}
      </div>
    </div>
  );
}

