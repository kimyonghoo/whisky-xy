import { describe, it, expect } from 'vitest';
import { fetchCatalog, fetchLiveProduct, CurrencyMismatchError, storeHeaders, loadShopifyRobots, RobotsRefusal } from '@/lib/shopify/client';
import { CrawlStopped } from '@/lib/pagecrawl/fetcher';
import { parseRobots } from '@/lib/pagecrawl/robots';
import type { Store } from '@/lib/stores';

const store = { id: 'dewinespot', name: 'De Wine Spot', domain: 'dewinespot.co', city: 'brooklyn', currency: 'USD' } as Store;
const jpStore = { id: 'jpshop', name: 'JP Shop', domain: 'jp.example', city: 'tokyo', currency: 'JPY' } as Store;
const HOST = 'https://dewinespot.co';

interface Call { url: string; headers: Record<string, string> }
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}
function makeFake(route: (url: string) => Response) {
  const calls: Call[] = [];
  const fn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, headers: (init?.headers ?? {}) as Record<string, string> });
    return route(url);
  }) as typeof fetch & { calls: Call[] };
  fn.calls = calls;
  return fn;
}
const prod = (id: number) => ({ id, title: `P${id}`, handle: `p${id}`, vendor: 'v', product_type: 't', tags: [], images: [], variants: [] });
const usd = () => json({ currency: 'USD' });

describe('fetchCatalog', () => {
  it('pages until empty and sends USD cookie', async () => {
    const fake = makeFake((url) => {
      if (url.endsWith('/cart.js')) return usd();
      if (url.endsWith('page=1')) return json({ products: [prod(1), prod(2)] });
      if (url.endsWith('page=2')) return json({ products: [prod(3)] });
      return json({ products: [] });
    });
    const { products, complete } = await fetchCatalog(store, { fetchFn: fake, delayMs: 0 });
    expect(products).toHaveLength(3);
    expect(complete).toBe(true);
    expect(fake.calls.every((c) => c.headers.Cookie === 'localization=US; cart_currency=USD')).toBe(true);
    expect(fake.calls.every((c) => c.headers['User-Agent'].startsWith('WhiskyPortalBot/0.1'))).toBe(true);
    expect(fake.calls.map((c) => c.url)).toContain(`${HOST}/products.json?limit=250&page=3`);
  });
  it('throws CurrencyMismatchError when cart.js reports KRW', async () => {
    const fake = makeFake(() => json({ currency: 'KRW' }));
    await expect(fetchCatalog(store, { fetchFn: fake, delayMs: 0 })).rejects.toBeInstanceOf(CurrencyMismatchError);
    expect(fake.calls).toHaveLength(1);
  });
  it('throws (no partial result) when page 2 returns 429', async () => {
    const fake = makeFake((url) => {
      if (url.endsWith('/cart.js')) return usd();
      if (url.endsWith('page=1')) return json({ products: [prod(1)] });
      return json({}, 429);
    });
    await expect(fetchCatalog(store, { fetchFn: fake, delayMs: 0 })).rejects.toThrow(/429/);
  });
  it('stops at maxPages and reports incomplete', async () => {
    const fake = makeFake((url) => (url.endsWith('/cart.js') ? usd() : json({ products: [prod(1)] })));
    const { products, complete, stoppedBy } = await fetchCatalog(store, { fetchFn: fake, delayMs: 0, maxPages: 2 });
    expect(products).toHaveLength(2);
    expect(complete).toBe(false);
    expect(stoppedBy).toBe('page-limit');
  });
  it('crawls the store collection path when catalogPath is set', async () => {
    const fake = makeFake((url) => {
      if (url.endsWith('/cart.js')) return usd();
      if (url.endsWith('page=1')) return json({ products: [prod(1)] });
      return json({ products: [] });
    });
    const { complete } = await fetchCatalog({ ...store, catalogPath: '/collections/whiskeys/products.json' }, { fetchFn: fake, delayMs: 0 });
    expect(complete).toBe(true);
    expect(fake.calls.map((c) => c.url)).toEqual([
      `${HOST}/cart.js`,
      `${HOST}/collections/whiskeys/products.json?limit=250&page=1`,
      `${HOST}/collections/whiskeys/products.json?limit=250&page=2`,
    ]);
  });
  it('rejects a catalogPath that is not a products.json endpoint', async () => {
    const fake = makeFake(() => usd());
    for (const catalogPath of ['/admin/products.json', '//evil.com/products.json', '/collections/../x/products.json', 'products.json']) {
      await expect(fetchCatalog({ ...store, catalogPath }, { fetchFn: fake, delayMs: 0 })).rejects.toThrow(/invalid catalogPath/);
    }
  });
  it('waits delayMs between requests', async () => {
    const fake = makeFake((url) => (url.endsWith('/cart.js') ? usd() : json({ products: [] })));
    const t = Date.now();
    await fetchCatalog(store, { fetchFn: fake, delayMs: 60 });
    expect(Date.now() - t).toBeGreaterThanOrEqual(55);
  });
});

