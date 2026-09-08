'use client';

import { useCallback, useEffect } from 'react';
import { getCurrent } from '@tauri-apps/plugin-deep-link';
import { useRouter } from 'next/navigation';
import { useEnv } from '@/context/EnvContext';
import { isTauriAppPlatform } from '@/services/environment';
import { eventDispatcher } from '@/utils/event';
import { parseRedeemDeepLink } from '@/utils/deeplink';

// Module-scoped: cold-start guard mirrors useOpenBookLink so a remount does
// not re-read the launch URL on every reader reload.
let coldStartConsumed = false;

/**
 * Receive `moyue://redeem/{code}` deep links (from a desktop shortcut or a
 * web-bundle share-sheet) and route to /user?redeem=… so the
 * `RedemptionCard` can pre-fill the code. Only acts inside the Tauri
 * desktop shell; the web landing page (`/redeem`) is owned by
 * `apps/readest-app/src/app/redeem/page.tsx`.
 */
export function useOpenRedeemLink() {
  const router = useRouter();
  const { appService } = useEnv();

  const resolveAndNavigate = useCallback(
    (code: string) => {
      // Same query-string shape as the web landing page so the /user
      // handler only has one path to read.
      router.push(`/user?redeem=${encodeURIComponent(code)}`);
    },
    [router],
  );

  useEffect(() => {
    if (!isTauriAppPlatform() || !appService) return;

    const handle = (url: string, coldStart = false) => {
      const parsed = parseRedeemDeepLink(url);
      if (!parsed) return;
      // Dedupe ONLY the cold-start path: the OS persists the launch URL and
      // re-delivers it on every reader reload.
      if (coldStart) {
        try {
          if (sessionStorage.getItem('consumedColdStartRedeemUrl') === url) return;
          sessionStorage.setItem('consumedColdStartRedeemUrl', url);
        } catch {
          // sessionStorage unavailable - proceed.
        }
      }
      resolveAndNavigate(parsed.code);
    };

    if (!coldStartConsumed) {
      coldStartConsumed = true;
      getCurrent()
        .then((urls) => urls?.forEach((u) => handle(u, true)))
        .catch(() => {});
    }

    const onIncoming = (event: Event) => {
      const detail = (event as CustomEvent).detail as { urls?: string[] };
      detail.urls?.forEach((u) => handle(u));
    };
    eventDispatcher.on('app-incoming-url', onIncoming as EventListener);
    return () => {
      eventDispatcher.off('app-incoming-url', onIncoming as EventListener);
    };
  }, [appService, resolveAndNavigate]);
}
