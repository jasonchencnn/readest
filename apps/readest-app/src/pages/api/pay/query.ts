import type { NextApiRequest, NextApiResponse } from 'next';
import { corsAllMethods, runMiddleware } from '@/utils/cors';
import { validateUserAndToken } from '@/utils/access';
import { createSupabaseAdminClient } from '@/utils/supabase';

/**
 * GET /api/pay/query?orderNo=… — client-side polling after the gateway
 * redirect. Scoped to the caller's own orders so order numbers can't be
 * probed across users.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  await runMiddleware(req, res, corsAllMethods);

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { user } = await validateUserAndToken(req.headers['authorization']);
  if (!user) {
    return res.status(403).json({ error: 'Not authenticated' });
  }

  const orderNo = typeof req.query['orderNo'] === 'string' ? req.query['orderNo'] : '';
  if (!orderNo) {
    return res.status(400).json({ error: 'Missing orderNo' });
  }

  const supabase = createSupabaseAdminClient();
  const { data: order, error } = await supabase
    .from('orders')
    .select('order_no, plan, amount_cents, currency, status, paid_at, created_at')
    .eq('order_no', orderNo)
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();

  if (error) {
    return res.status(500).json({ error: 'Could not query order' });
  }
  if (!order) {
    return res.status(404).json({ error: 'Order not found' });
  }

  return res.status(200).json({ order });
}