describe('fetchLiveProduct', () => {
  const liveFake = () =>
    makeFake((url) => {
      if (url.endsWith('/cart.js')) return usd();
      if (url.endsWith('/products/stagg.js')) return json({ variants: [{ id: 11, price: 17500, available: true }] });
      return json({}, 404);
    });
  it('returns cents and null on 404', async () => {
    expect(await fetchLiveProduct(store, 'stagg', { fetchFn: liveFake() })).toEqual([{ id: 11, priceCents: 17500, available: true }]);
    expect(await fetchLiveProduct(store, 'gone', { fetchFn: liveFake() })).toBeNull();
  });
  it('throws on currency mismatch', async () => {
    const fake = makeFake((url) => (url.endsWith('/cart.js') ? json({ currency: 'KRW' }) : json({ variants: [] })));
    await expect(fetchLiveProduct(store, 'stagg', { fetchFn: fake })).rejects.toBeInstanceOf(CurrencyMismatchError);
  });
});

describe('storeHeaders', () => {
  it('has cookie and UA', () => {
    expect(storeHeaders(store).Cookie).toBe('localization=US; cart_currency=USD');
  });
  it('sends the JP cookie for a JPY store', () => {
    expect(storeHeaders(jpStore).Cookie).toBe('localization=JP; cart_currency=JPY');
  });
});

describe('JPY store', () => {
  it('sends the JPY cookie and accepts a JPY cart', async () => {
    const fake = makeFake((url) => (url.endsWith('/cart.js') ? json({ currency: 'JPY' }) : json({ products: [] })));
    await fetchCatalog(jpStore, { fetchFn: fake, delayMs: 0 });
    expect(fake.calls.length).toBeGreaterThan(0);
    for (const c of fake.calls) expect(c.headers.Cookie).toBe('localization=JP; cart_currency=JPY');
  });
  it('throws CurrencyMismatchError when a JPY store reports USD', async () => {
    const fake = makeFake((url) => (url.endsWith('/cart.js') ? usd() : json({ products: [] })));
    const err = await fetchCatalog(jpStore, { fetchFn: fake, delayMs: 0 }).catch((e) => e);
    expect(err).toBeInstanceOf(CurrencyMismatchError);
    expect(err.message).toBe('Expected JPY but store reported USD');
  });
  it('live recheck refuses a non-USD store before any request (.js prices are subunits x100)', async () => {
    const fake = makeFake(() => json({ currency: 'JPY', variants: [] }));
    await expect(fetchLiveProduct(jpStore, 'x', { fetchFn: fake })).rejects.toThrow(/live recheck.*JPY/i);
    expect(fake.calls).toHaveLength(0);
  });
});

