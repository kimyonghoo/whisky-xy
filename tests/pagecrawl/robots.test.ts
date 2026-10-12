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

  it('compares percent-encoded unreserved characters as equal', () => {
    const r = parseRobots('User-agent: *\nDisallow: /~secret\n', UA);
    expect(r.isAllowed('/%7Esecret')).toBe(false);
  });
});
