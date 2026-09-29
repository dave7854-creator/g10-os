export type MessageModule = 'shop' | 'towing' | 'parts';

export interface MessageConversation {
  id: string;
  module: MessageModule;
  contact_name: string;
  contact_phone: string;
  contact_email: string | null;
  record_id: string | null;
  record_type: string | null;
  record_label: string | null;
  vehicle_label: string | null;
  unread_count: number;
  last_message_preview: string | null;
  last_message_at: string | null;
  is_unassigned: boolean;
  created_at: string;
  updated_at: string;
}

export interface MessageMessage {
  id: string;
  conversation_id: string;
  direction: 'incoming' | 'outgoing';
  body: string;
  is_read: boolean;
  delivery_status: string;
  provider_message_id: string | null;
  sent_by: string | null;
  created_at: string;
}

export interface MessagingConfig {
  id: number;
  provider: string;
  phone_number: string | null;
  is_active: boolean;
  webhook_url: string | null;
}
