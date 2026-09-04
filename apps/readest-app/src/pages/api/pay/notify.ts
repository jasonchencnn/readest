import type { NextApiRequest, NextApiResponse } from 'next';
import { corsAllMethods, runMiddleware } from '@/utils/cors';
import { createSupabaseAdminClient } from '@/utils/supabase';
import { getEpayConfig, isEpayTradeSuccess, verifyEpayNotify } from '@/libs/payment/epay';

/**
 * GET/POST /api/pay/notify — the epay gateway's async payment callback.
 * Money path rules:
 *  - the request is only trusted after signature verification;
 *  - only TRADE_SUCCESS credits the user;
 *  - the signed amount must match the pending order exactly;
 *  - `mark_order_paid` (migration 020) flips pending→paid and starts/extends
 *    the plan atomically, so gateway retries are idempotent;
 *  - always answer the literal body epay expects: "success" stops retries,
 *    anything else makes the gateway keep re-notifying.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  await runMiddleware(req, res, corsAllMethods);

  const config = getEpayConfig();
  if (!config) {
    return res.status(503).send('fail');
  }

  const params: Record<string, string | string[] | undefined> = {
    ...req.query,
    ...(req.body && typeof req.body === 'object' ? (req.body as Record<string, string>) : {}),
  };

  if (!verifyEpayNotify(params, config)) {
    console.error('epay notify signature verification failed');
    return res.status(400).send('fail');
  }

  // Acknowledge non-success states without crediting anything.
  if (!isEpayTradeSuccess(params)) {
    return res.status(200).send('success');
  }

  const orderNo = String(params['out_trade_no']);
  const tradeNo = String(params['trade_no'] ?? '');
  const moneyCents = Math.round(parseFloat(String(params['money'] ?? '0')) * 100);

  const supabase = createSupabaseAdminClient();
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select('order_no, user_id, plan, months, amount_cents, status')
    .eq('order_no', orderNo)
    .limit(1)
    .maybeSingle();

  if (orderError || !order) {
    console.error('epay notify for unknown order:', orderNo, orderError?.message);
    return res.status(200).send('success');
  }

  // Defense in depth: the signature proves the gateway collected this money,
  // but the credited order must be the one the gateway is talking about, at
  // the exact amount we asked for.
  if (order.status !== 'pending' || moneyCents !== order.amount_cents) {
    console.error(
      'epay notify order mismatch:',
      orderNo,
      'status:',
      order.status,
      'money:',
      moneyCents,
      'expected:',
      order.amount_cents,
    );
    return res.status(400).send('fail');
  }

  const { data: claim, error: claimError } = await supabase.rpc('mark_order_paid', {
    p_order_no: orderNo,
    p_trade_no: tradeNo,
    p_notify: params,
  });

  if (claimError || !claim?.ok) {
    console.error('mark_order_paid failed:', orderNo, claimError?.message ?? claim);
    return res.status(500).send('fail');
  }

  return res.status(200).send('success');
}
