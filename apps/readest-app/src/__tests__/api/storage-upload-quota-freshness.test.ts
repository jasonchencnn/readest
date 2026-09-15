import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';

// Moyue resolves the storage tier *and* the usage counter server-side, from the
// `plans` table via the `get_user_plan` / `get_storage_usage` SECURITY DEFINER
// RPCs (`getUserPlanData`) — the client JWT carries no plan or usage claim. So
// the gate is driven through `getUserPlanData` here, and the invariant under
// test is the one that matters: the gate must always authorise against the live
// counter and must never fail open when that counter cannot be read.

const validateUserAndTokenMock = vi.fn();
const getUploadSignedUrlMock = vi.fn();
const getDownloadSignedUrlMock = vi.fn();
const createSupabaseAdminClientMock = vi.fn();
const getUserPlanDataMock = vi.fn();

vi.mock('@/utils/cors', () => ({
  corsAllMethods: {},
  runMiddleware: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/utils/access', () => ({
  validateUserAndToken: (...a: unknown[]) => validateUserAndTokenMock(...a),
  STORAGE_QUOTA_GRACE_BYTES: 0,
}));
vi.mock('@/utils/plan', () => ({
  getUserPlanData: (...a: unknown[]) => getUserPlanDataMock(...a),
}));
vi.mock('@/utils/object', async (orig) => {
  const actual = await orig<typeof import('@/utils/object')>();
  return {
    ...actual,
    getUploadSignedUrl: (...a: unknown[]) => getUploadSignedUrlMock(...a),
    getDownloadSignedUrl: (...a: unknown[]) => getDownloadSignedUrlMock(...a),
  };
});
vi.mock('@/utils/supabase', () => ({
  createSupabaseAdminClient: (...a: unknown[]) => createSupabaseAdminClientMock(...a),
}));

import handler from '@/pages/api/storage/upload';

const QUOTA = 500 * 1024 * 1024;

const makeReqRes = (body: Record<string, unknown>) => {
  const req = {
    method: 'POST',
    headers: { authorization: 'Bearer tok' },
    body,
  } as unknown as NextApiRequest;
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as NextApiResponse;
  return { req, res };
};

/**
 * Only the `files` table is touched after the gate: a lookup for an existing
 * row (miss ⇒ PGRST116) then an insert. `single` is shared across both calls
 * so the two `mockResolvedValueOnce`s apply in call order.
 */
const stubSupabase = () => {
  const single = vi
    .fn()
    .mockResolvedValueOnce({ data: null, error: { code: 'PGRST116' } })
    .mockResolvedValueOnce({ data: { file_size: 1 }, error: null });

  const make = (singleFn: unknown) => {
    const builder: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'limit', 'insert', 'is']) builder[m] = () => builder;
    builder['single'] = singleFn;
    return builder;
  };
  createSupabaseAdminClientMock.mockReset().mockReturnValue({
    from: () => make(single),
  });
};

beforeEach(() => {
  validateUserAndTokenMock.mockReset().mockResolvedValue({ user: { id: 'user-1' }, token: 'tok' });
  getUploadSignedUrlMock.mockReset().mockResolvedValue('https://r2/upload');
  getDownloadSignedUrlMock.mockReset().mockResolvedValue('https://r2/download');
  getUserPlanDataMock.mockReset();
  stubSupabase();
});

describe('POST /api/storage/upload — quota freshness', () => {
  it('refuses an upload that the live usage puts over quota', async () => {
    // The account is already full — a fresh request must be refused.
    getUserPlanDataMock.mockResolvedValue({
      plan: 'free',
      usage: QUOTA,
      quota: QUOTA,
      currentPeriodEnd: null,
      usageUnavailable: false,
    });
    const { req, res } = makeReqRes({
      fileName: 'Readest/Books/hash.epub',
      fileSize: 90 * 1024 * 1024,
    });

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(getUploadSignedUrlMock).not.toHaveBeenCalled();
  });

  it('reports the live usage, not a stale snapshot', async () => {
    getUserPlanDataMock.mockResolvedValue({
      plan: 'plus',
      usage: 400 * 1024 * 1024,
      quota: QUOTA,
      currentPeriodEnd: null,
      usageUnavailable: false,
    });
    const { req, res } = makeReqRes({
      fileName: 'Readest/Books/hash.epub',
      fileSize: 10 * 1024 * 1024,
    });

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const payload = (res.json as unknown as { mock: { calls: [{ usage: number }][] } }).mock
      .calls[0]![0];
    expect(payload.usage).toBe(410 * 1024 * 1024);
  });

  it('still allows an upload that genuinely fits', async () => {
    getUserPlanDataMock.mockResolvedValue({
      plan: 'plus',
      usage: 10 * 1024 * 1024,
      quota: QUOTA,
      currentPeriodEnd: null,
      usageUnavailable: false,
    });
    const { req, res } = makeReqRes({
      fileName: 'Readest/Books/hash.epub',
      fileSize: 5 * 1024 * 1024,
    });

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(getUploadSignedUrlMock).toHaveBeenCalled();
  });

  it('refuses the upload when the usage counter cannot be read (no fail-open)', async () => {
    // An unreadable counter must not become "0 bytes used, upload anything".
    getUserPlanDataMock.mockResolvedValue({
      plan: 'plus',
      usage: 0,
      quota: QUOTA,
      currentPeriodEnd: null,
      usageUnavailable: true,
    });
    const { req, res } = makeReqRes({
      fileName: 'Readest/Books/hash.epub',
      fileSize: 90 * 1024 * 1024,
    });

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(getUploadSignedUrlMock).not.toHaveBeenCalled();
  });
});
