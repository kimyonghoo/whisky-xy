import { describe, expect, it } from 'vitest';
import { botUserAgent } from '@/lib/bot-ua';
import { CrawlStopped, PageGone, PathDisallowed, createPoliteFetcher } from '@/lib/pagecrawl/fetcher';

const ORIGIN = 'https://shop.example.jp';

type Reply = Response | Error | (() => Response | Error);
type Call = { url: string; init: RequestInit };

function html(body = '<html>ok</html>', status = 200, headers: Record<string, string> = {}): Response {
  return new Response(body, { status, headers });
}

/** Fake fetch: routes by pathname (+search). Unlisted paths are 200 html. Records every call. */
function makeFetch(routes: Record<string, Reply | Reply[]>) {
  const calls: Call[] = [];
  const queues = new Map<string, Reply[]>();
  for (const [k, v] of Object.entries(routes)) queues.set(k, Array.isArray(v) ? [...v] : [v]);
  const fetchFn = (async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = String(input);
    calls.push({ url, init });
    const u = new URL(url);
    const key = u.pathname + u.search;
    const q = queues.get(key);
    // The last queued reply repeats.
    let reply: Reply = q ? (q.length > 1 ? q.shift()! : q[0]) : html();
    if (typeof reply === 'function') reply = reply();
    if (reply instanceof Error) throw reply;
    return reply.clone();
  }) as typeof fetch;
  return { fetchFn, calls };
}

function makeClock() {
  const sleeps: number[] = [];
  return {
    sleeps,
    sleep: async (ms: number) => { sleeps.push(ms); },
    now: () => 1_000_000,
  };
}

const ROBOTS_OK = 'User-agent: *\nDisallow: /cart\n';
const robots = (text = ROBOTS_OK) => ({ '/robots.txt': () => new Response(text, { status: 200 }) });

async function create(routes: Record<string, Reply | Reply[]>, extra: Record<string, unknown> = {}) {
  const f = makeFetch({ ...robots(), ...routes });
  const clock = makeClock();
  const fetcher = await createPoliteFetcher({ origin: ORIGIN, fetchFn: f.fetchFn, sleep: clock.sleep, now: clock.now, ...extra });
  return { fetcher, ...f, clock };
}

async function stopReason(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    if (e instanceof CrawlStopped) return e.reason;
    throw e;
  }
  return 'no-throw';
}

async function pathRefused(p: Promise<unknown>): Promise<boolean> {
  try {
    await p;
  } catch (e) {
    return e instanceof PathDisallowed && !(e instanceof CrawlStopped);
  }
  return false;
}

