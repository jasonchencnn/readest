// SYMBOL must be re-exported from foliate-js so consumers read the same Symbol
// instances that the parser writes onto publication metadata. Declaring fresh
// `Symbol('content')` calls here would produce different identities, and
// `metadata[SYMBOL.CONTENT]` would silently return undefined — losing the book
// description for OPDS 1.x feeds where it lives in <summary>.
import { SYMBOL as FOLIATE_SYMBOL } from 'foliate-js/opds.js';

// N10 (v0.2.0 书源整合): AdapterType 通过 OPDSCatalog.adapterType 字段标识
// 走哪个 adapter。留在这里避免循环 import（adapters/index.ts 已经从 '@/types/opds'
// 导入 OPDSCatalog）。AdapterType 字面量用 string 兼容，避免在 types/opds.ts
// 引入新模块依赖；运行时由 adapters/index.ts 做字符串字面量校验。
export type AdapterTypeLiteral = 'opds' | 'mediawiki' | 'archive-advancedsearch' | 'custom-http';

export const REL = {
  ACQ: 'http://opds-spec.org/acquisition',
  FACET: 'http://opds-spec.org/facet',
  GROUP: 'http://opds-spec.org/group',
  COVER: ['http://opds-spec.org/image', 'http://opds-spec.org/cover', 'x-stanza-cover-image'],
  THUMBNAIL: [
    'http://opds-spec.org/image/thumbnail',
    'http://opds-spec.org/thumbnail',
    'x-stanza-cover-image-thumbnail',
  ],
  STREAM: 'http://vaemendis.net/opds-pse/stream',
} as const;

export const SYMBOL = FOLIATE_SYMBOL as { SUMMARY: symbol; CONTENT: symbol };

export interface OPDSCatalog {
  id: string;
  name: string;
  url: string;
  description?: string;
  disabled?: boolean;
  icon?: string;
  username?: string;
  password?: string;
  customHeaders?: Record<string, string>;
  autoDownload?: boolean;
  /**
   * Stable cross-device identifier derived from the URL. Used as the
   * replica_id so two devices that import the same OPDS URL converge to a
   * single row instead of duplicating. Absent on legacy entries imported
   * before replica sync shipped — they get backfilled at next save.
   */
  contentId?: string;
  /** Wall-clock ms of first import, used for ordering. */
  addedAt?: number;
  /**
   * Manual display position, stamped 0..n-1 across the visible list every
   * time the user drags a card. Absent until the first reorder — those
   * entries keep the legacy `addedAt`-descending order and sort above the
   * stamped ones, so a freshly added catalog still appears at the top.
   */
  sortOrder?: number;
  /** Soft-delete timestamp; non-null entries are hidden from the UI. */
  deletedAt?: number;
  /** Reincarnation token (re-import after server tombstone). */
  reincarnation?: string;
  /**
   * Per-field cipher fingerprint of the last successfully-decrypted
   * pull. Maps `fieldName` → cipher's `c` (base64 ciphertext). The
   * orchestrator compares the row's incoming cipher against this on
   * each pull: same → skip the passphrase prompt (we already have
   * the plaintext); different → prompt to re-decrypt (rotation or
   * value change on another device). Sync-only metadata; never
   * surfaced in the OPDS UI.
   */
  lastSeenCipher?: Record<string, string>;
  /**
   * N10 (v0.2.0 书源整合): 标识该 catalog 走哪个 adapter。
   * 缺省 = 'opds'，与 readest 上游行为完全一致（4 个复用源 / 自定义 URL 都走 OPDS）。
   * 仅当 catalog 是非 OPDS 协议（如 zh.wikisource / en.wikisource / archive.org
   * 公版 / 未来 N11a 自定义源）时填。
   *
   * 详见 apps/readest-app/src/app/opds/adapters/types.ts。
   */
  adapterType?: AdapterTypeLiteral;
}

