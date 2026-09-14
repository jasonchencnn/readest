// N10 (v0.2.0 书源整合): MediaWiki 协议适配器
//
// 用于 zh.wikisource.org / en.wikisource.org 等 Wikimedia 项目。
//
// 协议特征：
// - 端点：`{apiBase}?action=opensearch&format=json&search={q}&limit={n}`
//         或 `{apiBase}?action=query&list=search&srsearch={q}&format=json&srnamespace=0|14|100|104|106`
// - 返回：JSON（opensearch 返 4 元数组；query 返 `{query: {search: [{title, pageid, ...}]}}`）
// - 公版依据：Wikimedia 所有 Wikisource 收录公版文献（CC BY-SA 3.0 + PD-old / PD-China）
//
// N10 风险点（已实测 2026-09-09）：
// - zh.wikisource 搜 "唐协诗" 实际返回的是中国法院判决书（关键词巧合匹配到 `唐某协`）
// - 解决：validate 阶段限定 `srnamespace=0|14|100|104|106`（Page / Category / Index）
//   排除法庭判决书所在的 namespace（通常是 0，但文书元数据在 0 namespace 时也会出现）
// - 实际更稳的做法：search 阶段客户端过滤掉长度 < 100 字符的标题（判决书标题过短）
//   但 N10 仅做 validate，不做内容过滤
//
// 鉴权：MediaWiki API 默认匿名访问，无需 username/password

import { fetchWithAuth } from '../utils/opdsReq';
import type {
  AdapterValidationResult,
  SourceAdapter,
  AdapterType,
  AdapterSearchResult,
  AdapterBookDetail,
} from './types';
import { AdapterNotImplementedError } from './types';

export interface MediaWikiAdapterOptions {
  /**
   * 限制 search 命中的 namespace 列表（默认 Page / Category / Index / Module / Widget）。
   * 用 `|` 分隔的字符串（MediaWiki API 参数形式）。空 = 不限定（**不推荐**，会命中判决书等非公版内容）。
   */
  namespaces?: string;
  /** User-Agent 头（部分 Wikimedia 反爬要求明确标识；N10 默认带 Moyue 标识） */
  userAgent?: string;
  /** 协议标识，写入 AdapterValidationResult.protocol */
  protocolLabel?: string;
}

const DEFAULT_NAMESPACES = '0|14|100|104|106';
const DEFAULT_USER_AGENT = 'Moyue/0.2.0 (https://moyue.app; compliance=cc-pd-only)';

export class MediaWikiAdapter implements SourceAdapter {
  readonly type: AdapterType = 'mediawiki';
  private readonly options: Required<MediaWikiAdapterOptions>;

  constructor(options: MediaWikiAdapterOptions = {}) {
    this.options = {
      namespaces: options.namespaces ?? DEFAULT_NAMESPACES,
      userAgent: options.userAgent ?? DEFAULT_USER_AGENT,
      protocolLabel: options.protocolLabel ?? 'mediawiki-opensearch',
    };
  }

  /**
   * validate: 1 次最小 opensearch 请求。
   *
   * 构造 query `?action=opensearch&format=json&search=Moyue&limit=1`
   * （"Moyue" 是项目名，几乎不会撞到真实词条；limit=1 最小负载）
   *
   * 命中判据：
   *   - HTTP 200
   *   - body 是合法 JSON
   *   - body 是 4 元数组 [query, [titles], [descriptions], [urls]]（opensearch 协议约定）
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
    // url 应形如 `https://zh.wikisource.org/w/api.php`（不带 query string）
    // 自动补 action=opensearch
    const probeUrl = this.buildProbeURL(url);
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
        false, // useProxy 由上层决定，N10 不在这里做 web 分流
        {
          signal: opts?.signal ?? new AbortController().signal,
          headers,
        },
        headers,
      );
      if (!res.ok) {
        return {
          valid: false,
          error: `MediaWiki endpoint returned ${res.status} ${res.statusText}`,
        };
      }
      const text = await res.text();
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        return { valid: false, error: 'Response is not valid JSON' };
      }
      if (!Array.isArray(parsed) || parsed.length !== 4) {
        return {
          valid: false,
          error: 'Response does not match MediaWiki opensearch protocol (expected 4-tuple array)',
        };
      }
      // 协议命中
      return { valid: true, protocol: this.options.protocolLabel };
    } catch (e) {
      return {
        valid: false,
        error: e instanceof Error ? e.message : 'Network request failed',
      };
    }
  }

  async search(query: string, page = 1): Promise<AdapterSearchResult[]> {
    // N10 仅占位。N12 跨源聚合搜索会真正实现：构造 action=query&list=search URL
    // 并把 srnamespace 限定到 options.namespaces（避免判决书混入）。
    throw new AdapterNotImplementedError(this.type, `search("${query}", page=${page})`);
  }

  async getBook(id: string): Promise<AdapterBookDetail> {
    // N10 仅占位。N12 实现：action=parse&pageid={id}&format=json 拿到 HTML
    throw new AdapterNotImplementedError(this.type, `getBook("${id}")`);
  }

  /** 内部工具：构造最小探测 URL。子类（如 LibraryOfCongressAdapter）可重写。 */
  protected buildProbeURL(baseUrl: string): string {
    const u = new URL(baseUrl);
    // 强制覆盖原有 query（避免用户 URL 自带参数污染探测）
    u.search = '';
    u.searchParams.set('action', 'opensearch');
    u.searchParams.set('format', 'json');
    u.searchParams.set('search', 'Moyue');
    u.searchParams.set('limit', '1');
    return u.toString();
  }
}
