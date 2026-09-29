import { useEffect, useState } from 'react';
import {
  Wrench,
  ShieldCheck,
  Package,
  Clock,
  ClipboardList,
  Inbox,
  Sparkles,
  ChevronRight,
  MessageSquare,
  CreditCard,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { Card, Badge } from '@/components/ui';
import { GlobalSearchBar } from '@/components/GlobalSearchBar';
import { supabase } from '@/supabaseClient';
import type { Screen } from '@/types';
import type { AppEmployee } from '@/components/AppLock';

interface ModuleCard {
  id: Screen;
  title: string;
  subtitle: string;
  icon: LucideIcon;
  gradient: string;
  iconBg: string;
  iconColor: string;
  badge?: number;
}

export function HomeScreen({ onNavigate, employee }: { onNavigate: (s: Screen) => void; employee: AppEmployee }) {
  const [newInquiries, setNewInquiries] = useState(0);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [latestMessage, setLatestMessage] = useState<string | null>(null);
  const [isManager, setIsManager] = useState(false);

  useEffect(() => {
    (async () => {
      const { count } = await supabase
        .from('part_inquiries')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'new');
      setNewInquiries(count ?? 0);

      const { data: convs } = await supabase
        .from('message_conversations')
        .select('unread_count, last_message_preview')
        .gt('unread_count', 0);
      const total = (convs ?? []).reduce((s, c: { unread_count: number }) => s + (c.unread_count ?? 0), 0);
      setUnreadMessages(total);
      const latest = (convs ?? []).sort((a: { last_message_preview: string | null }, b: { last_message_preview: string | null }) => (b.last_message_preview ?? '').localeCompare(a.last_message_preview ?? ''))[0];
      setLatestMessage(latest?.last_message_preview ?? null);

      const { data: emp } = await supabase
        .from('employees')
        .select('role')
        .eq('active', true);
      // Check if current session user is a manager
      const sessionRaw = sessionStorage.getItem('wp_app_session');
      if (sessionRaw) {
        try {
          const session = JSON.parse(sessionRaw);
          const currentEmp = (emp ?? []).find((e: any) => e.role === 'manager' && session.user?.id === e.id);
          setIsManager(!!currentEmp || session.user?.role === 'manager');
        } catch {}
      }
    })();
  }, []);

  const modules: ModuleCard[] = [
    {
      id: 'messages',
      title: 'Messages',
      subtitle: unreadMessages > 0 ? `${unreadMessages} unread` : (latestMessage ?? 'No new messages'),
      icon: MessageSquare,
      gradient: 'from-slate-700 to-slate-800',
      iconBg: 'bg-white/15',
      iconColor: 'text-white',
      badge: unreadMessages,
    },
    {
      id: 'shop',
      title: 'Shop Management',
      subtitle: 'Work orders, labor times & parts',
      icon: Wrench,
      gradient: 'from-amber-600 to-amber-700',
      iconBg: 'bg-white/15',
      iconColor: 'text-white',
    },
    {
      id: 'towing',
      title: 'Towing',
      subtitle: 'Impounds, releases & liens',
      icon: ShieldCheck,
      gradient: 'from-slate-800 to-slate-900',
      iconBg: 'bg-red-500/15',
      iconColor: 'text-red-400',
    },
    {
      id: 'parts',
      title: 'Parts Management',
      subtitle: 'Intake, dismantling & inventory',
      icon: Package,
      gradient: 'from-red-600 to-red-700',
      iconBg: 'bg-white/15',
      iconColor: 'text-white',
    },
    {
      id: 'clockin',
      title: 'Clock In',
      subtitle: 'Staff time tracking',
      icon: Clock,
      gradient: 'from-emerald-600 to-emerald-700',
      iconBg: 'bg-white/15',
      iconColor: 'text-white',
    },
    {
      id: 'timesheet',
      title: 'Timesheets',
      subtitle: 'Weekly hours review',
      icon: ClipboardList,
      gradient: 'from-cyan-600 to-cyan-700',
      iconBg: 'bg-white/15',
      iconColor: 'text-white',
    },
    {
      id: 'inquiries',
      title: 'Leads',
      subtitle: 'Customer inquiries',
      icon: Inbox,
      gradient: 'from-rose-600 to-rose-700',
      iconBg: 'bg-white/15',
      iconColor: 'text-white',
      badge: newInquiries,
    },
    ...(isManager ? [{
      id: 'customer-accounts' as Screen,
      title: 'Customer Accounts',
      subtitle: 'Manage customers & portal access',
      icon: Users,
      gradient: 'from-cyan-600 to-cyan-700',
      iconBg: 'bg-white/15',
      iconColor: 'text-white',
    }] : []),
  ];

  return (
    <div className="px-4 pt-14 pb-nav-safe lg:px-8 lg:pt-8 space-y-6 animate-fade-in">
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold text-white">Wolf Point OS</h1>
          <Badge color="blue"><Sparkles size={10} /> AI v2.1</Badge>
        </div>
        <p className="text-slate-400 text-sm mt-0.5">Dismantling Intelligence System</p>
      </div>

      {employee.role === 'manager' && (
        <GlobalSearchBar employee={employee} onNavigate={onNavigate} />
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 lg:gap-4">
        {modules.map((mod) => {
          const Icon = mod.icon;
          return (
            <button
              key={mod.id}
              onClick={() => onNavigate(mod.id)}
              className={`group w-full bg-gradient-to-br ${mod.gradient} rounded-3xl p-5 shadow-xl shadow-black/20 active:scale-[0.97] lg:hover:scale-[1.02] transition-all flex items-center gap-4 text-left relative overflow-hidden`}
            >
              {mod.badge !== undefined && mod.badge > 0 && (
                <span className="absolute top-4 right-4 min-w-[24px] h-6 px-2 rounded-full bg-white/90 flex items-center justify-center text-xs font-bold text-slate-900 animate-pulse">
                  {mod.badge}
                </span>
              )}
              <div className={`w-14 h-14 rounded-2xl ${mod.iconBg} backdrop-blur flex items-center justify-center flex-shrink-0`}>
                <Icon size={28} className={mod.iconColor} strokeWidth={2.2} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white font-bold text-lg">{mod.title}</p>
                <p className="text-white/70 text-sm mt-0.5 truncate">{mod.subtitle}</p>
              </div>
              <ChevronRight size={22} className="text-white/40 hidden lg:block group-hover:translate-x-1 transition-transform flex-shrink-0" />
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-4">
        <button
          onClick={() => onNavigate('settings')}
          className="text-slate-500 text-sm font-medium hover:text-slate-300 transition-colors"
        >
          Settings
        </button>
        <button
          onClick={() => onNavigate('settings')}
          className="flex items-center gap-1.5 text-slate-500 text-sm font-medium hover:text-emerald-400 transition-colors"
        >
          <CreditCard size={14} /> Payments
        </button>
      </div>
    </div>
  );
}
