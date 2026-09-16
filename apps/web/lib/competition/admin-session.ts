'use client';

const ADMIN_KEY_STORAGE = 'hirance_admin_key';

export function getAdminKey(): string | null {
  if (typeof window === 'undefined') return null;
  return window.sessionStorage.getItem(ADMIN_KEY_STORAGE);
}

export function setAdminKey(key: string) {
  window.sessionStorage.setItem(ADMIN_KEY_STORAGE, key);
}

export function clearAdminKey() {
  window.sessionStorage.removeItem(ADMIN_KEY_STORAGE);
}
