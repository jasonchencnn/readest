// N10 (v0.2.0): MediaWikiAdapter 单测
//
// 验证：
// - validate 构造的 URL 形如 `?action=opensearch&format=json&search=Moyue&limit=1`
// - 命中 4 元组 JSON → valid=true
// - 非 4 元组 / 非 JSON → valid=false
// - HTTP 错误 → valid=false
// - 不带 srnamespace 暴露给 search（search 在 N10 抛 NotImplemented）

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/services/environment', () => ({
  isWebAppPlatform: () => true,
  isTauriAppPlatform: () => false,
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

import { MediaWikiAdapter, AdapterNotImplementedError } from '@/app/opds/adapters';
import { fetchWithAuth } from '@/app/opds/utils/opdsReq';

const mockFetch = vi.mocked(fetchWithAuth);

const OPENSEARCH_OK = JSON.stringify([
  'Moyue', // query
  ['Moyue (1987 film)'], // titles
  ['1987 Hong Kong film'], // descriptions
  ['https://en.wikipedia.org/wiki/Moyue_(1987_film)'], // urls
]);

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

describe('MediaWikiAdapter (N10)', () => {
  let adapter: MediaWikiAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new MediaWikiAdapter();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('exposes type = "mediawiki"', () => {
    expect(adapter.type).toBe('mediawiki');
  });

  it('builds a probe URL with action=opensearch&format=json&limit=1', async () => {
    mockFetch.mockResolvedValueOnce(buildResponse({ status: 200, body: OPENSEARCH_OK }));
    await adapter.validate('https://zh.wikisource.org/w/api.php');

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const calledUrl = mockFetch.mock.calls[0]![0] as string;
    const u = new URL(calledUrl);
    expect(u.origin).toBe('https://zh.wikisource.org');
    expect(u.pathname).toBe('/w/api.php');
    expect(u.searchParams.get('action')).toBe('opensearch');
    expect(u.searchParams.get('format')).toBe('json');
    expect(u.searchParams.get('limit')).toBe('1');
  });

  it('returns valid=true on a 4-tuple opensearch JSON', async () => {
    mockFetch.mockResolvedValueOnce(buildResponse({ status: 200, body: OPENSEARCH_OK }));
    const r = await adapter.validate('https://zh.wikisource.org/w/api.php');
    expect(r.valid).toBe(true);
    expect(r.protocol).toBe('mediawiki-opensearch');
  });

  it('returns valid=false when response is not a 4-tuple array', async () => {
    mockFetch.mockResolvedValueOnce(
      buildResponse({ status: 200, body: JSON.stringify({ error: 'bad' }) }),
    );
    const r = await adapter.validate('https://en.wikipedia.org/w/api.php');
    expect(r.valid).toBe(false);
    expect(r.error).toContain('4-tuple');
  });

  it('returns valid=false when response is not JSON', async () => {
    mockFetch.mockResolvedValueOnce(
      buildResponse({ status: 200, body: '<html>not json</html>', contentType: 'text/html' }),
    );
    const r = await adapter.validate('https://en.wikipedia.org/w/api.php');
    expect(r.valid).toBe(false);
    expect(r.error).toContain('not valid JSON');
  });

  it('returns valid=false on a 5xx HTTP status', async () => {
    mockFetch.mockResolvedValueOnce(buildResponse({ status: 503, body: '' }));
    const r = await adapter.validate('https://en.wikipedia.org/w/api.php');
    expect(r.valid).toBe(false);
    expect(r.error).toContain('503');
  });

  it('search() throws AdapterNotImplementedError in N10', async () => {
    await expect(adapter.search!('唐诗')).rejects.toBeInstanceOf(AdapterNotImplementedError);
  });
});
