import { createClient, type Session, type User } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const portalSupabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});

function authCallbackUrl(): string {
  return `${window.location.origin}/auth-callback`;
}

const FN_BASE = `${supabaseUrl}/functions/v1/customer-portal`;

function authHeaders(session: Session | null): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    apikey: supabaseAnonKey,
  };
  if (session?.access_token) {
    headers['Authorization'] = `Bearer ${session.access_token}`;
  }
  return headers;
}

// ===== Types =====
export interface PortalCustomer {
  id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
}

export interface PortalVehicle {
  id: string;
  vin: string | null;
  year: string | null;
  make: string | null;
  model: string | null;
  trim: string | null;
  color: string | null;
  mileage: number | null;
  engine: string | null;
  transmission?: string | null;
  drivetrain?: string | null;
  fuel_type?: string | null;
  body_style?: string | null;
}

export interface PortalWorkOrder {
  id: string;
  work_order_number: string;
  status: string;
  total: number;
  balance_due: number;
  created_at: string;
  updated_at: string;
  invoice_date: string | null;
  payment_status: string;
  vehicle_id: string | null;
  vehicle?: PortalVehicle | null;
}

export interface PortalEstimateDetail {
  id: string;
  work_order_number: string;
  status: string;
  subtotal: number;
  tax: number;
  shop_supplies: number;
  total: number;
  created_at: string;
  updated_at: string;
  customerNotes: string | null;
  vehicle: PortalVehicle | null;
  laborOperations: any[];
  parts: any[];
  laborTotal: number;
  partsTotal: number;
  estimateHash: string;
  existingApproval: { decision: string; decided_at: string; notes: string | null } | null;
}

export interface PortalInvoiceDetail {
  id: string;
  work_order_number: string;
  status: string;
  subtotal: number;
  tax: number;
  shop_supplies: number;
  total: number;
  balance_due: number;
  created_at: string;
  invoice_date: string | null;
  payment_status: string;
  vehicle_id: string | null;
  vehicle: PortalVehicle | null;
  payments: any[];
  laborOperations: any[];
  parts: any[];
  totalPaid: number;
  paymentToken: string | null;
}

export interface PortalPayment {
  id: string;
  amount: number;
  method: string;
  created_at: string;
  payment_status: string;
  processor: string | null;
  work_order_id: string;
  work_order_number: string;
}

export interface PortalConversation {
  id: string;
  record_id: string;
  record_type: string | null;
  record_label: string | null;
  vehicle_label: string | null;
  unread_count: number;
  last_message_preview: string | null;
  last_message_at: string | null;
  created_at: string;
}

export interface DashboardData {
  customer: PortalCustomer;
  vehicles: PortalVehicle[];
  workOrders: PortalWorkOrder[];
  stats: {
    estimatesAwaitingApproval: number;
    activeRepairs: number;
    balanceDue: number;
    totalInvoices: number;
  };
  approvals: any[];
}

// ===== Auth Functions =====

export async function signInWithPassword(identifier: string, password: string): Promise<{ success: boolean; error?: string }> {
  let email = identifier.trim();
  const isUsername = !email.includes('@');

  try {
    if (isUsername) {
      const resp = await fetch(`${FN_BASE}/resolve-username`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: supabaseAnonKey },
        body: JSON.stringify({ username: email }),
      });
      const data = await resp.json();
      if (!resp.ok || data.error) {
        console.error('Portal login: resolve-username failed for', email, data.error || resp.status);
        return { success: false, error: data.error || 'Username not found' };
      }
      email = data.email;
    }

    const { error } = await portalSupabase.auth.signInWithPassword({ email, password });
    if (error) {
      console.error('Portal login: Supabase Auth error for', email, '| code:', error.code, '| message:', error.message);
      return { success: false, error: 'Invalid username/email or password.' };
    }
    return { success: true };
  } catch (err: any) {
    console.error('Portal login: unexpected error:', err);
    return { success: false, error: 'Unable to sign in. Please try again.' };
  }
}

export async function sendSetupInvite(email: string): Promise<{ success: boolean; error?: string; action?: string }> {
  const resp = await fetch(`${FN_BASE}/portal-access`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: supabaseAnonKey },
    body: JSON.stringify({ email }),
  });
  const data = await resp.json();
  if (!resp.ok || data.error) {
    return { success: false, error: data.error || 'Unable to send setup link.' };
  }
  return { success: true, action: data.action };
}

export async function resetPassword(email: string): Promise<{ success: boolean; error?: string }> {
  const { error } = await portalSupabase.auth.resetPasswordForEmail(email, {
    redirectTo: authCallbackUrl(),
  });

  if (error) {
    return { success: false, error: error.message };
  }
  return { success: true };
}

export async function updatePassword(newPassword: string): Promise<{ success: boolean; error?: string }> {
  const { error } = await portalSupabase.auth.updateUser({ password: newPassword });
  if (error) {
    return { success: false, error: error.message };
  }
  return { success: true };
}

export async function linkAccount(session: Session): Promise<{ linked: boolean; needs_setup?: boolean; setup_complete?: boolean; customer?: PortalCustomer; error?: string }> {
  const resp = await fetch(`${FN_BASE}/link-account`, {
    method: 'POST',
    headers: authHeaders(session),
  });
  const data = await resp.json();
  return data;
}

export async function createAccount(
  session: Session,
  details: { first_name: string; last_name: string; phone: string; address?: string },
): Promise<{ linked: boolean; customer?: PortalCustomer; error?: string }> {
  const resp = await fetch(`${FN_BASE}/create-account`, {
    method: 'POST',
    headers: authHeaders(session),
    body: JSON.stringify(details),
  });
  const data = await resp.json();
  return data;
}

