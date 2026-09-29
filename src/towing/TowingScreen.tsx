import { useState, useEffect } from 'react';
import { supabase } from '@/supabaseClient';
import { TowingLogin } from './TowingLogin';
import { TowingApp } from './TowingApp';
import { restoreSession, isSessionExpired, touchActivity } from '@/auth/sessionService';
import type { TowingUser, TowingSession } from './types';

interface AuthState {
  user: TowingUser;
  session: TowingSession;
}

export function TowingScreen({ onBack, onNavigate }: { onBack: () => void; onNavigate?: (s: import('@/types').Screen) => void }) {
  const [authState, setAuthState] = useState<AuthState | null>(null);
  const [replacedMessage, setReplacedMessage] = useState(false);
  const [checking, setChecking] = useState(true);

  // Check shared app session first — if valid, skip towing login entirely
  useEffect(() => {
    (async () => {
      const appSession = restoreSession();
      if (appSession && !isSessionExpired(appSession)) {
        // Try towing_users table first (dedicated towing users)
        const { data: towingUser } = await supabase
          .from('towing_users')
          .select('*')
          .eq('id', appSession.user.id)
          .eq('active', true)
          .maybeSingle();

        if (towingUser) {
          touchActivity();
          setAuthState({
            user: towingUser as TowingUser,
            session: {
              id: 'shared',
              user_id: towingUser.id,
              session_token: 'shared',
              device_info: null,
              device_name: null,
              ip_address: null,
              started_at: new Date(appSession.unlockedAt).toISOString(),
              last_activity: new Date(appSession.lastActivity).toISOString(),
              ended_at: null,
              ended_reason: null,
            },
          });
          setChecking(false);
          return;
        }

        // If not a towing user, check if they're an employee with access
        // Employees get basic access — create a lightweight towing session
        const { data: emp } = await supabase
          .from('employees')
          .select('*')
          .eq('id', appSession.user.id)
          .eq('active', true)
          .maybeSingle();

        if (emp) {
          touchActivity();
          setAuthState({
            user: {
              id: emp.id,
              name: emp.name,
              role: emp.role === 'manager' ? 'manager' : 'office_staff',
              active: emp.active,
              failed_attempts: 0,
              locked_until: null,
              created_at: emp.created_at,
              updated_at: emp.created_at,
            },
            session: {
              id: 'shared',
              user_id: emp.id,
              session_token: 'shared',
              device_info: null,
              device_name: null,
              ip_address: null,
              started_at: new Date(appSession.unlockedAt).toISOString(),
              last_activity: new Date(appSession.lastActivity).toISOString(),
              ended_at: null,
              ended_reason: null,
            },
          });
          setChecking(false);
          return;
        }
      }

      // Check for towing-specific remembered session
      const towingToken = sessionStorage.getItem('towing_session_token');
      if (towingToken) {
        const { data: session } = await supabase
          .from('towing_sessions')
          .select('*')
          .eq('session_token', towingToken)
          .is('ended_at', null)
          .maybeSingle();

        if (session) {
          const { data: user } = await supabase
            .from('towing_users')
            .select('*')
            .eq('id', session.user_id)
            .maybeSingle();

          if (user && user.active) {
            touchActivity();
            setAuthState({ user: user as TowingUser, session: session as TowingSession });
            setChecking(false);
            return;
          }
        } else {
          sessionStorage.removeItem('towing_session_token');
        }
      }

      setChecking(false);
    })();
  }, []);

  // Poll for session replacement (only when using towing-specific sessions)
  useEffect(() => {
    if (!authState || authState.session.id === 'shared') return;
    const interval = setInterval(async () => {
      const { data } = await supabase
        .from('towing_sessions')
        .select('*')
        .eq('id', authState.session.id)
        .maybeSingle();
      if (data && data.ended_at) {
        setAuthState(null);
        sessionStorage.removeItem('towing_session_token');
        if (data.ended_reason === 'replaced') {
          setReplacedMessage(true);
        }
      }
    }, 10000);
    return () => clearInterval(interval);
  }, [authState]);

  const handleLock = () => {
    setAuthState(null);
    sessionStorage.removeItem('towing_session_token');
  };

  if (checking) {
    return (
      <div className="px-4 pt-14 pb-nav-safe flex flex-col items-center justify-center min-h-[60vh]">
        <div className="w-12 h-12 border-4 border-red-500/30 border-t-red-500 rounded-full animate-spin" />
        <p className="text-slate-400 text-sm mt-4">Loading towing module...</p>
      </div>
    );
  }

  if (!authState) {
    return (
      <>
        {replacedMessage && (
          <div className="fixed top-0 left-0 right-0 z-[100] bg-amber-500/20 border-b border-amber-500/30 px-4 py-3 text-center">
            <p className="text-amber-300 text-sm font-semibold">Signed out because your account was accessed from another device.</p>
            <button onClick={() => setReplacedMessage(false)} className="text-amber-400 text-xs mt-1">Dismiss</button>
          </div>
        )}
        <TowingLogin
          onAuthenticated={(state) => { setAuthState(state); setReplacedMessage(false); }}
          onBack={onBack}
        />
      </>
    );
  }

  return (
    <TowingApp
      user={authState.user}
      session={authState.session}
      onLock={handleLock}
      onBack={onBack}
      onNavigate={onNavigate}
    />
  );
}
