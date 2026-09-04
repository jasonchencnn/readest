import { describe, expect, it } from 'vitest';
import {
  INVITE_CODE_PATTERN,
  generateInviteCode,
  isAdminEmail,
  normalizeInviteCode,
  parseAdminEmails,
} from '@/utils/invite';

describe('invite codes', () => {
  it('generates 4-4-4 codes from the unambiguous Crockford alphabet', () => {
    for (let i = 0; i < 100; i++) {
      const code = generateInviteCode();
      expect(code).toMatch(INVITE_CODE_PATTERN);
      expect(code).not.toMatch(/[ILOU]/);
    }
  });

  it('generates unique codes', () => {
    const codes = new Set(Array.from({ length: 500 }, () => generateInviteCode()));
    expect(codes.size).toBe(500);
  });

  it('normalizes case, whitespace, and dashes back to the canonical form', () => {
    const code = generateInviteCode();
    expect(normalizeInviteCode(code)).toBe(code);
    expect(normalizeInviteCode(code.toLowerCase())).toBe(code);
    expect(normalizeInviteCode(` ${code.replace(/-/g, ' ')} `)).toBe(code);
  });

  it('applies the Crockford decodings for hand-typed lookalikes', () => {
    expect(normalizeInviteCode('abcd-efgh-jkmn')).toBe('ABCD-EFGH-JKMN');
    expect(normalizeInviteCode('ABCD-EFGH-JKLN')).toBe('ABCD-EFGH-JK1N');
    expect(normalizeInviteCode('ABCO')).toBe('ABC0');
  });

  it('leaves malformed input non-matching so the server rejects it', () => {
    expect(normalizeInviteCode('ABCD')).not.toMatch(INVITE_CODE_PATTERN);
    expect(normalizeInviteCode('ABCD-EFGH-JKLM-XYZ!')).not.toMatch(INVITE_CODE_PATTERN);
  });
});

describe('admin email gate', () => {
  it('parses a comma/semicolon/space separated list, lowercased', () => {
    expect(parseAdminEmails(' A@X.com,b@Y.com；；C@Z.com  D@W.com\n')).toEqual([
      'a@x.com',
      'b@y.com',
      'c@z.com',
      'd@w.com',
    ]);
    expect(parseAdminEmails(undefined)).toEqual([]);
    expect(parseAdminEmails('')).toEqual([]);
  });

  it('matches case-insensitively and rejects empty/unknown emails', () => {
    const env = 'owner@example.com';
    expect(isAdminEmail('Owner@Example.com', env)).toBe(true);
    expect(isAdminEmail('other@example.com', env)).toBe(false);
    expect(isAdminEmail('', env)).toBe(false);
    expect(isAdminEmail(undefined, env)).toBe(false);
    expect(isAdminEmail('owner@example.com', undefined)).toBe(false);
  });
});