describe('robots.txt loading', () => {
  it('requests /robots.txt first, counts it, and does not sleep before it', async () => {
    const { fetcher, calls, clock } = await create({});
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(`${ORIGIN}/robots.txt`);
    expect(fetcher.used()).toBe(1);
    expect(clock.sleeps).toEqual([]);
  });

  it('404 means no rules: pages are fetched', async () => {
    const { fetcher } = await create({ '/robots.txt': () => new Response('nope', { status: 404 }), '/cart': html('cart page') });
    expect(await fetcher.get('/cart')).toBe('cart page');
  });

  it.each([500, 503, 403, 401, 410, 429, 301, 302])('robots HTTP %i throws robots-unavailable and makes no further requests', async (status) => {
    const f = makeFetch({ '/robots.txt': () => new Response('', { status, headers: { location: 'https://elsewhere.example/robots.txt' } }) });
    const reason = await stopReason(createPoliteFetcher({ origin: ORIGIN, fetchFn: f.fetchFn, sleep: async () => {}, now: () => 0 }));
    expect(reason).toBe('robots-unavailable');
    expect(f.calls).toHaveLength(1);
  });

  it('robots opaqueredirect throws robots-unavailable', async () => {
    const opaque = { type: 'opaqueredirect', status: 0, ok: false, headers: new Headers(), text: async () => '' } as unknown as Response;
    const f = makeFetch({ '/robots.txt': opaque });
    // clone() is not available on the hand-made object
    (opaque as unknown as { clone: () => Response }).clone = () => opaque;
    const reason = await stopReason(createPoliteFetcher({ origin: ORIGIN, fetchFn: f.fetchFn, sleep: async () => {}, now: () => 0 }));
    expect(reason).toBe('robots-unavailable');
  });

  it('robots network error throws robots-unavailable', async () => {
    const f = makeFetch({ '/robots.txt': new Error('ECONNRESET') });
    expect(await stopReason(createPoliteFetcher({ origin: ORIGIN, fetchFn: f.fetchFn, sleep: async () => {}, now: () => 0 }))).toBe('robots-unavailable');
    expect(f.calls).toHaveLength(1);
  });

  it('robots timeout (abort) throws robots-unavailable', async () => {
    const err = new DOMException('The operation timed out', 'TimeoutError');
    const f = makeFetch({ '/robots.txt': err });
    expect(await stopReason(createPoliteFetcher({ origin: ORIGIN, fetchFn: f.fetchFn, sleep: async () => {}, now: () => 0 }))).toBe('robots-unavailable');
  });

  it('robots body over the cap throws robots-unavailable', async () => {
    const f = makeFetch({ '/robots.txt': () => new Response('a'.repeat(4 * 1024 * 1024), { status: 200 }) });
    expect(await stopReason(createPoliteFetcher({ origin: ORIGIN, fetchFn: f.fetchFn, sleep: async () => {}, now: () => 0 }))).toBe('robots-unavailable');
    expect(f.calls).toHaveLength(1);
  });

  it('robots fetchFn rejecting with a too-large error throws robots-unavailable', async () => {
    const f = makeFetch({ '/robots.txt': new Error('response too large') });
    expect(await stopReason(createPoliteFetcher({ origin: ORIGIN, fetchFn: f.fetchFn, sleep: async () => {}, now: () => 0 }))).toBe('robots-unavailable');
  });

  it('a cf-mitigated challenge served as robots.txt fails closed', async () => {
    const f = makeFetch({ '/robots.txt': () => new Response('', { status: 200, headers: { 'cf-mitigated': 'challenge' } }) });
    expect(await stopReason(createPoliteFetcher({ origin: ORIGIN, fetchFn: f.fetchFn, sleep: async () => {}, now: () => 0 }))).toBe('challenge');
    expect(f.calls).toHaveLength(1);
  });

  it('robots.txt text mentioning challenge-platform is not a challenge', async () => {
    const { fetcher } = await create(robots('User-agent: *\nDisallow: /cdn-cgi/challenge-platform/\n# cf-chl- cf-chl\n'));
    expect(await fetcher.get('/ok')).toBe('<html>ok</html>');
  });

  it('a non-2xx robots.txt is robots-unavailable even when it looks like a challenge', async () => {
    const f = makeFetch({ '/robots.txt': () => new Response('cf-chl', { status: 403, headers: { 'cf-mitigated': 'challenge' } }) });
    expect(await stopReason(createPoliteFetcher({ origin: ORIGIN, fetchFn: f.fetchFn, sleep: async () => {}, now: () => 0 }))).toBe('robots-unavailable');
    expect(f.calls).toHaveLength(1);
  });

  it.each([
    ['NaN maxRequests', { maxRequests: NaN }],
    ['Infinity maxRequests', { maxRequests: Infinity }],
    ['zero maxRequests', { maxRequests: 0 }],
    ['301 maxRequests', { maxRequests: 301 }],
    ['fractional maxRequests', { maxRequests: 2.5 }],
    ['NaN minDelayMs', { minDelayMs: NaN }],
    ['Infinity minDelayMs', { minDelayMs: Infinity }],
    ['2999 minDelayMs', { minDelayMs: 2999 }],
    ['negative minDelayMs', { minDelayMs: -1 }],
  ])('%s throws RangeError before any request', async (_n, extra) => {
    const f = makeFetch({});
    await expect(
      createPoliteFetcher({ origin: ORIGIN, fetchFn: f.fetchFn, sleep: async () => {}, now: () => 0, ...extra }),
    ).rejects.toBeInstanceOf(RangeError);
    expect(f.calls).toHaveLength(0);
  });

  it('accepts the boundary options minDelayMs 3000, maxRequests 1 and 300', async () => {
    for (const extra of [{ minDelayMs: 3000 }, { maxRequests: 1 }, { maxRequests: 300 }]) {
      const f = makeFetch({});
      await createPoliteFetcher({ origin: ORIGIN, fetchFn: f.fetchFn, sleep: async () => {}, now: () => 0, ...extra });
      expect(f.calls).toHaveLength(1);
    }
  });

  it.each(['http://shop.example.jp', 'ftp://shop.example.jp', 'not a url'])('rejects origin %s without any request', async (origin) => {
    const f = makeFetch({});
    await expect(createPoliteFetcher({ origin, fetchFn: f.fetchFn, sleep: async () => {}, now: () => 0 })).rejects.toThrow();
    expect(f.calls).toHaveLength(0);
  });

  it('uses the WhiskyPortalBot group over *', async () => {
    const { fetcher, calls } = await create(robots('User-agent: *\nDisallow: /\n\nUser-agent: WhiskyPortalBot\nDisallow: /cart\n'));
    expect(await fetcher.get('/products/1')).toBe('<html>ok</html>');
    expect(await pathRefused(fetcher.get('/cart'))).toBe(true);
    expect(calls).toHaveLength(2);
  });
});

