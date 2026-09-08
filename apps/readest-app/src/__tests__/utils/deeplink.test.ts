import { describe, it, expect } from 'vitest';
import { buildAnnotationUrl, parseRedeemDeepLink } from '../../utils/deeplink';

describe('buildAnnotationUrl', () => {
  const link = { bookHash: 'abc', noteId: 'n1', cfi: '/6/4!/4/2' };

  it('builds the custom-scheme app URL when linkType is "app"', () => {
    const url = buildAnnotationUrl(link, 'app');
    expect(url.startsWith('moyue://book/abc/annotation/n1')).toBe(true);
  });

  it('builds the HTTPS web URL when linkType is "web"', () => {
    const url = buildAnnotationUrl(link, 'web');
    expect(url.startsWith('https://')).toBe(true);
    expect(url).toContain('/o/book/abc/annotation/n1');
  });

  it('preserves the cfi query for both link types', () => {
    const encoded = encodeURIComponent(link.cfi);
    expect(buildAnnotationUrl(link, 'app')).toContain(`cfi=${encoded}`);
    expect(buildAnnotationUrl(link, 'web')).toContain(`cfi=${encoded}`);
  });

  it('omits the cfi query when no cfi is provided', () => {
    const url = buildAnnotationUrl({ bookHash: 'abc', noteId: 'n1' }, 'app');
    expect(url).toBe('moyue://book/abc/annotation/n1');
  });
});

describe('parseRedeemDeepLink', () => {
  it('parses a moyue://redeem/{code} URL into the raw code', () => {
    expect(parseRedeemDeepLink('moyue://redeem/ABCD-EFGH-JKMN')).toEqual({
      code: 'ABCD-EFGH-JKMN',
    });
  });

  it('accepts a trailing slash and lower-cased code unchanged', () => {
    expect(parseRedeemDeepLink('moyue://redeem/abcd-efgh-jkmn/')).toEqual({
      code: 'abcd-efgh-jkmn',
    });
  });

  it('returns null for non-moyue schemes', () => {
    expect(parseRedeemDeepLink('https://example.com/redeem?code=ABCD-EFGH-JKMN')).toBeNull();
  });

  it('returns null when the first path segment is not "redeem"', () => {
    expect(parseRedeemDeepLink('moyue://book/ABCD-EFGH-JKMN')).toBeNull();
  });

  it('returns null when the code segment is empty', () => {
    expect(parseRedeemDeepLink('moyue://redeem/')).toBeNull();
  });

  it('returns null for unparseable input', () => {
    expect(parseRedeemDeepLink('not a url')).toBeNull();
  });
});
