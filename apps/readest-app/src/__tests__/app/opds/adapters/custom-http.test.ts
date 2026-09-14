// N10 (v0.2.0): CustomHttpAdapter 单测
//
// 验证：
// - HTTP 200 + 白名单 Content-Type + 非空 body → valid=true
// - Content-Type 不在白名单（image / video / binary）→ valid=false
// - 空 body → valid=false
// - HTTP 4xx/5xx → valid=false
//
// N10 关键合规约束（commit 时要 grep 复检）：
// - 此适配器**不**接任何盗版 / 侵权源（具体禁源清单见墨阅项目规则 v0.2.0
//   第五节合规红线 + ADR-2026-09-09-04；白名单机制只是"协议层可解析"，**不**
//   做内容合规审核；N14 范围）
// - 此适配器**不**注入任意 HTML / 脚本渲染（"内嵌浏览器"是 N10 禁区）

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

import { CustomHttpAdapter, AdapterNotImplementedError } from '@/app/opds/adapters';
import { fetchWithAuth } from '@/app/opds/utils/opdsReq';

const mockFetch = vi.mocked(fetchWithAuth);

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

describe('CustomHttpAdapter (N10)', () => {
  let adapter: CustomHttpAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new CustomHttpAdapter();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('exposes type = "custom-http"', () => {
    expect(adapter.type).toBe('custom-http');
  });

  it('returns valid=true on 200 + text/html + non-empty body', async () => {
    mockFetch.mockResolvedValueOnce(
      buildResponse({ status: 200, body: '<html>some content</html>' }),
    );
    const r = await adapter.validate('https://example.com/feed.html');
    expect(r.valid).toBe(true);
    expect(r.protocol).toBe('custom-http');
  });

  it('returns valid=false when Content-Type is image/png (binary, not in whitelist)', async () => {
    mockFetch.mockResolvedValueOnce(
      buildResponse({ status: 200, body: 'binarydata', contentType: 'image/png' }),
    );
    const r = await adapter.validate('https://example.com/cover.png');
    expect(r.valid).toBe(false);
    expect(r.error).toContain('Unsupported Content-Type');
  });

  it('returns valid=false on empty body', async () => {
    mockFetch.mockResolvedValueOnce(buildResponse({ status: 200, body: '   ' }));
    const r = await adapter.validate('https://example.com/empty.html');
    expect(r.valid).toBe(false);
    expect(r.error).toContain('Empty response body');
  });

  it('returns valid=false on 401', async () => {
    mockFetch.mockResolvedValueOnce(buildResponse({ status: 401, body: '' }));
    const r = await adapter.validate('https://example.com/protected');
    expect(r.valid).toBe(false);
    expect(r.error).toContain('401');
  });

  it('accepts custom Content-Type whitelist', async () => {
    const narrow = new CustomHttpAdapter({ acceptContentTypes: ['application/pdf'] });
    mockFetch.mockResolvedValueOnce(
      buildResponse({ status: 200, body: '%PDF-1.4...', contentType: 'application/pdf' }),
    );
    const r = await narrow.validate('https://example.com/book.pdf');
    expect(r.valid).toBe(true);
  });

  it('search() throws AdapterNotImplementedError in N10', async () => {
    await expect(adapter.search!('foo')).rejects.toBeInstanceOf(AdapterNotImplementedError);
  });
});