describe('disallowed paths and budget', () => {
  it('a disallowed path throws PathDisallowed (not CrawlStopped) without fetching or sleeping', async () => {
    const { fetcher, calls, clock } = await create({});
    expect(await pathRefused(fetcher.get('/cart'))).toBe(true);
    expect(calls).toHaveLength(1);
    expect(clock.sleeps).toEqual([]);
    expect(fetcher.used()).toBe(1);
  });

  it('disallowed applies to the query string too', async () => {
    const { fetcher, calls } = await create(robots('User-agent: *\nDisallow: /*?sort=\n'));
    expect(await pathRefused(fetcher.get('/list?sort=price'))).toBe(true);
    expect(calls).toHaveLength(1);
  });

  it('a disallowed path does not stop later allowed paths', async () => {
    const { fetcher } = await create({});
    expect(await pathRefused(fetcher.get('/cart'))).toBe(true);
    expect(await fetcher.get('/ok')).toBe('<html>ok</html>');
  });

  it('with maxRequests 3 (robots counted) the third get throws budget before any fetch or sleep', async () => {
    const { fetcher, calls, clock } = await create({}, { maxRequests: 3 });
    await fetcher.get('/a');
    await fetcher.get('/b');
    expect(fetcher.used()).toBe(3);
    const sleepsBefore = clock.sleeps.length;
    expect(await stopReason(fetcher.get('/c'))).toBe('budget');
    expect(calls).toHaveLength(3);
    expect(clock.sleeps).toHaveLength(sleepsBefore);
    expect(await stopReason(fetcher.get('/d'))).toBe('budget');
    expect(calls).toHaveLength(3);
  });

  it('the default budget is 300 requests including robots', async () => {
    const { fetcher, calls } = await create({});
    for (let i = 0; i < 299; i++) await fetcher.get(`/p/${i}`);
    expect(calls).toHaveLength(300);
    expect(await stopReason(fetcher.get('/p/last'))).toBe('budget');
    expect(calls).toHaveLength(300);
  });
});

describe('path validation', () => {
  it.each([
    ['full URL on another host', 'https://evil.example/x'],
    ['full URL on the same host', `${ORIGIN}/x`],
    ['protocol-relative URL', '//evil.example/x'],
    ['relative path', 'products/1'],
    ['empty path', ''],
    ['backslash trick', '/\\evil.example'],
    ['newline injection', '/x\r\nHost: evil'],
  ])('rejects %s without fetching', async (_n, path) => {
    const { fetcher, calls } = await create({});
    await expect(fetcher.get(path)).rejects.toThrow();
    expect(calls).toHaveLength(1);
    expect(fetcher.used()).toBe(1);
  });

  it('a rejected path does not count toward the error rule', async () => {
    const { fetcher } = await create({});
    for (let i = 0; i < 5; i++) await expect(fetcher.get('https://evil.example/x')).rejects.toThrow();
    expect(await fetcher.get('/ok')).toBe('<html>ok</html>');
  });

  it('only configured-origin requests are made', async () => {
    const { fetcher, calls } = await create({});
    await fetcher.get('/a?b=c');
    for (const c of calls) expect(new URL(c.url).origin).toBe(ORIGIN);
    expect(calls[1].url).toBe(`${ORIGIN}/a?b=c`);
  });
});

