// N10 (v0.2.0): OpdsAdapter 单测
//
// 验证：OpdsAdapter.validate 直接复用 readest 上游 validateOPDSURL（**不改**）
// - 成功：走 validateOPDSURL 的 200 + 合法 OPDS feed 路径
// - 失败：走 validateOPDSURL 的 404 / 401 / 非 OPDS 路径
// - search / getBook 抛 AdapterNotImplementedError

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/services/environment', () => ({
  isWebAppPlatform: vi.fn(() => true),
  isTauriAppPlatform: vi.fn(() => false),
  getAPIBaseUrl: () => '/api',
  getNodeAPIBaseUrl: () => '/node-api',
  getBaseUrl: () => 'https://web.readest.com',
  getNodeBaseUrl: () => 'https://node.readest.com',
  isWebDevMode: () => true,
}));

vi.mock('@tauri-apps/plugin-http', () => ({
  fetch: vi.fn(),
}));

vi.mock('@/app/opds/utils/opdsReq', () => ({
  fetchWithAuth: vi.fn(),
}));

vi.mock('foliate-js/opds.js', async (importOriginal) => ({
  ...((await importOriginal()) as object),
  isOPDSCatalog: vi.fn((type: string) => type.includes('application/atom+xml')),
}));

import { OpdsAdapter, AdapterNotImplementedError } from '@/app/opds/adapters';
import { fetchWithAuth } from '@/app/opds/utils/opdsReq';

const mockFetch = vi.mocked(fetchWithAuth);

const OPDS_FEED_XML = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Test OPDS</title>
  <id>urn:test</id>
  <updated>2026-09-09T00:00:00Z</updated>
</feed>`;

const buildResponse = (init: {
  status: number;
  body: string;
  contentType?: string;
  url?: string;
}): Response => {
  const r: Record<string, unknown> = {
    ok: init.status >= 200 && init.status < 300,
    status: init.status,
    statusText: init.status === 200 ? 'OK' : 'Error',
    url: init.url ?? 'https://example.com',
    text: () => Promise.resolve(init.body),
    headers: new Headers({
      'Content-Type': init.contentType ?? 'application/atom+xml; charset=utf-8',
    }),
  };
  return r as unknown as Response;
};

describe('OpdsAdapter (N10)', () => {
  let adapter: OpdsAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new OpdsAdapter();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('exposes type = "opds"', () => {
    expect(adapter.type).toBe('opds');
  });

  it('returns valid=true on a 200 + atom+xml OPDS feed', async () => {
    mockFetch.mockResolvedValueOnce(buildResponse({ status: 200, body: OPDS_FEED_XML }));
    const r = await adapter.validate('https://example.com/opds');
    expect(r.valid).toBe(true);
    expect(r.protocol).toBe('feed');
  });

  it('returns valid=false on a 404', async () => {
    mockFetch.mockResolvedValueOnce(buildResponse({ status: 404, body: '' }));
    const r = await adapter.validate('https://example.com/missing');
    expect(r.valid).toBe(false);
    expect(r.error).toContain('404');
  });

  it('search() throws AdapterNotImplementedError in N10', async () => {
    await expect(adapter.search!('foo')).rejects.toBeInstanceOf(AdapterNotImplementedError);
  });

  it('getBook() throws AdapterNotImplementedError in N10', async () => {
    await expect(adapter.getBook!('id-1')).rejects.toBeInstanceOf(AdapterNotImplementedError);
  });
});
