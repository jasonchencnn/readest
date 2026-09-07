import { describe, it, expect } from 'vitest';
import {
  REDEMPTION_ERROR_CODES,
  PLAN_TYPES,
  generateRedemptionCode,
  normalizeRedemptionCode,
  INVITE_CODE_PATTERN,
} from '@/utils/redemption';

describe('redemption utility re-exports', () => {
  it('exposes the invite-code Crockford generator under a redemption name', () => {
    for (let i = 0; i < 20; i++) {
      const code = generateRedemptionCode();
      expect(code).toMatch(INVITE_CODE_PATTERN);
    }
  });

  it('normalises hand-typed input via the same Crockford rules', () => {
    expect(normalizeRedemptionCode('abcd-efgh-jkln')).toBe('ABCD-EFGH-JK1N');
  });
});

describe('redemption constants', () => {
  it('locks the error code set so the RPC, route, and UI all agree', () => {
    expect(REDEMPTION_ERROR_CODES).toEqual({
      invalid_code: 'invalid_code',
      already_used_or_invalid: 'already_used_or_invalid',
      expired: 'expired',
      redeem_failed: 'redeem_failed',
    });
  });

  it('exposes the same plus/pro plan set the SQL CHECK allows', () => {
    expect(PLAN_TYPES).toEqual(['plus', 'pro']);
  });
});