describe('stopping on server signals', () => {
  it.each([
    [403, 'http-403'],
    [429, 'http-429'],
    [503, 'http-503'],
  ])('the first HTTP %i throws %s and every later get throws it without fetching', async (status, reason) => {
    const { fetcher, calls } = await create({ '/blocked': new Response('no', { status }) });
    const first = await fetcher.get('/blocked').catch((e) => e);
    expect(first).toBeInstanceOf(CrawlStopped);
    expect(first.reason).toBe(reason);
    expect(calls).toHaveLength(2);
    const second = await fetcher.get('/other').catch((e) => e);
    expect(second).toBe(first);
    const third = await fetcher.get('/blocked').catch((e) => e);
    expect(third).toBe(first);
    expect(calls).toHaveLength(2);
  });

  it.each([403, 503])('HTTP %i with cf-mitigated is a challenge', async (status) => {
    const { fetcher, calls } = await create({ '/x': new Response('', { status, headers: { 'cf-mitigated': 'challenge' } }) });
    expect(await stopReason(fetcher.get('/x'))).toBe('challenge');
    expect(await stopReason(fetcher.get('/y'))).toBe('challenge');
    expect(calls).toHaveLength(2);
  });

  it.each(['<div id="cf-chl-widget"></div>', '<html><TITLE>Just a moment...</TITLE></html>'])('a 2xx body %s is a challenge', async (body) => {
    const { fetcher, calls } = await create({ '/x': html(body) });
    expect(await stopReason(fetcher.get('/x'))).toBe('challenge');
    expect(await stopReason(fetcher.get('/y'))).toBe('challenge');
    expect(calls).toHaveLength(2);
  });

  it('a 2xx with cf-mitigated: challenge is a challenge', async () => {
    const { fetcher } = await create({ '/x': html('<p>hi</p>', 200, { 'cf-mitigated': 'challenge' }) });
    expect(await stopReason(fetcher.get('/x'))).toBe('challenge');
  });

  it('a 2xx page that merely loads a /cdn-cgi/challenge-platform/ script is normal', async () => {
    const page = '<html><script src="/cdn-cgi/challenge-platform/scripts/jsd/main.js"></script>cf-chl</html>';
    const { fetcher } = await create({ '/x': html(page) });
    expect(await fetcher.get('/x')).toBe(page);
  });

  it.each(['cf-chl', 'challenge-platform'])('a 403 or 503 body containing %s is a challenge', async (marker) => {
    for (const status of [403, 503]) {
      const { fetcher } = await create({ '/x': html(`<script src="/${marker}/a.js"></script>`, status) });
      expect(await stopReason(fetcher.get('/x'))).toBe('challenge');
    }
  });

  it('a 403 with a challenge body is challenge, not http-403', async () => {
    const { fetcher } = await create({ '/x': html('<div id="cf-chl-widget"></div>', 403) });
    expect(await stopReason(fetcher.get('/x'))).toBe('challenge');
  });

  it('a 403 with an oversized body still stops as http-403', async () => {
    const { fetcher } = await create({ '/x': () => html('a'.repeat(4 * 1024 * 1024), 403) });
    expect(await stopReason(fetcher.get('/x'))).toBe('http-403');
  });

  it('404 and 410 throw PageGone, do not stop the store and do not count as errors', async () => {
    const { fetcher } = await create({
      '/gone1': new Response('', { status: 404 }),
      '/gone2': new Response('', { status: 410 }),
    });
    for (let i = 0; i < 4; i++) {
      const e404 = await fetcher.get('/gone1').catch((e) => e);
      expect(e404).toBeInstanceOf(PageGone);
      expect(e404).not.toBeInstanceOf(CrawlStopped);
      expect(e404.status).toBe(404);
      expect(e404.path).toBe('/gone1');
      const e410 = await fetcher.get('/gone2').catch((e) => e);
      expect(e410).toBeInstanceOf(PageGone);
      expect(e410.status).toBe(410);
    }
    expect(await fetcher.get('/fine')).toBe('<html>ok</html>');
  });

  it('PageGone in between does not reset or add to the consecutive-error count', async () => {
    const { fetcher } = await create({
      '/e': new Response('', { status: 500 }),
      '/gone': new Response('', { status: 404 }),
    });
    await expect(fetcher.get('/e')).rejects.toThrow();
    await fetcher.get('/gone').catch(() => {});
    await expect(fetcher.get('/e')).rejects.toThrow();
    await fetcher.get('/gone').catch(() => {});
    expect(await stopReason(fetcher.get('/e'))).toBe('errors');
  });

  it('three consecutive network errors throw errors on the third, then stay stopped', async () => {
    const { fetcher, calls } = await create({ '/n': new Error('ECONNRESET') });
    const e1 = await fetcher.get('/n').catch((e) => e);
    const e2 = await fetcher.get('/n').catch((e) => e);
    expect(e1).toBeInstanceOf(Error);
    expect(e1).not.toBeInstanceOf(CrawlStopped);
    expect(e2).not.toBeInstanceOf(CrawlStopped);
    expect(await stopReason(fetcher.get('/n'))).toBe('errors');
    expect(calls).toHaveLength(4);
    expect(await stopReason(fetcher.get('/fine'))).toBe('errors');
    expect(calls).toHaveLength(4);
  });

  it('other non-2xx statuses count as errors, and a 2xx resets the count', async () => {
    const { fetcher } = await create({ '/e': new Response('', { status: 500 }), '/t': new Error('timeout') });
    await expect(fetcher.get('/e')).rejects.toThrow(/500/);
    await expect(fetcher.get('/t')).rejects.toThrow();
    expect(await fetcher.get('/fine')).toBe('<html>ok</html>');
    await expect(fetcher.get('/e')).rejects.toThrow();
    await expect(fetcher.get('/e')).rejects.toThrow();
    expect(await stopReason(fetcher.get('/e'))).toBe('errors');
  });

  it('a redirect is an error, never followed', async () => {
    const { fetcher, calls } = await create({
      '/r': new Response('', { status: 301, headers: { location: 'https://evil.example/' } }),
    });
    await expect(fetcher.get('/r')).rejects.toThrow(/redirect/i);
    expect(calls).toHaveLength(2);
    expect(calls[1].init.redirect).toBe('manual');
  });

  it('an opaqueredirect response is an error', async () => {
    const opaque = { type: 'opaqueredirect', status: 0, ok: false, headers: new Headers(), text: async () => '' } as unknown as Response;
    (opaque as unknown as { clone: () => Response }).clone = () => opaque;
    const { fetcher } = await create({ '/r': opaque });
    await expect(fetcher.get('/r')).rejects.toThrow(/redirect/i);
  });

  it('a response body over the cap is an error', async () => {
    const { fetcher } = await create({ '/big': () => html('a'.repeat(4 * 1024 * 1024)) });
    await expect(fetcher.get('/big')).rejects.toThrow(/too large/i);
  });

  it('a declared content-length over the cap is an error', async () => {
    const { fetcher } = await create({ '/big': () => html('small', 200, { 'content-length': String(50 * 1024 * 1024) }) });
    await expect(fetcher.get('/big')).rejects.toThrow(/too large/i);
  });

  it('never retries: one request per get, even on failure', async () => {
    const { fetcher, calls } = await create({ '/e': new Response('', { status: 500 }) });
    await expect(fetcher.get('/e')).rejects.toThrow();
    expect(calls).toHaveLength(2);
  });
});

