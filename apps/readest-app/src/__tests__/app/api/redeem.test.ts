import { describe, it, expect, vi, beforeEach } from 'vitest';

const hooks = vi.hoisted(() => ({
  auth: { user: null as { id: string; email: string } | null, error: null as unknown },
  redeemResponse: null as { data: unknown; error: unknown } | null,
}));

vi.mock('@/utils/supabase', () => ({
  createSupabaseAdminClient: () => ({
    rpc: (name: string, _args: Record<string, unknown>) => {
      if (name !== 'redeem_code') {
        return Promise.resolve({ data: null, error: new Error(`unexpected RPC: ${name}`) });
      }
      return Promise.resolve(hooks.redeemResponse);
    },
  }),
}));

vi.mock('@/utils/access', () => ({
  validateUserAndToken: () =>
    Promise.resolve(hooks.auth.user ? { user: hooks.auth.user, token: 'tok' } : {}),
}));

import { POST } from '@/app/api/redeem/route';

const makeReq = (body: unknown) =>
  new Request('https://readest.chen-cn.top/api/redeem', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }) as unknown as Parameters<typeof POST>[0];

beforeEach(() => {
  hooks.auth = {
    user: { id: 'user-1', email: 'test@example.com' },
    error: null,
  };
  hooks.redeemResponse = { data: null, error: null };
});

describe('POST /api/redeem', () => {
  it('rejects unauthenticated callers with 403', async () => {
    hooks.auth.user = null;
    const res = await POST(makeReq({ code: 'ABCD-EFGH-JKMN' }));
    expect(res.status).toBe(403);
  });

  it('rejects missing or non-string codes with 400', async () => {
    const empty = await POST(makeReq({ code: '' }));
    expect(empty.status).toBe(400);

    const wrongType = await POST(makeReq({ code: 123 }));
    expect(wrongType.status).toBe(400);
  });

  it('rejects malformed codes with 400 invalid_code', async () => {
    const res = await POST(makeReq({ code: 'shrt' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('invalid_code');
  });

  it('normalises lowercase, whitespace, and Crockford lookalikes before calling the RPC', async () => {
    hooks.redeemResponse = {
      data: {
        ok: true,
        plan: 'plus',
        months_added: 1,
        current_period_end: '2030-01-01T00:00:00Z',
      },
      error: null,
    };
    const res = await POST(makeReq({ code: ' abcd-efgh-jkln ' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.plan).toBe('plus');
  });

  it('forwards RPC error reasons as 400', async () => {
    hooks.redeemResponse = {
      data: { ok: false, reason: 'already_used_or_invalid' },
      error: null,
    };
    const res = await POST(makeReq({ code: 'ABCD-EFGH-JKMN' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('already_used_or_invalid');
  });

  it('forwards expired reason as 400', async () => {
    hooks.redeemResponse = { data: { ok: false, reason: 'expired' }, error: null };
    const res = await POST(makeReq({ code: 'ABCD-EFGH-JKMN' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('expired');
  });

  it('returns 500 redeem_failed when the RPC itself errors', async () => {
    hooks.redeemResponse = {
      data: null,
      error: new Error('connection refused'),
    };
    const res = await POST(makeReq({ code: 'ABCD-EFGH-JKMN' }));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('redeem_failed');
  });

  it('returns the plan / monthsAdded / currentPeriodEnd triple on success', async () => {
    hooks.redeemResponse = {
      data: {
        ok: true,
        plan: 'pro',
        months_added: 12,
        current_period_end: '2031-01-01T00:00:00Z',
      },
      error: null,
    };
    const res = await POST(makeReq({ code: 'ABCD-EFGH-JKMN' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      plan: 'pro',
      monthsAdded: 12,
      currentPeriodEnd: '2031-01-01T00:00:00Z',
    });
  });
});
