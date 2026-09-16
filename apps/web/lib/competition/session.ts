'use client';

const IDENTITY_KEY = 'hirance_identity';

export type SessionIdentity = {
  companyId: string;
  companyName: string;
  mobile?: string;
};

export function getIdentity(): SessionIdentity | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(IDENTITY_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<SessionIdentity> & {
      displayName?: string;
    };
    if (!parsed.companyId || !parsed.companyName) return null;
    return {
      companyId: parsed.companyId,
      companyName: parsed.companyName,
      mobile: parsed.mobile,
    };
  } catch {
    return null;
  }
}

export function setIdentity(identity: SessionIdentity) {
  window.localStorage.setItem(IDENTITY_KEY, JSON.stringify(identity));
}

export function clearIdentity() {
  window.localStorage.removeItem(IDENTITY_KEY);
}
