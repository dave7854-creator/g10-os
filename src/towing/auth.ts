import type { TowingRole, TowingPage } from './types';

// ===== PERMISSIONS =====
const PERMISSIONS: Record<TowingRole, TowingPage[]> = {
  administrator: [
    'dashboard', 'active-impounds', 'released', 'title-obtained', 'junkyard', 'for-sale',
    'archived-impounds', 'reports', 'payments', 'fees', 'photos', 'owners', 'lien-holders', 'notices',
    'history', 'new-impound', 'impound-detail', 'user-management', 'security-settings', 'sessions', 'settings',
  ],
  manager: [
    'dashboard', 'active-impounds', 'released', 'title-obtained', 'junkyard', 'for-sale',
    'archived-impounds', 'reports', 'payments', 'fees', 'photos', 'owners', 'lien-holders', 'notices',
    'history', 'new-impound', 'impound-detail',
  ],
  office_staff: [
    'dashboard', 'active-impounds', 'released', 'title-obtained', 'junkyard', 'for-sale',
    'archived-impounds', 'payments', 'fees', 'photos', 'owners', 'lien-holders', 'notices',
    'history', 'new-impound', 'impound-detail',
  ],
  driver: [
    'dashboard', 'new-impound', 'impound-detail', 'photos',
  ],
};

export function canAccess(role: TowingRole, page: TowingPage): boolean {
  return PERMISSIONS[role]?.includes(page) ?? false;
}

export function canDelete(role: TowingRole): boolean {
  return role === 'administrator' || role === 'manager';
}

export function canManageUsers(role: TowingRole): boolean {
  return role === 'administrator';
}

export function canAccessSecuritySettings(role: TowingRole): boolean {
  return role === 'administrator';
}

export function canSeeFinancials(role: TowingRole): boolean {
  return role !== 'driver';
}

export function canReleaseVehicles(role: TowingRole): boolean {
  return role === 'administrator' || role === 'manager';
}

export function canEditImpounds(role: TowingRole): boolean {
  return role === 'administrator' || role === 'manager' || role === 'office_staff';
}

// ===== PIN HASHING =====
// Simple but effective client-side hashing using SubtleCrypto (SHA-256 with salt).
// The PIN is never stored or transmitted in plaintext.
const SALT = 'wp-towing-2026';

export async function hashPin(pin: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(SALT + pin + SALT);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function verifyPin(pin: string, storedHash: string): Promise<boolean> {
  const hash = await hashPin(pin);
  return hash === storedHash;
}

// ===== SESSION MANAGEMENT =====
import { getSessionTimeout } from '@/auth/sessionService';

const LOCKOUT_DURATION_MS = 5 * 60 * 1000; // 5 minutes
const MAX_FAILED_ATTEMPTS = 5;

export { LOCKOUT_DURATION_MS, MAX_FAILED_ATTEMPTS };

// Use configurable timeout from sessionService
export function getInactivityTimeoutMs(): number {
  return getSessionTimeout();
}

// Backward-compatible export (used by TowingApp)
const INACTIVITY_TIMEOUT_MS = getSessionTimeout();
export { INACTIVITY_TIMEOUT_MS };

export function generateSessionToken(): string {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return Array.from(arr).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function getDeviceInfo(): string {
  return navigator.userAgent;
}

export function getDeviceName(): string {
  const ua = navigator.userAgent;
  const browser = /Edg/.test(ua) ? 'Edge' : /Chrome/.test(ua) ? 'Chrome' : /Firefox/.test(ua) ? 'Firefox' : /Safari/.test(ua) ? 'Safari' : 'Browser';
  const os = /Windows/.test(ua) ? 'Windows' : /Mac/.test(ua) ? 'Mac' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : 'Device';
  return `${browser} on ${os}`;
}

export function isLocked(lockedUntil: string | null): boolean {
  if (!lockedUntil) return false;
  return new Date(lockedUntil).getTime() > Date.now();
}

export function getLockoutRemaining(lockedUntil: string | null): number {
  if (!lockedUntil) return 0;
  const remaining = new Date(lockedUntil).getTime() - Date.now();
  return Math.max(0, remaining);
}

export function isSessionExpired(lastActivity: string): boolean {
  return Date.now() - new Date(lastActivity).getTime() > getSessionTimeout();
}
