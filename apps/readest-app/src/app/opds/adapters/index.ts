// N10 (v0.2.0 书源整合): 适配器层统一入口
//
// 提供：
// - 单例 ADAPTER_REGISTRY：按 AdapterType 取对应适配器实例
// - getAdapterForCatalog(catalog): 便捷方法，按 OPDSCatalog.adapterType 字段取适配器
// - validateCatalogWithAdapter(catalog): 便捷方法，做"非 OPDS 源走 adapter / OPDS 源走 validateOPDSURL" 的分叉
//
// 关键设计：
// - `getAdapterForCatalog` 把 CatalogManager 的 if/else 分叉下沉到这里
//   让 CatalogManager 不用感知 4 种 adapter 的差异
// - `validateCatalogWithAdapter` 返回跟 `validateOPDSURL` 同形状的结果
//   让 CatalogManager 现有的 `validateOPDSCatalog` 调用点**不用改 return 字段**

import { OpdsAdapter } from './opds';
import { MediaWikiAdapter } from './mediawiki';
import { ArchiveAdvancedSearchAdapter } from './archive-advancedsearch';
import { CustomHttpAdapter } from './custom-http';
import { validateOPDSURL } from '../utils/opdsUtils';
import type { AdapterType, SourceAdapter, AdapterValidationResult } from './types';
import type { OPDSCatalog } from '@/types/opds';

const _opds = new OpdsAdapter();
const _mediawiki = new MediaWikiAdapter();
const _archive = new ArchiveAdvancedSearchAdapter();
const _custom = new CustomHttpAdapter();

/** 按 AdapterType 取适配器单例 */
export const ADAPTER_REGISTRY: Record<AdapterType, SourceAdapter> = {
  opds: _opds,
  mediawiki: _mediawiki,
  'archive-advancedsearch': _archive,
  'custom-http': _custom,
};

/**
 * 便捷方法：按 catalog.adapterType 取适配器。
 *
 * - 若 catalog.adapterType 缺失，默认 'opds'（与 readest 上游完全一致，不破坏
 *   现有 4 个复用源路径）
 * - 若 catalog.adapterType 不在 ADAPTER_REGISTRY，回退到 opds
 */
export const getAdapterForCatalog = (catalog: Pick<OPDSCatalog, 'adapterType'>): SourceAdapter => {
  const t = catalog.adapterType ?? 'opds';
  return ADAPTER_REGISTRY[t] ?? _opds;
};

/**
 * 便捷方法：分叉入口。
 *
 * - catalog.adapterType = 'opds' 或缺失 → 走 readest 上游 validateOPDSURL
 *   （保留所有现有 web proxy / Digest auth / OPDS 协议处理逻辑，**零修改**）
 * - 其他 adapterType → 走 ADAPTER_REGISTRY[t].validate()
 *
 * 返回值与 validateOPDSURL 同形状：{ isValid, error, data? }，让 CatalogManager
 * 现有调用点不用改。
 *
 * 为什么不直接返回 AdapterValidationResult：
 * 答：CatalogManager.tsx 当前用的是 `validateOPDSURL` 的返回形状（带 `data` 字段
 * 含解析后的 doc/text），不能因为适配器层分叉就打破这条契约。opds 路径走原
 * 路径返回完整 data；非 opds 路径只返回 { isValid, error }，不返回 data
 * （非 OPDS 源没有"feed doc"概念）。
 */
export interface UnifiedValidationResult {
  isValid: boolean;
  error?: string;
  data?: {
    type: 'feed' | 'entry' | 'opensearch' | 'html';
    doc: Document;
    text: string;
    responseURL: string;
  };
  protocol?: string;
}

export const validateCatalogWithAdapter = async (
  catalog: Pick<OPDSCatalog, 'url' | 'username' | 'password' | 'customHeaders' | 'adapterType'>,
  useProxy: boolean,
): Promise<UnifiedValidationResult> => {
  const adapterType = catalog.adapterType ?? 'opds';

  if (adapterType === 'opds') {
    // 直接走 readest 上游（保留所有 proxy / auth / OPDS 解析逻辑）
    const r = await validateOPDSURL(
      catalog.url,
      catalog.username,
      catalog.password,
      useProxy,
      catalog.customHeaders ?? {},
    );
    return {
      isValid: r.isValid,
      error: r.error,
      data: r.data,
    };
  }

  // 非 OPDS：走 adapter.validate
  const adapter = ADAPTER_REGISTRY[adapterType];
  if (!adapter) {
    return { isValid: false, error: `Unknown adapter type: ${adapterType}` };
  }
  const r: AdapterValidationResult = await adapter.validate(catalog.url, {
    username: catalog.username,
    password: catalog.password,
    customHeaders: catalog.customHeaders,
  });
  return {
    isValid: r.valid,
    error: r.error,
    protocol: r.protocol,
  };
};

export type {
  SourceAdapter,
  AdapterType,
  AdapterValidationResult,
  AdapterSearchResult,
  AdapterBookDetail,
} from './types';
export { AdapterNotImplementedError } from './types';
export { OpdsAdapter } from './opds';
export { MediaWikiAdapter } from './mediawiki';
export { ArchiveAdvancedSearchAdapter } from './archive-advancedsearch';
export { CustomHttpAdapter } from './custom-http';
