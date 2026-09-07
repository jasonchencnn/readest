// Redemption-code grant (Moyue / 兑换码支付).
//
// The codes share invite codes' Crockford 4-4-4 alphabet and dash shape, so
// we re-export `generateInviteCode` / `normalizeInviteCode` rather than
// maintaining a parallel generator. `redeem_code` RPC owns validation; the
// client only normalises before sending and the server compares the dashed
// canonical form against the table primary key.

export {
  INVITE_CODE_PATTERN,
  INVITE_CODE_GROUP_LENGTH,
  generateInviteCode as generateRedemptionCode,
  normalizeInviteCode as normalizeRedemptionCode,
} from '@/utils/invite';

// Reasons returned by `public.redeem_code` RPC and surfaced to the client.
// Kept in one place so /api/redeem, the admin listing, and the UI toast mapper
// all agree on the same string set.
export const REDEMPTION_ERROR_CODES = {
  invalid_code: 'invalid_code',
  already_used_or_invalid: 'already_used_or_invalid',
  expired: 'expired',
  redeem_failed: 'redeem_failed',
} as const;

export type RedemptionErrorCode =
  (typeof REDEMPTION_ERROR_CODES)[keyof typeof REDEMPTION_ERROR_CODES];

export const PLAN_TYPES = ['plus', 'pro'] as const;
export type RedemptionPlan = (typeof PLAN_TYPES)[number];
