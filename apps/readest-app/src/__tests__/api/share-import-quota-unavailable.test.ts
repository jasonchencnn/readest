import { describe, it, expect, vi, beforeEach } from 'vitest';

// Covers the share-import quota gate — the second of the two callers that
// authorise *against* usage (the first being storage upload). Both must refuse
// when the counter is unreadable rather than treating the account as empty;
// unlike upload this one answers 503 `quota_unavailable`, since the copy cannot
// be authorised at all.

const validateUserAndTokenMock = vi.fn();
const resolveActiveShareMock = vi.fn();
const getUserPlanDataMock = vi.fn();
const copyObjectMock = vi.fn();
const objectExistsMock = vi.fn();

vi.mock('@/utils/access', () => ({
  validateUserAndToken: (...a: unknown[]) => validateUserAndTokenMock(...a),
  STORAGE_QUOTA_GRACE_BYTES: 0,
}));
vi.mock('@/libs/shareServer', () => ({
  resolveActiveShare: (...a: unknown[]) => resolveActiveShareMock(...a),
  rejectionToHttp: () => ({ status: 404, body: { error: 'Share not found' } }),
}));
vi.mock('@/utils/object', () => ({
  copyObject: (...a: unknown[]) => copyObjectMock(...a),
  objectExists: (...a: unknown[]) => objectExistsMock(...a),
}));
vi.mock('@/utils/plan', () => ({
  getUserPlanData: (...a: unknown[]) => getUserPlanDataMock(...a),
}));

/** Chainable AND awaitable PostgREST stub (queries resolve to no rows). */
const supabaseBuilder = () => {
  const builder: Record<string, unknown> = {};
  const chain = () => builder;
  for (const m of ['select', 'eq', 'limit', 'is', 'not', 'insert', 'update', 'upsert', 'order']) {
    builder[m] = chain;
  }
  builder['maybeSingle'] = () => Promise.resolve({ data: null, error: null });
  builder['single'] = () => Promise.resolve({ data: null, error: null });
  builder['then'] = (resolve: (v: unknown) => void, reject?: (e: unknown) => void) =>
    Promise.resolve({ data: [], error: null }).then(resolve, reject);
  return builder;
};

vi.mock('@/utils/supabase', () => ({
  createSupabaseAdminClient: () => ({ from: () => supabaseBuilder() }),
}));

const { POST } = await import('@/app/api/share/[token]/import/route');

const QUOTA = 500 * 1024 * 1024;

const postImport = (token = 'share-token') =>
  POST(new Request(`http://localhost/api/share/${token}/import`, { method: 'POST' }), {
    params: Promise.resolve({ token }),
  });

beforeEach(() => {
  validateUserAndTokenMock.mockReset().mockResolvedValue({
    user: { id: 'recipient-1' },
    token: 'jwt',
  });
  getUserPlanDataMock.mockReset();
  copyObjectMock.mockReset();
  objectExistsMock.mockReset();
  resolveActiveShareMock.mockReset().mockResolvedValue({
    ok: true,
    share: {
      userId: 'sharer-1',
      bookHash: 'hash-1',
      bookSize: 1000,
      bookFileKey: 'sharer-1/Moyue/Book/hash-1/book.epub',
      cfi: null,
    },
  });
});

describe('POST /api/share/[token]/import — quota gate', () => {
  it('refuses with 503 when the usage counter cannot be read (no fail-open)', async () => {
    getUserPlanDataMock.mockResolvedValue({
      plan: 'plus',
      usage: 0,
      quota: QUOTA,
      currentPeriodEnd: null,
      usageUnavailable: true,
    });

    const response = await postImport();

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ code: 'quota_unavailable' });
    // No byte-copy work may start when the copy cannot be authorised.
    expect(objectExistsMock).not.toHaveBeenCalled();
    expect(copyObjectMock).not.toHaveBeenCalled();
  });

  it('still refuses an over-quota import with 402 when the counter is readable', async () => {
    getUserPlanDataMock.mockResolvedValue({
      plan: 'plus',
      usage: QUOTA,
      quota: QUOTA,
      currentPeriodEnd: null,
      usageUnavailable: false,
    });

    const response = await postImport();

    expect(response.status).toBe(402);
    expect(await response.json()).toMatchObject({ code: 'quota_exceeded' });
    expect(copyObjectMock).not.toHaveBeenCalled();
  });
});
