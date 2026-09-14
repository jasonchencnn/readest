// N10 (v0.2.0 书源整合): 标准 OPDS 协议适配器
//
// 这是 readest 上游默认走的那条路径。N10 把它"显式化"成 SourceAdapter
// 接口的一个实现，目的是让 CatalogManager 走统一的 adapter.validate 入口，
// 而不是直接调 validateOPDSURL（避免在 catalog-manager.tsx 里 if/else 分叉）。
//
// 实现策略：
// - validate 直接复用 readest 现有 opdsUtils.validateOPDSURL（**不改** readest 上游
//   任何 4 个复用源走的代码）
// - search / getBook 抛 AdapterNotImplementedError（N12 跨源聚合搜索再做；
//   现在 readest 上游的"我的目录"列表走的是 OPDS feed，不是 search 接口，
//   search 在 N10 范围内不需要做）
// - 如果未来想给 OPDS 源也加 search，让这个 adapter 走 OpenSearch description
//   即可（不破坏上游）。

import { validateOPDSURL } from '../utils/opdsUtils';
import type {
  AdapterValidationResult,
  SourceAdapter,
  AdapterType,
  AdapterSearchResult,
  AdapterBookDetail,
} from './types';
import { AdapterNotImplementedError } from './types';

export class OpdsAdapter implements SourceAdapter {
  readonly type: AdapterType = 'opds';

  async validate(
    url: string,
    opts?: {
      username?: string;
      password?: string;
      customHeaders?: Record<string, string>;
      signal?: AbortSignal;
    },
  ): Promise<AdapterValidationResult> {
    // 复用 readest 上游校验。validateOPDSURL 接受 web platform 标志，但这里
    // CatalogManager 已经在更高层做了 isWebAppPlatform 判断并把 useProxy 传进来；
    // OpdsAdapter 是底层 adapter，proxy 决策不在这里做，固定传 false 让上层决定。
    // （实际上 CatalogManager 调用 adapter 前已经会做 web 平台分流，详见
    // CatalogManager.validateOPDSCatalog）
    const result = await validateOPDSURL(
      url,
      opts?.username,
      opts?.password,
      false,
      opts?.customHeaders ?? {},
    );
    return {
      valid: result.isValid,
      error: result.error,
      protocol: result.data?.type,
    };
  }

  async search(_query: string, _page?: number): Promise<AdapterSearchResult[]> {
    throw new AdapterNotImplementedError(this.type, 'search');
  }

  async getBook(_id: string): Promise<AdapterBookDetail> {
    throw new AdapterNotImplementedError(this.type, 'getBook');
  }
}
