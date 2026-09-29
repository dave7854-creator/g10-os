import { useState, useEffect, useRef } from 'react';
import { getConversations, getMessageThread, sendMessage, formatDate, type Session, type PortalConversation } from '../portalApi';

interface PortalMessagesProps {
  session: Session;
  conversationId?: string | null;
  onOpenThread?: (id: string) => void;
  onBack?: () => void;
}

export function PortalMessages({ session, conversationId, onOpenThread, onBack }: PortalMessagesProps) {
  const [conversations, setConversations] = useState<PortalConversation[]>([]);
  const [activeConv, setActiveConv] = useState<PortalConversation | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load conversation list
  useEffect(() => {
    if (conversationId) return; // In thread mode
    setLoading(true);
    getConversations(session)
      .then((res) => setConversations(res.conversations))
      .catch(() => setError('Unable to load messages.'))
      .finally(() => setLoading(false));
  }, [session, conversationId]);

  // Load thread when conversationId is provided
  useEffect(() => {
    if (!conversationId) return;
    setLoading(true);
    getMessageThread(session, conversationId)
      .then((res) => {
        setActiveConv(res.conversation);
        setMessages(res.messages);
      })
      .catch(() => setError('Unable to load conversation.'))
      .finally(() => setLoading(false));
  }, [session, conversationId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!draft.trim() || !conversationId) return;
    setSending(true);
    try {
      await sendMessage(session, conversationId, draft);
      setDraft('');
      // Reload thread
      const res = await getMessageThread(session, conversationId);
      setMessages(res.messages);
    } catch (e: any) {
      setError(e.message || 'Unable to send message.');
    }
    setSending(false);
  };

  if (loading) return <div className="fp-portal-loading"><div className="fp-spinner" /></div>;

  // Thread view
  if (conversationId) {
    return (
      <div className="fp-anim-in">
        <div className="fp-portal-section">
          {onBack && (
            <button className="fp-back-btn" onClick={onBack}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m12 19-7-7 7-7M19 12H5"/></svg>
              Back to Messages
            </button>
          )}

          {activeConv && (
            <div className="fp-portal-thread-header">
              <h1>{activeConv.record_label || 'Conversation'}</h1>
              {activeConv.vehicle_label && <p>{activeConv.vehicle_label}</p>}
            </div>
          )}

          {error && <div className="fp-portal-error-banner">{error}</div>}

          <div className="fp-portal-thread">
            {messages.length === 0 && (
              <div className="fp-portal-empty"><p>No messages yet.</p></div>
            )}
            {messages.map(msg => (
              <div key={msg.id} className={`fp-portal-msg ${msg.direction === 'incoming' ? 'fp-portal-msg-in' : 'fp-portal-msg-out'}`}>
                <div className="fp-portal-msg-bubble">
                  {msg.body}
                </div>
                <div className="fp-portal-msg-time">{formatDate(msg.created_at)}</div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          <div className="fp-portal-msg-compose">
            <textarea
              className="fp-portal-input fp-portal-textarea"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Type your message..."
              rows={2}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
            />
            <button className="fp-btn fp-btn-primary" onClick={handleSend} disabled={sending || !draft.trim()}>
              {sending ? 'Sending...' : 'Send'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // List view
  return (
    <div className="fp-anim-in">
      <div className="fp-portal-section">
        <h1 className="fp-portal-page-title">Messages</h1>

        {error && <div className="fp-portal-error-banner">{error}</div>}

        {conversations.length === 0 && !error && (
          <div className="fp-portal-empty">
            <h3>No Messages</h3>
            <p>When you submit a service request or have questions about your repairs, conversations will appear here.</p>
          </div>
        )}

        {conversations.length > 0 && (
          <div className="fp-portal-list">
            {conversations.map(conv => (
              <div
                key={conv.id}
                className="fp-portal-list-item"
                onClick={() => onOpenThread?.(conv.id)}
                style={{ cursor: 'pointer' }}
              >
                <div className="fp-portal-list-info">
                  <div className="fp-portal-list-primary">{conv.record_label || 'Conversation'}</div>
                  {conv.vehicle_label && <div className="fp-portal-list-secondary">{conv.vehicle_label}</div>}
                  {conv.last_message_preview && (
                    <div className="fp-portal-list-meta" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '300px' }}>
                      {conv.last_message_preview}
                    </div>
                  )}
                </div>
                {conv.unread_count > 0 && (
                  <div className="fp-portal-unread-badge">{conv.unread_count}</div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