describe('hardening', () => {
  it('rejects when a request hangs past timeoutMs', async () => {
    const hang = ((_u: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_res, rej) => {
        init?.signal?.addEventListener('abort', () => rej(init.signal!.reason));
      })) as typeof fetch;
    await expect(fetchCatalog(store, { fetchFn: hang, delayMs: 0, timeoutMs: 50 })).rejects.toBeTruthy();
  });
  it('rejects with domain and content-type on non-JSON 200', async () => {
    const fake = makeFake((url) =>
      url.endsWith('/cart.js')
        ? usd()
        : new Response('<html>challenge</html>', { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } }),
    );
    await expect(fetchCatalog(store, { fetchFn: fake, delayMs: 0 })).rejects.toThrow(/dewinespot\.co.*text\/html/);
  });
  it('rejects on 301 and always requests with redirect manual', async () => {
    const seen: (RequestRedirect | undefined)[] = [];
    const fake = (async (input: RequestInfo | URL, init?: RequestInit) => {
      seen.push(init?.redirect);
      return String(input).endsWith('/cart.js')
        ? usd()
        : new Response(null, { status: 301, headers: { location: 'https://evil.example/' } });
    }) as typeof fetch;
    await expect(fetchCatalog(store, { fetchFn: fake, delayMs: 0 })).rejects.toThrow(/301/);
    expect(seen.every((r) => r === 'manual')).toBe(true);
  });
  it('live: throws on non-integer price', async () => {
    const fake = makeFake((url) =>
      url.endsWith('/cart.js') ? usd() : json({ variants: [{ id: 1, price: '175.00', available: true }] }),
    );
    await expect(fetchLiveProduct(store, 'x', { fetchFn: fake })).rejects.toThrow(/price/);
  });
});

