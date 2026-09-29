import { useState, useEffect, useCallback, useRef } from 'react';
import { BottomNav } from '@/components/BottomNav';
import { AppLock } from '@/components/AppLock';
import type { AppEmployee } from '@/components/AppLock';
import { HomeScreen } from '@/screens/HomeScreen';
import { PartsModule } from '@/screens/PartsModule';
import { InquiriesScreen } from '@/screens/InquiriesScreen';
import { ClockInScreen } from '@/screens/ClockInScreen';
import { TimesheetScreen } from '@/screens/TimesheetScreen';
import { SettingsScreen } from '@/screens/SettingsScreen';
import { TowingScreen } from '@/towing/TowingScreen';
import { ShopScreen } from '@/screens/ShopScreen';
import { CustomerAccountsScreen } from '@/screens/CustomerAccountsScreen';
import { MessageCenter } from '@/messaging/MessageCenter';
import { useVehicleStore } from '@/vehicleStore';
import type { Screen, VehicleStore } from '@/types';
import {
  restoreSession, touchActivity, clearSession, isSessionExpired,
  getSessionTimeout, type AppSession,
} from '@/auth/sessionService';
import { supabase } from '@/supabaseClient';

function App() {
  const [screen, setScreen] = useState<Screen>('home');
  const [employee, setEmployee] = useState<AppEmployee | null>(null);
  const [restoring, setRestoring] = useState(true);
  const [autoLocked, setAutoLocked] = useState(false);
  const store = useVehicleStore();
  const [inquiryVersion, setInquiryVersion] = useState(0);
  const bumpInquiries = () => setInquiryVersion((v) => v + 1);
  const sessionRef = useRef<AppSession | null>(null);

  // Restore session on mount
  useEffect(() => {
    const session = restoreSession();
    if (session) {
      sessionRef.current = session;
      (async () => {
        const { data } = await supabase
          .from('employees')
          .select('*')
          .eq('id', session.user.id)
          .eq('active', true)
          .maybeSingle();
        if (data) {
          setEmployee(data as AppEmployee);
        } else {
          clearSession();
        }
        setRestoring(false);
      })();
    } else {
      setRestoring(false);
    }
  }, []);

  // Activity tracking — touch session on user interaction
  useEffect(() => {
    if (!employee) return;
    const handler = () => {
      touchActivity();
    };
    window.addEventListener('click', handler);
    window.addEventListener('keydown', handler);
    window.addEventListener('touchstart', handler);
    return () => {
      window.removeEventListener('click', handler);
      window.removeEventListener('keydown', handler);
      window.removeEventListener('touchstart', handler);
    };
  }, [employee]);

  // Auto-lock check — runs every 30s
  useEffect(() => {
    if (!employee) return;
    const interval = setInterval(() => {
      const raw = sessionStorage.getItem('wp_app_session');
      if (!raw) return;
      try {
        const session = JSON.parse(raw) as AppSession;
        if (isSessionExpired(session)) {
          clearSession();
          setAutoLocked(true);
          setEmployee(null);
        }
      } catch {
        // ignore
      }
    }, 30000);
    return () => clearInterval(interval);
  }, [employee]);

  const handleUnlock = (emp: AppEmployee) => {
    setEmployee(emp);
    setAutoLocked(false);
  };

  const handleLock = useCallback(() => {
    clearSession();
    setEmployee(null);
    setScreen('home');
  }, []);

  const handleAutoLockDismiss = () => {
    setAutoLocked(false);
  };

  if (restoring) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-red-500/30 border-t-red-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (!employee) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        {autoLocked && (
          <div className="fixed top-0 left-0 right-0 z-[100] bg-amber-500/20 border-b border-amber-500/30 px-4 py-3 text-center">
            <p className="text-amber-300 text-sm font-semibold">
              You were auto-locked after {Math.round(getSessionTimeout() / 60000)} minutes of inactivity.
            </p>
            <button onClick={handleAutoLockDismiss} className="text-amber-400 text-xs mt-1">Dismiss</button>
          </div>
        )}
        <AppLock onUnlock={handleUnlock} />
      </div>
    );
  }

  const renderScreen = () => {
    switch (screen) {
      case 'home': return <HomeScreen key={`home-${inquiryVersion}`} onNavigate={setScreen} employee={employee} />;
      case 'parts': return <PartsModule store={store} onExit={() => setScreen('home')} onNavigate={setScreen} isManager={employee.role === 'manager'} />;
      case 'inquiries': return <InquiriesScreen onNavigate={setScreen} onInquiriesChanged={bumpInquiries} />;
      case 'clockin': return <ClockInScreen onNavigate={setScreen} initialEmployee={employee} onLock={handleLock} />;
      case 'timesheet': return <TimesheetScreen onNavigate={setScreen} />;
      case 'settings': return <SettingsScreen onNavigate={setScreen} store={store} onLock={handleLock} employeeName={employee.name} />;
      case 'towing': return <TowingScreen onBack={() => setScreen('home')} onNavigate={setScreen} />;
      case 'shop': return <ShopScreen onNavigate={setScreen} />;
      case 'customer-accounts': return <CustomerAccountsScreen onNavigate={setScreen} employee={employee} />;
      case 'messages': return <MessageCenter onNavigate={setScreen} employeeName={employee.name} />;
    }
  };

  const isModule = screen === 'towing' || screen === 'shop' || screen === 'parts';

  return (
    <div className="min-h-screen bg-slate-950">
      {!isModule && <BottomNav current={screen} onNavigate={setScreen} isManager={employee.role === 'manager'} />}
      <div className={isModule ? '' : 'lg:pl-60'}>
        <div className="max-w-7xl mx-auto">
          {renderScreen()}
        </div>
      </div>
    </div>
  );
}

export default App;
