import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/supabaseClient';
import type { MessageConversation, MessageMessage, MessagingConfig, MessageModule } from './types';

export function useMessaging() {
  const [conversations, setConversations] = useState<MessageConversation[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchConversations = useCallback(async () => {
    const { data, error } = await supabase
      .from('message_conversations')
      .select('*')
      .order('last_message_at', { ascending: false, nullsFirst: false });
    if (!error && data) {
      setConversations(data as MessageConversation[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  // Realtime subscription for new messages
  useEffect(() => {
    const channel = supabase
      .channel('message_conversations_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'message_conversations' }, () => {
        fetchConversations();
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'message_messages' }, () => {
        fetchConversations();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchConversations]);

  const totalUnread = conversations.reduce((s, c) => s + (c.unread_count ?? 0), 0);
  const unreadByModule = (mod: MessageModule) =>
    conversations.filter((c) => c.module === mod && !c.is_unassigned).reduce((s, c) => s + (c.unread_count ?? 0), 0);
  const unassignedCount = conversations.filter((c) => c.is_unassigned).length;

  return { conversations, loading, totalUnread, unreadByModule, unassignedCount, refetch: fetchConversations };
}

export function useConversationMessages(conversationId: string | null) {
  const [messages, setMessages] = useState<MessageMessage[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchMessages = useCallback(async () => {
    if (!conversationId) { setMessages([]); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from('message_messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });
    if (!error && data) {
      setMessages(data as MessageMessage[]);
    }
    setLoading(false);
  }, [conversationId]);

  useEffect(() => { fetchMessages(); }, [fetchMessages]);

  // Realtime for messages in this conversation
  useEffect(() => {
    if (!conversationId) return;
    const channel = supabase
      .channel(`messages_${conversationId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'message_messages', filter: `conversation_id=eq.${conversationId}` }, () => {
        fetchMessages();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [conversationId, fetchMessages]);

  // Mark messages as read when conversation is opened
  useEffect(() => {
    if (!conversationId) return;
    (async () => {
      await supabase
        .from('message_messages')
        .update({ is_read: true })
        .eq('conversation_id', conversationId)
        .eq('direction', 'incoming')
        .eq('is_read', false);
      await supabase
        .from('message_conversations')
        .update({ unread_count: 0, updated_at: new Date().toISOString() })
        .eq('id', conversationId);
    })();
  }, [conversationId]);

  const sendMessage = useCallback(async (body: string, sentBy?: string): Promise<{ success: boolean; error?: string }> => {
    if (!conversationId || !body.trim()) return { success: false, error: 'Empty message' };

    const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-message`;
    try {
      const resp = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ conversation_id: conversationId, body: body.trim(), sent_by: sentBy }),
      });
      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        return { success: false, error: errData.error ?? `Failed (${resp.status})` };
      }
      await fetchMessages();
      return { success: true };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }, [conversationId, fetchMessages]);

  return { messages, loading, sendMessage, refetch: fetchMessages };
}

export async function startConversation(params: {
  module: MessageModule;
  contactName: string;
  contactPhone: string;
  contactEmail?: string | null;
  recordId?: string | null;
  recordType?: string | null;
  recordLabel?: string | null;
  vehicleLabel?: string | null;
}): Promise<MessageConversation | null> {
  // Check if a conversation already exists for this phone + module + record
  let query = supabase
    .from('message_conversations')
    .select('*')
    .eq('contact_phone', params.contactPhone)
    .eq('module', params.module);

  if (params.recordId) {
    query = query.eq('record_id', params.recordId);
  }

  const { data: existing } = await query.maybeSingle();

  if (existing) {
    // Update contact info in case it changed
    const { data: updated } = await supabase
      .from('message_conversations')
      .update({
        contact_name: params.contactName,
        contact_email: params.contactEmail ?? null,
        record_label: params.recordLabel ?? existing.record_label,
        vehicle_label: params.vehicleLabel ?? existing.vehicle_label,
        is_unassigned: false,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
      .select()
      .maybeSingle();
    return (updated ?? existing) as MessageConversation;
  }

  const { data: newConv } = await supabase
    .from('message_conversations')
    .insert({
      module: params.module,
      contact_name: params.contactName,
      contact_phone: params.contactPhone,
      contact_email: params.contactEmail ?? null,
      record_id: params.recordId ?? null,
      record_type: params.recordType ?? null,
      record_label: params.recordLabel ?? null,
      vehicle_label: params.vehicleLabel ?? null,
      is_unassigned: false,
    })
    .select()
    .maybeSingle();

  return newConv as MessageConversation | null;
}

export async function assignConversation(conversationId: string, module: MessageModule, recordId?: string | null, recordLabel?: string | null, contactName?: string | null) {
  await supabase
    .from('message_conversations')
    .update({
      module,
      is_unassigned: false,
      record_id: recordId ?? null,
      record_label: recordLabel ?? null,
      contact_name: contactName ?? undefined,
      updated_at: new Date().toISOString(),
    })
    .eq('id', conversationId);
}

export async function getMessagingConfig(): Promise<MessagingConfig | null> {
  const { data } = await supabase
    .from('messaging_config')
    .select('id, provider, phone_number, is_active, webhook_url')
    .eq('id', 1)
    .maybeSingle();
  return data as MessagingConfig | null;
}

export async function updateMessagingConfig(updates: { provider?: string; phone_number?: string | null; is_active?: boolean; webhook_url?: string | null; api_key?: string | null; api_secret?: string | null }) {
  // Only send api_key/api_secret if they're provided (non-null) — don't overwrite existing keys with null
  const payload: Record<string, unknown> = { ...updates };
  if (updates.api_key === null) delete payload.api_key;
  if (updates.api_secret === null) delete payload.api_secret;

  const { data } = await supabase
    .from('messaging_config')
    .update(payload)
    .eq('id', 1)
    .select('id, provider, phone_number, is_active, webhook_url')
    .maybeSingle();
  return data as MessagingConfig | null;
}

export function searchConversations(conversations: MessageConversation[], query: string): MessageConversation[] {
  if (!query.trim()) return conversations;
  const q = query.toLowerCase();
  return conversations.filter((c) =>
    c.contact_name?.toLowerCase().includes(q) ||
    c.contact_phone?.toLowerCase().includes(q) ||
    c.vehicle_label?.toLowerCase().includes(q) ||
    c.record_label?.toLowerCase().includes(q) ||
    c.last_message_preview?.toLowerCase().includes(q)
  );
}