describe('robots-checked catalog crawl (non-USD stores)', () => {
  const JP = 'https://jp.example';
  const noSleep = async () => {};
  const coll = { ...jpStore, catalogPath: '/collections/whisky/products.json' } as Store;
  const meta = (currency = 'JPY') => json({ currency });
  const catalogFake = () =>
    makeFake((url) => {
      if (url.endsWith('/meta.json')) return meta();
      if (url.endsWith('page=1')) return json({ products: [prod(1)] });
      return json({ products: [] });
    });

  it('loadShopifyRobots: fetches /robots.txt once with the bot UA and no cookie, and parses it', async () => {
    const fake = makeFake(() => new Response('User-agent: *\nDisallow: /cart.js\nCrawl-delay: 2\n', { status: 200 }));
    const robots = await loadShopifyRobots(coll, { fetchFn: fake });
    expect(fake.calls.map((c) => c.url)).toEqual([`${JP}/robots.txt`]);
    expect(fake.calls[0].headers['User-Agent']).toMatch(/^WhiskyPortalBot\/0\.1/);
    expect(fake.calls[0].headers.Cookie).toBeUndefined();
    expect(robots.isAllowed('/cart.js')).toBe(false);
    expect(robots.isAllowed('/collections/whisky/products.json?limit=250&page=1')).toBe(true);
    expect(robots.crawlDelayMs).toBe(2000);
  });

  it('loadShopifyRobots: 404 means no rules', async () => {
    const robots = await loadShopifyRobots(coll, { fetchFn: makeFake(() => new Response('nope', { status: 404 })) });
    expect(robots.isAllowed('/cart.js')).toBe(true);
  });

  it('loadShopifyRobots: any other failure refuses the store', async () => {
    const replies = [
      () => new Response('x', { status: 500 }),
      () => new Response('', { status: 301, headers: { location: '/x' } }),
      () => new Response('x', { status: 503 }),
    ];
    for (const reply of replies) {
      await expect(loadShopifyRobots(coll, { fetchFn: makeFake(reply) })).rejects.toBeInstanceOf(RobotsRefusal);
    }
    const throwing = (async () => { throw new Error('ECONNRESET'); }) as unknown as typeof fetch;
    await expect(loadShopifyRobots(coll, { fetchFn: throwing })).rejects.toBeInstanceOf(RobotsRefusal);
    const slow = makeFake(() => new Response('User-agent: *\nCrawl-delay: 120\n', { status: 200 }));
    await expect(loadShopifyRobots(coll, { fetchFn: slow })).rejects.toThrow(/crawl-delay/i);
  });

  it('loadShopifyRobots: a cf-mitigated challenge on robots.txt is a challenge stop (any status)', async () => {
    for (const status of [200, 403, 503]) {
      const fake = makeFake(() => new Response('User-agent: *\nDisallow:\n', { status, headers: { 'cf-mitigated': 'challenge' } }));
      const err = await loadShopifyRobots(coll, { fetchFn: fake }).catch((e) => e);
      expect(err, String(status)).toBeInstanceOf(CrawlStopped);
      expect(err.reason, String(status)).toBe('challenge');
      expect(fake.calls).toHaveLength(1);
    }
  });

  it('loadShopifyRobots: a robots.txt 403 or 429 is a block stop (http-403 / http-429), with no further request', async () => {
    for (const [status, reason] of [[403, 'http-403'], [429, 'http-429']] as const) {
      const fake = makeFake(() => new Response('x', { status }));
      const err = await loadShopifyRobots(coll, { fetchFn: fake }).catch((e) => e);
      expect(err, String(status)).toBeInstanceOf(CrawlStopped);
      expect(err.reason, String(status)).toBe(reason);
      expect(fake.calls).toHaveLength(1);
    }
  });

  it('loadShopifyRobots: a refusal says why (robots-unavailable or crawl-delay)', async () => {
    const unavailable = await loadShopifyRobots(coll, { fetchFn: makeFake(() => new Response('x', { status: 500 })) }).catch((e) => e);
    expect(unavailable.reason).toBe('robots-unavailable');
    const slow = makeFake(() => new Response('User-agent: *\nCrawl-delay: 120\n', { status: 200 }));
    expect((await loadShopifyRobots(coll, { fetchFn: slow }).catch((e) => e)).reason).toBe('crawl-delay');
  });

  it('robots-checked crawls stop on 403, 429, 503 or a challenge header, on /meta.json or a catalog page, without another request', async () => {
    const robots = parseRobots('', 'WhiskyPortalBot');
    const cases: [string, () => Response, string][] = [
      ['/meta.json', () => new Response('x', { status: 403 }), 'http-403'],
      ['page=1', () => new Response('x', { status: 429 }), 'http-429'],
      ['page=1', () => new Response('x', { status: 503 }), 'http-503'],
      ['page=1', () => new Response('{"products":[]}', { status: 200, headers: { 'cf-mitigated': 'challenge' } }), 'challenge'],
      ['/meta.json', () => new Response('x', { status: 403, headers: { 'cf-mitigated': 'challenge' } }), 'challenge'],
    ];
    for (const [at, reply, reason] of cases) {
      const fake = makeFake((url) => (url.endsWith(at) ? reply() : url.endsWith('/meta.json') ? meta() : json({ products: [prod(1)] })));
      const err = await fetchCatalog(coll, { fetchFn: fake, delayMs: 0, robots, sleep: noSleep }).catch((e) => e);
      expect(err, `${at} ${reason}`).toBeInstanceOf(CrawlStopped);
      expect(err.reason, `${at} ${reason}`).toBe(reason);
      expect(fake.calls.at(-1)!.url.endsWith(at), `${at} ${reason}`).toBe(true);
    }
  });

  it('US catalog crawls keep failing a 403 or 429 as a plain error (unchanged)', async () => {
    const fake = makeFake((url) => (url.endsWith('/cart.js') ? usd() : json({}, 429)));
    const err = await fetchCatalog(store, { fetchFn: fake, delayMs: 0 }).catch((e) => e);
    expect(err).not.toBeInstanceOf(CrawlStopped);
    expect(err.message).toMatch(/HTTP 429/);
  });

  it('checks the currency through /meta.json (Shopify robots disallow /cart.js) and never requests /cart.js', async () => {
    const robots = parseRobots('User-agent: *\nDisallow: /cart.js\n', 'WhiskyPortalBot');
    const fake = catalogFake();
    const { products, complete } = await fetchCatalog(coll, { fetchFn: fake, delayMs: 0, robots, sleep: noSleep });
    expect(products).toHaveLength(1);
    expect(complete).toBe(true);
    expect(fake.calls.map((c) => c.url)).toEqual([
      `${JP}/meta.json`,
      `${JP}/collections/whisky/products.json?limit=250&page=1`,
      `${JP}/collections/whisky/products.json?limit=250&page=2`,
    ]);
  });

  it('a /meta.json currency other than the store currency aborts', async () => {
    const robots = parseRobots('', 'WhiskyPortalBot');
    const fake = makeFake((url) => (url.endsWith('/meta.json') ? meta('USD') : json({ products: [] })));
    await expect(fetchCatalog(coll, { fetchFn: fake, delayMs: 0, robots, sleep: noSleep })).rejects.toBeInstanceOf(CurrencyMismatchError);
    expect(fake.calls).toHaveLength(1);
  });

  it('refuses before any request when robots disallows /meta.json or any catalog page it could request', async () => {
    for (const rules of ['Disallow: /meta.json', 'Disallow: /collections/whisky/', 'Disallow: /*limit=250', 'Disallow: /*page=7$']) {
      const fake = catalogFake();
      const robots = parseRobots(`User-agent: *\n${rules}\n`, 'WhiskyPortalBot');
      const err = await fetchCatalog(coll, { fetchFn: fake, delayMs: 0, robots, maxPages: 10, sleep: noSleep }).catch((e) => e);
      expect(err, rules).toBeInstanceOf(RobotsRefusal);
      expect(err.message, rules).toMatch(/robots\.txt disallows/);
      expect(fake.calls, rules).toHaveLength(0);
    }
  });

  it('honours a Crawl-delay larger than delayMs between catalog requests, and keeps delayMs otherwise', async () => {
    const waits = async (rules: string) => {
      const slept: number[] = [];
      await fetchCatalog(coll, {
        fetchFn: catalogFake(), delayMs: 1100, robots: parseRobots(`User-agent: *\n${rules}\n`, 'WhiskyPortalBot'),
        sleep: async (ms) => { slept.push(ms); },
      });
      return slept;
    };
    // robots-checked (JPY) crawls wait before every request after robots.txt: /meta.json and each page
    expect(await waits('Crawl-delay: 5')).toEqual([5000, 5000, 5000]);
  });

  it('robots-checked crawls keep a 3 s floor between requests even when delayMs is lower; US keeps delayMs', async () => {
    const jpWaits: number[] = [];
    await fetchCatalog(coll, {
      fetchFn: catalogFake(), delayMs: 1100, robots: parseRobots('User-agent: *\nCrawl-delay: 0.5\n', 'WhiskyPortalBot'),
      sleep: async (ms) => { jpWaits.push(ms); },
    });
    expect(jpWaits).toEqual([3000, 3000, 3000]);
    const usWaits: number[] = [];
    const usFake = makeFake((url) => (url.endsWith('/cart.js') ? usd() : json({ products: [] })));
    await fetchCatalog(store, { fetchFn: usFake, delayMs: 1100, sleep: async (ms) => { usWaits.push(ms); } });
    expect(usWaits).toEqual([1100]);
  });

  it('robots-checked crawls stop at the deadline and return what they have, incomplete', async () => {
    let t = 0;
    const fake = makeFake((url) => {
      if (url.endsWith('/meta.json')) return meta();
      const page = Number(new URL(url).searchParams.get('page'));
      return json({ products: [prod(page)] }); // never-ending catalog
    });
    const r = await fetchCatalog(coll, {
      fetchFn: fake, robots: parseRobots('', 'WhiskyPortalBot'), deadlineMs: 10_000,
      sleep: async (ms) => { t += ms; }, now: () => t,
    });
    // waits of 3 s: meta at 3 s, pages at 6 s and 9 s; the next wait reaches 12 s > 10 s: stop
    expect(r).toEqual({ products: [prod(1), prod(2)], complete: false, stoppedBy: 'deadline' });
    expect(fake.calls.map((c) => new URL(c.url).pathname + new URL(c.url).search)).toEqual([
      '/meta.json', '/collections/whisky/products.json?limit=250&page=1', '/collections/whisky/products.json?limit=250&page=2',
    ]);
  });
});
