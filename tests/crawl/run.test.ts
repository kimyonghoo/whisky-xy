import { describe, it, expect, beforeEach, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb } from '../helpers/db';
import { listings, priceHistory, watches } from '@/lib/db/schema';
import { runCrawl } from '@/lib/crawl/run';
import { dueProductPaths, getNextListPage } from '@/lib/crawl/page-state';
import { getStore } from '@/lib/stores';
import type { FetchFn } from '@/lib/shopify/client';

const flask = getStore('flask')!;
const cave = getStore('liquorcave')!;

const prod = (id: number, title: string, price: string, available: boolean) => ({
  id, title, handle: `h${id}`, vendor: 'V', product_type: 'Whiskey', tags: [], images: [],
  variants: [{ id: id * 10, title: 'Default Title', price, available }],
});

interface Site { currency?: string; pages: unknown[][]; failPage?: number; failStatus?: number }
function fakeFetch(sites: Record<string, Site>): FetchFn {
  return (async (input: string | URL | Request) => {
    const u = new URL(String(input));
    const site = sites[u.hostname];
    if (!site) return new Response('nope', { status: 404 });
    const json = (b: unknown, status = 200) =>
      new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } });
    if (u.pathname === '/cart.js') return json({ currency: site.currency ?? 'USD' });
    const page = Number(u.searchParams.get('page'));
    if (site.failPage === page) return json({}, site.failStatus ?? 429);
    return json({ products: site.pages[page - 1] ?? [] });
  }) as FetchFn;
}

let db: Awaited<ReturnType<typeof createTestDb>>;
let base: Parameters<typeof runCrawl>[0];
let tick: number;
beforeEach(async () => {
  db = await createTestDb();
  tick = 0;
  base = {
    db, stores: [flask, cave], delayMs: 0, siteUrl: 'https://site.test',
    now: () => new Date(Date.UTC(2026, 0, 1, 0, 0, 0) + tick++ * 3600_000),
    notify: async () => {},
  };
});

const flaskPages = [[prod(1, 'Flask Bourbon One', '40.00', true)], [prod(2, 'Flask Bourbon Two', '50.00', true)]];
const caveWith = (available: boolean) => [[prod(9, 'Stagg Bourbon 750ml', '99.99', available)]];

