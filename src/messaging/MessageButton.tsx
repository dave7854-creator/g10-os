import { useState, useEffect } from 'react';
import { MessageSquare, X, Send, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui';
import type { MessageModule, MessageConversation } from './types';
import { startConversation } from './messagingService';
import { useConversationMessages } from './messagingService';

interface MessageButtonProps {
  module: MessageModule;
  contactName: string;
  contactPhone: string;
  contactEmail?: string | null;
  recordId?: string | null;
  recordType?: string | null;
  recordLabel?: string | null;
  vehicleLabel?: string | null;
  sentBy?: string;
  compact?: boolean;
}

export function MessageButton({
  module, contactName, contactPhone, contactEmail,
  recordId, recordType, recordLabel, vehicleLabel, sentBy, compact,
}: MessageButtonProps) {
  const [open, setOpen] = useState(false);

  const handleClick = () => {
    if (!contactPhone) {
      alert('No phone number available for this contact');
      return;
    }
    setOpen(true);
  };

  return (
    <>
      {compact ? (
        <button
          onClick={handleClick}
          className="w-9 h-9 rounded-xl bg-slate-800/60 border border-slate-700/50 flex items-center justify-center active:scale-90 transition-transform"
          title={`Message ${contactName}`}
        >
          <MessageSquare size={18} className="text-slate-300" />
        </button>
      ) : (
        <button
          onClick={handleClick}
          className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-800/60 border border-slate-700/50 text-sm font-semibold text-slate-300 active:scale-95 transition-transform"
        >
          <MessageSquare size={16} /> Message
        </button>
      )}
      {open && (
        <MessageModal
          module={module}
          contactName={contactName}
          contactPhone={contactPhone}
          contactEmail={contactEmail}
          recordId={recordId}
          recordType={recordType}
          recordLabel={recordLabel}
          vehicleLabel={vehicleLabel}
          sentBy={sentBy}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function MessageModal({
  module, contactName, contactPhone, contactEmail,
  recordId, recordType, recordLabel, vehicleLabel, sentBy, onClose,
}: MessageButtonProps & { onClose: () => void }) {
  const [conv, setConv] = useState<MessageConversation | null>(null);
  const [starting, setStarting] = useState(true);
  const [text, setText] = useState('');
  const [sendResult, setSendResult] = useState<{ success: boolean; error?: string } | null>(null);

  const { messages, sendMessage, loading } = useConversationMessages(conv?.id ?? null);

  useEffect(() => {
    if (!contactPhone) { setStarting(false); return; }
    (async () => {
      const c = await startConversation({
        module,
        contactName,
        contactPhone,
        contactEmail,
        recordId,
        recordType,
        recordLabel,
        vehicleLabel,
      });
      setConv(c);
      setStarting(false);
    })();
  }, [contactPhone, module, contactName, contactEmail, recordId, recordType, recordLabel, vehicleLabel]);

  const handleSend = async () => {
    if (!text.trim()) return;
    setSendResult(null);
    const result = await sendMessage(text, sentBy);
    if (result.success) {
      setText('');
    }
    setSendResult(result);
  };

  const MODULE_LABEL: Record<MessageModule, string> = { shop: 'Shop', towing: 'Towing', parts: 'Parts' };

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center lg:items-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-fade-in" />
      <div
        className="relative w-full max-w-lg bg-slate-900 rounded-t-3xl lg:rounded-2xl border-t lg:border border-slate-700/50 max-h-[85vh] overflow-y-auto scrollbar-hide animate-slide-up flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-slate-900/95 backdrop-blur-xl px-4 pt-4 pb-3 border-b border-slate-800 z-10 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MessageSquare size={18} className="text-red-400" />
            <div>
              <h2 className="text-lg font-bold text-white">{contactName}</h2>
              <p className="text-xs text-slate-500">{contactPhone} · {MODULE_LABEL[module]}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center">
            <X size={18} className="text-slate-400" />
          </button>
        </div>

        {recordLabel && (
          <div className="px-4 pt-3">
            <p className="text-xs text-slate-500">{recordLabel}</p>
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2 min-h-[200px]">
          {starting ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 size={20} className="text-red-400 animate-spin" />
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center text-center py-8">
              <MessageSquare size={28} className="text-slate-700" strokeWidth={1.5} />
              <p className="text-slate-500 text-sm mt-3">No messages yet</p>
              <p className="text-slate-600 text-xs mt-1">Send a message below to start</p>
            </div>
          ) : (
            messages.map((msg) => (
              <div key={msg.id} className={`flex ${msg.direction === 'outgoing' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 ${
                  msg.direction === 'outgoing' ? 'bg-red-600 text-white rounded-br-md' : 'bg-slate-800 text-slate-200 rounded-bl-md'
                }`}>
                  <p className="text-sm whitespace-pre-wrap break-words">{msg.body}</p>
                  <span className={`text-[10px] ${msg.direction === 'outgoing' ? 'text-red-300/70' : 'text-slate-500'} block mt-1`}>
                    {new Date(msg.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                  </span>
                </div>
              </div>
            ))
          )}
          {sendResult && !sendResult.success && (
            <div className="p-2.5 bg-red-500/10 border border-red-500/20 rounded-xl">
              <p className="text-xs text-red-300">{sendResult.error}</p>
            </div>
          )}
        </div>

        <div className="sticky bottom-0 bg-slate-900/95 backdrop-blur-xl px-4 py-3 border-t border-slate-800 flex items-end gap-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            placeholder="Type a message..."
            rows={1}
            className="flex-1 bg-slate-800/60 border border-slate-700/50 rounded-2xl px-4 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-red-500 focus:outline-none resize-none max-h-24"
            style={{ minHeight: '42px' }}
          />
          <button
            onClick={handleSend}
            disabled={!text.trim() || starting}
            className="w-11 h-11 rounded-2xl bg-red-600 flex items-center justify-center active:scale-90 transition-transform disabled:opacity-40 flex-shrink-0"
          >
            <Send size={18} className="text-white" />
          </button>
        </div>
      </div>
    </div>
  );
}
