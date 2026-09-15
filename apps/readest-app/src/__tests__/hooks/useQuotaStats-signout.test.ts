import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

// Moyue resolves the membership tier server-side (`GET /api/user/plan`) — the
// client JWT carries no plan claim — so entitlement lands asynchronously rather
// than synchronously off a token. The invariant this guards is unchanged: a
// sign-out must clear the module-level entitlement caches, because they are read
// synchronously by non-React gates (`resolveCloudSyncGate`) and a stale value
// would leave the previous account looking premium.

const auth = vi.hoisted(() => ({ token: null as string | null, user: null as unknown }));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => auth }));

const cache = vi.hoisted(() => ({
  setCachedUserPlan: vi.fn(),
  setCachedCustomizationPurchased: vi.fn(),
}));
vi.mock('@/services/sync/cloudSyncProvider', () => cache);

vi.mock('@/hooks/useTranslation', () => ({ useTranslation: () => (s: string) => s }));

vi.mock('@/utils/access', () => ({
  getTranslationQuota: () => 1000,
}));

import { useQuotaStats } from '@/hooks/useQuotaStats';

const planResponse = (plan: 'free' | 'plus' | 'pro' | 'purchase') => ({
  ok: true,
  json: async () => ({ plan, usage: 0, quota: 1000 }),
});

beforeEach(() => {
  cache.setCachedUserPlan.mockReset();
  cache.setCachedCustomizationPurchased.mockReset();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(planResponse('purchase')));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useQuotaStats — sign-out clears the entitlement caches', () => {
  it('caches the purchased entitlement while signed in', async () => {
    auth.token = 'a-token';
    auth.user = { id: 'user-1' };

    const { result } = renderHook(() => useQuotaStats());

    await waitFor(() => expect(result.current.customizationPurchased).toBe(true));
    expect(cache.setCachedCustomizationPurchased).toHaveBeenLastCalledWith(true);
    expect(cache.setCachedUserPlan).toHaveBeenLastCalledWith('purchase');
  });

  it('clears both caches when the session goes away', async () => {
    auth.token = 'a-token';
    auth.user = { id: 'user-1' };
    const { rerender, result } = renderHook(() => useQuotaStats());
    await waitFor(() =>
      expect(cache.setCachedCustomizationPurchased).toHaveBeenLastCalledWith(true),
    );

    auth.token = null;
    auth.user = null;
    rerender();

    await waitFor(() =>
      expect(cache.setCachedCustomizationPurchased).toHaveBeenLastCalledWith(false),
    );
    expect(cache.setCachedUserPlan).toHaveBeenLastCalledWith(undefined);
    // The rendered value reflects the cleared server-resolved plan.
    expect(result.current.customizationPurchased).toBe(false);
  });
});