describe('pacing', () => {
  it('sleeps 3000 before each request after robots', async () => {
    const { fetcher, clock } = await create({});
    await fetcher.get('/a');
    await fetcher.get('/b');
    expect(clock.sleeps).toEqual([3000, 3000]);
  });

  it('sleeps the Crawl-delay when it is larger than ours', async () => {
    const { fetcher, clock } = await create(robots('User-agent: *\nCrawl-delay: 10\n'));
    await fetcher.get('/a');
    await fetcher.get('/b');
    expect(clock.sleeps).toEqual([10000, 10000]);
  });

  it('keeps our minimum when Crawl-delay is smaller', async () => {
    const { fetcher, clock } = await create(robots('User-agent: *\nCrawl-delay: 1\n'));
    await fetcher.get('/a');
    expect(clock.sleeps).toEqual([3000]);
  });

  it('honours a custom minDelayMs', async () => {
    const { fetcher, clock } = await create({}, { minDelayMs: 5000 });
    await fetcher.get('/a');
    expect(clock.sleeps).toEqual([5000]);
  });

  it('measures from the previous request start, sleeping only the remainder', async () => {
    let t = 0;
    const sleeps: number[] = [];
    const f = makeFetch(robots());
    const fetcher = await createPoliteFetcher({
      origin: ORIGIN,
      fetchFn: f.fetchFn,
      sleep: async (ms) => { sleeps.push(ms); },
      now: () => t,
    });
    t = 1000; // robots started at 0
    await fetcher.get('/a');
    t = 1500; // /a started at 1000
    await fetcher.get('/b');
    expect(sleeps).toEqual([2000, 2500]);
  });

  it('never passes a negative sleep when enough time already passed', async () => {
    let t = 0;
    const sleeps: number[] = [];
    const f = makeFetch(robots());
    const fetcher = await createPoliteFetcher({
      origin: ORIGIN,
      fetchFn: f.fetchFn,
      sleep: async (ms) => { sleeps.push(ms); },
      now: () => (t += 10_000),
    });
    await fetcher.get('/a');
    expect(sleeps).toEqual([0]);
  });
});