describe('runCrawl', () => {
  it('skips a failing store without touching its rows (no false sold_out)', async () => {
    const bothOk = fakeFetch({ [flask.domain]: { pages: flaskPages }, [cave.domain]: { pages: caveWith(true) } });
    await runCrawl({ ...base, fetchFn: bothOk });
    const before = await db.select().from(listings).where(eq(listings.storeId, 'flask'));
    expect(before).toHaveLength(2);
    const bad = fakeFetch({ [flask.domain]: { pages: flaskPages, failPage: 2 }, [cave.domain]: { pages: caveWith(true) } });
    const r = await runCrawl({ ...base, fetchFn: bad });
    expect(r.stores.find((s) => s.storeId === 'flask')).toMatchObject({ ok: false });
    expect(r.stores.find((s) => s.storeId === 'liquorcave')).toMatchObject({ ok: true });
    expect(await db.select().from(listings).where(eq(listings.storeId, 'flask'))).toEqual(before);
  });

  it('sends one notify per alert after a restock', async () => {
    await db.insert(watches).values({ label: 'Stagg', includeTerms: ['stagg'], excludeTerms: ['jr', 'junior', 'george'], cities: ['brooklyn', 'nj'], createdAt: new Date() });
    const fl = { pages: flaskPages };
    await runCrawl({ ...base, fetchFn: fakeFetch({ [flask.domain]: fl, [cave.domain]: { pages: caveWith(false) } }) });
    const sent: string[] = [];
    const r = await runCrawl({
      ...base, notify: async (t) => { sent.push(t); },
      fetchFn: fakeFetch({ [flask.domain]: fl, [cave.domain]: { pages: caveWith(true) } }),
    });
    expect(r.alertsSent).toBe(1);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toContain('재입고');
  });

  it('a failed notify does not abort the run and is not counted', async () => {
    await db.insert(watches).values({ label: 'Stagg', includeTerms: ['stagg'], excludeTerms: [], cities: ['nj'], createdAt: new Date() });
    const mk = (a: boolean) => fakeFetch({ [flask.domain]: { pages: flaskPages }, [cave.domain]: { pages: caveWith(a) } });
    await runCrawl({ ...base, fetchFn: mk(false) });
    const r = await runCrawl({ ...base, fetchFn: mk(true), notify: async () => { throw new Error('tg down'); } });
    expect(r.alertsSent).toBe(0);
    expect(r.stores.every((s) => s.ok)).toBe(true);
  });

  it('KRW store is reported failed and writes nothing', async () => {
    const f = fakeFetch({ [flask.domain]: { pages: flaskPages, currency: 'KRW' }, [cave.domain]: { pages: caveWith(true) } });
    const r = await runCrawl({ ...base, fetchFn: f });
    expect(r.stores.find((s) => s.storeId === 'flask')).toMatchObject({ ok: false });
    expect(await db.select().from(listings).where(eq(listings.storeId, 'flask'))).toHaveLength(0);
    expect(await db.select().from(listings).where(eq(listings.storeId, 'liquorcave'))).toHaveLength(1);
  });

  it('empty whisky crawl never marks everything sold out and is noted', async () => {
    await runCrawl({ ...base, fetchFn: fakeFetch({ [flask.domain]: { pages: flaskPages }, [cave.domain]: { pages: caveWith(true) } }) });
    const r = await runCrawl({ ...base, fetchFn: fakeFetch({ [flask.domain]: { pages: [[]] }, [cave.domain]: { pages: caveWith(true) } }) });
    const entry = r.stores.find((s) => s.storeId === 'flask') as { ok: boolean; note?: string };
    expect(entry.ok).toBe(true);
    expect(entry.note).toBeTruthy();
    const rows = await db.select().from(listings).where(eq(listings.storeId, 'flask'));
    expect(rows.every((l) => l.available)).toBe(true);
  });

  it('a throwing fx fetch is reported in the report and leaves store results ok', async () => {
    const inner = fakeFetch({ [flask.domain]: { pages: flaskPages }, [cave.domain]: { pages: caveWith(true) } });
    const f = (async (input: string | URL | Request, init?: RequestInit) => {
      if (new URL(String(input)).hostname === 'open.er-api.com') throw new Error('fx down');
      return inner(input, init);
    }) as FetchFn;
    const r = await runCrawl({ ...base, fetchFn: f });
    expect(r.stores.every((s) => s.ok)).toBe(true);
    expect(r.fx).toContain('fx down');
    expect(r.krLinks).toEqual({ ok: 0, failed: 0 });
  });

  it('reports fx ok when the rate fetch succeeds', async () => {
    const inner = fakeFetch({ [flask.domain]: { pages: flaskPages }, [cave.domain]: { pages: caveWith(true) } });
    const f = (async (input: string | URL | Request, init?: RequestInit) => {
      if (new URL(String(input)).hostname === 'open.er-api.com') return new Response(JSON.stringify({ result: 'success', rates: { KRW: 1400 } }));
      return inner(input, init);
    }) as FetchFn;
    expect((await runCrawl({ ...base, fetchFn: f })).fx).toBe('ok');
  });
});

// ---- Japanese stores: page crawl, robots-checked Shopify, private-crawl guards ----

