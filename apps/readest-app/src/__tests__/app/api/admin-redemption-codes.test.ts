import { describe, it, expect, vi, beforeEach } from 'vitest';

const hooks = vi.hoisted(() => ({
  auth: { user: null as { id: string; email: string } | null },
  // admin client surface we need to fake.
  codesList: [] as unknown[],
  codesListError: null as unknown,
  insertResult: null as unknown,
  insertError: null as unknown,
  insertCalls: 0,
  insertForceError: null as string | null,
  profiles: [] as { id: string; email: string }[],
}));

vi.mock('@/utils/supabase', () => ({
  createSupabaseAdminClient: () => ({
    auth: {
      getUser: () =>
        Promise.resolve({
          data: hooks.auth.user ? { user: hooks.auth.user } : { user: null },
          error: hooks.auth.user ? null : new Error('no session'),
        }),
    },
    from: (table: string) => {
      if (table === 'redemption_codes') {
        return {
          select: () => ({
            order: () => ({
              limit: () => Promise.resolve({ data: hooks.codesList, error: hooks.codesListError }),
            }),
          }),
          insert: () => {
            hooks.insertCalls += 1;
            if (hooks.insertForceError) {
              return {
                select: () => ({
                  single: () =>
                    Promise.resolve({ data: null, error: { message: hooks.insertForceError } }),
                }),
              };
            }
            return {
              select: () => ({
                single: () =>
                  Promise.resolve({ data: hooks.insertResult, error: hooks.insertError }),
              }),
            };
          },
        };
      }
      if (table === 'profiles') {
        return {
          select: () => ({
            in: () => Promise.resolve({ data: hooks.profiles, error: null }),
          }),
        };
      }
      throw new Error(`unexpected table: ${table}`);
    },
  }),
}));

import { GET, POST } from '@/app/api/admin/redemption-codes/route';

const makeReq = (
  body?: unknown,
  headers: Record<string, string> = { authorization: 'Bearer tok' },
) =>
  new Request('https://readest.chen-cn.top/api/admin/redemption-codes', {
    method: body !== undefined ? 'POST' : 'GET',
    headers: { 'content-type': 'application/json', ...headers },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  }) as unknown as Parameters<typeof GET>[0];

beforeEach(() => {
  process.env['ADMIN_EMAILS'] = 'admin@chen-cn.top';
  hooks.auth = { user: { id: 'admin-1', email: 'admin@chen-cn.top' } };
  hooks.codesList = [];
  hooks.codesListError = null;
  hooks.insertResult = { code: 'ABCD-EFGH-JKMN', plan: 'plus', months: 1 };
  hooks.insertError = null;
  hooks.insertCalls = 0;
  hooks.insertForceError = null;
  hooks.profiles = [];
});

describe('GET /api/admin/redemption-codes', () => {
  it('returns 403 when the caller is not authenticated', async () => {
    hooks.auth.user = null;
    const res = await GET(makeReq());
    expect(res.status).toBe(403);
  });

  it('returns 403 when the caller is authenticated but not in ADMIN_EMAILS', async () => {
    hooks.auth.user = { id: 'u', email: 'someone@example.com' };
    const res = await GET(makeReq());
    expect(res.status).toBe(403);
  });

  it('returns the codes list and joins redeemed_by_email when the caller is an admin', async () => {
    hooks.codesList = [
      {
        code: 'CODE-REDEEMED-X',
        plan: 'plus',
        months: 1,
        status: 'redeemed',
        redeemed_by: 'user-9',
        redeemed_at: '2026-09-07T10:00:00Z',
      },
      {
        code: 'CODE-ACTIVE-XXXX',
        plan: 'pro',
        months: 12,
        status: 'active',
        redeemed_by: null,
        redeemed_at: null,
      },
    ];
    hooks.profiles = [{ id: 'user-9', email: 'buyer@x.io' }];

    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { codes: Array<Record<string, unknown>> };
    expect(body.codes).toHaveLength(2);
    expect(body.codes[0]?.['redeemed_by_email']).toBe('buyer@x.io');
    expect(body.codes[1]?.['redeemed_by_email']).toBeNull();
  });
});

describe('POST /api/admin/redemption-codes', () => {
  it('returns 403 when the caller is not an admin', async () => {
    hooks.auth.user = { id: 'u', email: 'someone@example.com' };
    const res = await POST(makeReq({ plan: 'plus', count: 1 }));
    expect(res.status).toBe(403);
  });

  it('returns 400 invalid_plan for unknown plan values', async () => {
    const res = await POST(makeReq({ plan: 'gold', count: 1 }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('invalid_plan');
  });

  it('generates the requested number of codes', async () => {
    const res = await POST(makeReq({ plan: 'plus', count: 3, months: 1 }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { codes: unknown[] };
    expect(body.codes).toHaveLength(3);
    expect(hooks.insertCalls).toBe(3);
  });

  it('defaults to 1 month and 1 code when fields are missing or invalid', async () => {
    const res = await POST(makeReq({ plan: 'pro' }));
    expect(res.status).toBe(200);
    expect(hooks.insertCalls).toBe(1);
  });

  it('returns 500 when the DB insert fails for a non-collision reason', async () => {
    hooks.insertForceError = 'connection lost';
    const res = await POST(makeReq({ plan: 'plus', count: 1 }));
    expect(res.status).toBe(500);
  });
});
