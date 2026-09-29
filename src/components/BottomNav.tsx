import { Home, Wrench, ShieldCheck, Package, Clock, ClipboardList, Inbox, Settings, MessageSquare, Users } from 'lucide-react';
import { useState, useEffect } from 'react';
import { supabase } from '@/supabaseClient';
import type { Screen } from '@/types';

const navItems: { id: Screen; label: string; icon: typeof Home }[] = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'shop', label: 'Shop', icon: Wrench },
  { id: 'towing', label: 'Towing', icon: ShieldCheck },
  { id: 'parts', label: 'Parts', icon: Package },
  { id: 'clockin', label: 'Clock In', icon: Clock },
  { id: 'timesheet', label: 'Hours', icon: ClipboardList },
  { id: 'inquiries', label: 'Leads', icon: Inbox },
  { id: 'customer-accounts', label: 'Accounts', icon: Users },
  { id: 'messages', label: 'Messages', icon: MessageSquare },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export function BottomNav({
  current,
  onNavigate,
  isManager,
}: {
  current: Screen;
  onNavigate: (s: Screen) => void;
  isManager: boolean;
}) {
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('message_conversations')
        .select('unread_count')
        .gt('unread_count', 0);
      setUnread((data ?? []).reduce((s: number, c: { unread_count: number }) => s + (c.unread_count ?? 0), 0));
    })();
  }, [current]);

  const items = navItems.filter((item) => {
    if (item.id === 'timesheet' && !isManager) return false;
    if (item.id === 'customer-accounts' && !isManager) return false;
    return true;
  });
  return (
    <>
      {/* Desktop sidebar */}
      <nav className="hidden lg:flex fixed left-0 top-0 bottom-0 w-60 bg-slate-900/80 backdrop-blur-xl border-r border-slate-700/50 flex-col z-40">
        <div className="px-5 py-6 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-red-600 flex items-center justify-center">
              <Home size={18} className="text-white" />
            </div>
            <div>
              <p className="text-sm font-bold text-white">Wolf Point OS</p>
              <p className="text-[10px] text-slate-500">Dismantling System</p>
            </div>
          </div>
        </div>
        <div className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto scrollbar-hide">
          {items.map((item) => {
            const Icon = item.icon;
            const active = current === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onNavigate(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-sm font-medium ${
                  active
                    ? 'bg-red-600 text-white shadow-lg shadow-red-600/20'
                    : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
                }`}
              >
                <Icon size={18} strokeWidth={2.2} />
                {item.label}
                {item.id === 'messages' && unread > 0 && (
                  <span className="ml-auto min-w-[20px] h-5 px-1.5 rounded-full bg-red-500 flex items-center justify-center text-[10px] font-bold text-white">{unread}</span>
                )}
              </button>
            );
          })}
        </div>
      </nav>

      {/* Mobile bottom nav */}
      <div className="lg:hidden fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md z-50">
        <div className="mx-2 mb-2 bg-slate-900/95 backdrop-blur-xl border border-slate-700/50 rounded-3xl shadow-2xl shadow-black/50 safe-bottom">
          <div className="flex items-center justify-around px-0.5 py-1.5 gap-0 overflow-x-auto scrollbar-hide">
            {items.map((item) => {
              const Icon = item.icon;
              const active = current === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onNavigate(item.id)}
                  className="flex flex-col items-center gap-0.5 px-1.5 py-1 rounded-xl transition-all active:scale-90 flex-shrink-0 relative"
                >
                  <div
                    className={`p-1.5 rounded-lg transition-all ${
                      active
                        ? 'bg-red-600 text-white shadow-lg shadow-red-600/30'
                        : 'text-slate-500'
                    }`}
                  >
                    <Icon size={18} strokeWidth={2.2} />
                  </div>
                  {item.id === 'messages' && unread > 0 && (
                    <span className="absolute top-0 right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-red-500 flex items-center justify-center text-[9px] font-bold text-white">{unread}</span>
                  )}
                  <span
                    className={`text-[9px] font-semibold transition-colors ${
                      active ? 'text-red-400' : 'text-slate-600'
                    }`}
                  >
                    {item.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}
