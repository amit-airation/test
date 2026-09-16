import { scryptSync, timingSafeEqual, randomBytes } from 'node:crypto';
import { DEFAULT_JOIN_PIN } from '../constants.js';

const SCRYPT_KEYLEN = 64;

/**
 * Hash a competition join PIN with scrypt.
 * Format: `scrypt$<saltHex>$<hashHex>`
 */
export function hashJoinPin(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, SCRYPT_KEYLEN).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

export function verifyJoinPin(
  password: string,
  storedHash: string | null | undefined,
): boolean {
  if (!storedHash) return false;
  const parts = storedHash.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const [, salt, expectedHex] = parts;
  if (!salt || !expectedHex) return false;
  try {
    const actual = scryptSync(password, salt, SCRYPT_KEYLEN);
    const expected = Buffer.from(expectedHex, 'hex');
    if (actual.length !== expected.length) return false;
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export function hashDefaultJoinPin(): string {
  return hashJoinPin(DEFAULT_JOIN_PIN);
}

/** Normalize mobile to digits only for storage / lookup. */
export function normalizeMobile(mobile: string): string {
  return mobile.replace(/\D/g, '');
}

export function assertValidMobile(mobile: string): string {
  const digits = normalizeMobile(mobile);
  if (digits.length < 10 || digits.length > 15) {
    throw new Error('Mobile must be 10–15 digits');
  }
  return digits;
}
