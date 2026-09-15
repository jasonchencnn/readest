import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';

// Regression guard for `getUserPlanData`'s usage-availability contract.
//
// The usage counter (`get_storage_usage`) and the entitlement tier
// (`get_user_plan`) fail independently. Only the two gates that authorise
// *against usage* — storage upload and share import — may refuse when the
// counter is unreadable. Every other caller must keep working: an RPC blip must
// not turn into a 500 for the translation, send-address, sender-list, stats and
// client-plan paths, none of which enforce usage.
//
// `send-address-plan-gate.test.ts` mocks `@/utils/plan` wholesale, so it never
// exercised the real resolver — that over-mocking is exactly what hid the
// original over-broad fail-closed change. This file deliberately runs the REAL
// `getUserPlanData` and drives it through the Supabase admin client.

const validateUserAndTokenMock = vi.fn();
// Contract: a read of the plan tier and a write that must fail.
const planTier: { value: string | null } = { value: 'plus' };

vi.mock('@/utils/access', async () => {
  const actual = await vi.importActual<typeof import('@/utils/access')>('@/utils/access');
  return {
    ...actual,
    validateUserAndToken: (...a: unknown[]) => validateUserAndTokenMock(...a),
  };
});

vi.mock('@/utils/cors', () => ({
  corsAllMethods: {},
  runMiddleware: vi.fn().mockResolvedValue(undefined),
}));

/**
 * Chainable AND awaitable PostgREST stub. `maybeSingle`/`single` resolve a bare
 * result; awaiting the builder itself (`…order().returns()`, `…insert()`) makes
 * it thenable so those calls also resolve `{ data: [], error: null }`.
 */
const supabaseBuilder = () => {
  const builder: Record<string, unknown> = {};
  const chain = () => builder;
  for (const m of [
    'select',
    'eq',
    'limit',
    'order',
    'insert',
    'upsert',
    'is',
    'returns',
    'delete',
    'update',
  ]) {
    builder[m] = chain;
  }
  builder['maybeSingle'] = () => Promise.resolve({ data: null, error: null });
  builder['single'] = () => Promise.resolve({ data: null, error: null });
  builder['then'] = (resolve: (v: unknown) => void, reject?: (e: unknown) => void) =>
    Promise.resolve({ data: [], error: null }).then(resolve, reject);
  return builder;
};

vi.mock('@/utils/supabase', () => ({
  createSupabaseAdminClient: () => ({
    rpc: (fn: string) => {
      if (fn === 'get_user_plan') return Promise.resolve({ data: planTier.value, error: null });
      // The storage counter is unreadable for every case in this file.
      if (fn === 'get_storage_usage') {
        return Promise.resolve({ data: null, error: { message: 'function not found' } });
      }
      return Promise.resolve({ data: null, error: null });
    },
    from: () => supabaseBuilder(),
  }),
}));

const { default: sendersHandler } = await import('@/pages/api/send/senders');
const { GET: userPlanGET } = await import('@/app/api/user/plan/route');

interface MockRes {
  status: ReturnType<typeof vi.fn>;
  json: ReturnType<typeof vi.fn>;
  _status: number;
  _body: Record<string, unknown> | undefined;
}

function makeRes(): MockRes {
  const res: MockRes = { status: vi.fn(), json: vi.fn(), _status: 0, _body: undefined };
  res.status.mockImplementation((code: number) => {
    res._status = code;
    return res as unknown as NextApiResponse;
  });
  res.json.mockImplementation((body: Record<string, unknown>) => {
    res._body = body;
    return res as unknown as NextApiResponse;
  });
  return res;
}

const makeReq = (): NextApiRequest =>
  ({ method: 'GET', headers: { authorization: 'Bearer testtoken' } }) as unknown as NextApiRequest;

beforeEach(() => {
  validateUserAndTokenMock.mockReset();
  validateUserAndTokenMock.mockResolvedValue({
    user: { id: 'user-1', email: 'u@example.com' },
    token: 'testtoken',
  });
  planTier.value = 'plus';
});

describe('entitlement-only path (send/senders) with an unreadable usage counter', () => {
  it('still passes the plan gate for a paid tier — no 500', async () => {
    planTier.value = 'plus';
    const res = makeRes();

    await sendersHandler(makeReq(), res as unknown as NextApiResponse);

    // The gate is past (the stub returns no rows), so this is a plain 200, not
    // a 500 — an unreadable counter must not break the sender list.
    expect(res._status).toBe(200);
    expect(res._body).toMatchObject({ senders: [] });
  });

  it('still blocks the free tier with plan_required (entitlement logic intact)', async () => {
    planTier.value = 'free';
    const res = makeRes();

    await sendersHandler(makeReq(), res as unknown as NextApiResponse);

    expect(res._status).toBe(403);
    expect(res._body).toMatchObject({ code: 'plan_required', plan: 'free' });
  });
});

describe('display path (/api/user/plan) with an unreadable usage counter', () => {
  it('degrades instead of 500-ing, and flags the reading as unavailable', async () => {
    planTier.value = 'plus';
    const req = new Request('http://localhost/api/user/plan', {
      headers: { authorization: 'Bearer testtoken' },
    });

    const response = await userPlanGET(req);

    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body).toMatchObject({ plan: 'plus', usage: 0, usageUnavailable: true });
  });
});
