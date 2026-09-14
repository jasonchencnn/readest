// N10 (v0.2.0 书源整合): Internet Archive advancedsearch 协议适配器
//
// 用于 archive.org 公版书籍检索。
//
// 协议特征：
// - 端点：`https://archive.org/advancedsearch.php?q=...&output=json&rows=...`
// - 返回：JSON `{response: {numFound: int, start: int, docs: [...]}}`
// - 公版依据：构造 query 时固定带 `licenseurl:(*publicdomain*)` 过滤公版，
//   **不带这个过滤的 query 视为无效**（避免误接侵权内容）
//
// N10 实测（2026-09-09）：
// - numFound = 3,372,173（公版书籍量级）
// - docs[] 字段：btih / collection / creator / date / description / downloads / format / identifier / title
// - 关键标识字段：`identifier`（作为 AdapterSearchResult.id）
//
// 鉴权：匿名访问，无需 username/password

import { fetchWithAuth } from '../utils/opdsReq';
import type {
  AdapterValidationResult,
  SourceAdapter,
  AdapterType,
  AdapterSearchResult,
  AdapterBookDetail,
} from './types';
import { AdapterNotImplementedError } from './types';

export interface ArchiveAdvancedSearchAdapterOptions {
  /**
   * 强制公版过滤的 license 关键字。默认 `*publicdomain*`。
   * 改这个字段需要明确原因（不能去掉）—— 详见 N10 ADR。
   */
  licenseFilter?: string;
  /**
   * mediatype 过滤。默认 `texts`（文字书）。
   * 改成 `movies` / `audio` 等需要 N14 合规审核先确认范围。
   */
  mediatype?: string;
  /** User-Agent */
  userAgent?: string;
}

const DEFAULT_LICENSE_FILTER = '*publicdomain*';
const DEFAULT_MEDIATYPE = 'texts';
const DEFAULT_USER_AGENT = 'Moyue/0.2.0 (https://moyue.app; compliance=cc-pd-only)';

export class ArchiveAdvancedSearchAdapter implements SourceAdapter {
  readonly type: AdapterType = 'archive-advancedsearch';
  private readonly options: Required<ArchiveAdvancedSearchAdapterOptions>;

  constructor(options: ArchiveAdvancedSearchAdapterOptions = {}) {
    this.options = {
      licenseFilter: options.licenseFilter ?? DEFAULT_LICENSE_FILTER,
      mediatype: options.mediatype ?? DEFAULT_MEDIATYPE,
      userAgent: options.userAgent ?? DEFAULT_USER_AGENT,
    };
  }

  /**
   * validate: 1 次最小 advancedsearch 请求。
   *
   * 构造 query：`mediatype:(texts) AND licenseurl:(*publicdomain*)` + rows=1
   * 命中判据：HTTP 200 + body 是 JSON + 有 `response.numFound`（>=0 数字）
   */
  async validate(
    url: string,
    opts?: {
      username?: string;
      password?: string;
      customHeaders?: Record<string, string>;
      signal?: AbortSignal;
    },
  ): Promise<AdapterValidationResult> {
    const probeUrl = this.buildProbeURL(url, 'Moyue', 1);
    const headers: Record<string, string> = {
      'User-Agent': this.options.userAgent,
      Accept: 'application/json',
      ...opts?.customHeaders,
    };

    try {
      const res = await fetchWithAuth(
        probeUrl,
        opts?.username,
        opts?.password,
        false,
        {
          signal: opts?.signal ?? new AbortController().signal,
          headers,
        },
        headers,
      );
      if (!res.ok) {
        return {
          valid: false,
          error: `Internet Archive returned ${res.status} ${res.statusText}`,
        };
      }
      const text = await res.text();
      let parsed: Record<string, unknown>;
      try {
        const v: unknown = JSON.parse(text);
        if (typeof v !== 'object' || v === null) {
          return { valid: false, error: 'Response is not a JSON object' };
        }
        parsed = v as Record<string, unknown>;
      } catch {
        return { valid: false, error: 'Response is not valid JSON' };
      }
      const response = parsed['response'];
      if (
        typeof response !== 'object' ||
        response === null ||
        typeof (response as Record<string, unknown>)['numFound'] !== 'number'
      ) {
        return {
          valid: false,
          error:
            'Response does not match Internet Archive advancedsearch protocol (missing response.numFound)',
        };
      }
      return {
        valid: true,
        protocol: 'archive-advancedsearch',
      };
    } catch (e) {
      return {
        valid: false,
        error: e instanceof Error ? e.message : 'Network request failed',
      };
    }
  }

  async search(query: string, page = 1): Promise<AdapterSearchResult[]> {
    // N10 占位。N12 真正实现：用 buildProbeURL 构造完整 query，分页 10/页
    // 客户端提取 docs[].title / creator / description / identifier
    throw new AdapterNotImplementedError(this.type, `search("${query}", page=${page})`);
  }

  async getBook(id: string): Promise<AdapterBookDetail> {
    // N10 占位。N12 真正实现：https://archive.org/metadata/{id} 拿详细元数据 + 直链
    throw new AdapterNotImplementedError(this.type, `getBook("${id}")`);
  }

  /**
   * 构造 advancedsearch URL。子类可重写。
   *
   * 注意：`q` 参数是 IA 自己的 query DSL（lucene-ish），跟 URL query string 不同。
   * 实际是 `q=mediatype:(texts) AND licenseurl:(*publicdomain*) AND <user-query>`
   * N10 不实现 search 逻辑，所以这个函数在 validate 阶段也用不上 user query
   * （用空字符串或 'Moyue' 占位探测）。search 阶段再扩展。
   */
  protected buildProbeURL(baseUrl: string, userQuery: string, rows: number): string {
    const u = new URL(baseUrl);
    u.search = '';
    const safeQuery = userQuery.trim() || '*';
    const iaQuery = `mediatype:(${this.options.mediatype}) AND licenseurl:(${this.options.licenseFilter}) AND (${safeQuery})`;
    u.searchParams.set('q', iaQuery);
    u.searchParams.set('output', 'json');
    u.searchParams.set('rows', String(rows));
    return u.toString();
  }
}
