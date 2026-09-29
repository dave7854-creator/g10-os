import { supabase } from '@/supabaseClient';

export interface SessionUser {
  id: string;
  name: string;
  role: string;
  pin_code?: string;
  pin_hash?: string;
  active: boolean;
  source: 'employees' | 'towing_users';
}

export interface AppSession {
  user: SessionUser;
  unlockedAt: number;
  lastActivity: number;
  timeoutMs: number;
}

const STORAGE_KEY = 'wp_app_session';
const TIMEOUT_STORAGE_KEY = 'wp_session_timeout';
const DEFAULT_TIMEOUT_MS = 15 * 60 * 1000;

export function getSessionTimeout(): number {
  const stored = localStorage.getItem(TIMEOUT_STORAGE_KEY);
  if (stored) {
    const n = Number(stored);
    if (!isNaN(n) && n >= 60000) return n;
  }
  return DEFAULT_TIMEOUT_MS;
}

export function setSessionTimeout(ms: number): void {
  localStorage.setItem(TIMEOUT_STORAGE_KEY, String(ms));
}

export function saveSession(user: SessionUser): AppSession {
  const now = Date.now();
  const session: AppSession = {
    user,
    unlockedAt: now,
    lastActivity: now,
    timeoutMs: getSessionTimeout(),
  };
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  return session;
}

export function restoreSession(): AppSession | null {
  const raw = sessionStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const session = JSON.parse(raw) as AppSession;
    session.timeoutMs = getSessionTimeout();
    if (isSessionExpired(session)) {
      clearSession();
      return null;
    }
    return session;
  } catch {
    clearSession();
    return null;
  }
}

export function isSessionExpired(session: AppSession): boolean {
  return Date.now() - session.lastActivity > session.timeoutMs;
}

export function touchActivity(): void {
  const raw = sessionStorage.getItem(STORAGE_KEY);
  if (!raw) return;
  try {
    const session = JSON.parse(raw) as AppSession;
    session.lastActivity = Date.now();
    session.timeoutMs = getSessionTimeout();
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    // ignore
  }
}

export function clearSession(): void {
  sessionStorage.removeItem(STORAGE_KEY);
}

export function checkExpiredAndClear(): boolean {
  const session = restoreSession();
  if (session && isSessionExpired(session)) {
    clearSession();
    return true;
  }
  return false;
}

export { DEFAULT_TIMEOUT_MS };
