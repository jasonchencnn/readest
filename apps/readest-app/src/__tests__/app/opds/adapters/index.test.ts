// N10 (v0.2.0): adapters/index 单测
//
// 验证：
// - ADAPTER_REGISTRY 4 个键都有对应单例
// - getAdapterForCatalog 按 adapterType 字段正确分叉
// - 缺 adapterType / 未知类型 → 回退到 opds 适配器（不破坏 readest 上游行为）
// - validateCatalogWithAdapter 走分叉：opds 路径透传 data 字段，非 opds 路径不传 data

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

vi.mock('foliate-js/opds.js', async (importOriginal) => ({
  ...((await importOriginal()) as object),
  isOPDSCatalog: vi.fn((type: string) => type.includes('application/atom+xml')),
}));

import {
  ADAPTER_REGISTRY,
  getAdapterForCatalog,
  validateCatalogWithAdapter,
  OpdsAdapter,
  MediaWikiAdapter,
  ArchiveAdvancedSearchAdapter,
  CustomHttpAdapter,
} from '@/app/opds/adapters';
import { fetchWithAuth } from '@/app/opds/utils/opdsReq';

const mockFetch = vi.mocked(fetchWithAuth);

const OPDS_FEED_XML = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom"><title>X</title><id>x</id><updated>2026-01-01</updated></feed>`;

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

describe('adapters/index (N10)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('exposes all 4 adapter types in ADAPTER_REGISTRY', () => {
    expect(ADAPTER_REGISTRY.opds).toBeInstanceOf(OpdsAdapter);
    expect(ADAPTER_REGISTRY.mediawiki).toBeInstanceOf(MediaWikiAdapter);
    expect(ADAPTER_REGISTRY['archive-advancedsearch']).toBeInstanceOf(ArchiveAdvancedSearchAdapter);
    expect(ADAPTER_REGISTRY['custom-http']).toBeInstanceOf(CustomHttpAdapter);
  });

  it('getAdapterForCatalog returns opds adapter when adapterType is missing', () => {
    const a = getAdapterForCatalog({});
    expect(a).toBe(ADAPTER_REGISTRY.opds);
  });

  it('getAdapterForCatalog returns the matching adapter for adapterType=mediawiki', () => {
    const a = getAdapterForCatalog({ adapterType: 'mediawiki' });
    expect(a).toBe(ADAPTER_REGISTRY.mediawiki);
  });

  it('getAdapterForCatalog falls back to opds adapter for unknown adapterType', () => {
    // Cast to the literal union so the test compiles, while the runtime value
    // is intentionally outside the registry to exercise the fallback path.
    const a = getAdapterForCatalog({ adapterType: 'something-not-real' as 'opds' });
    expect(a).toBe(ADAPTER_REGISTRY.opds);
  });

  it('validateCatalogWithAdapter: adapterType=opds returns data field (legacy contract)', async () => {
    mockFetch.mockResolvedValueOnce(
      buildResponse({ status: 200, body: OPDS_FEED_XML, contentType: 'application/atom+xml' }),
    );
    const r = await validateCatalogWithAdapter(
      { url: 'https://example.com/opds', adapterType: 'opds' },
      false,
    );
    expect(r.isValid).toBe(true);
    expect(r.data).toBeDefined();
    expect(r.data?.type).toBe('feed');
  });

  it('validateCatalogWithAdapter: adapterType=mediawiki does NOT return data field', async () => {
    mockFetch.mockResolvedValueOnce(
      buildResponse({
        status: 200,
        body: JSON.stringify(['Moyue', ['T'], [], []]),
        contentType: 'application/json',
        url: 'https://zh.wikisource.org/w/api.php?...',
      }),
    );
    const r = await validateCatalogWithAdapter(
      { url: 'https://zh.wikisource.org/w/api.php', adapterType: 'mediawiki' },
      false,
    );
    expect(r.isValid).toBe(true);
    expect(r.data).toBeUndefined();
    expect(r.protocol).toBe('mediawiki-opensearch');
  });

  it('validateCatalogWithAdapter: missing adapterType routes to opds', async () => {
    mockFetch.mockResolvedValueOnce(
      buildResponse({ status: 200, body: OPDS_FEED_XML, contentType: 'application/atom+xml' }),
    );
    const r = await validateCatalogWithAdapter({ url: 'https://example.com/opds' }, false);
    expect(r.isValid).toBe(true);
    expect(r.data?.type).toBe('feed');
  });
});
