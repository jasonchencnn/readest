// N10 (v0.2.0 书源整合): 公共适配器类型
//
// 为什么需要适配器层：
// readest 上游 CatalogManager 走 validateOPDSURL 强校验，要求 URL 返回 OPDS feed XML
// 或 OPDS 2.0 JSON。但墨阅 v0.2.0 新增的 3 个合规章（zh/en Wikisource + Internet
// Archive）返回的是各自原生协议（MediaWiki opensearch JSON / IA advancedsearch
// JSON），不是 OPDS。适配器层把"非 OPDS 协议源"在 validate 阶段分叉开，
// 让 CatalogManager 能接入多种协议源而不破坏 readest 上游的 4 个复用源路径。
//
// 范围：
// - N10 重点是 `validate` 入口（添加 catalog 时的连通性检查 + 协议识别）
// - `search` / `getBook` 接口签名定义清楚但实现留给 N12 跨源聚合搜索
// - N11a 自定义书源会走 `custom-http` 适配器，结构已预留

/**
 * 适配器类型标识。
 *
 * - `opds`                标准 OPDS 1.x / 2.0 协议（readest 上游默认）
 * - `mediawiki`           MediaWiki `action=opensearch|query&list=search` 协议
 *                         （zh.wikisource / en.wikisource 用）
 * - `archive-advancedsearch`  Internet Archive `/advancedsearch.php` 协议
 * - `custom-http`         通用 HTTP 兜底，N11a 自定义书源用（N10 仅留接口）
 */
export type AdapterType = 'opds' | 'mediawiki' | 'archive-advancedsearch' | 'custom-http';

/** 搜索/详情接口公共返回项。N10 仅定义结构，N12 实现跨源聚合。 */
export interface AdapterSearchResult {
  /** 源内唯一 id（同一源内不重复即可；跨源不保证唯一） */
  id: string;
  /** 标题（必填） */
  title: string;
  /** 作者（可选，多个用 ' / ' 拼接） */
  author?: string;
  /** 简介（可选） */
  description?: string;
  /** 封面图 URL（可选） */
  cover?: string;
  /** 所属 catalog id（与 OPDSCatalog.id 对应） */
  source: string;
  /** 走哪个适配器取的 */
  adapterType: AdapterType;
  /** 协议原生元数据（N12 合并去重时用，不进 UI） */
  raw?: unknown;
}

export interface AdapterBookDetail extends AdapterSearchResult {
  /** 全文直链 URL（epub / html / pdf / txt） */
  contentUrl?: string;
  /** 格式 */
  format?: 'epub' | 'html' | 'pdf' | 'txt';
  /** 许可证标识（SPDX / publicdomain / CC-*） */
  license?: string;
  /** ISO 639-1 语种 */
  language?: string;
}

/** validate 阶段返回结构。CatalogManager 添加 catalog 时复用现有 {valid, error} 形状。 */
export interface AdapterValidationResult {
  valid: boolean;
  error?: string;
  /** 命中协议特征字段，供上层诊断 / 调试 */
  protocol?: string;
}

/**
 * SourceAdapter 公共接口。
 *
 * N10 实现策略：每个 adapter 必须实现 `validate`（轻量连通性 + 协议特征识别），
 * `search` / `getBook` 在 N10 中可以 throw `NotImplementedError`（N12 再做）。
 */
export interface SourceAdapter {
  /** 适配器类型标识（用于 ADAPTER_REGISTRY 反查） */
  readonly type: AdapterType;

  /**
   * 轻量连通性检查。N10 用 1 次最小请求确认：
   *   1) URL 200 / 2xx
   *   2) 返回内容符合本适配器协议的最小特征（如 MediaWiki 返回 `query.search` 数组）
   *
   * @param url     源 URL（用户在添加 catalog 时填的 URL；可能带查询参数如 `?action=opensearch&...`）
   * @param opts    透传：username / password / customHeaders（来自 OPDSCatalog 同名字段）
   * @param signal  AbortSignal（10s 超时；UI 取消时用）
   */
  validate(
    url: string,
    opts?: {
      username?: string;
      password?: string;
      customHeaders?: Record<string, string>;
      signal?: AbortSignal;
    },
  ): Promise<AdapterValidationResult>;

  /**
   * 关键词搜索。N10 暂时只在适配器层实现最简形态（端到端可用即可），
   * 真正跨源合并 + 排序交给 N12 端。
   *
   * @param page 1-based 页码；省略 = 第 1 页
   */
  search?(query: string, page?: number): Promise<AdapterSearchResult[]>;

  /** 单本书详情。N10 同 search 仅占位。 */
  getBook?(id: string): Promise<AdapterBookDetail>;
}

/** 适配器层抛出的"未实现"错误，用于 N10 阶段 search/getBook 的占位。 */
export class AdapterNotImplementedError extends Error {
  constructor(adapterType: AdapterType, method: string) {
    super(`[${adapterType}] ${method}() not implemented in N10; reserved for N12`);
    this.name = 'AdapterNotImplementedError';
  }
}
