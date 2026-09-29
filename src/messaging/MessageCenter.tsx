import { useState, useEffect, useMemo } from 'react';
import {
  MessageSquare, Search, Send, ChevronLeft, ArrowLeft, Inbox, User,
  Wrench, ShieldCheck, Package, X, AlertTriangle, Check, Phone,
} from 'lucide-react';
import { Card, Button, Badge } from '@/components/ui';
import { supabase } from '@/supabaseClient';
import type { Screen } from '@/types';
import type { MessageModule, MessageConversation } from '@/messaging/types';
import { useMessaging, useConversationMessages, startConversation, assignConversation, searchConversations } from '@/messaging/messagingService';

type MessageView = 'inbox' | 'conversation' | 'assign';

const MODULE_META: Record<MessageModule, { label: string; icon: typeof Wrench; color: string; bg: string; border: string }> = {
  shop: { label: 'SHOP', icon: Wrench, color: 'text-amber-400', bg: 'bg-amber-500/15', border: 'border-amber-500/30' },
  towing: { label: 'TOWING', icon: ShieldCheck, color: 'text-red-400', bg: 'bg-red-500/15', border: 'border-red-500/30' },
  parts: { label: 'PARTS', icon: Package, color: 'text-emerald-400', bg: 'bg-emerald-500/15', border: 'border-emerald-500/30' },
};

type ModuleFilter = 'all' | MessageModule | 'unassigned';

const FILTERS: { id: ModuleFilter; label: string; icon: typeof Inbox }[] = [
  { id: 'all', label: 'All Messages', icon: MessageSquare },
  { id: 'shop', label: 'Shop', icon: Wrench },
  { id: 'towing', label: 'Towing', icon: ShieldCheck },
  { id: 'parts', label: 'Parts', icon: Package },
  { id: 'unassigned', label: 'Unassigned', icon: AlertTriangle },
];