describe('request shape', () => {
  it('sends the honest User-Agent, html Accept, a 20 s timeout signal and manual redirects, with no cookies', async () => {
    const { fetcher, calls } = await create({});
    await fetcher.get('/a');
    expect(calls).toHaveLength(2);
    for (const c of calls) {
      const h = new Headers(c.init.headers);
      expect(h.get('user-agent')).toBe(botUserAgent());
      expect(h.get('accept')).toBe('text/html,application/xhtml+xml');
      expect(h.get('cookie')).toBeNull();
      expect(h.get('referer')).toBeNull();
      expect(h.get('sec-fetch-mode')).toBeNull();
      expect(c.init.redirect).toBe('manual');
      expect(c.init.signal).toBeInstanceOf(AbortSignal);
      expect((c.init.signal as AbortSignal).aborted).toBe(false);
    }
  });

  it('get returns the HTML text and used() counts every request', async () => {
    const { fetcher } = await create({ '/a': html('<p>hi</p>') });
    expect(await fetcher.get('/a')).toBe('<p>hi</p>');
    expect(fetcher.used()).toBe(2);
  });

  it('uses a 20 000 ms timeout', async () => {
    const spy: number[] = [];
    const orig = AbortSignal.timeout;
    AbortSignal.timeout = ((ms: number) => { spy.push(ms); return orig.call(AbortSignal, ms); }) as typeof AbortSignal.timeout;
    try {
      const { fetcher } = await create({});
      await fetcher.get('/a');
    } finally {
      AbortSignal.timeout = orig;
    }
    expect(spy).toEqual([20000, 20000]);
  });
});

describe('the path on the wire is the path robots was matched against', () => {
  const ROBOTS_WIRE =
    'User-agent: *\nDisallow: /cart\nDisallow: /secret$\nAllow: /view/item/\nDisallow: /%E5%95%86%E5%93%81/\nDisallow: /商品B/\n';

  it.each([
    '/./cart',
    '/x/../cart',
    '/view/item/../../cart',
    '/x/%2e%2e/cart',
    '/x/%2E%2E/cart',
    '/secret#frag',
    '/商品/1',
    '/%e5%95%86%e5%93%81/1',
    '/%E5%95%86%E5%93%81B/1',
    '/商品B/1',
  ])('refuses %s without a request', async (path) => {
    const { fetcher, calls } = await create(robots(ROBOTS_WIRE));
    expect(await pathRefused(fetcher.get(path))).toBe(true);
    expect(calls).toHaveLength(1);
    expect(fetcher.used()).toBe(1);
  });

  it.each([
    ['/ok/../view/item/1', '/view/item/1'],
    ['/a/./b?x=1', '/a/b?x=1'],
    ['/商品C/1', '/%E5%95%86%E5%93%81C/1'],
    ['/%e5%95%86%e5%93%81C/1?q=商', '/%e5%95%86%e5%93%81C/1?q=%E5%95%86'],
  ])('requests exactly the normalised URL for %s', async (path, wire) => {
    const { fetcher, calls } = await create(robots(ROBOTS_WIRE));
    await fetcher.get(path);
    expect(calls[1].url).toBe(`${ORIGIN}${wire}`);
  });

  it.each([
    ['/a^b', '/a^b'],
    ['/*q=\'', "/x?q='1"],
    ['/p|q', '/p%7Cq'],
    ['/p%7Cq', '/p|q'],
    ['/it%27s', "/it's"],
    ["/it's", '/it%27s'],
    ['/a%2Ab', '/a*b'],
    ['/x?q=%24', '/x?q=$'],
  ])('rule %s blocks %s', async (rule, path) => {
    const { fetcher, calls } = await create(robots(`User-agent: *\nDisallow: ${rule}\n`));
    expect(await pathRefused(fetcher.get(path))).toBe(true);
    expect(calls).toHaveLength(1);
  });

  it('an escaped * in a rule is literal, not a wildcard', async () => {
    const { fetcher } = await create(robots('User-agent: *\nDisallow: /a%2Ab\n'));
    expect(await fetcher.get('/aXb')).toBe('<html>ok</html>');
  });

  it('refuses a fragment even on an otherwise allowed path', async () => {
    const { fetcher, calls } = await create({});
    expect(await pathRefused(fetcher.get('/ok#frag'))).toBe(true);
    expect(calls).toHaveLength(1);
  });
});

