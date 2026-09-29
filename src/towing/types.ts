export type TowingRole = 'administrator' | 'manager' | 'office_staff' | 'driver';

export type TowingPage =
  | 'dashboard'
  | 'active-impounds'
  | 'released'
  | 'title-obtained'
  | 'junkyard'
  | 'for-sale'
  | 'archived-impounds'
  | 'reports'
  | 'payments'
  | 'fees'
  | 'photos'
  | 'owners'
  | 'lien-holders'
  | 'notices'
  | 'history'
  | 'new-impound'
  | 'impound-detail'
  | 'user-management'
  | 'security-settings'
  | 'sessions'
  | 'settings';

export interface TowingUser {
  id: string;
  name: string;
  role: TowingRole;
  active: boolean;
  failed_attempts: number;
  locked_until: string | null;
  created_at: string;
  updated_at: string;
}

export interface TowingSession {
  id: string;
  user_id: string;
  session_token: string;
  device_info: string | null;
  device_name: string | null;
  ip_address: string | null;
  started_at: string;
  last_activity: string;
  ended_at: string | null;
  ended_reason: string | null;
}

export interface TowingImpound {
  id: string;
  tow_date: string;
  tow_location: string | null;
  pickup_location: string | null;
  vin: string | null;
  year: string | null;
  make: string | null;
  model: string | null;
  color: string | null;
  plate: string | null;
  vehicle_status: 'active_impound' | 'released' | 'title_obtained' | 'junkyard' | 'for_sale' | 'archived';
  tow_reason: string | null;
  driver_id: string | null;
  created_by: string;
  released_at: string | null;
  released_to: string | null;
  release_fee: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface TowingOwner {
  id: string;
  impound_id: string;
  name: string | null;
  phone: string | null;
  address: string | null;
  license_number: string | null;
  created_at: string;
}

export interface TowingLienHolder {
  id: string;
  impound_id: string;
  name: string | null;
  phone: string | null;
  address: string | null;
  created_at: string;
}

export interface TowingFee {
  id: string;
  impound_id: string;
  fee_type: 'tow' | 'storage' | 'admin' | 'lien' | 'other';
  amount: number;
  description: string | null;
  created_by: string;
  created_at: string;
}

export interface TowingPayment {
  id: string;
  impound_id: string;
  amount: number;
  method: 'cash' | 'card' | 'check' | 'other';
  reference: string | null;
  created_by: string;
  created_at: string;
}

export interface TowingPhoto {
  id: string;
  impound_id: string;
  url: string;
  caption: string | null;
  uploaded_by: string;
  created_at: string;
}

export interface TowingNotice {
  id: string;
  impound_id: string;
  notice_type: 'towing' | 'lien' | 'abandonment' | 'sale' | 'other';
  sent_date: string;
  content: string | null;
  created_by: string;
  created_at: string;
}

export interface TowingHistoryEntry {
  id: string;
  impound_id: string;
  action: string;
  performed_by: string;
  details: string | null;
  created_at: string;
}

export interface TowingNoticeTemplate {
  id: string;
  template_name: string;
  notice_type: 'towing' | 'lien' | 'abandonment' | 'sale' | 'other';
  company_name: string | null;
  company_address: string | null;
  company_phone: string | null;
  company_license: string | null;
  header_text: string | null;
  body_text: string | null;
  footer_text: string | null;
  is_default: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface TowingNoticeSnapshot {
  id: string;
  impound_id: string;
  template_id: string | null;
  template_name: string;
  notice_type: string;
  printed_by: string | null;
  printed_at: string;
  snapshot_data: Record<string, string>;
  generated_text: string;
  created_at: string;
}
