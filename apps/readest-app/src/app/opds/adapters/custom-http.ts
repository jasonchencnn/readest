// N10 (v0.2.0 书源整合): 兜底 Custom HTTP 适配器
//
// N10 范围内仅做"接得住"，不做"做得好"：
// - validate: HTTP 200 + 任何可读 body（不限协议），给后续 N11a 解析器留余地
// - search / getBook: N10 抛 AdapterNotImplementedError（N11a 实现 Legado JSON
//   子集 + XPath/JSONPath/CSS 解析器后会真正接上）
//
// 适用场景（未来 N11a）：
// - 用户提交一个自定义 URL + 解析模板（XPath / JSONPath / CSS selector）
// - 墨阅按模板抽取书名 / 作者 / 简介 / 直链
// - validate 阶段只确认"URL 通 + 返回 HTML/JSON/TEXT 任意可读 body"
//
// N10 关键约束：
// - **不允许**用此适配器接任何盗版 / 侵权源（具体清单见墨阅项目规则 v0.2.0
//   第五节合规红线 + ADR-2026-09-09-04）
// - **不允许**此适配器注入任意 HTML / 脚本（"内嵌浏览器 / 任意 URL 渲染"
//   是 N10 禁区，详见 ADR-2026-09-09-04）
// - validate 阶段**不**做内容审核（合规审核是 N14 范围）

import { fetchWithAuth } from '../utils/opdsReq';
import type {
  AdapterValidationResult,
  SourceAdapter,
  AdapterType,
  AdapterSearchResult,
  AdapterBookDetail,
} from './types';
import { AdapterNotImplementedError } from './types';

export interface CustomHttpAdapterOptions {
  /** 期望的 Content-Type 列表（默认接受任何 text/* 或 application/*） */
  acceptContentTypes?: string[];
  /** User-Agent */
  userAgent?: string;
}

const DEFAULT_USER_AGENT = 'Moyue/0.2.0 (https://moyue.app; compliance=cc-pd-only)';

export class CustomHttpAdapter implements SourceAdapter {
  readonly type: AdapterType = 'custom-http';
  private readonly options: Required<CustomHttpAdapterOptions>;

  constructor(options: CustomHttpAdapterOptions = {}) {
    this.options = {
      acceptContentTypes: options.acceptContentTypes ?? [
        'text/html',
        'text/plain',
        'application/json',
        'application/xml',
        'application/atom+xml',
        'application/opds+json',
        'application/opensearchdescription+xml',
      ],
      userAgent: options.userAgent ?? DEFAULT_USER_AGENT,
    };
  }

  /**
   * validate: HTTP HEAD/GET + Content-Type 校验。
   *
   * 命中判据：
   *   - HTTP 200/2xx
   *   - Content-Type 在白名单内（避免接二进制垃圾 / 视频流等）
   *   - body 长度 > 0（空 body 视为无效）
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
    const headers: Record<string, string> = {
      'User-Agent': this.options.userAgent,
      ...opts?.customHeaders,
    };

    try {
      const res = await fetchWithAuth(
        url,
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
          error: `HTTP ${res.status} ${res.statusText}`,
        };
      }
      const contentType = (res.headers.get('Content-Type') || '').toLowerCase();
      // 检查 content-type 命中白名单
      const matched = this.options.acceptContentTypes.some((t) =>
        contentType.includes(t.toLowerCase()),
      );
      if (!matched) {
        return {
          valid: false,
          error: `Unsupported Content-Type: ${contentType || '(empty)'}`,
        };
      }
      // 读 body 确认非空
      const text = await res.text();
      if (!text || text.trim().length === 0) {
        return { valid: false, error: 'Empty response body' };
      }
      return { valid: true, protocol: 'custom-http' };
    } catch (e) {
      return {
        valid: false,
        error: e instanceof Error ? e.message : 'Network request failed',
      };
    }
  }

  async search(_query: string, _page?: number): Promise<AdapterSearchResult[]> {
    // N10 占位。N11a 实现 Legado JSON 子集 + XPath/JSONPath/CSS 解析器后会真正接上
    throw new AdapterNotImplementedError(this.type, 'search');
  }

  async getBook(_id: string): Promise<AdapterBookDetail> {
    throw new AdapterNotImplementedError(this.type, 'getBook');
  }
}
