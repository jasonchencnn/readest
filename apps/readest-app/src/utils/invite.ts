import { randomBytes } from 'node:crypto';

// Crockford base32: excludes I, L, O, U so codes survive being read aloud
// or typed by hand — the whole point of an invite code.
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const INVITE_CODE_GROUP_LENGTH = 4;
export const INVITE_CODE_GROUP_COUNT = 3;
export const INVITE_CODE_PATTERN = new RegExp(
  `^[0-9A-HJKMNP-TV-Z]{${INVITE_CODE_GROUP_LENGTH}}(-[0-9A-HJKMNP-TV-Z]{${INVITE_CODE_GROUP_LENGTH}}){${INVITE_CODE_GROUP_COUNT - 1}}$`,
);

export function generateInviteCode(): string {
  const bytes = randomBytes(INVITE_CODE_GROUP_LENGTH * INVITE_CODE_GROUP_COUNT);
  const groups: string[] = [];
  for (let g = 0; g < INVITE_CODE_GROUP_COUNT; g++) {
    let group = '';
    for (let i = 0; i < INVITE_CODE_GROUP_LENGTH; i++) {
      const byte = bytes[g * INVITE_CODE_GROUP_LENGTH + i] ?? 0;
      group += ALPHABET.charAt(byte % ALPHABET.length);
    }
    groups.push(group);
  }
  return groups.join('-');
}

// Canonical form keeps the 4-4-4 dashes (codes are stored dashed in the
// database) and applies the Crockford decodings so hand-typed I/L and O
// land on the unambiguous digits they were excluded for.
export function normalizeInviteCode(code: string): string {
  const compact = code
    .replace(/[^0-9A-Za-z]/g, '')
    .toUpperCase()
    .replace(/[IL]/g, '1')
    .replace(/O/g, '0');
  const groups = compact.match(new RegExp(`.{1,${INVITE_CODE_GROUP_LENGTH}}`, 'g')) ?? [];
  return groups.join('-');
}

export function parseAdminEmails(env: string | undefined): string[] {
  // Full-width separators too — CN admins paste lists with ；、 all the time.
  return (env ?? '')
    .split(/[,;\s；、]+/)
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email: string | null | undefined, env: string | undefined): boolean {
  if (!email) return false;
  return parseAdminEmails(env).includes(email.trim().toLowerCase());
}
