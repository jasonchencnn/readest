import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/utils/supabase';
import { validateUserAndToken } from '@/utils/access';
import { INVITE_CODE_PATTERN, normalizeInviteCode } from '@/utils/invite';
import { REDEMPTION_ERROR_CODES } from '@/utils/redemption';

// POST /api/redeem — exchange a redemption code for a membership grant.
//
// The caller's session is verified with the standard `validateUserAndToken`
// helper; the user id flows into the `redeem_code` RPC, which locks the code
// row, extends or starts the matching `plans` row, and flips the code to
// `redeemed` in one transaction. We never tell the client the row state — the
// RPC's structured `{ ok, reason | plan, months_added, current_period_end }`
// response is forwarded verbatim so i18n mapping stays on the client.
export async function POST(req: Request): Promise<Response> {
  try {
    const { user } = await validateUserAndToken(req.headers.get('authorization'));
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 403 });
    }

    const body = (await req.json().catch(() => null)) as { code?: unknown } | null;
    if (typeof body?.code !== 'string' || !body.code.trim()) {
      return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
    }

    const code = normalizeInviteCode(body.code);
    if (!INVITE_CODE_PATTERN.test(code)) {
      return NextResponse.json({ error: REDEMPTION_ERROR_CODES.invalid_code }, { status: 400 });
    }

    const admin = createSupabaseAdminClient();
    const { data, error } = await admin.rpc('redeem_code', {
      p_code: code,
      p_user_id: user.id,
    });

    if (error) {
      console.error('redeem_code RPC error:', error);
      return NextResponse.json({ error: REDEMPTION_ERROR_CODES.redeem_failed }, { status: 500 });
    }

    if (!data?.ok) {
      // RPC reason strings become HTTP 400s so the client can branch on the
      // error string without parsing the status code.
      const reason =
        (typeof data?.reason === 'string' && data.reason) || REDEMPTION_ERROR_CODES.invalid_code;
      return NextResponse.json({ error: reason }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      plan: data.plan,
      monthsAdded: data.months_added,
      currentPeriodEnd: data.current_period_end,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('redeem route error:', error);
    return NextResponse.json(
      { error: REDEMPTION_ERROR_CODES.redeem_failed, message },
      { status: 500 },
    );
  }
}
