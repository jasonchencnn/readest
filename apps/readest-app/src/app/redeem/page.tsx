'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useTranslation } from '@/hooks/useTranslation';

// Landing page for redemption-code links — both web (`/redeem?code=…`) and
// desktop (`moyue://redeem/…`) deep links converge here, then route to the
// actual exchange form. The page only renders a fallback "Redirecting…"
// with a manual retry link because every authenticated visit gets
// `router.replace`'d before paint, and unauthenticated visits get bounced
// through `/auth?redirect=…` so the buyer returns to the same flow after
// sign-in. The retry link exists so a stuck `replace` (e.g. auth state
// hydrating slower than expected on first load) is recoverable.

export default function RedeemLandingPage() {
  const _ = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const [showRetry, setShowRetry] = useState(false);

  const code = searchParams?.get('code')?.trim() ?? '';
  const target = code ? `/user?redeem=${encodeURIComponent(code)}` : '/user';
  const signInRedirect = code
    ? `/auth?redirect=${encodeURIComponent(`/redeem?code=${encodeURIComponent(code)}`)}`
    : '/auth?redirect=/user';

  useEffect(() => {
    // Auth context is null on the very first render before the Supabase
    // session hydrates; bail out and let the next render (after the effect
    // re-runs) handle it. After 2 s with no auth state, show the manual
    // retry link so the user is never stuck on a blank "Redirecting…".
    const t = setTimeout(() => setShowRetry(true), 2000);
    if (user) {
      router.replace(target);
    } else {
      router.replace(signInRedirect);
    }
    return () => clearTimeout(t);
  }, [user, target, signInRedirect, router]);

  return (
    <div className='bg-base-100 flex min-h-screen items-center justify-center p-6'>
      <div className='flex max-w-sm flex-col items-center gap-3 text-center'>
        <div className='loading loading-spinner loading-md text-primary' />
        <p className='text-base-content/80 text-sm'>{_('Redirecting…')}</p>
        {showRetry && (
          <a href={user ? target : signInRedirect} className='link link-primary text-sm'>
            {_('Click here if you are not redirected automatically.')}
          </a>
        )}
      </div>
    </div>
  );
}
