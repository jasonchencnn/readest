import type { NextApiRequest, NextApiResponse } from 'next';
import { corsAllMethods, runMiddleware } from '@/utils/cors';
import { validateUserAndToken } from '@/utils/access';
import { createSupabaseAdminClient } from '@/utils/supabase';
import { MEMBERSHIP_PLANS } from '@/services/constants';
import { buildEpayPayUrl, generateOrderNo, getEpayConfig } from '@/libs/payment/epay';
import type { EpayChannel } from '@/libs/payment/epay';
import type { UserPlan } from '@/types/quota';

const EPAY_CHANNEL_BY_NAME: { wechat: EpayChannel; alipay: EpayChannel } = {
  wechat: 'wxpay',
  alipay: 'alipay',
};

// The gateway must reach the notify URL from the public internet, so this is
// the deployment's public origin — not the container-internal one.
const getPublicBaseUrl = (): string =>
  process.env['PAY_SITE_URL'] ||
  process.env['API_BASE_URL'] ||
  process.env['NEXT_PUBLIC_SITE_URL'] ||
  '';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  await runMiddleware(req, res, corsAllMethods);

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { user } = await validateUserAndToken(req.headers['authorization']);
  if (!user) {
    return res.status(403).json({ error: 'Not authenticated' });
  }

  const config = getEpayConfig();
  if (!config) {
    return res.status(503).json({ error: 'Payment gateway is not configured' });
  }

  const { plan, channel } = (req.body ?? {}) as { plan?: string; channel?: string };
  if (plan !== 'plus' && plan !== 'pro') {
    return res.status(400).json({ error: 'Invalid plan' });
  }
  if (channel !== 'wechat' && channel !== 'alipay') {
    return res.status(400).json({ error: 'Invalid payment channel' });
  }

  const membership = MEMBERSHIP_PLANS.find((p) => p.plan === (plan as UserPlan));
  if (!membership || membership.currency !== 'CNY') {
    return res.status(400).json({ error: 'Plan is not purchasable' });
  }

  const baseUrl = getPublicBaseUrl();
  if (!baseUrl) {
    return res.status(503).json({ error: 'Payment callback base URL is not configured' });
  }

  const orderNo = generateOrderNo();
  const months = 1;
  const supabase = createSupabaseAdminClient();
  const { error: insertError } = await supabase.from('orders').insert({
    order_no: orderNo,
    user_id: user.id,
    plan,
    months,
    amount_cents: membership.price,
    currency: membership.currency,
    channel,
    provider: 'epay',
    status: 'pending',
  });
  if (insertError) {
    console.error('Failed to create order:', insertError.message);
    return res.status(500).json({ error: 'Could not create order' });
  }

  const payUrl = buildEpayPayUrl(config, {
    orderNo,
    productName: `墨阅 ${membership.productName} ${months}个月`,
    amountCents: membership.price,
    channel: EPAY_CHANNEL_BY_NAME[channel],
    notifyUrl: `${baseUrl}/api/pay/notify`,
    returnUrl: `${baseUrl}/user?payment=return&orderNo=${orderNo}`,
  });

  return res.status(200).json({ orderNo, payUrl, amountCents: membership.price });
}