export interface OPDSFeed {
  metadata: {
    id?: string;
    updated?: string;
    title?: string;
    subtitle?: string;
    numberOfItems?: number;
    itemsPerPage?: number;
    currentPage?: number;
  };
  links: OPDSGenericLink[];
  isComplete?: boolean;
  isArchive?: boolean;
  navigation?: OPDSNavigationItem[];
  publications?: OPDSPublication[];
  groups?: OPDSGroup[];
  facets?: OPDSFacet[];
}

export interface OPDSPublication {
  metadata: {
    id?: string;
    updated?: string;
    title?: string;
    subtitle?: string;
    description?: string;
    content?: OPDSContent;
    author?: OPDSPerson[];
    contributor?: OPDSPerson[];
    publisher?: string | OPDSPerson | OPDSPerson[];
    published?: string;
    language?: string | string[];
    identifier?: string;
    subject?: OPDSSubject[];
    rights?: string;
    [SYMBOL.CONTENT]?: OPDSContent;
  };
  links: Array<OPDSAcquisitionLink | OPDSStreamLink | OPDSGenericLink>;
  images: OPDSGenericLink[];
}

export interface OPDSSearch {
  metadata: {
    title?: string;
    description?: string;
  };
  search: (map: Map<string | undefined, Map<string, string>>) => string;
  params: OPDSSearchParam[];
}

export interface OPDSBaseLink {
  rel?: string | string[];
  href?: string;
  type?: string;
  title?: string;
  /** OPDS 2.0 / RFC 6570: href is a URI template (e.g. `/search{?query}`). */
  templated?: boolean;
}

export interface OPDSPerson {
  name?: string;
  links: Array<{ href: string; type?: string }>;
}

export interface OPDSSubject {
  name?: string;
  code?: string;
  scheme?: string;
  links?: Array<{ href: string; type?: string }>;
}

export interface OPDSContent {
  value: string;
  type: 'text' | 'html' | 'xhtml';
}

export interface OPDSGenericLink extends OPDSBaseLink {
  properties?: {
    price?: undefined;
    indirectAcquisition?: undefined;
    numberOfItems?: number;
    'pse:count'?: undefined;
    'pse:lastRead'?: undefined;
    'pse:lastReadDate'?: undefined;
  };
}

export interface OPDSAcquisitionLink extends OPDSBaseLink {
  properties?: {
    price?: OPDSPrice | OPDSPrice[];
    indirectAcquisition?: OPDSIndirectAcquisition[];
    numberOfItems?: number;
    'pse:count'?: undefined;
    'pse:lastRead'?: undefined;
    'pse:lastReadDate'?: undefined;
  };
}

export interface OPDSStreamLink extends OPDSBaseLink {
  properties?: {
    price?: OPDSPrice | OPDSPrice[];
    indirectAcquisition?: OPDSIndirectAcquisition[];
    numberOfItems?: number;
    'pse:count'?: number;
    'pse:lastRead'?: number;
    'pse:lastReadDate'?: string;
  };
}

export interface OPDSFacetLink extends OPDSBaseLink {
  properties?: {
    price?: undefined;
    indirectAcquisition?: undefined;
    numberOfItems?: number;
    'pse:count'?: undefined;
    'pse:lastRead'?: undefined;
    'pse:lastReadDate'?: undefined;
  };
}

export interface OPDSNavigationItem extends OPDSGenericLink {
  title?: string;
  [SYMBOL.SUMMARY]?: string;
}

export interface OPDSGroup {
  metadata: {
    title?: string;
    numberOfItems?: number;
  };
  links: OPDSGenericLink[];
  publications?: OPDSPublication[];
  navigation?: OPDSNavigationItem[];
}

export interface OPDSFacet {
  metadata: {
    title?: string;
  };
  links: OPDSFacetLink[];
}

interface OPDSSearchParam {
  ns?: string;
  name: string;
  required?: boolean;
  value?: string;
}

export interface OPDSPrice {
  currency?: string;
  value: number;
}

export interface OPDSIndirectAcquisition {
  type: string;
  child?: OPDSIndirectAcquisition[];
}
