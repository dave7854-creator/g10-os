import { supabase } from '@/supabaseClient';

const FN_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/customer-portal`;

function managerHeaders(employeeId: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
    'X-Manager-Token': employeeId,
  };
}

export interface ManagerCustomer {
  id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  created_at: string;
  portal_status: 'none' | 'active' | 'disabled' | 'setup_incomplete';
  portal_user_id: string | null;
  setup_complete: boolean;
  last_login_at: string | null;
  portal_link_created_at: string | null;
  vehicles: { id: string; vin: string | null; year: string | null; make: string | null; model: string | null }[];
}

export interface ManagerCustomerDetail {
  customer: ManagerCustomer & { updated_at?: string };
  portal_link: { user_id: string; portal_status: string; setup_complete: boolean; last_login_at: string | null; created_at: string; username: string | null } | null;
  vehicles: any[];
  workOrders: any[];
  payments: any[];
  towing: any[];
  unlinkedTowing: any[];
  inquiries: any[];
}

export async function managerListCustomers(employeeId: string): Promise<ManagerCustomer[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const resp = await fetch(`${FN_BASE}/manager/customers`, {
      headers: managerHeaders(employeeId),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      throw new Error(data.error || `Server returned ${resp.status}`);
    }
    const data = await resp.json();
    return data.customers || [];
  } catch (err: any) {
    clearTimeout(timeout);
    if (err.name === 'AbortError') {
      throw new Error('Request timed out. Please check your connection and try again.');
    }
    throw new Error(err.message || 'Unable to load customers');
  }
}

export async function managerGetCustomer(employeeId: string, customerId: string): Promise<ManagerCustomerDetail> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const resp = await fetch(`${FN_BASE}/manager/customer?id=${customerId}`, {
      headers: managerHeaders(employeeId),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      throw new Error(data.error || `Server returned ${resp.status}`);
    }
    return resp.json();
  } catch (err: any) {
    clearTimeout(timeout);
    if (err.name === 'AbortError') {
      throw new Error('Request timed out. Please try again.');
    }
    throw new Error(err.message || 'Unable to load customer details');
  }
}

export async function managerCreateCustomer(
  employeeId: string,
  data: { first_name: string; last_name: string; phone?: string; email?: string; address?: string },
): Promise<{ success: boolean; customer?: ManagerCustomer; duplicates?: any[]; error?: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const resp = await fetch(`${FN_BASE}/manager/customer/create`, {
      method: 'POST',
      headers: managerHeaders(employeeId),
      body: JSON.stringify(data),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const result = await resp.json();
    if (!resp.ok && !result.duplicates) {
      return { success: false, error: result.error || `Server returned ${resp.status}` };
    }
    return result;
  } catch (err: any) {
    clearTimeout(timeout);
    if (err.name === 'AbortError') {
      return { success: false, error: 'Request timed out after 20 seconds. Please try again.' };
    }
    console.error('managerCreateCustomer error:', err, 'Endpoint:', `${FN_BASE}/manager/customer/create`);
    return { success: false, error: `Network error: ${err.message || 'Unable to reach server'} (endpoint: ${FN_BASE}/manager/customer/create)` };
  }
}

export async function managerUpdateCustomer(
  employeeId: string,
  customerId: string,
  updates: { first_name?: string; last_name?: string; phone?: string; email?: string; address?: string },
): Promise<{ success: boolean; error?: string }> {
  const resp = await fetch(`${FN_BASE}/manager/customer/update`, {
    method: 'PUT',
    headers: managerHeaders(employeeId),
    body: JSON.stringify({ customer_id: customerId, ...updates }),
  });
  return resp.json();
}

export async function managerEnablePortal(employeeId: string, customerId: string, email?: string): Promise<{ success: boolean; action?: string; error?: string; message?: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const resp = await fetch(`${FN_BASE}/manager/portal/enable`, {
      method: 'POST',
      headers: managerHeaders(employeeId),
      body: JSON.stringify({ customer_id: customerId, email }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return resp.json();
  } catch (err: any) {
    clearTimeout(timeout);
    if (err.name === 'AbortError') {
      return { success: false, error: 'Request timed out after 30 seconds. The server may be slow to respond — please try again.' };
    }
    return { success: false, error: `Network error: ${err.message || 'Unable to reach server'}` };
  }
}

export async function managerDisablePortal(employeeId: string, customerId: string): Promise<{ success: boolean; error?: string }> {
  const resp = await fetch(`${FN_BASE}/manager/portal/disable`, {
    method: 'POST',
    headers: managerHeaders(employeeId),
    body: JSON.stringify({ customer_id: customerId }),
  });
  return resp.json();
}

export async function managerSendInvite(employeeId: string, customerId: string): Promise<{ success: boolean; error?: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const resp = await fetch(`${FN_BASE}/manager/portal/invite`, {
      method: 'POST',
      headers: managerHeaders(employeeId),
      body: JSON.stringify({ customer_id: customerId }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return resp.json();
  } catch (err: any) {
    clearTimeout(timeout);
    if (err.name === 'AbortError') {
      return { success: false, error: 'Request timed out. Please try again.' };
    }
    return { success: false, error: `Network error: ${err.message || 'Unable to reach server'}` };
  }
}

export async function managerSendPasswordReset(employeeId: string, customerId: string): Promise<{ success: boolean; error?: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const resp = await fetch(`${FN_BASE}/manager/portal/reset-password`, {
      method: 'POST',
      headers: managerHeaders(employeeId),
      body: JSON.stringify({ customer_id: customerId }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return resp.json();
  } catch (err: any) {
    clearTimeout(timeout);
    if (err.name === 'AbortError') {
      return { success: false, error: 'Request timed out. Please try again.' };
    }
    return { success: false, error: `Network error: ${err.message || 'Unable to reach server'}` };
  }
}

// ===== GLOBAL SEARCH =====
export async function managerGlobalSearch(employeeId: string, query: string): Promise<SearchResults> {
  const resp = await fetch(`${FN_BASE}/manager/search?q=${encodeURIComponent(query)}`, {
    headers: managerHeaders(employeeId),
  });
  if (!resp.ok) throw new Error('Search failed');
  return resp.json();
}

export interface SearchResults {
  success?: boolean;
  results?: {
    customers?: SearchResult[];
    vehicles?: SearchResult[];
    work_orders?: SearchResult[];
    towing?: SearchResult[];
    parts?: SearchResult[];
    salvage_parts?: SearchResult[];
    salvage_vehicles?: SearchResult[];
    inquiries?: SearchResult[];
    ebay_listings?: SearchResult[];
  };
}

export interface SearchResult {
  type: string;
  id: string;
  label: string;
  sublabel: string;
  [key: string]: any;
}

// ===== DUPLICATE CHECK =====
export async function managerDuplicateCheck(
  employeeId: string,
  data: { phone?: string; email?: string; first_name?: string; last_name?: string },
): Promise<{ success: boolean; matches?: any[]; error?: string }> {
  const resp = await fetch(`${FN_BASE}/manager/duplicate-check`, {
    method: 'POST',
    headers: managerHeaders(employeeId),
    body: JSON.stringify(data),
  });
  return resp.json();
}

// ===== LINK TOWING TO CUSTOMER =====
export async function managerLinkTowing(
  employeeId: string,
  impoundId: string,
  customerId: string,
  shopVehicleId?: string,
): Promise<{ success: boolean; error?: string }> {
  const resp = await fetch(`${FN_BASE}/manager/link-towing`, {
    method: 'POST',
    headers: managerHeaders(employeeId),
    body: JSON.stringify({ impound_id: impoundId, customer_id: customerId, shop_vehicle_id: shopVehicleId }),
  });
  return resp.json();
}

// ===== LINK INQUIRY TO CUSTOMER =====
export async function managerLinkInquiry(
  employeeId: string,
  inquiryId: string,
  customerId: string,
): Promise<{ success: boolean; error?: string }> {
  const resp = await fetch(`${FN_BASE}/manager/link-inquiry`, {
    method: 'POST',
    headers: managerHeaders(employeeId),
    body: JSON.stringify({ inquiry_id: inquiryId, customer_id: customerId }),
  });
  return resp.json();
}

// ===== ADD VEHICLE =====
export async function managerAddVehicle(
  employeeId: string,
  data: { customer_id: string; vin?: string; year?: string; make?: string; model?: string; trim?: string; color?: string; plate?: string; mileage?: number; engine?: string },
): Promise<{ success: boolean; vehicle?: any; error?: string; existing_vehicle?: any }> {
  const resp = await fetch(`${FN_BASE}/manager/vehicle/add`, {
    method: 'POST',
    headers: managerHeaders(employeeId),
    body: JSON.stringify(data),
  });
  return resp.json();
}

// ===== LINK EXISTING VEHICLE =====
export async function managerLinkVehicle(
  employeeId: string,
  vehicleId: string,
  customerId: string,
): Promise<{ success: boolean; vehicle?: any; error?: string }> {
  const resp = await fetch(`${FN_BASE}/manager/vehicle/link`, {
    method: 'POST',
    headers: managerHeaders(employeeId),
    body: JSON.stringify({ vehicle_id: vehicleId, customer_id: customerId }),
  });
  return resp.json();
}

// Unused but kept for type compat with supabase import in some bundlers
export { supabase };

// ===== CREATE CUSTOMER LOGIN (username + password) =====
export async function managerCreateLogin(
  employeeId: string,
  customerId: string,
  data: { username: string; password: string; email?: string; require_change?: boolean },
): Promise<{ success: boolean; action?: string; error?: string; message?: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const resp = await fetch(`${FN_BASE}/manager/portal/create-login`, {
      method: 'POST',
      headers: managerHeaders(employeeId),
      body: JSON.stringify({ customer_id: customerId, ...data }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return resp.json();
  } catch (err: any) {
    clearTimeout(timeout);
    if (err.name === 'AbortError') return { success: false, error: 'Request timed out. Please try again.' };
    return { success: false, error: `Network error: ${err.message || 'Unable to reach server'}` };
  }
}

// ===== SET CUSTOMER PASSWORD (manager reset) =====
export async function managerSetPassword(
  employeeId: string,
  customerId: string,
  password: string,
  requireChange?: boolean,
): Promise<{ success: boolean; error?: string; message?: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const resp = await fetch(`${FN_BASE}/manager/portal/set-password`, {
      method: 'POST',
      headers: managerHeaders(employeeId),
      body: JSON.stringify({ customer_id: customerId, password, require_change: requireChange }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return resp.json();
  } catch (err: any) {
    clearTimeout(timeout);
    if (err.name === 'AbortError') return { success: false, error: 'Request timed out. Please try again.' };
    return { success: false, error: `Network error: ${err.message || 'Unable to reach server'}` };
  }
}

// ===== CHANGE USERNAME =====
export async function managerChangeUsername(
  employeeId: string,
  customerId: string,
  username: string,
): Promise<{ success: boolean; error?: string; message?: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const resp = await fetch(`${FN_BASE}/manager/portal/change-username`, {
      method: 'POST',
      headers: managerHeaders(employeeId),
      body: JSON.stringify({ customer_id: customerId, username }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return resp.json();
  } catch (err: any) {
    clearTimeout(timeout);
    if (err.name === 'AbortError') return { success: false, error: 'Request timed out. Please try again.' };
    return { success: false, error: `Network error: ${err.message || 'Unable to reach server'}` };
  }
}