const shinanoya = getStore('shinanoya')!;
const nemoto = getStore('nemoto')!;
const SITE = 'https://whisky-xy.vercel.app';
const itemId = (n: number) => String(n).padStart(12, '0');
const itemPath = (n: number) => `/view/item/${itemId(n)}`;
const listPath = (page: number) => `/view/category/ct755?page=${page}`;
const listHtml = (ns: number[]) =>
  `<html><body>${ns.map((n) => `<a href="${itemPath(n)}?category_page_id=ct755">x</a>`).join('')}</body></html>`;
function itemHtml(o: { name?: string; price?: string; availability?: string } = {}): string {
  const offer = { '@type': 'Offer', price: o.price ?? '5478', priceCurrency: 'JPY', availability: o.availability ?? 'http://schema.org/InStock' };
  const product = { '@context': 'http://schema.org', '@type': 'Product', name: o.name ?? 'ベンリアック 12年 700ml', offers: offer };
  return `<html><head><script type="application/ld+json">${JSON.stringify(product)}</script></head><body></body></html>`;
}
type Reply = string | number | undefined;
/** A fake network for every host: `route(host, path)` returns a body (200), a status, or undefined (404). */
function net(route: (host: string, path: string) => Reply) {
  const calls: string[] = [];
  const fetchFn = (async (input: string | URL | Request) => {
    const u = new URL(String(input));
    calls.push(`${u.hostname}${u.pathname}${u.search}`);
    const r = route(u.hostname, u.pathname + u.search);
    if (r === undefined) return new Response('not found', { status: 404 });
    if (typeof r === 'number') return new Response('x', { status: r });
    return new Response(r, { status: 200, headers: { 'content-type': r.startsWith('{') ? 'application/json' : 'text/html; charset=utf-8' } });
  }) as FetchFn;
  return { fetchFn, calls, storeCalls: (host: string) => calls.filter((c) => c.startsWith(host)).map((c) => c.slice(host.length)) };
}
/** Shinanoya site: robots 404; `lists[page]` are list pages; items answer `items(n)`. */
const shinanoyaSite = (lists: Record<number, number[]>, items: (n: number) => Reply = () => itemHtml()) =>
  (host: string, path: string): Reply => {
    if (host !== shinanoya.domain) return undefined;
    const l = /^\/view\/category\/ct755\?page=(\d+)$/.exec(path);
    if (l) return lists[Number(l[1])] ? listHtml(lists[Number(l[1])]) : listHtml([]);
    const i = /^\/view\/item\/(\d+)$/.exec(path);
    if (i) return items(Number(i[1]));
    return undefined;
  };
const rowsOf = async (storeId: string) =>
  (await db.select().from(listings).where(eq(listings.storeId, storeId))).sort((a, b) => a.variantId.localeCompare(b.variantId));

