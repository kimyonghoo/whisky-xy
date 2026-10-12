import { describe, expect, it } from 'vitest';
import { botUserAgent } from '@/lib/bot-ua';
import { CrawlStopped, PageGone, createPoliteFetcher } from '@/lib/pagecrawl/fetcher';

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

  it('a challenge served as robots.txt fails closed', async () => {
    const f = makeFetch({ '/robots.txt': () => new Response('<script src="/cdn-cgi/challenge-platform/x"></script>', { status: 200 }) });
    expect(await stopReason(createPoliteFetcher({ origin: ORIGIN, fetchFn: f.fetchFn, sleep: async () => {}, now: () => 0 }))).toBe('challenge');
    expect(f.calls).toHaveLength(1);
  });

  it('a non-2xx robots.txt is robots-unavailable even when it looks like a challenge', async () => {
    const f = makeFetch({ '/robots.txt': () => new Response('cf-chl', { status: 403, headers: { 'cf-mitigated': 'challenge' } }) });
    expect(await stopReason(createPoliteFetcher({ origin: ORIGIN, fetchFn: f.fetchFn, sleep: async () => {}, now: () => 0 }))).toBe('robots-unavailable');
    expect(f.calls).toHaveLength(1);
  });

  it('maxRequests below 1 cannot even load robots', async () => {
    const f = makeFetch({});
    expect(await stopReason(createPoliteFetcher({ origin: ORIGIN, fetchFn: f.fetchFn, maxRequests: 0, sleep: async () => {}, now: () => 0 }))).toBe('budget');
    expect(f.calls).toHaveLength(0);
  });

  it('uses the WhiskyPortalBot group over *', async () => {
    const { fetcher, calls } = await create(robots('User-agent: *\nDisallow: /\n\nUser-agent: WhiskyPortalBot\nDisallow: /cart\n'));
    expect(await fetcher.get('/products/1')).toBe('<html>ok</html>');
    expect(await stopReason(fetcher.get('/cart'))).toBe('disallowed');
    expect(calls).toHaveLength(2);
  });
});

describe('disallowed paths and budget', () => {
  it('a disallowed path throws disallowed without fetching or sleeping', async () => {
    const { fetcher, calls, clock } = await create({});
    expect(await stopReason(fetcher.get('/cart'))).toBe('disallowed');
    expect(calls).toHaveLength(1);
    expect(clock.sleeps).toEqual([]);
    expect(fetcher.used()).toBe(1);
  });

  it('disallowed applies to the query string too', async () => {
    const { fetcher, calls } = await create(robots('User-agent: *\nDisallow: /*?sort=\n'));
    expect(await stopReason(fetcher.get('/list?sort=price'))).toBe('disallowed');
    expect(calls).toHaveLength(1);
  });

  it('a disallowed path does not stop later allowed paths', async () => {
    const { fetcher } = await create({});
    expect(await stopReason(fetcher.get('/cart'))).toBe('disallowed');
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

  it.each(['cf-chl', 'challenge-platform'])('a 2xx body containing %s is a challenge', async (marker) => {
    const { fetcher, calls } = await create({ '/x': html(`<html><script src="/${marker}/a.js"></script></html>`) });
    expect(await stopReason(fetcher.get('/x'))).toBe('challenge');
    expect(await stopReason(fetcher.get('/y'))).toBe('challenge');
    expect(calls).toHaveLength(2);
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
