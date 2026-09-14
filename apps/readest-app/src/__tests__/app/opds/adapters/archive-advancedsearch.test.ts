// N10 (v0.2.0): ArchiveAdvancedSearchAdapter 单测
//
// 验证：
// - validate 构造的 query 强制带 licenseurl:(*publicdomain*) 公版过滤
// - 命中 response.numFound → valid=true
// - 缺 response.numFound / 非 JSON / 5xx → valid=false
// - 默认 mediatype=texts

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

import { ArchiveAdvancedSearchAdapter, AdapterNotImplementedError } from '@/app/opds/adapters';
import { fetchWithAuth } from '@/app/opds/utils/opdsReq';

const mockFetch = vi.mocked(fetchWithAuth);

const IA_OK = JSON.stringify({
  responseHeader: { status: 0, QTime: 5 },
  response: {
    numFound: 3372173,
    start: 0,
    docs: [{ identifier: 'sample-public-domain-book', title: 'Sample PD Book' }],
  },
});

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

describe('ArchiveAdvancedSearchAdapter (N10)', () => {
  let adapter: ArchiveAdvancedSearchAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new ArchiveAdvancedSearchAdapter();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('exposes type = "archive-advancedsearch"', () => {
    expect(adapter.type).toBe('archive-advancedsearch');
  });

  it('builds a probe URL with mediatype:(texts) AND licenseurl:(*publicdomain*)', async () => {
    mockFetch.mockResolvedValueOnce(buildResponse({ status: 200, body: IA_OK }));
    await adapter.validate('https://archive.org/advancedsearch.php');

    const calledUrl = mockFetch.mock.calls[0]![0] as string;
    const u = new URL(calledUrl);
    expect(u.origin).toBe('https://archive.org');
    expect(u.pathname).toBe('/advancedsearch.php');
    expect(u.searchParams.get('output')).toBe('json');
    expect(u.searchParams.get('rows')).toBe('1');
    const q = u.searchParams.get('q') || '';
    // 公版过滤是 N10 合规硬要求，**必须**命中
    expect(q).toContain('licenseurl:(*publicdomain*)');
    expect(q).toContain('mediatype:(texts)');
  });

  it('returns valid=true on response.numFound', async () => {
    mockFetch.mockResolvedValueOnce(buildResponse({ status: 200, body: IA_OK }));
    const r = await adapter.validate('https://archive.org/advancedsearch.php');
    expect(r.valid).toBe(true);
    expect(r.protocol).toBe('archive-advancedsearch');
  });

  it('returns valid=false when response lacks response.numFound', async () => {
    const broken = JSON.stringify({ response: { docs: [] } });
    mockFetch.mockResolvedValueOnce(buildResponse({ status: 200, body: broken }));
    const r = await adapter.validate('https://archive.org/advancedsearch.php');
    expect(r.valid).toBe(false);
    expect(r.error).toContain('numFound');
  });

  it('returns valid=false on 5xx', async () => {
    mockFetch.mockResolvedValueOnce(buildResponse({ status: 502, body: '' }));
    const r = await adapter.validate('https://archive.org/advancedsearch.php');
    expect(r.valid).toBe(false);
    expect(r.error).toContain('502');
  });

  it('search() throws AdapterNotImplementedError in N10', async () => {
    await expect(adapter.search!('Pride and Prejudice')).rejects.toBeInstanceOf(
      AdapterNotImplementedError,
    );
  });
});
