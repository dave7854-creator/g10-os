import { useEffect, useState } from 'react';
import { MessageSquare, ChevronRight } from 'lucide-react';
import { Card } from '@/components/ui';
import { supabase } from '@/supabaseClient';
import type { Screen } from '@/types';
import type { MessageModule } from './types';

export function ModuleMessageLink({ module, onNavigate }: { module: MessageModule; onNavigate: (s: Screen) => void }) {
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('message_conversations')
        .select('unread_count')
        .eq('module', module)
        .gt('unread_count', 0);
      setUnread((data ?? []).reduce((s: number, c: { unread_count: number }) => s + (c.unread_count ?? 0), 0));
    })();
  }, [module]);

  return (
    <Card onClick={() => onNavigate('messages')} className="p-4 flex items-center gap-3 relative">
      <div className="w-10 h-10 rounded-xl bg-red-500/15 flex items-center justify-center flex-shrink-0">
        <MessageSquare size={20} className="text-red-400" />
      </div>
      <div className="flex-1">
        <p className="text-sm font-bold text-white">Messages</p>
        <p className="text-xs text-slate-500">
          {unread > 0 ? `${unread} unread` : 'No new messages'}
        </p>
      </div>
      {unread > 0 && (
        <span className="min-w-[24px] h-6 px-2 rounded-full bg-red-500 flex items-center justify-center text-xs font-bold text-white animate-pulse">
          {unread}
        </span>
      )}
      <ChevronRight size={18} className="text-slate-600 flex-shrink-0" />
    </Card>
  );
}