export async function getDashboard(session: Session): Promise<DashboardData> {
  const resp = await fetch(`${FN_BASE}/dashboard`, {
    headers: authHeaders(session),
  });
  if (!resp.ok) throw new Error('Failed to load dashboard');
  return resp.json();
}

export async function getVehicles(session: Session): Promise<{ vehicles: PortalVehicle[] }> {
  const resp = await fetch(`${FN_BASE}/vehicles`, {
    headers: authHeaders(session),
  });
  if (!resp.ok) throw new Error('Failed to load vehicles');
  return resp.json();
}

export async function addVehicle(session: Session, vehicle: Partial<PortalVehicle> & { vin_decoded?: boolean }): Promise<{ vehicle: PortalVehicle; error?: string }> {
  const resp = await fetch(`${FN_BASE}/vehicles/add`, {
    method: 'POST',
    headers: authHeaders(session),
    body: JSON.stringify(vehicle),
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(data.error || 'Unable to add vehicle');
  return data;
}

export async function getEstimateDetail(session: Session, id: string): Promise<{ estimate: PortalEstimateDetail }> {
  const resp = await fetch(`${FN_BASE}/estimate?id=${id}`, {
    headers: authHeaders(session),
  });
  if (!resp.ok) throw new Error('Failed to load estimate');
  return resp.json();
}

export async function respondToEstimate(
  session: Session,
  workOrderId: string,
  decision: 'approved' | 'declined',
  estimateTotal: number,
  estimateHash: string,
  notes?: string,
): Promise<{ success: boolean; error?: string }> {
  const resp = await fetch(`${FN_BASE}/estimate/respond`, {
    method: 'POST',
    headers: authHeaders(session),
    body: JSON.stringify({
      work_order_id: workOrderId,
      decision,
      estimate_total: estimateTotal,
      estimate_hash: estimateHash,
      notes: notes || null,
    }),
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(data.error || 'Unable to respond');
  return data;
}

export async function getInvoiceDetail(session: Session, id: string): Promise<{ invoice: PortalInvoiceDetail }> {
  const resp = await fetch(`${FN_BASE}/invoice?id=${id}`, {
    headers: authHeaders(session),
  });
  if (!resp.ok) throw new Error('Failed to load invoice');
  return resp.json();
}

export async function getPayments(session: Session): Promise<{ payments: PortalPayment[] }> {
  const resp = await fetch(`${FN_BASE}/payments`, {
    headers: authHeaders(session),
  });
  if (!resp.ok) throw new Error('Failed to load payments');
  return resp.json();
}

export async function getConversations(session: Session): Promise<{ conversations: PortalConversation[] }> {
  const resp = await fetch(`${FN_BASE}/messages`, {
    headers: authHeaders(session),
  });
  if (!resp.ok) throw new Error('Failed to load messages');
  return resp.json();
}

export async function getMessageThread(session: Session, conversationId: string): Promise<{ conversation: PortalConversation; messages: any[] }> {
  const resp = await fetch(`${FN_BASE}/messages/thread?conversation_id=${conversationId}`, {
    headers: authHeaders(session),
  });
  if (!resp.ok) throw new Error('Failed to load thread');
  return resp.json();
}

export async function sendMessage(session: Session, conversationId: string, body: string): Promise<{ success: boolean }> {
  const resp = await fetch(`${FN_BASE}/messages/send`, {
    method: 'POST',
    headers: authHeaders(session),
    body: JSON.stringify({ conversation_id: conversationId, body }),
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(data.error || 'Unable to send');
  return data;
}

export async function createServiceRequest(session: Session, vehicleId: string, problem: string): Promise<{ success: boolean; work_order_number?: string; error?: string }> {
  const resp = await fetch(`${FN_BASE}/service-request`, {
    method: 'POST',
    headers: authHeaders(session),
    body: JSON.stringify({ vehicle_id: vehicleId, problem }),
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(data.error || 'Unable to create request');
  return data;
}

export async function updateProfile(session: Session, updates: Partial<PortalCustomer>): Promise<{ success: boolean }> {
  const resp = await fetch(`${FN_BASE}/profile`, {
    method: 'PUT',
    headers: authHeaders(session),
    body: JSON.stringify(updates),
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(data.error || 'Unable to update');
  return data;
}

export async function decodeVin(vin: string, session: Session): Promise<any> {
  const resp = await fetch(`${FN_BASE}/decode-vin?vin=${encodeURIComponent(vin)}`, {
    headers: authHeaders(session),
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(data.error || 'VIN decode failed');
  return data;
}

// ===== Status helpers =====
export const REPAIR_STATUS_LABELS: Record<string, string> = {
  'estimate': 'Estimate — Awaiting Your Approval',
  'approved': 'Approved — Scheduled for Repair',
  'in_progress': 'Repair in Progress',
  'waiting_parts': 'Parts Ordered — Waiting for Delivery',
  'completed': 'Repair Complete — Ready for Pickup',
  'invoiced': 'Invoiced — Payment Due',
  'paid': 'Paid — Thank You',
};

export const STATUS_COLORS: Record<string, string> = {
  'estimate': 'var(--fp-warning)',
  'approved': 'var(--fp-primary)',
  'in_progress': 'var(--fp-accent)',
  'waiting_parts': 'var(--fp-accent)',
  'completed': 'var(--fp-success)',
  'invoiced': 'var(--fp-warning)',
  'paid': 'var(--fp-success)',
};

export function formatCurrency(amount: number | string): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  return num.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

export function formatDate(dateStr: string): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
