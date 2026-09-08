import { cleanup, render, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const hooks = vi.hoisted(() => ({
  replace: vi.fn(),
  searchParams: new URLSearchParams(),
  user: null as { id: string; email: string } | null,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: hooks.replace, push: vi.fn() }),
  useSearchParams: () => hooks.searchParams,
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: hooks.user, token: hooks.user ? 'tok' : null }),
}));

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (key: string) => key,
}));

import RedeemLandingPage from '@/app/redeem/page';

beforeEach(() => {
  hooks.replace.mockReset();
  hooks.searchParams = new URLSearchParams();
  hooks.user = null;
});

describe('RedeemLandingPage', () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('redirects an unauthenticated visitor through /auth?redirect= with the same code', async () => {
    vi.useFakeTimers();
    hooks.searchParams = new URLSearchParams('code=ABCD-EFGH-JKMN');
    hooks.user = null;
    await act(async () => {
      render(<RedeemLandingPage />);
    });
    expect(hooks.replace).toHaveBeenCalledTimes(1);
    const target = hooks.replace.mock.calls[0]?.[0] as string;
    expect(target).toMatch(/^\/auth\?redirect=/);
    // The redirect target should re-enter /redeem?code=… so the buyer lands
    // back here after sign-in, with the code intact through the round trip.
    const inner = decodeURIComponent(target.split('redirect=')[1] ?? '');
    expect(inner).toBe('/redeem?code=ABCD-EFGH-JKMN');
  });

  it('redirects an authenticated visitor straight to /user?redeem=', async () => {
    vi.useFakeTimers();
    hooks.searchParams = new URLSearchParams('code=ABCD-EFGH-JKMN');
    hooks.user = { id: 'u1', email: 'a@b.io' };
    await act(async () => {
      render(<RedeemLandingPage />);
    });
    expect(hooks.replace).toHaveBeenCalledWith('/user?redeem=ABCD-EFGH-JKMN');
  });

  it('falls back to /user when no code is present (no crash, no /auth bounce)', async () => {
    vi.useFakeTimers();
    hooks.searchParams = new URLSearchParams();
    hooks.user = { id: 'u1', email: 'a@b.io' };
    const { container } = render(<RedeemLandingPage />);
    expect(container.textContent).toContain('Redirecting…');
    expect(hooks.replace).toHaveBeenCalledWith('/user');
  });

  it('reveals a manual retry link after the 2 s timeout so a stuck replace is recoverable', async () => {
    vi.useFakeTimers();
    hooks.searchParams = new URLSearchParams('code=ABCD-EFGH-JKMN');
    hooks.user = { id: 'u1', email: 'a@b.io' };
    const { container, queryByText } = render(<RedeemLandingPage />);
    expect(queryByText('Click here if you are not redirected automatically.')).toBeNull();
    await act(async () => {
      vi.advanceTimersByTime(2100);
    });
    expect(container.textContent).toContain('Click here if you are not redirected automatically.');
  });
});
