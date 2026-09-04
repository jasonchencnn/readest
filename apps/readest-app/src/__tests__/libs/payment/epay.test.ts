import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  buildEpayPayUrl,
  formatEpayMoney,
  generateOrderNo,
  isEpayTradeSuccess,
  signEpayParams,
  verifyEpayNotify,
} from '@/libs/payment/epay';

const CONFIG = { gatewayUrl: 'https://pay.example.com/', pid: '1001', key: 'test-secret-key' };

describe('formatEpayMoney', () => {
  it('renders cents as a two-decimal string', () => {
    expect(formatEpayMoney(1500)).toBe('15.00');
    expect(formatEpayMoney(3000)).toBe('30.00');
    expect(formatEpayMoney(1550)).toBe('15.50');
    expect(formatEpayMoney(5)).toBe('0.05');
  });
});

describe('signEpayParams', () => {
  it('is deterministic', () => {
    const params = { pid: '1001', type: 'alipay', out_trade_no: 'MOY1', money: '15.00' };
    expect(signEpayParams(params, CONFIG.key)).toBe(signEpayParams(params, CONFIG.key));
  });

  it('excludes sign/sign_type and empty values, sorts keys, and appends the secret', () => {
    // Reimplement the documented algorithm inline as the oracle.
    const oracle = (raw: Record<string, string>, key: string) => {
      const filtered = Object.entries(raw)
        .filter(([k, v]) => !['sign', 'sign_type'].includes(k) && v !== '')
        .sort(([a], [b]) => a.localeCompare(b));
      const expected = createHash('md5')
        .update(`${filtered.map(([k, v]) => `${k}=${v}`).join('&')}&${key}`)
        .digest('hex');
      return signEpayParams(raw, key) === expected;
    };
    const params = {
      sign_type: 'MD5',
      money: '15.00',
      pid: '1001',
      type: 'wxpay',
      empty_field: '',
      out_trade_no: 'MOY1',
      notify_url: 'https://m.example.com/api/pay/notify',
    };
    expect(oracle(params, CONFIG.key)).toBe(true);
  });

  it('changes when the key changes', () => {
    const params = { pid: '1001', money: '15.00' };
    expect(signEpayParams(params, CONFIG.key)).not.toBe(signEpayParams(params, 'other-key'));
  });
});

describe('buildEpayPayUrl', () => {
  it('builds a signed submit.php URL with encoded query and raw-value sign', () => {
    const url = buildEpayPayUrl(CONFIG, {
      orderNo: 'MOYTEST1',
      productName: '墨阅 Plus 会员',
      amountCents: 1500,
      channel: 'alipay',
      notifyUrl: 'https://m.example.com/api/pay/notify',
      returnUrl: 'https://m.example.com/user?payment=return',
    });
    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe('https://pay.example.com/submit.php');
    expect(parsed.searchParams.get('pid')).toBe('1001');
    expect(parsed.searchParams.get('type')).toBe('alipay');
    expect(parsed.searchParams.get('out_trade_no')).toBe('MOYTEST1');
    expect(parsed.searchParams.get('money')).toBe('15.00');
    expect(parsed.searchParams.get('sign_type')).toBe('MD5');
    // The sign must verify against the raw (decoded) params.
    const received: Record<string, string> = {};
    parsed.searchParams.forEach((v, k) => {
      received[k] = v;
    });
    expect(verifyEpayNotify(received, CONFIG)).toBe(true);
  });
});

describe('verifyEpayNotify', () => {
  it('accepts a notification whose sign matches its own params', () => {
    const payload = {
      pid: '1001',
      trade_no: 'GW20260902PAY',
      out_trade_no: 'MOYTEST2',
      type: 'wxpay',
      name: '墨阅 Plus 会员',
      money: '15.00',
      trade_status: 'TRADE_SUCCESS',
    };
    const sign = signEpayParams(payload, CONFIG.key);
    expect(verifyEpayNotify({ ...payload, sign, sign_type: 'MD5' }, CONFIG)).toBe(true);
  });

  it('rejects a tampered amount', () => {
    const payload = {
      pid: '1001',
      out_trade_no: 'MOYTEST3',
      money: '15.00',
      trade_status: 'TRADE_SUCCESS',
      type: 'alipay',
    };
    const sign = signEpayParams(payload, CONFIG.key);
    expect(verifyEpayNotify({ ...payload, money: '0.01', sign }, CONFIG)).toBe(false);
  });

  it('rejects a signature minted with a different key', () => {
    const payload = { out_trade_no: 'MOYTEST4', money: '30.00', trade_status: 'TRADE_SUCCESS' };
    const sign = signEpayParams(payload, 'attacker-key');
    expect(verifyEpayNotify({ ...payload, sign }, CONFIG)).toBe(false);
  });

  it('rejects params missing required fields or sign', () => {
    expect(verifyEpayNotify({ money: '15.00' }, CONFIG)).toBe(false);
    expect(
      verifyEpayNotify({ out_trade_no: 'MOYTEST5', trade_status: 'TRADE_SUCCESS' }, CONFIG),
    ).toBe(false);
  });
});

describe('isEpayTradeSuccess', () => {
  it('accepts only TRADE_SUCCESS and handles array-typed query values', () => {
    expect(isEpayTradeSuccess({ trade_status: 'TRADE_SUCCESS' })).toBe(true);
    expect(isEpayTradeSuccess({ trade_status: ['TRADE_SUCCESS'] })).toBe(true);
    expect(isEpayTradeSuccess({ trade_status: 'WAIT_BUYER_PAY' })).toBe(false);
    expect(isEpayTradeSuccess({})).toBe(false);
  });
});

describe('generateOrderNo', () => {
  it('produces unique, prefixed, non-empty order numbers', () => {
    const seen = new Set(Array.from({ length: 200 }, () => generateOrderNo()));
    expect(seen.size).toBe(200);
    for (const orderNo of seen) {
      expect(orderNo.startsWith('MOY')).toBe(true);
      expect(orderNo).toMatch(/^[A-Z0-9]+$/);
    }
  });
});