describe('every printable ASCII character matches in raw and percent-escaped form', () => {
  // Structural characters keep their meaning when raw, so their escaped form is a different token:
  // `/` separates segments, `?` starts the query, `=` and `&` delimit query parameters.
  const STRUCTURAL = new Set(['/', '?', '=', '&']);
  const chars: string[] = [];
  for (let code = 0x21; code <= 0x7e; code++) if (code !== 0x23 /* # is a fragment, rejected */) chars.push(String.fromCharCode(code));
  const esc = (c: string) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`;
  const lower = (c: string) => `%${c.charCodeAt(0).toString(16).toLowerCase()}`;

  async function blocked(rule: string, path: string): Promise<boolean> {
    const { fetcher, calls } = await create(robots(`User-agent: *\nDisallow: ${rule}\n`));
    const refused = await pathRefused(fetcher.get(path));
    return refused && calls.length === 1; // robots.txt only: zero page fetches
  }

  it('in the path', async () => {
    const failures: string[] = [];
    for (const c of chars) {
      if (!(await blocked(`/a${c}b`, `/a${c}b`))) failures.push(`raw ${c}`);
      if (STRUCTURAL.has(c)) continue;
      if (!(await blocked(`/a${c}b`, `/a${esc(c)}b`))) failures.push(`escaped ${c}`);
      if (!(await blocked(`/a${c}b`, `/a${lower(c)}b`))) failures.push(`lower-case escaped ${c}`);
      if (!(await blocked(`/a${esc(c)}b`, `/a${c}b`))) failures.push(`rule escaped, request raw ${c}`);
    }
    expect(failures).toEqual([]);
  });

  it('in the query', async () => {
    const failures: string[] = [];
    for (const c of chars) {
      // A trailing `$` in a rule is the end anchor, so the raw rule `/x?q=$` means "ends here".
      if (c !== '$' && !(await blocked(`/x?q=${c}`, `/x?q=${c}`))) failures.push(`raw ${c}`);
      if (STRUCTURAL.has(c)) continue;
      if (c !== '$' && !(await blocked(`/x?q=${c}`, `/x?q=${esc(c)}`))) failures.push(`escaped ${c}`);
      if (!(await blocked(`/x?q=${esc(c)}`, `/x?q=${c}`))) failures.push(`rule escaped, request raw ${c}`);
    }
    expect(failures).toEqual([]);
  });
});

describe('concurrent get calls are serialised', () => {
  it('Promise.all of four gets with maxRequests 3 sends at most 3 fetches, one at a time, with sleeps in sequence', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const calls: string[] = [];
    const sleeps: number[] = [];
    const fetchFn = (async (input: string | URL | Request) => {
      calls.push(String(input));
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return new Response(String(input).endsWith('/robots.txt') ? '' : 'ok', { status: 200 });
    }) as typeof fetch;
    const fetcher = await createPoliteFetcher({
      origin: ORIGIN,
      fetchFn,
      maxRequests: 3,
      sleep: async (ms) => { sleeps.push(ms); await new Promise((r) => setTimeout(r, 5)); },
      now: () => 1_000_000,
    });
    const results = await Promise.allSettled([fetcher.get('/a'), fetcher.get('/b'), fetcher.get('/c'), fetcher.get('/d')]);
    expect(calls).toHaveLength(3);
    expect(maxInFlight).toBe(1);
    expect(sleeps).toEqual([3000, 3000]);
    expect(results.map((r) => r.status)).toEqual(['fulfilled', 'fulfilled', 'rejected', 'rejected']);
    for (const r of results.slice(2)) {
      expect((r as PromiseRejectedResult).reason).toBeInstanceOf(CrawlStopped);
      expect((r as PromiseRejectedResult).reason.reason).toBe('budget');
    }
    expect(fetcher.used()).toBe(3);
  });

  it('after a stop, queued gets throw the same CrawlStopped without fetching', async () => {
    const { fetcher, calls } = await create({ '/a': new Response('', { status: 429 }) });
    const results = await Promise.allSettled([fetcher.get('/a'), fetcher.get('/b'), fetcher.get('/c')]);
    expect(calls).toHaveLength(2);
    const reasons = results.map((r) => (r.status === 'rejected' ? r.reason : null));
    expect(reasons[0]).toBeInstanceOf(CrawlStopped);
    expect(reasons[0].reason).toBe('http-429');
    expect(reasons[1]).toBe(reasons[0]);
    expect(reasons[2]).toBe(reasons[0]);
  });

  it('a rejection does not break the queue', async () => {
    const { fetcher } = await create({ '/gone': new Response('', { status: 404 }) });
    const results = await Promise.allSettled([fetcher.get('/cart'), fetcher.get('/gone'), fetcher.get('/ok')]);
    expect(results.map((r) => r.status)).toEqual(['rejected', 'rejected', 'fulfilled']);
    expect((results[0] as PromiseRejectedResult).reason).toBeInstanceOf(PathDisallowed);
    expect((results[1] as PromiseRejectedResult).reason).toBeInstanceOf(PageGone);
  });
});

describe('Crawl-delay limit', () => {
  const roboFor = (delay: string) => robots(`User-agent: *\nCrawl-delay: ${delay}\n`);

  it.each(['61', '1e7', '3000000', '1e999'])('Crawl-delay %s stops with crawl-delay after robots and before any page request', async (delay) => {
    const f = makeFetch(roboFor(delay));
    const clock = makeClock();
    expect(await stopReason(createPoliteFetcher({ origin: ORIGIN, fetchFn: f.fetchFn, sleep: clock.sleep, now: clock.now }))).toBe('crawl-delay');
    expect(f.calls).toHaveLength(1);
    expect(clock.sleeps).toEqual([]);
  });

  it('exactly 60 s is honoured', async () => {
    const { fetcher, clock } = await create(roboFor('60'));
    await fetcher.get('/a');
    expect(clock.sleeps).toEqual([60000]);
  });
});

describe('response charset', () => {
  const SJIS = [0x8e, 0x52, 0x8d, 0xe8]; // 山崎
  const EUC = [0xbb, 0xb3, 0xba, 0xea]; // 山崎
  const ascii = (s: string) => Array.from(Buffer.from(s, 'latin1'));
  const bytesResponse = (bytes: number[], headers: Record<string, string> = {}) =>
    new Response(new Uint8Array(bytes), { status: 200, headers });

  it('decodes Shift_JIS from the Content-Type charset', async () => {
    const { fetcher } = await create({ '/s': () => bytesResponse(SJIS, { 'content-type': 'text/html; charset=Shift_JIS' }) });
    expect(await fetcher.get('/s')).toBe('山崎');
  });

  it('decodes EUC-JP from the Content-Type charset', async () => {
    const { fetcher } = await create({ '/e': () => bytesResponse(EUC, { 'content-type': 'text/html; charset="EUC-JP"' }) });
    expect(await fetcher.get('/e')).toBe('山崎');
  });

  it.each(['cp932', 'MS932', 'windows-31j', 'x-sjis'])('treats the Windows Shift_JIS label %s as shift_jis', async (label) => {
    const { fetcher } = await create({ '/w': () => bytesResponse(SJIS, { 'content-type': `text/html; charset=${label}` }) });
    expect(await fetcher.get('/w')).toBe('山崎');
  });

  it('sniffs <meta charset> when Content-Type has none', async () => {
    const body = [...ascii('<html><head><meta charset="shift_jis"></head><body>'), ...SJIS];
    const { fetcher } = await create({ '/m': () => bytesResponse(body, { 'content-type': 'text/html' }) });
    expect(await fetcher.get('/m')).toContain('山崎');
  });

  it('sniffs <meta http-equiv content=...charset=>', async () => {
    const body = [...ascii('<head><meta http-equiv="Content-Type" content="text/html; charset=EUC-JP"></head>'), ...EUC];
    const { fetcher } = await create({ '/h': () => bytesResponse(body) });
    expect(await fetcher.get('/h')).toContain('山崎');
  });

  it('defaults to UTF-8, and falls back to it for an unknown charset', async () => {
    const utf8 = Array.from(Buffer.from('山崎', 'utf8'));
    const { fetcher } = await create({
      '/u': () => bytesResponse(utf8),
      '/x': () => bytesResponse(utf8, { 'content-type': 'text/html; charset=no-such-charset' }),
    });
    expect(await fetcher.get('/u')).toBe('山崎');
    expect(await fetcher.get('/x')).toBe('山崎');
  });

  it('keeps the byte cap on bytes, not characters', async () => {
    // 1.1M characters but about 3.3 MB of UTF-8, over the 3 MiB cap.
    const { fetcher } = await create({ '/big': () => html('山'.repeat(1_100_000)) });
    await expect(fetcher.get('/big')).rejects.toThrow(/too large/i);
  });
});
