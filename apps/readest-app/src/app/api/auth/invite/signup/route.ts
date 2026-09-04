import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/utils/supabase';
import { INVITE_CODE_PATTERN, normalizeInviteCode } from '@/utils/invite';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: Request): Promise<Response> {
  try {
    const { email, password, inviteCode } = await req.json();
    if (
      typeof email !== 'string' ||
      typeof password !== 'string' ||
      typeof inviteCode !== 'string'
    ) {
      return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
    }
    const normalizedEmail = email.trim().toLowerCase();
    const code = normalizeInviteCode(inviteCode);
    if (!EMAIL_PATTERN.test(normalizedEmail) || !INVITE_CODE_PATTERN.test(code)) {
      return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
    }

    const admin = createSupabaseAdminClient();

    // Fast feedback before burning a GoTrue user on a dead code.
    const { data: check, error: checkError } = await admin.rpc('validate_invite', {
      p_code: code,
    });
    if (checkError || !check?.valid) {
      return NextResponse.json({ error: 'invalid_or_exhausted' }, { status: 400 });
    }

    // DISABLE_SIGNUP=true gates the anon client, so accounts are minted
    // server-side via the admin API; email_confirm skips SMTP (self-hosted
    // deployments usually have none configured).
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email: normalizedEmail,
      password,
      email_confirm: true,
    });
    if (createError || !created?.user) {
      const status = createError?.status;
      const message = createError?.message ?? '';
      const errorCode =
        status === 422 || /already|registered|exists/i.test(message)
          ? 'email_exists'
          : 'signup_failed';
      return NextResponse.json(
        { error: errorCode, message: createError?.message },
        { status: errorCode === 'email_exists' ? 409 : 400 },
      );
    }
    const user = created.user;

    // Atomic consume; on a race (last use taken between validate and claim)
    // roll the freshly created user back so no invite-less account lingers.
    const { data: claim, error: claimError } = await admin.rpc('claim_invite', {
      p_code: code,
      p_user_id: user.id,
      p_email: normalizedEmail,
    });
    if (claimError || !claim?.ok) {
      await admin.auth.admin.deleteUser(user.id);
      return NextResponse.json({ error: 'invalid_or_exhausted' }, { status: 409 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: 'signup_failed', message }, { status: 500 });
  }
}
