'use client';
import clsx from 'clsx';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import { IoArrowBack } from 'react-icons/io5';

import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/utils/supabase';
import { useEnv } from '@/context/EnvContext';
import { useTheme } from '@/hooks/useTheme';
import { useThemeStore } from '@/store/themeStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useTranslation } from '@/hooks/useTranslation';
import { useTrafficLightStore } from '@/store/trafficLightStore';
import { getBaseUrl, isTauriAppPlatform } from '@/services/environment';
import WindowButtons from '@/components/WindowButtons';
import AuthPanel from './components/AuthPanel';

const WEB_AUTH_CALLBACK = `${getBaseUrl()}/auth/callback`;

export default function AuthPage() {
  const _ = useTranslation();
  const router = useRouter();
  const { login } = useAuth();
  const { envConfig, appService } = useEnv();
  const { safeAreaInsets, isRoundedWindow } = useThemeStore();
  const { isTrafficLightVisible } = useTrafficLightStore();
  const { settings, setSettings, saveSettings } = useSettingsStore();
  const [isMounted, setIsMounted] = useState(false);

  const headerRef = useRef<HTMLDivElement>(null);

  useTheme({ systemUIVisible: false });

  // Signup is invite-only and there are no OAuth providers, so the only
  // redirects left are magic-link / password-reset emails landing on the
  // web callback page.
  const getRedirectTo = () => {
    if (isTauriAppPlatform()) {
      return WEB_AUTH_CALLBACK;
    }
    return process.env.NODE_ENV === 'production'
      ? WEB_AUTH_CALLBACK
      : `${window.location.origin}/auth/callback`;
  };

  const handleGoBack = () => {
    // Keep login false to avoid infinite loop to redirect to the login page
    settings.keepLogin = false;
    setSettings(settings);
    saveSettings(envConfig, settings);
    const redirectTo = new URLSearchParams(window.location.search).get('redirect');
    if (redirectTo) {
      router.push(redirectTo);
    } else {
      router.back();
    }
  };

  useEffect(() => {
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.access_token && session.user) {
        login(session.access_token, session.user);
        const redirectTo = new URLSearchParams(window.location.search).get('redirect');
        const lastRedirectAtKey = 'lastRedirectAt';
        const lastRedirectAt = parseInt(localStorage.getItem(lastRedirectAtKey) || '0', 10);
        const now = Date.now();
        localStorage.setItem(lastRedirectAtKey, now.toString());
        if (now - lastRedirectAt > 3000) {
          router.push(redirectTo ?? '/library');
        }
      }
    });

    return () => {
      subscription?.subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted) {
    return null;
  }

  return isTauriAppPlatform() ? (
    <div
      className={clsx(
        'bg-base-100 full-height inset-0 flex select-none flex-col items-center overflow-hidden',
        appService?.hasRoundedWindow && isRoundedWindow && 'window-border rounded-window',
      )}
    >
      <div
        className={clsx('flex h-full w-full flex-col items-center overflow-y-auto')}
        style={{
          paddingTop: `${safeAreaInsets?.top || 0}px`,
        }}
      >
        <div
          ref={headerRef}
          className={clsx(
            'fixed z-10 flex w-full items-center justify-between py-2 pe-6 ps-4',
            appService?.hasTrafficLight && 'pt-11',
          )}
          style={{ top: `${safeAreaInsets?.top || 0}px` }}
        >
          <button
            aria-label={_('Go Back')}
            onClick={handleGoBack}
            className={clsx('btn btn-ghost h-12 min-h-12 w-12 p-0 sm:h-8 sm:min-h-8 sm:w-8')}
          >
            <IoArrowBack className='text-base-content' />
          </button>

          {appService?.hasWindowBar && (
            <WindowButtons
              headerRef={headerRef}
              showMinimize={!isTrafficLightVisible}
              showMaximize={!isTrafficLightVisible}
              showClose={!isTrafficLightVisible}
              onClose={handleGoBack}
            />
          )}
        </div>
        <div
          className={clsx(
            'z-20 flex w-full flex-col items-center px-6 pb-12',
            appService?.hasTrafficLight ? 'mt-24' : 'mt-16',
          )}
        >
          <AuthPanel supabaseClient={supabase} magicLink={true} redirectTo={getRedirectTo()} />
        </div>
      </div>
    </div>
  ) : (
    <div className='bg-base-100 flex min-h-screen flex-col items-center overflow-y-auto px-6 pb-12 pt-20'>
      <button
        aria-label={_('Go Back')}
        onClick={handleGoBack}
        className='btn btn-ghost fixed start-6 top-6 h-8 min-h-8 w-8 p-0'
      >
        <IoArrowBack className='text-base-content' />
      </button>
      <AuthPanel supabaseClient={supabase} magicLink={true} redirectTo={getRedirectTo()} />
    </div>
  );
}
