import { NextResponse } from 'next/server';
import { validateUserAndToken } from '@/utils/access';
import { getUserPlanData } from '@/utils/plan';

// GET /api/user/plan — the client's single source for membership state:
// tier (expiry-resolved), live storage usage, tier quota, and the current
// period end for display. All values come from the plans/files tables via
// the server; the client JWT carries no plan claim.
export async function GET(req: Request): Promise<Response> {
  try {
    const { user } = await validateUserAndToken(req.headers.get('authorization'));
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 403 });
    }
    const { plan, usage, quota, currentPeriodEnd } = await getUserPlanData(user.id);
    return NextResponse.json({ plan, usage, quota, currentPeriodEnd });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
