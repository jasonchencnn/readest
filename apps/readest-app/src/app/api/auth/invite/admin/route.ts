import { NextResponse } from 'next/server';
import type { User } from '@supabase/supabase-js';
import { createSupabaseAdminClient } from '@/utils/supabase';
import { generateInviteCode, isAdminEmail } from '@/utils/invite';

async function requireAdmin(req: Request): Promise<User | null> {
  const authHeader = req.headers.get('authorization') ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!token) return null;
  const admin = createSupabaseAdminClient();
  const { data } = await admin.auth.getUser(token);
  if (!data?.user) return null;
  if (!isAdminEmail(data.user.email, process.env['ADMIN_EMAILS'])) return null;
  return data.user;
}

export async function GET(req: Request): Promise<Response> {
  try {
    const user = await requireAdmin(req);
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 403 });
    }
    const admin = createSupabaseAdminClient();
    const { data: invites, error } = await admin
      .from('invites')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    const { data: redemptions } = await admin
      .from('invite_redemptions')
      .select('invite_id,email,redeemed_at');
    const byInvite = new Map<string, { email: string; redeemed_at: string }[]>();
    for (const r of redemptions ?? []) {
      const list = byInvite.get(r.invite_id) ?? [];
      list.push({ email: r.email, redeemed_at: r.redeemed_at });
      byInvite.set(r.invite_id, list);
    }
    return NextResponse.json({
      invites: (invites ?? []).map((invite) => ({
        ...invite,
        redemptions: byInvite.get(invite.id) ?? [],
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request): Promise<Response> {
  try {
    const user = await requireAdmin(req);
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 403 });
    }
    const body = await req.json().catch(() => ({}));
    const maxUses = Number.isInteger(body?.maxUses) && body.maxUses >= 1 ? body.maxUses : 1;
    const expiresInDays = Number(body?.expiresInDays) > 0 ? Number(body.expiresInDays) : null;
    const expiresAt = expiresInDays
      ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString()
      : null;

    const admin = createSupabaseAdminClient();
    // Codes are random and the table enforces uniqueness; retry past the
    // (vanishingly unlikely) collision instead of failing the request.
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = generateInviteCode();
      const { data, error } = await admin
        .from('invites')
        .insert({
          code,
          note: typeof body?.note === 'string' ? body.note.slice(0, 200) : null,
          created_by: user.id,
          max_uses: maxUses,
          expires_at: expiresAt,
        })
        .select()
        .single();
      if (!error) {
        return NextResponse.json({ invite: data });
      }
      if (!/duplicate|unique/i.test(error.message)) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }
    return NextResponse.json({ error: 'Could not generate a unique code' }, { status: 500 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
