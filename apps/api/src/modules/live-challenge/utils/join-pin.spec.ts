import { describe, expect, it } from 'vitest';
import {
  assertValidMobile,
  hashJoinPin,
  normalizeMobile,
  verifyJoinPin,
} from './join-pin.js';

describe('join-pin utils', () => {
  it('hashes and verifies a PIN', () => {
    const hash = hashJoinPin('123456');
    expect(verifyJoinPin('123456', hash)).toBe(true);
    expect(verifyJoinPin('000000', hash)).toBe(false);
  });

  it('normalizes and validates mobile digits', () => {
    expect(normalizeMobile('+91 98765-43210')).toBe('919876543210');
    expect(assertValidMobile('9876543210')).toBe('9876543210');
    expect(() => assertValidMobile('123')).toThrow(/10–15/);
  });
});
