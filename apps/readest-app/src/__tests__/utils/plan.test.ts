import { describe, expect, it, vi, beforeEach } from 'vitest';

const rpcMock = vi.fn();
const fromMock = vi.fn();

vi.mock('@/utils/supabase', () => ({
  createSupabaseAdminClient: () => ({
    rpc: (...args: unknown[]) => rpcMock(...args),
    from: (...args: unknown[]) => fromMock(...args),
  }),
}));

import { getUserPlanData } from '@/utils/plan';

const mockPlansRow = (row: { current_period_end: string } | null) => {
  fromMock.mockImplementation(() => ({
    select: () => ({
      eq: () => ({
        limit: () => ({
          maybeSingle: () => Promise.resolve({ data: row }),
        }),
      }),
    }),
  }));
};

describe('getUserPlanData (server-side tier resolution)', () => {
  beforeEach(() => {
    rpcMock.mockReset();
    fromMock.mockReset();
  });

  it('resolves the tier, coerces the bigint usage, and passes the period end through', async () => {
    rpcMock.mockImplementation((fn: string) => {
      if (fn === 'get_user_plan') {
        return Promise.resolve({ data: 'plus', error: null });
      }
      if (fn === 'get_storage_usage') {
        return Promise.resolve({ data: '123456789', error: null });
      }
      return Promise.resolve({ data: null, error: 'unexpected rpc' });
    });
    mockPlansRow({ current_period_end: '2026-10-01T00:00:00Z' });

    const data = await getUserPlanData('user-1');
    expect(data).toEqual({
      plan: 'plus',
      usage: 123456789,
      quota: 2 * 1024 * 1024 * 1024,
      currentPeriodEnd: '2026-10-01T00:00:00Z',
    });
  });

  it('falls back to free + 100 MB when the user has no plans row', async () => {
    rpcMock.mockImplementation((fn: string) => {
      if (fn === 'get_user_plan') {
        return Promise.resolve({ data: null, error: null });
      }
      if (fn === 'get_storage_usage') {
        return Promise.resolve({ data: '42', error: null });
      }
      return Promise.resolve({ data: null, error: 'unexpected rpc' });
    });
    mockPlansRow(null);

    const data = await getUserPlanData('user-2');
    expect(data).toEqual({
      plan: 'free',
      usage: 42,
      quota: 100 * 1024 * 1024,
      currentPeriodEnd: null,
    });
  });

  it('resolves to the free tier — never a paid tier — when get_user_plan errors', async () => {
    rpcMock.mockImplementation((fn: string) => {
      if (fn === 'get_user_plan') {
        return Promise.resolve({ data: null, error: { message: 'function not found' } });
      }
      // A readable usage counter keeps the resolution alive; only the tier
      // lookup fails here.
      return Promise.resolve({ data: '123', error: null });
    });
    mockPlansRow(null);

    const data = await getUserPlanData('user-3');
    expect(data.plan).toBe('free');
    expect(data.quota).toBe(100 * 1024 * 1024);
    expect(data.usage).toBe(123);
  });

  it('fails closed (rejects) when the usage counter cannot be read', async () => {
    // Coercing an unreadable usage counter to 0 is the fail-open that let the
    // storage gate authorise over-quota uploads — it must reject instead.
    rpcMock.mockImplementation((fn: string) => {
      if (fn === 'get_user_plan') {
        return Promise.resolve({ data: 'plus', error: null });
      }
      return Promise.resolve({ data: null, error: { message: 'function not found' } });
    });
    mockPlansRow(null);

    await expect(getUserPlanData('user-3')).rejects.toThrow(/get_storage_usage failed/);
  });

  it('maps each tier to its configured quota', async () => {
    rpcMock.mockImplementation((fn: string) => {
      if (fn === 'get_user_plan') {
        return Promise.resolve({ data: 'pro', error: null });
      }
      return Promise.resolve({ data: '0', error: null });
    });
    mockPlansRow(null);

    const data = await getUserPlanData('user-4');
    expect(data.quota).toBe(5 * 1024 * 1024 * 1024);
  });
});