describe('runCrawl: Japanese stores', () => {
  let jp: Parameters<typeof runCrawl>[0];
  beforeEach(() => {
    vi.stubEnv('SITE_URL', SITE);
    jp = { ...base, pageSleep: async () => {} };
    return () => vi.unstubAllEnvs();
  });

  it('page store: robots first, list pages, item pages; JPY facts-only listings without a sweep', async () => {
    const n = net(shinanoyaSite({ 1: [1, 2] }));
    const r = await runCrawl({ ...jp, stores: [shinanoya], fetchFn: n.fetchFn });
    expect(n.storeCalls(shinanoya.domain)).toEqual(['/robots.txt', listPath(1), listPath(2), itemPath(1), itemPath(2)]);
    const rows = await rowsOf('shinanoya');
    expect(rows.map((l) => [l.variantId, l.currency, l.priceCents, l.available, l.imageUrl, l.url])).toEqual([
      [itemId(1), 'JPY', 5478, true, null, `https://shinanoya-tokyo.jp${itemPath(1)}`],
      [itemId(2), 'JPY', 5478, true, null, `https://shinanoya-tokyo.jp${itemPath(2)}`],
    ]);
    expect(r.stores[0]).toMatchObject({ storeId: 'shinanoya', ok: true, observations: 2 });
    expect(r.stores[0].page).toMatchObject({ requests: 5, listPages: 2, nextListPage: 1 });
  });

  it('passes the store listings as due paths, oldest checked first, before new list items', async () => {
    await runCrawl({ ...jp, stores: [shinanoya], fetchFn: net(shinanoyaSite({ 1: [1, 2, 3] })).fetchFn });
    // item 2 was checked most recently; items 1 and 3 tie, oldest first by id
    await db.update(listings).set({ checkedAt: new Date(Date.UTC(2027, 0, 1)) }).where(eq(listings.variantId, itemId(2)));
    expect(await dueProductPaths(db, 'shinanoya', 10)).toEqual([itemPath(1), itemPath(3), itemPath(2)]);
    expect(await dueProductPaths(db, 'shinanoya', 2)).toEqual([itemPath(1), itemPath(3)]);
    const n = net(shinanoyaSite({ 1: [9] }));
    await runCrawl({ ...jp, stores: [shinanoya], fetchFn: n.fetchFn });
    expect(n.storeCalls(shinanoya.domain).filter((c) => c.startsWith('/view/item/'))).toEqual([itemPath(1), itemPath(3), itemPath(2), itemPath(9)]);
  });

  it('never marks a listing sold out for not being reached (markMissingSoldOut false)', async () => {
    await runCrawl({ ...jp, stores: [shinanoya], fetchFn: net(shinanoyaSite({ 1: [1, 2] })).fetchFn });
    // the first due item answers 403: the store stops, item 2 is never reached
    const r = await runCrawl({ ...jp, stores: [shinanoya], fetchFn: net(shinanoyaSite({}, (k) => (k === 1 ? 403 : itemHtml()))).fetchFn });
    expect(r.stores[0]).toMatchObject({ ok: true, observations: 0, note: 'stopped: http-403' });
    expect((await rowsOf('shinanoya')).map((l) => l.available)).toEqual([true, true]);
  });

  it('applies per-path outcomes: gone sells out, other skips only bump checkedAt, unknown paths are not stored', async () => {
    await runCrawl({ ...jp, stores: [shinanoya], fetchFn: net(shinanoyaSite({ 1: [1, 2, 3, 4] })).fetchFn });
    const before = await rowsOf('shinanoya');
    const items = (k: number): Reply =>
      k === 1 ? itemHtml({ price: '6000' }) // observed: price change
        : k === 2 ? undefined // 404: gone
          : k === 3 ? itemHtml({ availability: 'http://schema.org/PreOrder' }) // noAvailability
            : k === 4 ? 500 // error
              : itemHtml({ name: '山崎 飲み比べセット' }); // fresh, notWhisky
    const r = await runCrawl({ ...jp, stores: [shinanoya], fetchFn: net(shinanoyaSite({ 1: [5] }, items)).fetchFn });
    const after = await rowsOf('shinanoya');
    expect(after.map((l) => l.variantId)).toEqual([itemId(1), itemId(2), itemId(3), itemId(4)]); // 5 not stored
    expect(after.map((l) => [l.priceCents, l.available])).toEqual([[6000, true], [5478, false], [5478, true], [5478, true]]);
    for (let i = 0; i < 4; i++) expect(after[i].checkedAt.getTime()).toBeGreaterThan(before[i].checkedAt.getTime());
    // only the observed and the gone listing changed; skips leave updatedAt alone
    expect(after[2].updatedAt).toEqual(before[2].updatedAt);
    expect(after[3].updatedAt).toEqual(before[3].updatedAt);
    expect(after[1].updatedAt.getTime()).toBeGreaterThan(before[1].updatedAt.getTime());
    const hist = await db.select().from(priceHistory).where(eq(priceHistory.listingId, after[1].id));
    expect(hist.map((h) => h.available)).toEqual([true, false]);
    expect(r.stores[0].events).toBe(2); // price change + sold out
    expect(r.stores[0].page?.skipped).toMatchObject({ gone: 1, noAvailability: 1, error: 1, notWhisky: 1 });
  });

  it('reports stopped: budget at 300 requests and keeps what it gathered', async () => {
    const lists: Record<number, number[]> = {};
    for (let p = 1; p <= 20; p++) lists[p] = Array.from({ length: 30 }, (_, i) => p * 100 + i);
    const n = net(shinanoyaSite(lists));
    const r = await runCrawl({ ...jp, stores: [shinanoya], fetchFn: n.fetchFn });
    expect(n.storeCalls(shinanoya.domain)).toHaveLength(300);
    expect(r.stores[0]).toMatchObject({ ok: true, observations: 279, note: 'stopped: budget' });
    expect(r.stores[0].page).toMatchObject({ requests: 300, listPages: 20, nextListPage: 21 });
    expect(await rowsOf('shinanoya')).toHaveLength(279);
  });

  it('persists nextListPage between runs and starts the next run there', async () => {
    const lists: Record<number, number[]> = {};
    for (let p = 1; p <= 25; p++) lists[p] = [p];
    await runCrawl({ ...jp, stores: [shinanoya], fetchFn: net(shinanoyaSite(lists)).fetchFn });
    expect(await getNextListPage(db, 'shinanoya')).toBe(21);
    const n = net(shinanoyaSite(lists));
    await runCrawl({ ...jp, stores: [shinanoya], fetchFn: n.fetchFn });
    const reads = n.storeCalls(shinanoya.domain).filter((c) => c.startsWith('/view/category/'));
    expect(reads[0]).toBe(listPath(21));
    expect(await getNextListPage(db, 'shinanoya')).toBe(1); // page 26 was empty: wrapped
  });

  it('a stop before any page (robots unavailable) changes nothing and is reported', async () => {
    await runCrawl({ ...jp, stores: [shinanoya], fetchFn: net(shinanoyaSite({ 1: [1] })).fetchFn });
    const before = await rowsOf('shinanoya');
    const n = net((host, path) => (path === '/robots.txt' ? 503 : shinanoyaSite({ 1: [1] })(host, path)));
    const r = await runCrawl({ ...jp, stores: [shinanoya], fetchFn: n.fetchFn });
    expect(n.storeCalls(shinanoya.domain)).toEqual(['/robots.txt']);
    expect(r.stores[0]).toMatchObject({ ok: true, observations: 0, note: 'stopped: robots-unavailable' });
    expect(await rowsOf('shinanoya')).toEqual(before);
  });

  it('a crawlEnabled false store makes zero requests and is reported skipped', async () => {
    const n = net(shinanoyaSite({ 1: [1] }));
    const r = await runCrawl({ ...jp, stores: [{ ...shinanoya, crawlEnabled: false }, { ...nemoto, crawlEnabled: false }], fetchFn: n.fetchFn });
    expect(n.storeCalls(shinanoya.domain)).toEqual([]);
    expect(n.storeCalls(nemoto.domain)).toEqual([]);
    expect(r.stores.map((s) => [s.storeId, s.ok, s.note])).toEqual([
      ['shinanoya', true, 'skipped: crawl disabled (terms)'],
      ['nemoto', true, 'skipped: crawl disabled (terms)'],
    ]);
  });

  it('JPY stores are skipped without SITE_URL (no contact URL in the UA); US stores still run', async () => {
    vi.stubEnv('SITE_URL', '');
    const n = net((host, path) => {
      if (host === flask.domain) return path === '/cart.js' ? '{"currency":"USD"}' : '{"products":[]}';
      return shinanoyaSite({ 1: [1] })(host, path);
    });
    const r = await runCrawl({ ...jp, stores: [shinanoya, nemoto, flask], fetchFn: n.fetchFn });
    expect(n.storeCalls(shinanoya.domain)).toEqual([]);
    expect(n.storeCalls(nemoto.domain)).toEqual([]);
    expect(n.storeCalls(flask.domain).length).toBeGreaterThan(0);
    expect(r.stores.map((s) => [s.storeId, s.ok, s.note])).toEqual([
      ['shinanoya', false, 'skipped: SITE_URL unset'],
      ['nemoto', false, 'skipped: SITE_URL unset'],
      ['flask', true, 'anomaly: no whisky observations; missing listings not marked sold out'],
    ]);
  });

  const nemotoSite = (robots: Reply, products: unknown[] = []) => (host: string, path: string): Reply => {
    if (host !== nemoto.domain) return undefined;
    if (path === '/robots.txt') return robots;
    if (path === '/meta.json') return '{"currency":"JPY"}';
    if (path === '/collections/whisky/products.json?limit=250&page=1') return JSON.stringify({ products });
    if (path.startsWith('/collections/whisky/products.json')) return '{"products":[]}';
    return undefined;
  };
  const yamazaki = {
    id: 7, title: '山崎 12年 700ml', handle: 'yamazaki-12', vendor: 'サントリー', product_type: '', tags: [],
    images: [{ src: 'https://nemoto-shouten.com/cdn/shop/files/y.jpg' }],
    variants: [{ id: 70, title: 'Default Title', price: '27500', available: true }],
  };

  it('JPY Shopify store: robots checked first, currency from /meta.json, never /cart.js; JPY listings', async () => {
    const n = net(nemotoSite('User-agent: *\nDisallow: /cart.js\n', [yamazaki]));
    const r = await runCrawl({ ...jp, stores: [nemoto], fetchFn: n.fetchFn });
    expect(n.storeCalls(nemoto.domain)).toEqual([
      '/robots.txt', '/meta.json',
      '/collections/whisky/products.json?limit=250&page=1', '/collections/whisky/products.json?limit=250&page=2',
    ]);
    expect(r.stores[0]).toMatchObject({ storeId: 'nemoto', ok: true, observations: 1 });
    const rows = await rowsOf('nemoto');
    expect(rows.map((l) => [l.currency, l.priceCents, l.imageUrl, l.title])).toEqual([['JPY', 27500, null, '山崎 12年 700ml']]);
  });

  it('JPY Shopify store: a robots disallow or an unreadable robots.txt skips it with a note and no catalog request', async () => {
    for (const [robots, note] of [
      ['User-agent: *\nDisallow: /collections/\n', 'skipped: robots.txt disallows /collections/whisky/products.json?limit=250&page=1'],
      [500, 'skipped: robots.txt unavailable: HTTP 500'],
    ] as const) {
      const n = net(nemotoSite(robots, [yamazaki]));
      const r = await runCrawl({ ...jp, stores: [nemoto], fetchFn: n.fetchFn });
      expect(n.storeCalls(nemoto.domain)).toEqual(['/robots.txt']);
      expect(r.stores[0]).toMatchObject({ storeId: 'nemoto', ok: true, observations: 0, note });
    }
    expect(await rowsOf('nemoto')).toEqual([]);
  });

  it('JPY Shopify store: robots 404 means no rules', async () => {
    const n = net(nemotoSite(undefined, [yamazaki]));
    const r = await runCrawl({ ...jp, stores: [nemoto], fetchFn: n.fetchFn });
    expect(r.stores[0]).toMatchObject({ ok: true, observations: 1 });
  });

  it('US Shopify stores do not fetch robots.txt (unchanged)', async () => {
    const n = net((host, path) => (host === flask.domain ? (path === '/cart.js' ? '{"currency":"USD"}' : '{"products":[]}') : undefined));
    await runCrawl({ ...jp, stores: [flask], fetchFn: n.fetchFn });
    expect(n.storeCalls(flask.domain)[0]).toBe('/cart.js');
    expect(n.storeCalls(flask.domain)).not.toContain('/robots.txt');
  });
});
