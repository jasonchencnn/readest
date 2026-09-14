import { useRef } from 'react';
import Image from 'next/image';
import type { SupabaseClient } from '@supabase/supabase-js';
import { useTranslation } from '@/hooks/useTranslation';
import EmailPasswordAuth from './EmailPasswordAuth';
import ReadestCloudOptIn from './ReadestCloudOptIn';

interface AuthPanelProps {
  supabaseClient: SupabaseClient;
  redirectTo?: string;
  magicLink?: boolean;
}

export default function AuthPanel({
  supabaseClient,
  redirectTo,
  magicLink = false,
}: AuthPanelProps) {
  const _ = useTranslation();
  // `signInWithOAuth` redirects the whole page on web, which can cut off the
  // opt-in's settings write. Hold sign-in until it has landed. Null until the
  // user actually touches the checkbox, so the common path adds no delay.
  const pendingCloudChoice = useRef<Promise<unknown> | null>(null);

  return (
    <div className='flex w-full max-w-sm flex-col items-center gap-6'>
      <div className='flex flex-col items-center gap-3 text-center'>
        <Image src='/icon.png' alt='' width={56} height={56} className='eink-bordered rounded-xl' />
        <div>
          <h1 className='text-xl font-semibold tracking-tight'>{_('Sign in to Moyue')}</h1>
          <p className='text-base-content/70 mt-1.5 text-sm leading-relaxed'>
            {_('Sync your library, reading progress, and highlights across your devices.')}
          </p>
        </div>
      </div>
      <EmailPasswordAuth
        supabaseClient={supabaseClient}
        redirectTo={redirectTo}
        magicLink={magicLink}
      />
      <ReadestCloudOptIn
        onPendingWrite={(write) => {
          pendingCloudChoice.current = write;
        }}
      />
    </div>
  );
}
