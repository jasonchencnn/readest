import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/utils/supabase';
import { INVITE_CODE_PATTERN, normalizeInviteCode } from '@/utils/invite';

export async function POST(req: Request): Promise<Response> {
  try {
    const { inviteCode } = await req.json();
    if (typeof inviteCode !== 'string') {
      return NextResponse.json({ valid: false, remaining: 0 });
    }
    const code = normalizeInviteCode(inviteCode);
    if (!INVITE_CODE_PATTERN.test(code)) {
      return NextResponse.json({ valid: false, remaining: 0 });
    }
    const admin = createSupabaseAdminClient();
    const { data } = await admin.rpc('validate_invite', { p_code: code });
    return NextResponse.json({ valid: !!data?.valid, remaining: data?.remaining ?? 0 });
  } catch {
    return NextResponse.json({ valid: false, remaining: 0 });
  }
}
