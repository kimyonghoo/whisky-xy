import { describe, expect, it } from 'vitest';
import { parseRobots } from '@/lib/pagecrawl/robots';

const UA = 'WhiskyPortalBot';

describe('parseRobots', () => {
  it('treats an empty file as allow-all with no delay', () => {
    const r = parseRobots('', UA);
    expect(r.isAllowed('/anything')).toBe(true);
    expect(r.crawlDelayMs).toBeNull();
  });

  it('applies Disallow / Allow from the * group with longest match winning', () => {
    const r = parseRobots('User-agent: *\nDisallow: /cart\nDisallow: /view/\nAllow: /view/item/\nCrawl-delay: 10\n', UA);
    expect(r.isAllowed('/cart')).toBe(false);
    expect(r.isAllowed('/cart/add?id=1')).toBe(false);
    expect(r.isAllowed('/view/other')).toBe(false);
    expect(r.isAllowed('/view/item/123')).toBe(true);
    expect(r.isAllowed('/products/1')).toBe(true);
    expect(r.crawlDelayMs).toBe(10000);
  });

  it('prefers Allow on an equal-length tie', () => {
    const r = parseRobots('User-agent: *\nDisallow: /a\nAllow: /a\n', UA);
    expect(r.isAllowed('/a')).toBe(true);
  });

  it('supports * and $ wildcards', () => {
    const r = parseRobots('User-agent: *\nDisallow: /*.pdf$\nDisallow: /search*sort=\n', UA);
    expect(r.isAllowed('/docs/a.pdf')).toBe(false);
    expect(r.isAllowed('/docs/a.pdf?x=1')).toBe(true);
    expect(r.isAllowed('/docs/a.pdfx')).toBe(true);
    expect(r.isAllowed('/search?q=a&sort=price')).toBe(false);
    expect(r.isAllowed('/search?q=a')).toBe(true);
  });

  it('an empty Disallow allows everything', () => {
    const r = parseRobots('User-agent: *\nDisallow:\n', UA);
    expect(r.isAllowed('/x')).toBe(true);
  });

  it('Disallow: / blocks everything', () => {
    const r = parseRobots('User-agent: *\nDisallow: /\n', UA);
    expect(r.isAllowed('/')).toBe(false);
    expect(r.isAllowed('/x')).toBe(false);
  });

  it('uses the WhiskyPortalBot group (case-insensitive) instead of *', () => {
    const r = parseRobots(
      'User-agent: *\nDisallow: /\nCrawl-delay: 99\n\nUser-agent: whiskyportalbot\nDisallow: /private\nCrawl-delay: 5\n',
      UA,
    );
    expect(r.isAllowed('/shop')).toBe(true);
    expect(r.isAllowed('/private/x')).toBe(false);
    expect(r.crawlDelayMs).toBe(5000);
  });

  it('accepts a full User-Agent string and uses its product token', () => {
    const r = parseRobots('User-agent: WhiskyPortalBot\nDisallow: /x\n', 'WhiskyPortalBot/0.1 (+https://example.com)');
    expect(r.isAllowed('/x')).toBe(false);
  });

  it('handles a group with several User-agent lines', () => {
    const r = parseRobots('User-agent: Googlebot\nUser-agent: WhiskyPortalBot\nDisallow: /g\n\nUser-agent: *\nDisallow: /\n', UA);
    expect(r.isAllowed('/shop')).toBe(true);
    expect(r.isAllowed('/g')).toBe(false);
  });

  it('falls back to * when no group names us, ignoring other bots groups', () => {
    const r = parseRobots('User-agent: Googlebot\nDisallow: /\n\nUser-agent: *\nDisallow: /cart\n', UA);
    expect(r.isAllowed('/shop')).toBe(true);
    expect(r.isAllowed('/cart')).toBe(false);
  });

  it('uses only the chosen group, so the * delay does not leak into our group', () => {
    const r = parseRobots('User-agent: *\nCrawl-delay: 30\n\nUser-agent: WhiskyPortalBot\nDisallow: /x\n', UA);
    expect(r.crawlDelayMs).toBeNull();
  });

  it('ignores comments, blank lines, CRLF, BOM, unknown fields and invalid delays', () => {
    const r = parseRobots('﻿# hi\r\nUser-agent: * # all\r\nSitemap: https://x/s.xml\r\nDisallow: /a # no\r\nCrawl-delay: abc\r\n', UA);
    expect(r.isAllowed('/a')).toBe(false);
    expect(r.isAllowed('/b')).toBe(true);
    expect(r.crawlDelayMs).toBeNull();
  });

  it('accepts fractional crawl-delay and rejects negative', () => {
    expect(parseRobots('User-agent: *\nCrawl-delay: 1.5\n', UA).crawlDelayMs).toBe(1500);
    expect(parseRobots('User-agent: *\nCrawl-delay: -4\n', UA).crawlDelayMs).toBeNull();
  });

  it('matches field names case-insensitively and merges repeated groups for the same agent', () => {
    const r = parseRobots('USER-AGENT: *\nDISALLOW: /a\n\nuser-agent: *\ndisallow: /b\n', UA);
    expect(r.isAllowed('/a')).toBe(false);
    expect(r.isAllowed('/b')).toBe(false);
  });

  it('Sitemap and unknown lines do not end a group User-agent list', () => {
    const r = parseRobots('User-agent: WhiskyPortalBot\nSitemap: https://x/s.xml\nFoo: bar\nUser-agent: *\nDisallow: /\n', UA);
    expect(r.isAllowed('/x')).toBe(false);
    const other = parseRobots('User-agent: Googlebot\nSitemap: https://x/s.xml\nUser-agent: *\nDisallow: /cart\n', 'Googlebot');
    expect(other.isAllowed('/cart')).toBe(false);
  });

  it('matches a versioned User-agent line such as WhiskyPortalBot/1.0', () => {
    const r = parseRobots('User-agent: WhiskyPortalBot/1.0\nDisallow: /\n', UA);
    expect(r.isAllowed('/x')).toBe(false);
  });

  it('keeps an infinite Crawl-delay so the caller can refuse it', () => {
    expect(parseRobots('User-agent: *\nCrawl-delay: 1e999\n', UA).crawlDelayMs).toBe(Infinity);
  });

  it('compares non-ASCII paths and patterns in percent-encoded form, both ways', () => {
    const enc = parseRobots('User-agent: *\nDisallow: /%E5%95%86%E5%93%81/\n', UA);
    expect(enc.isAllowed('/商品/1')).toBe(false);
    expect(enc.isAllowed('/%e5%95%86%e5%93%81/1')).toBe(false);
    expect(enc.isAllowed('/%E5%95%86%E5%93%81B/1')).toBe(true);
    const raw = parseRobots('User-agent: *\nDisallow: /商品/\n', UA);
    expect(raw.isAllowed('/%E5%95%86%E5%93%81/1')).toBe(false);
    expect(raw.isAllowed('/商品/1')).toBe(false);
    expect(raw.isAllowed('/商品B/1')).toBe(true);
  });

  it('counts rule length in decoded octets, not canonical characters', () => {
    // Allow /*' is 3 octets (the escaped quote counts 1), Disallow /cart is 5: Disallow wins.
    const r = parseRobots("User-agent: *\nDisallow: /cart\nAllow: /*'\n", UA);
    expect(r.isAllowed("/cart'")).toBe(false);
    // Escaped unreserved characters count 1 each: Disallow /%7Eu (3) beats Allow /~ (2).
    const t = parseRobots('User-agent: *\nDisallow: /%7Eu\nAllow: /~\n', UA);
    expect(t.isAllowed('/~u')).toBe(false);
    expect(t.isAllowed('/~x')).toBe(true);
    // A longer Allow still wins: Allow /cart/a'b (8) beats Disallow /cart (5).
    const longer = parseRobots("User-agent: *\nDisallow: /cart\nAllow: /cart/a'b\n", UA);
    expect(longer.isAllowed("/cart/a'b")).toBe(true);
    // A non-ASCII character counts its UTF-8 length (3), however it is written.
    const jp = parseRobots('User-agent: *\nDisallow: /商\nAllow: /*%E5\n', UA);
    expect(jp.isAllowed('/商')).toBe(false);
  });

  it('fails closed on structural-escape and case variants (stricter than RFC 9309)', () => {
    expect(parseRobots('User-agent: *\nDisallow: /cart/\n', UA).isAllowed('/cart%2F')).toBe(false);
    expect(parseRobots('User-agent: *\nDisallow: /a=b\n', UA).isAllowed('/a%3Db')).toBe(false);
    expect(parseRobots('User-agent: *\nDisallow: /x?q=/b\n', UA).isAllowed('/x?q=%2Fb')).toBe(false);
    expect(parseRobots('User-agent: *\nDisallow: /cart\n', UA).isAllowed('/CART')).toBe(false);
    expect(parseRobots('User-agent: *\nDisallow: /cart\nAllow: /view/item/\n', UA).isAllowed('/view/item/123')).toBe(true);
  });

  it('loose form strips ;params from path segments (stricter than RFC 9309)', () => {
    expect(parseRobots('User-agent: *\nDisallow: /cart$\n', UA).isAllowed('/cart;jsessionid=1')).toBe(false);
    expect(parseRobots('User-agent: *\nDisallow: /cart$\n', UA).isAllowed('/cart%3Bjsessionid=1')).toBe(false);
    expect(parseRobots('User-agent: *\nDisallow: /admin/\n', UA).isAllowed('/admin;x/')).toBe(false);
    expect(parseRobots('User-agent: *\nDisallow: /a/b/c\n', UA).isAllowed('/a;1/b;2/c;3')).toBe(false);
    // Tomcat strips the parameter, then merges slashes and resolves dot segments.
    expect(parseRobots('User-agent: *\nDisallow: /cart\n', UA).isAllowed('/x/..;a/cart')).toBe(false);
    expect(parseRobots('User-agent: *\nDisallow: /cart\n', UA).isAllowed('/;x/cart')).toBe(false);
    // The loose case-fold view still applies on its own: /x/..;a/cart is under /X/ on a case-insensitive server.
    expect(parseRobots('User-agent: *\nDisallow: /X/\n', UA).isAllowed('/x/..;a/cart')).toBe(false);
    // Only before the query: a ; in the query is not a path parameter.
    expect(parseRobots('User-agent: *\nDisallow: /x?a=1$\n', UA).isAllowed('/x?a=1;b')).toBe(true);
  });

  it('loose form strips ;params from patterns too, without widening them', () => {
    const p = parseRobots('User-agent: *\nDisallow: /cart;x\n', UA);
    expect(p.isAllowed('/cart')).toBe(false);
    expect(p.isAllowed('/cart;y')).toBe(false);
    expect(p.isAllowed('/cart/1')).toBe(false);
    expect(p.isAllowed('/cart?id=1')).toBe(false);
    expect(p.isAllowed('/cartoon')).toBe(true);
    const root = parseRobots('User-agent: *\nDisallow: /;jsessionid=\n', UA);
    expect(root.isAllowed('/')).toBe(false);
    expect(root.isAllowed('/products/abc')).toBe(true);
    // A parameter after a wildcard is kept: /*;jsessionid= blocks session-id URLs, not every page.
    const sid = parseRobots('User-agent: *\nDisallow: /*;jsessionid=\n', UA);
    expect(sid.isAllowed('/products/abc')).toBe(true);
    expect(sid.isAllowed('/products/abc;jsessionid=1')).toBe(false);
  });

  it('loose form treats + and %20 as the same in the query only', () => {
    expect(parseRobots('User-agent: *\nDisallow: /*?q=a+b\n', UA).isAllowed('/x?q=a%20b')).toBe(false);
    expect(parseRobots('User-agent: *\nDisallow: /*?q=a%20b\n', UA).isAllowed('/x?q=a+b')).toBe(false);
    expect(parseRobots('User-agent: *\nDisallow: /search*q=a+b\n', UA).isAllowed('/search?q=a%20b')).toBe(false);
    expect(parseRobots('User-agent: *\nDisallow: /tags/a%20b\n', UA).isAllowed('/tags/a+b')).toBe(true);
    expect(parseRobots('User-agent: *\nDisallow: /tags/a+b\n', UA).isAllowed('/tags/a%20b')).toBe(true);
    expect(parseRobots('User-agent: *\nDisallow: /cart\n', UA).isAllowed('/search?q=a+b')).toBe(true);
  });

  it('compares percent-encoded unreserved characters as equal', () => {
    const r = parseRobots('User-agent: *\nDisallow: /~secret\n', UA);
    expect(r.isAllowed('/%7Esecret')).toBe(false);
  });
});
