import { createHash } from 'node:crypto';

/**
 * 易支付 (epay) integration — the de-facto standard protocol used by
 * Chinese aggregated-payment gateways (彩虹易支付 and its derivatives).
 *
 * Flow: /api/pay/create builds a signed submit.php redirect URL → the user
 * pays via WeChat/Alipay on the gateway → the gateway calls /api/pay/notify
 * (async, signed, retried until we answer "success") and /api/pay/return
 * (sync browser redirect) → notify verification flips the pending order to
 * paid via the `mark_order_paid` RPC (migration 020), which also starts or
 * extends the user's plan period.
 */

export type EpayChannel = 'alipay' | 'wxpay';

export interface EpayConfig {
  gatewayUrl: string;
  pid: string;
  key: string;
}

export interface EpayOrderParams {
  orderNo: string;
  productName: string;
  amountCents: number;
  channel: EpayChannel;
  notifyUrl: string;
  returnUrl: string;
}

const MD5_EXCLUDED_KEYS = new Set(['sign', 'sign_type']);

export const formatEpayMoney = (amountCents: number): string => (amountCents / 100).toFixed(2);

/**
 * epay signature: drop sign/sign_type and empty values, sort by key ASCII
 * ascending, join as k=v pairs, append `&<key>`, MD5 lowercase hex.
 */
export const signEpayParams = (params: Record<string, string>, key: string): string => {
  const filtered = Object.entries(params)
    .filter(([k, v]) => !MD5_EXCLUDED_KEYS.has(k) && v !== '' && v != null)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const query = filtered.map(([k, v]) => `${k}=${v}`).join('&');
  return createHash('md5').update(`${query}&${key}`).digest('hex');
};

/**
 * Build the gateway submit.php redirect URL. The signature is computed over
 * the RAW values; only the query string itself is URL-encoded.
 */
export const buildEpayPayUrl = (config: EpayConfig, order: EpayOrderParams): string => {
  const base = config.gatewayUrl.replace(/\/+$/, '');
  const params: Record<string, string> = {
    pid: config.pid,
    type: order.channel,
    out_trade_no: order.orderNo,
    notify_url: order.notifyUrl,
    return_url: order.returnUrl,
    name: order.productName,
    money: formatEpayMoney(order.amountCents),
    sign_type: 'MD5',
  };
  const sign = signEpayParams(params, config.key);
  const query = new URLSearchParams({ ...params, sign }).toString();
  return `${base}/submit.php?${query}`;
};

/**
 * Verify an epay signature over received params (notify or return callback).
 * Re-signs the received params and compares against the `sign` field.
 * Presence of `out_trade_no`/`sign` is required; whether the trade actually
 * succeeded is the caller's concern (`isEpayTradeSuccess`) — submit.php
 * redirects legitimately carry no `trade_status`.
 */
export const verifyEpayNotify = (
  params: Record<string, string | string[] | undefined>,
  config: EpayConfig,
): boolean => {
  const flat: Record<string, string> = {};
  for (const [k, v] of Object.entries(params)) {
    const value = Array.isArray(v) ? v[0] : v;
    if (typeof value === 'string') flat[k] = value;
  }
  if (!flat['sign'] || !flat['out_trade_no']) return false;
  const expected = signEpayParams(flat, config.key);
  // Constant-time-ish compare; signature forgery here is a money path.
  const a = Buffer.from(expected);
  const b = Buffer.from(flat['sign']);
  return a.length === b.length && a.equals(b);
};

export const isEpayTradeSuccess = (params: Record<string, string | string[] | undefined>) => {
  const status = Array.isArray(params['trade_status'])
    ? params['trade_status'][0]
    : params['trade_status'];
  return status === 'TRADE_SUCCESS';
};

export const getEpayConfig = (): EpayConfig | null => {
  const gatewayUrl = process.env['PAY_GATEWAY_URL'];
  const pid = process.env['PAY_GATEWAY_ID'];
  const key = process.env['PAY_GATEWAY_KEY'];
  if (!gatewayUrl || !pid || !key) return null;
  return { gatewayUrl, pid, key };
};

/** Merchant order number: sortable, unique, and fits epay's out_trade_no. */
export const generateOrderNo = (): string => {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = createHash('md5')
    .update(`${Date.now()}-${Math.random()}-${process.pid}`)
    .digest('hex')
    .slice(0, 8)
    .toUpperCase();
  return `MOY${ts}${rand}`;
};