function formatTime(s: string): string {
  const d = new Date(s);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'now';
  if (diffMin < 60) return `${diffMin}m`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h`;
  if (diffHr < 48) return 'yesterday';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function MessageCenter({ onNavigate, employeeName }: { onNavigate: (s: Screen) => void; employeeName?: string }) {
  const { conversations, loading, totalUnread, refetch } = useMessaging();
  const [filter, setFilter] = useState<ModuleFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
  const [view, setView] = useState<MessageView>('inbox');

  const filtered = useMemo(() => {
    let list = conversations;
    if (filter === 'unassigned') {
      list = list.filter((c) => c.is_unassigned);
    } else if (filter !== 'all') {
      list = list.filter((c) => c.module === filter && !c.is_unassigned);
    } else {
      list = list.filter((c) => !c.is_unassigned);
    }
    return searchConversations(list, searchQuery);
  }, [conversations, filter, searchQuery]);

  const unreadByMod = (mod: MessageModule) =>
    conversations.filter((c) => c.module === mod && !c.is_unassigned).reduce((s, c) => s + (c.unread_count ?? 0), 0);
  const unassignedCount = conversations.filter((c) => c.is_unassigned).length;

  // CONVERSATION VIEW
  if (view === 'conversation' && selectedConvId) {
    return (
      <ConversationView
        conversationId={selectedConvId}
        onBack={() => { setView('inbox'); setSelectedConvId(null); }}
        employeeName={employeeName}
        onNavigate={onNavigate}
      />
    );
  }

  // ASSIGN VIEW
  if (view === 'assign' && selectedConvId) {
    return (
      <AssignView
        conversationId={selectedConvId}
        onBack={() => { setView('inbox'); setSelectedConvId(null); }}
        onAssigned={() => { refetch(); setView('inbox'); setSelectedConvId(null); }}
      />
    );
  }

  // INBOX VIEW
  return (
    <div className="px-4 pt-14 pb-nav-safe lg:px-8 lg:pt-8 space-y-4 animate-fade-in">
      <div className="flex items-center gap-3">
        <button onClick={() => onNavigate('home')} className="w-9 h-9 rounded-xl bg-slate-800/60 flex items-center justify-center active:scale-90 transition-transform lg:hidden">
          <ChevronLeft size={20} className="text-slate-400" />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-white">Messages</h1>
            {totalUnread > 0 && (
              <span className="min-w-[24px] h-6 px-2 rounded-full bg-red-500 flex items-center justify-center text-xs font-bold text-white">
                {totalUnread}
              </span>
            )}
          </div>
          <p className="text-slate-400 text-sm mt-0.5">
            {totalUnread > 0 ? `${totalUnread} unread` : 'All caught up'}
          </p>
        </div>
      </div>

      {/* Module sections */}
      <div className="grid grid-cols-3 gap-2">
        {(['shop', 'towing', 'parts'] as MessageModule[]).map((mod) => {
          const meta = MODULE_META[mod];
          const count = unreadByMod(mod);
          const total = conversations.filter((c) => c.module === mod && !c.is_unassigned).length;
          const Icon = meta.icon;
          return (
            <button
              key={mod}
              onClick={() => setFilter(mod)}
              className={`p-3 rounded-2xl border transition-all active:scale-95 text-center ${
                filter === mod ? `${meta.bg} ${meta.border}` : 'bg-slate-800/40 border-slate-700/40'
              }`}
            >
              <div className={`w-8 h-8 rounded-lg ${meta.bg} flex items-center justify-center mx-auto mb-1.5`}>
                <Icon size={16} className={meta.color} />
              </div>
              <p className="text-xs font-bold text-white">{meta.label}</p>
              <p className={`text-[10px] mt-0.5 ${count > 0 ? 'text-red-400 font-bold' : 'text-slate-500'}`}>
                {count > 0 ? `${count} unread` : `${total} total`}
              </p>
            </button>
          );
        })}
      </div>

      {/* Filter pills */}
      <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide pb-1">
        {FILTERS.map((f) => {
          const Icon = f.icon;
          const isActive = filter === f.id;
          const badge = f.id === 'unassigned' ? unassignedCount : f.id === 'all' ? totalUnread : 0;
          return (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all active:scale-95 ${
                isActive ? 'bg-red-600 text-white' : 'bg-slate-800/60 text-slate-400 border border-slate-700/50'
              }`}
            >
              <Icon size={14} />
              {f.label}
              {badge > 0 && (
                <span className={`min-w-[18px] h-[18px] px-1 rounded-full text-[10px] flex items-center justify-center font-bold ${
                  isActive ? 'bg-white/20 text-white' : 'bg-red-500 text-white'
                }`}>
                  {badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
        <input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search by name, phone, vehicle, WO#, VIN..."
          className="w-full bg-slate-800/60 border border-slate-700/50 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-red-500 focus:outline-none"
        />
      </div>

      {/* Conversation list */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-3 border-red-500/30 border-t-red-500 rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center text-center py-12">
          <MessageSquare size={32} className="text-slate-700" strokeWidth={1.5} />
          <p className="text-slate-500 text-sm mt-3">No messages{filter !== 'all' ? ` in ${filter}` : ''}</p>
          {searchQuery && <p className="text-slate-600 text-xs mt-1">Try a different search</p>}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((conv) => (
            <ConversationRow
              key={conv.id}
              conv={conv}
              onClick={() => {
                if (conv.is_unassigned) {
                  setSelectedConvId(conv.id);
                  setView('assign');
                } else {
                  setSelectedConvId(conv.id);
                  setView('conversation');
                }
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ConversationRow({ conv, onClick }: { conv: MessageConversation; onClick: () => void }) {
  const meta = MODULE_META[conv.module];
  const Icon = meta.icon;
  const hasUnread = conv.unread_count > 0;

  return (
    <Card className={`p-3.5 cursor-pointer active:scale-[0.98] transition-transform ${hasUnread ? 'border-red-500/30 bg-red-500/5' : ''}`} onClick={onClick}>
      <div className="flex items-start gap-3">
        <div className={`w-10 h-10 rounded-xl ${meta.bg} flex items-center justify-center flex-shrink-0`}>
          <Icon size={18} className={meta.color} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className={`text-sm truncate ${hasUnread ? 'font-bold text-white' : 'font-semibold text-slate-300'}`}>
              {conv.contact_name || 'Unknown'}
            </p>
            {conv.is_unassigned && (
              <span className="text-[9px] px-1.5 py-0.5 rounded-md font-bold text-amber-400 bg-amber-500/15 flex-shrink-0">
                UNASSIGNED
              </span>
            )}
            <span className={`text-[9px] px-1.5 py-0.5 rounded-md font-bold ${meta.color} ${meta.bg} flex-shrink-0`}>
              {meta.label}
            </span>
          </div>
          {conv.record_label && (
            <p className="text-xs text-slate-500 truncate mt-0.5">{conv.record_label}</p>
          )}
          {conv.last_message_preview && (
            <p className={`text-xs truncate mt-1 ${hasUnread ? 'text-slate-300' : 'text-slate-500'}`}>
              {conv.last_message_preview}
            </p>
          )}
        </div>
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          {conv.last_message_at && (
            <span className="text-[10px] text-slate-500">{formatTime(conv.last_message_at)}</span>
          )}
          {hasUnread && (
            <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-red-500 flex items-center justify-center text-[10px] font-bold text-white">
              {conv.unread_count}
            </span>
          )}
        </div>
      </div>
    </Card>
  );
}

function ConversationView({ conversationId, onBack, employeeName, onNavigate }: {
  conversationId: string;
  onBack: () => void;
  employeeName?: string;
  onNavigate: (s: Screen) => void;
}) {
  const { messages, loading, sendMessage } = useConversationMessages(conversationId);
  const [conv, setConv] = useState<MessageConversation | null>(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('message_conversations')
        .select('*')
        .eq('id', conversationId)
        .maybeSingle();
      if (data) setConv(data as MessageConversation);
    })();
  }, [conversationId]);

  const handleSend = async () => {
    if (!text.trim() || sending) return;
    setSending(true);
    setError(null);
    const result = await sendMessage(text, employeeName);
    if (result.success) {
      setText('');
    } else {
      setError(result.error ?? 'Failed to send');
    }
    setSending(false);
  };

  const meta = conv ? MODULE_META[conv.module] : null;

  return (
    <div className="flex flex-col lg:flex-row px-4 pt-14 pb-nav-safe lg:px-8 lg:pt-8 animate-fade-in" style={{ minHeight: 'calc(100vh - 0px)' }}>
      <div className="flex flex-col flex-1 max-w-3xl mx-auto w-full">
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <button onClick={onBack} className="w-9 h-9 rounded-xl bg-slate-800/60 flex items-center justify-center active:scale-90 transition-transform">
            <ArrowLeft size={20} className="text-slate-400" />
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-lg font-bold text-white truncate">{conv?.contact_name || 'Loading...'}</p>
              {meta && (
                <span className={`text-[9px] px-1.5 py-0.5 rounded-md font-bold ${meta.color} ${meta.bg} flex-shrink-0`}>
                  {meta.label}
                </span>
              )}
            </div>
            {conv?.record_label && <p className="text-xs text-slate-500 truncate">{conv.record_label}</p>}
          </div>
          {conv?.contact_phone && (
            <a href={`tel:${conv.contact_phone}`} className="w-9 h-9 rounded-xl bg-slate-800/60 flex items-center justify-center active:scale-90 transition-transform">
              <Phone size={18} className="text-slate-400" />
            </a>
          )}
        </div>

        {/* Vehicle/contact info */}
        {conv?.vehicle_label && (
          <div className="p-3 bg-slate-800/40 rounded-xl mb-3">
            <p className="text-xs text-slate-500">{conv.vehicle_label}</p>
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 space-y-2 overflow-y-auto pb-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="w-8 h-8 border-3 border-red-500/30 border-t-red-500 rounded-full animate-spin" />
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center text-center py-8">
              <MessageSquare size={28} className="text-slate-700" strokeWidth={1.5} />
              <p className="text-slate-500 text-sm mt-3">No messages yet</p>
              <p className="text-slate-600 text-xs mt-1">Send a message below to start the conversation</p>
            </div>
          ) : (
            messages.map((msg) => (
              <div key={msg.id} className={`flex ${msg.direction === 'outgoing' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[75%] rounded-2xl px-3.5 py-2.5 ${
                  msg.direction === 'outgoing'
                    ? 'bg-red-600 text-white rounded-br-md'
                    : 'bg-slate-800 text-slate-200 rounded-bl-md'
                }`}>
                  <p className="text-sm whitespace-pre-wrap break-words">{msg.body}</p>
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className={`text-[10px] ${msg.direction === 'outgoing' ? 'text-red-300/70' : 'text-slate-500'}`}>
                      {new Date(msg.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                    </span>
                    {msg.direction === 'outgoing' && msg.delivery_status === 'failed' && (
                      <span className="text-[10px] text-red-400 font-semibold">Failed</span>
                    )}
                    {msg.direction === 'outgoing' && msg.delivery_status === 'pending' && (
                      <span className="text-[10px] text-amber-400 font-semibold">Pending</span>
                    )}
                    {msg.sent_by && msg.direction === 'outgoing' && (
                      <span className={`text-[10px] ${msg.direction === 'outgoing' ? 'text-red-300/70' : 'text-slate-500'}`}>· {msg.sent_by}</span>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="p-2.5 bg-red-500/10 border border-red-500/20 rounded-xl mb-2">
            <p className="text-xs text-red-300">{error}</p>
          </div>
        )}

        {/* Compose */}
        <div className="flex items-end gap-2 pb-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            placeholder="Type a message..."
            rows={1}
            className="flex-1 bg-slate-800/60 border border-slate-700/50 rounded-2xl px-4 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-red-500 focus:outline-none resize-none max-h-32"
            style={{ minHeight: '42px' }}
          />
          <button
            onClick={handleSend}
            disabled={!text.trim() || sending}
            className="w-11 h-11 rounded-2xl bg-red-600 flex items-center justify-center active:scale-90 transition-transform disabled:opacity-40 flex-shrink-0"
          >
            {sending ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <Send size={18} className="text-white" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function AssignView({ conversationId, onBack, onAssigned }: {
  conversationId: string;
  onBack: () => void;
  onAssigned: () => void;
}) {
  const [conv, setConv] = useState<MessageConversation | null>(null);
  const [selectedModule, setSelectedModule] = useState<MessageModule>('shop');
  const [searchName, setSearchName] = useState('');
  const [searchResults, setSearchResults] = useState<{ id: string; label: string; phone?: string | null }[]>([]);
  const [selectedRecord, setSelectedRecord] = useState<{ id: string; label: string } | null>(null);
  const [contactName, setContactName] = useState('');

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('message_conversations')
        .select('*')
        .eq('id', conversationId)
        .maybeSingle();
      if (data) {
        setConv(data as MessageConversation);
        setContactName(data.contact_name ?? '');
      }
    })();
  }, [conversationId]);

  // Search records based on selected module
  useEffect(() => {
    if (!searchName.trim()) { setSearchResults([]); return; }
    let cancelled = false;
    (async () => {
      let results: { id: string; label: string; phone?: string | null }[] = [];
      const q = `%${searchName.toLowerCase()}%`;
      if (selectedModule === 'shop') {
        const { data } = await supabase
          .from('shop_customers')
          .select('id, first_name, last_name, phone')
          .or(`first_name.ilike.${q},last_name.ilike.${q},phone.ilike.${q}`)
          .limit(10);
        results = (data ?? []).map((c: { id: string; first_name: string; last_name: string; phone: string | null }) => ({
          id: c.id,
          label: `${c.first_name} ${c.last_name}`,
          phone: c.phone,
        }));
      } else if (selectedModule === 'towing') {
        const { data } = await supabase
          .from('towing_owners')
          .select('id, name, phone, impound_id')
          .ilike('name', q)
          .limit(10);
        results = (data ?? []).map((o: { id: string; name: string | null; phone: string | null; impound_id: string }) => ({
          id: o.impound_id,
          label: o.name ?? 'Unknown',
          phone: o.phone,
        }));
      } else if (selectedModule === 'parts') {
        const { data } = await supabase
          .from('part_inquiries')
          .select('id, customer_name, phone, part_needed')
          .ilike('customer_name', q)
          .limit(10);
        results = (data ?? []).map((i: { id: string; customer_name: string; phone: string; part_needed: string }) => ({
          id: i.id,
          label: `${i.customer_name} — ${i.part_needed}`,
          phone: i.phone,
        }));
      }
      if (!cancelled) setSearchResults(results);
    })();
    return () => { cancelled = true; };
  }, [searchName, selectedModule]);

  const handleAssign = async () => {
    await assignConversation(
      conversationId,
      selectedModule,
      selectedRecord?.id ?? null,
      selectedRecord?.label ?? null,
      contactName || null,
    );
    onAssigned();
  };

  return (
    <div className="px-4 pt-14 pb-nav-safe lg:px-8 lg:pt-8 space-y-4 animate-fade-in max-w-2xl mx-auto">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="w-9 h-9 rounded-xl bg-slate-800/60 flex items-center justify-center active:scale-90 transition-transform">
          <ArrowLeft size={20} className="text-slate-400" />
        </button>
        <h1 className="text-xl font-bold text-white">Assign Message</h1>
      </div>

      <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl">
        <div className="flex items-center gap-2 mb-1">
          <AlertTriangle size={14} className="text-amber-400" />
          <p className="text-xs font-bold text-amber-400">Unassigned Message</p>
        </div>
        <p className="text-sm text-slate-300">From: {conv?.contact_phone}</p>
        {conv?.last_message_preview && <p className="text-xs text-slate-500 mt-1">"{conv.last_message_preview}"</p>}
      </div>

      {/* Module selector */}
      <div>
        <p className="text-[10px] text-slate-500 uppercase font-semibold mb-2">Assign to Module</p>
        <div className="grid grid-cols-3 gap-2">
          {(['shop', 'towing', 'parts'] as MessageModule[]).map((mod) => {
            const meta = MODULE_META[mod];
            const Icon = meta.icon;
            return (
              <button
                key={mod}
                onClick={() => { setSelectedModule(mod); setSelectedRecord(null); setSearchName(''); }}
                className={`p-3 rounded-xl border transition-all active:scale-95 ${
                  selectedModule === mod ? `${meta.bg} ${meta.border}` : 'bg-slate-800/40 border-slate-700/40'
                }`}
              >
                <Icon size={18} className={`${meta.color} mx-auto mb-1`} />
                <p className="text-xs font-bold text-white">{meta.label}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Contact name */}
      <div>
        <p className="text-[10px] text-slate-500 uppercase font-semibold mb-2">Contact Name</p>
        <input
          value={contactName}
          onChange={(e) => setContactName(e.target.value)}
          placeholder="Customer name"
          className="w-full bg-slate-800/60 border border-slate-700/50 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-red-500 focus:outline-none"
        />
      </div>

      {/* Search for record */}
      <div>
        <p className="text-[10px] text-slate-500 uppercase font-semibold mb-2">Search for Related Record (optional)</p>
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            value={searchName}
            onChange={(e) => setSearchName(e.target.value)}
            placeholder="Search customers, owners, leads..."
            className="w-full bg-slate-800/60 border border-slate-700/50 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-red-500 focus:outline-none"
          />
        </div>
        {searchResults.length > 0 && (
          <div className="mt-2 space-y-1">
            {searchResults.map((r) => (
              <button
                key={r.id}
                onClick={() => { setSelectedRecord({ id: r.id, label: r.label }); setSearchName(r.label); }}
                className={`w-full text-left p-2.5 rounded-xl border transition-all ${
                  selectedRecord?.id === r.id ? 'bg-red-500/10 border-red-500/30' : 'bg-slate-800/40 border-slate-700/40'
                }`}
              >
                <p className="text-sm text-white font-medium">{r.label}</p>
                {r.phone && <p className="text-xs text-slate-500">{r.phone}</p>}
              </button>
            ))}
          </div>
        )}
        {selectedRecord && (
          <div className="mt-2 flex items-center gap-2 p-2.5 bg-red-500/10 rounded-xl">
            <Check size={14} className="text-red-400" />
            <p className="text-xs text-red-300 font-medium">Linked to: {selectedRecord.label}</p>
          </div>
        )}
      </div>

      <Button onClick={handleAssign} size="lg" className="w-full">
        Assign to {MODULE_META[selectedModule].label}
      </Button>
    </div>
  );
}
