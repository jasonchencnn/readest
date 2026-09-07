import { NextResponse } from 'next/server';
import type { User } from '@supabase/supabase-js';
import { createSupabaseAdminClient } from '@/utils/supabase';
import { generateInviteCode, isAdminEmail } from '@/utils/invite';
import { PLAN_TYPES, type RedemptionPlan } from '@/utils/redemption';

// /api/admin/redemption-codes — list + generate redemption codes.
//
// Mirrors the gate in /api/auth/invite/admin: the bearer's session must
// resolve to an email listed in ADMIN_EMAILS. The Crockford generator is
// reused from the invite tool (N08d), and a small retry loop absorbs the
// (vanishingly unlikely) random collision against the table's PK.
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
    const { data: codes, error } = await admin
      .from('redemption_codes')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Look up the redeemers' emails in one pass so the admin UI can show who
    // actually used a code without forcing a second round trip per row.
    const userIds = Array.from(
      new Set((codes ?? []).map((c) => c.redeemed_by).filter((id): id is string => !!id)),
    );
    const emailByUser = new Map<string, string>();
    if (userIds.length > 0) {
      const { data: profiles } = await admin.from('profiles').select('id,email').in('id', userIds);
      for (const p of profiles ?? []) {
        if (p?.id && p?.email) emailByUser.set(p.id, p.email);
      }
    }

    return NextResponse.json({
      codes: (codes ?? []).map((c) => ({
        ...c,
        redeemed_by_email: c.redeemed_by ? (emailByUser.get(c.redeemed_by) ?? null) : null,
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

type CreateBody = {
  plan?: unknown;
  months?: unknown;
  count?: unknown;
  expiresInDays?: unknown;
  note?: unknown;
};

export async function POST(req: Request): Promise<Response> {
  try {
    const user = await requireAdmin(req);
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 403 });
    }

    const body = (await req.json().catch(() => ({}))) as CreateBody;
    const plan = typeof body.plan === 'string' ? (body.plan as RedemptionPlan) : null;
    if (!plan || !PLAN_TYPES.includes(plan)) {
      return NextResponse.json({ error: 'invalid_plan' }, { status: 400 });
    }
    const months =
      Number.isInteger(body.months) && (body.months as number) > 0 ? (body.months as number) : 1;
    const count =
      Number.isInteger(body.count) && (body.count as number) >= 1 && (body.count as number) <= 100
        ? (body.count as number)
        : 1;
    const expiresInDays =
      Number.isInteger(body.expiresInDays) && (body.expiresInDays as number) > 0
        ? (body.expiresInDays as number)
        : null;
    const expiresAt = expiresInDays
      ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString()
      : null;
    const note = typeof body.note === 'string' ? body.note.slice(0, 200) : null;

    const admin = createSupabaseAdminClient();
    const generated: unknown[] = [];
    for (let i = 0; i < count; i++) {
      // Codes are random and the PK enforces uniqueness; retry past the
      // (astronomically rare) collision instead of failing the whole batch.
      let inserted: unknown = null;
      for (let attempt = 0; attempt < 5; attempt++) {
        const code = generateInviteCode();
        const { data, error } = await admin
          .from('redemption_codes')
          .insert({
            code,
            plan,
            months,
            expires_at: expiresAt,
            note,
            created_by: user.email ?? user.id,
          })
          .select()
          .single();
        if (!error) {
          inserted = data;
          break;
        }
        if (!/duplicate|unique/i.test(error.message)) {
          return NextResponse.json({ error: error.message }, { status: 500 });
        }
      }
      if (!inserted) {
        return NextResponse.json({ error: 'Could not generate a unique code' }, { status: 500 });
      }
      generated.push(inserted);
    }

    return NextResponse.json({ codes: generated });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
