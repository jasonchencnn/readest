import type { NextApiRequest, NextApiResponse } from 'next';
import { corsAllMethods, runMiddleware } from '@/utils/cors';
import { getEpayConfig, verifyEpayNotify } from '@/libs/payment/epay';

/**
 * GET /api/pay/return — the gateway's sync browser redirect. Signature-check
 * the callback, then send the user to the membership page which polls
 * /api/user/plan for the freshly extended tier. The async notify is the
 * source of truth; the redirect is UX only.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  await runMiddleware(req, res, corsAllMethods);

  const config = getEpayConfig();
  const base = process.env['PAY_SITE_URL'] || process.env['API_BASE_URL'] || '';
  if (!config || !base) {
    return res.redirect(302, '/user?payment=unconfigured');
  }

  const verified = verifyEpayNotify(req.query, config);
  const orderNo = typeof req.query['out_trade_no'] === 'string' ? req.query['out_trade_no'] : '';
  const target = verified
    ? `/user?payment=success&orderNo=${encodeURIComponent(orderNo)}`
    : '/user?payment=failed';
  return res.redirect(302, target);
}
