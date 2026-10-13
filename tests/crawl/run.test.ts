import { describe, it, expect, beforeEach, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb } from '../helpers/db';
import { listings, priceHistory, watches } from '@/lib/db/schema';
import { runCrawl } from '@/lib/crawl/run';
import { dueProductPaths, getNextListPage } from '@/lib/crawl/page-state';
import { clearBlock, getBlock } from '@/lib/crawl/block-state';
import { ingestStoreCrawl } from '@/lib/crawl/ingest';
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
    jp = { ...base, politeSleep: async () => {} };
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

  it('a page store that hits the 20-minute deadline keeps its partial work, and the run goes on', async () => {
    // flask: a sold-out Stagg now, restocked in the deadline run, so the alert step has work to do
    await runCrawl({ ...base, stores: [flask], fetchFn: fakeFetch({ [flask.domain]: { pages: caveWith(false) } }) });
    await db.insert(watches).values({ label: 'Stagg', includeTerms: ['stagg'], excludeTerms: [], cities: ['la'], createdAt: new Date() });
    const lists: Record<number, number[]> = {};
    for (let p = 1; p <= 20; p++) lists[p] = Array.from({ length: 30 }, (_, i) => p * 100 + i);
    const site = shinanoyaSite(lists);
    const usOk = fakeFetch({ [flask.domain]: { pages: caveWith(true) } });
    let t = 0;
    const n = net((host, path) => {
      if (host === shinanoya.domain) {
        t += 10_000; // every shinanoya response takes 10 s
        return site(host, path);
      }
      return undefined;
    });
    const fetchFn = (async (input: string | URL | Request, init?: RequestInit) => {
      const host = new URL(String(input)).hostname;
      return host === flask.domain ? usOk(input, init) : n.fetchFn(input, init);
    }) as FetchFn;
    const sent: string[] = [];
    const r = await runCrawl({
      ...jp, stores: [shinanoya, flask], fetchFn, notify: async (m) => { sent.push(m); },
      politeSleep: async (ms) => { t += ms; }, politeNow: () => t,
    });
    // 1,200 s / 10 s per response = 120 requests: robots + 20 list pages + 99 items
    expect(n.storeCalls(shinanoya.domain)).toHaveLength(120);
    expect(r.stores[0]).toMatchObject({ storeId: 'shinanoya', ok: true, observations: 99, note: 'stopped: deadline' });
    expect(await rowsOf('shinanoya')).toHaveLength(99);
    expect(await getNextListPage(db, 'shinanoya')).toBe(21);
    // the loop continued to the next store and to the post-loop steps
    expect(r.stores[1]).toMatchObject({ storeId: 'flask', ok: true });
    expect(n.calls.some((c) => c.startsWith('open.er-api.com'))).toBe(true);
    expect(r.krLinks).toEqual({ ok: 0, failed: 0 });
    expect(r.alertsSent).toBe(1);
    expect(sent[0]).toContain('재입고');
  });

  it('caps re-checks at 150 known pages, so new list items are still fetched', async () => {
    const obs = Array.from({ length: 200 }, (_, i) => {
      const id = itemId(i + 1);
      return {
        storeId: 'shinanoya', productId: id, variantId: id, handle: id, title: `ベンリアック ${i + 1}`, variantTitle: null,
        vendor: '', productType: '', imageUrl: null, url: `https://shinanoya-tokyo.jp${itemPath(i + 1)}`, priceCents: 5000,
        currency: 'JPY' as const, available: true, sizeMl: 700, proof: null, batch: null, bottleKey: `k${i}`, searchText: 'x',
      };
    });
    await ingestStoreCrawl(db, 'shinanoya', obs, new Date(Date.UTC(2025, 0, 1)));
    const n = net(shinanoyaSite({ 1: [9001, 9002, 9003] }));
    await runCrawl({ ...jp, stores: [shinanoya], fetchFn: n.fetchFn });
    const items = n.storeCalls(shinanoya.domain).filter((c) => c.startsWith('/view/item/'));
    expect(items).toHaveLength(153);
    expect(items.slice(150)).toEqual([itemPath(9001), itemPath(9002), itemPath(9003)]);
    expect(await rowsOf('shinanoya')).toHaveLength(203);
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

  it('JPY Shopify store: a deadline stop is reported as such, not as the page limit, and nothing is swept', async () => {
    let t = 0;
    const route = (host: string, path: string): Reply => {
      if (host !== nemoto.domain) return undefined;
      t += 60_000; // every nemoto response takes 60 s
      const m = /^\/collections\/whisky\/products\.json\?limit=250&page=(\d+)$/.exec(path);
      if (m) {
        const id = Number(m[1]);
        return JSON.stringify({ products: [{ ...yamazaki, id, handle: `y-${id}`, variants: [{ id: 1000 + id, title: 'Default Title', price: '27500', available: true }] }] });
      }
      return nemotoSite('', [])(host, path);
    };
    const n = net(route);
    const r = await runCrawl({ ...jp, stores: [nemoto], fetchFn: n.fetchFn, politeSleep: async (ms) => { t += ms; }, politeNow: () => t });
    expect(r.stores[0]).toMatchObject({ storeId: 'nemoto', ok: true, note: 'stopped: deadline; missing listings not marked sold out' });
    expect(r.stores[0].observations).toBeGreaterThan(0);
  });

  // ---- run order: public stores, then fx / kr_links / alerts, then private stores ----

  /** flask: a sold-out Stagg now, and a watch for it, so the next run (restocked) has one alert to send. */
  async function seedRestockAlert() {
    await runCrawl({ ...base, stores: [flask], fetchFn: fakeFetch({ [flask.domain]: { pages: caveWith(false) } }) });
    await db.insert(watches).values({ label: 'Stagg', includeTerms: ['stagg'], excludeTerms: [], cities: ['la'], createdAt: new Date() });
  }

  it('sends alerts (after fx and kr_links) before any private-store request; the report keeps the input order', async () => {
    await seedRestockAlert();
    const log: string[] = [];
    const usOk = fakeFetch({ [flask.domain]: { pages: caveWith(true) } });
    const n = net((host, path) => (host === nemoto.domain ? nemotoSite(undefined, [yamazaki])(host, path) : shinanoyaSite({ 1: [1] })(host, path)));
    const fetchFn = (async (input: string | URL | Request, init?: RequestInit) => {
      const host = new URL(String(input)).hostname;
      log.push(host);
      return host === flask.domain ? usOk(input, init) : n.fetchFn(input, init);
    }) as FetchFn;
    const r = await runCrawl({
      ...jp, stores: [shinanoya, nemoto, flask], fetchFn,
      notify: async () => { log.push('notify'); },
    });
    const firstPrivate = log.findIndex((h) => h === shinanoya.domain || h === nemoto.domain);
    expect(firstPrivate).toBeGreaterThan(-1);
    expect(log.indexOf('notify')).toBeGreaterThan(-1);
    expect(log.indexOf('notify')).toBeLessThan(firstPrivate);
    expect(log.indexOf('open.er-api.com')).toBeLessThan(firstPrivate);
    expect(log.lastIndexOf(flask.domain)).toBeLessThan(firstPrivate);
    expect(r.alertsSent).toBe(1);
    expect(r.stores.map((s) => [s.storeId, s.ok])).toEqual([['shinanoya', true], ['nemoto', true], ['flask', true]]);
    expect(r.stores[0].observations).toBe(1);
    expect(r.stores[1].observations).toBe(1);
  });

  it('a private store that throws or hits its deadline does not stop the alerts', async () => {
    await seedRestockAlert();
    const usOk = fakeFetch({ [flask.domain]: { pages: caveWith(true) } });
    const lists: Record<number, number[]> = {};
    for (let p = 1; p <= 20; p++) lists[p] = Array.from({ length: 30 }, (_, i) => p * 100 + i);
    const site = shinanoyaSite(lists);
    let t = 0;
    const fetchFn = (async (input: string | URL | Request, init?: RequestInit) => {
      const u = new URL(String(input));
      if (u.hostname === flask.domain) return usOk(input, init);
      if (u.hostname === nemoto.domain) {
        if (u.pathname === '/robots.txt') return new Response('', { status: 404 });
        throw new Error('nemoto exploded');
      }
      if (u.hostname === shinanoya.domain) {
        t += 10_000;
        const reply = site(u.hostname, u.pathname + u.search);
        if (reply === undefined) return new Response('not found', { status: 404 });
        return new Response(String(reply), { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } });
      }
      return new Response('nope', { status: 404 });
    }) as FetchFn;
    const sent: string[] = [];
    const r = await runCrawl({
      ...jp, stores: [nemoto, shinanoya, flask], fetchFn, notify: async (m) => { sent.push(m); },
      politeSleep: async (ms) => { t += ms; }, politeNow: () => t,
    });
    expect(r.stores[0]).toMatchObject({ storeId: 'nemoto', ok: false, error: 'nemoto exploded' });
    expect(r.stores[1]).toMatchObject({ storeId: 'shinanoya', ok: true, note: 'stopped: deadline' });
    expect(r.alertsSent).toBe(1);
    expect(sent).toHaveLength(1);
  });

  // ---- blocks (spec 3.5): a 403, 429 or challenge on a non-USD store is persisted and respected ----

  it('a 403 stop persists the block; the next run skips the store with 0 requests; unblock lets it run again', async () => {
    await runCrawl({ ...jp, stores: [shinanoya], fetchFn: net(shinanoyaSite({ 1: [1, 2] })).fetchFn });
    const r1 = await runCrawl({ ...jp, stores: [shinanoya], fetchFn: net(shinanoyaSite({}, (k) => (k === 1 ? 403 : itemHtml()))).fetchFn });
    expect(r1.stores[0]).toMatchObject({ ok: true, note: 'stopped: http-403', stopReason: 'http-403', block: { reason: 'http-403', detected: true } });
    const block = await getBlock(db, 'shinanoya');
    expect(block?.reason).toBe('http-403');
    expect(r1.stores[0].block?.since).toBe(block!.at.toISOString());

    const n2 = net(shinanoyaSite({ 1: [1, 2] }));
    const r2 = await runCrawl({ ...jp, stores: [shinanoya], fetchFn: n2.fetchFn });
    expect(n2.storeCalls(shinanoya.domain)).toEqual([]);
    expect(r2.stores[0]).toMatchObject({
      storeId: 'shinanoya', ok: true, observations: 0,
      note: `skipped: blocked since ${block!.at.toISOString()} (http-403)`,
      block: { reason: 'http-403', since: block!.at.toISOString(), detected: false },
    });

    expect(await clearBlock(db, 'shinanoya')).toEqual(block);
    const n3 = net(shinanoyaSite({ 1: [1, 2] }));
    await runCrawl({ ...jp, stores: [shinanoya], fetchFn: n3.fetchFn });
    expect(n3.storeCalls(shinanoya.domain)[0]).toBe('/robots.txt');
  });

  it('a JPY Shopify store is blocked by a robots.txt challenge or a 429, and later skipped with 0 requests', async () => {
    const challenge = net((host, path) => (host === nemoto.domain && path === '/robots.txt' ? 'x' : nemotoSite(undefined, [yamazaki])(host, path)));
    const challenged = (async (input: string | URL | Request, init?: RequestInit) => {
      const res = await challenge.fetchFn(input, init);
      return new URL(String(input)).pathname === '/robots.txt'
        ? new Response('x', { status: 403, headers: { 'cf-mitigated': 'challenge' } })
        : res;
    }) as FetchFn;
    const r1 = await runCrawl({ ...jp, stores: [nemoto], fetchFn: challenged });
    expect(challenge.storeCalls(nemoto.domain)).toEqual(['/robots.txt']);
    expect(r1.stores[0]).toMatchObject({ storeId: 'nemoto', note: 'stopped: challenge', block: { reason: 'challenge', detected: true } });
    expect((await getBlock(db, 'nemoto'))?.reason).toBe('challenge');
    const n2 = net(nemotoSite(undefined, [yamazaki]));
    const r2 = await runCrawl({ ...jp, stores: [nemoto], fetchFn: n2.fetchFn });
    expect(n2.storeCalls(nemoto.domain)).toEqual([]);
    expect(r2.stores[0].note).toMatch(/^skipped: blocked since \S+ \(challenge\)$/);

    await clearBlock(db, 'nemoto');
    const n3 = net((host, path) => (path.startsWith('/collections/') ? 429 : nemotoSite(undefined, [yamazaki])(host, path)));
    const r3 = await runCrawl({ ...jp, stores: [nemoto], fetchFn: n3.fetchFn });
    expect(n3.storeCalls(nemoto.domain)).toEqual(['/robots.txt', '/meta.json', '/collections/whisky/products.json?limit=250&page=1']);
    expect(r3.stores[0]).toMatchObject({ ok: true, observations: 0, note: 'stopped: http-429', block: { reason: 'http-429', detected: true } });
    expect((await getBlock(db, 'nemoto'))?.reason).toBe('http-429');
  });

  it('a 503, robots-unavailable or errors stop is reported but not persisted: the next run crawls', async () => {
    const r1 = await runCrawl({ ...jp, stores: [shinanoya], fetchFn: net(shinanoyaSite({ 1: [1] }, () => 503)).fetchFn });
    expect(r1.stores[0]).toMatchObject({ note: 'stopped: http-503', stopReason: 'http-503' });
    expect(r1.stores[0].block).toBeUndefined();
    const r2 = await runCrawl({ ...jp, stores: [shinanoya], fetchFn: net((h, p) => (p === '/robots.txt' ? 500 : shinanoyaSite({ 1: [1] })(h, p))).fetchFn });
    expect(r2.stores[0]).toMatchObject({ note: 'stopped: robots-unavailable', stopReason: 'robots-unavailable' });
    const r3 = await runCrawl({ ...jp, stores: [nemoto], fetchFn: net(nemotoSite(500, [yamazaki])).fetchFn });
    expect(r3.stores[0]).toMatchObject({ note: 'skipped: robots.txt unavailable: HTTP 500', stopReason: 'robots-unavailable' });
    expect(await getBlock(db, 'shinanoya')).toBeNull();
    expect(await getBlock(db, 'nemoto')).toBeNull();
    const n = net(shinanoyaSite({ 1: [1] }));
    await runCrawl({ ...jp, stores: [shinanoya], fetchFn: n.fetchFn });
    expect(n.storeCalls(shinanoya.domain).length).toBeGreaterThan(1);
  });

  it('US stores keep their behaviour: a 403 fails the store and is never persisted as a block', async () => {
    const f = fakeFetch({ [flask.domain]: { pages: flaskPages, failPage: 1, failStatus: 403 } });
    const r = await runCrawl({ ...base, stores: [flask], fetchFn: f });
    expect(r.stores[0]).toMatchObject({ storeId: 'flask', ok: false });
    expect(r.stores[0].block).toBeUndefined();
    expect(await getBlock(db, 'flask')).toBeNull();
  });

  // ---- run-level time budget: 40 minutes from the start of runCrawl ----

  it('a slow US phase shrinks the deadline of the JP stores that follow (min of 20 min and the run budget left)', async () => {
    const lists: Record<number, number[]> = {};
    for (let p = 1; p <= 20; p++) lists[p] = Array.from({ length: 30 }, (_, i) => p * 100 + i);
    const site = shinanoyaSite(lists);
    let t = 0;
    const usOk = fakeFetch({ [flask.domain]: { pages: caveWith(true) } });
    const n = net((host, path) => {
      if (host === shinanoya.domain) {
        t += 10_000; // every shinanoya response takes 10 s
        return site(host, path);
      }
      return undefined;
    });
    const fetchFn = (async (input: string | URL | Request, init?: RequestInit) => {
      if (new URL(String(input)).hostname === flask.domain) {
        t += 10 * 60_000; // the US phase takes 30 minutes (cart.js and two catalog pages)
        return usOk(input, init);
      }
      return n.fetchFn(input, init);
    }) as FetchFn;
    const r = await runCrawl({
      ...jp, stores: [shinanoya, flask], fetchFn, politeSleep: async (ms) => { t += ms; }, politeNow: () => t,
    });
    // 10 minutes left of the 40: 600 s / 10 s per response = 60 requests (not the 120 of a 20-minute deadline)
    expect(n.storeCalls(shinanoya.domain)).toHaveLength(60);
    expect(r.stores[0]).toMatchObject({ storeId: 'shinanoya', ok: true, note: 'stopped: deadline' });
  });

  it('the JPY Shopify path gets the shrunk deadline too', async () => {
    let t = 0;
    const route = (host: string, path: string): Reply => {
      if (host !== nemoto.domain) return undefined;
      t += 60_000; // every nemoto response takes 60 s
      const m = /^\/collections\/whisky\/products\.json\?limit=250&page=(\d+)$/.exec(path);
      if (m) {
        const id = Number(m[1]);
        return JSON.stringify({ products: [{ ...yamazaki, id, handle: `y-${id}`, variants: [{ id: 1000 + id, title: 'Default Title', price: '27500', available: true }] }] });
      }
      return nemotoSite('', [])(host, path);
    };
    const n = net(route);
    const usOk = fakeFetch({ [flask.domain]: { pages: caveWith(true) } });
    const fetchFn = (async (input: string | URL | Request, init?: RequestInit) => {
      if (new URL(String(input)).hostname === flask.domain) {
        t += 700_000; // US phase: 35 minutes over 3 requests
        return usOk(input, init);
      }
      return n.fetchFn(input, init);
    }) as FetchFn;
    const r = await runCrawl({
      ...jp, stores: [nemoto, flask], fetchFn, politeSleep: async (ms) => { t += ms; }, politeNow: () => t,
    });
    // 5 minutes left: robots (60 s), then 4 minutes for meta.json and 3 catalog pages (3 s gap + 60 s each)
    expect(n.storeCalls(nemoto.domain)).toHaveLength(5);
    expect(r.stores[0]).toMatchObject({ storeId: 'nemoto', ok: true, observations: 3, note: 'stopped: deadline; missing listings not marked sold out' });
  });

  it('a JP store is skipped without a request when under 60 s of the run budget is left', async () => {
    let t = 0;
    const usOk = fakeFetch({ [flask.domain]: { pages: caveWith(true) } });
    const n = net((host, path) => (host === nemoto.domain ? nemotoSite(undefined, [yamazaki])(host, path) : shinanoyaSite({ 1: [1] })(host, path)));
    const fetchFn = (async (input: string | URL | Request, init?: RequestInit) => {
      if (new URL(String(input)).hostname === flask.domain) {
        t += 790_000; // US phase: 39.5 minutes over 3 requests
        return usOk(input, init);
      }
      return n.fetchFn(input, init);
    }) as FetchFn;
    const sent: string[] = [];
    const r = await runCrawl({
      ...jp, stores: [shinanoya, nemoto, flask], fetchFn, notify: async (m) => { sent.push(m); },
      politeSleep: async (ms) => { t += ms; }, politeNow: () => t,
    });
    expect(n.storeCalls(shinanoya.domain)).toEqual([]);
    expect(n.storeCalls(nemoto.domain)).toEqual([]);
    expect(r.stores.map((s) => [s.storeId, s.ok, s.note])).toEqual([
      ['shinanoya', true, 'skipped: run budget exhausted'],
      ['nemoto', true, 'skipped: run budget exhausted'],
      ['flask', true, undefined],
    ]);
  });

  it('US Shopify stores do not fetch robots.txt (unchanged)', async () => {
    const n = net((host, path) => (host === flask.domain ? (path === '/cart.js' ? '{"currency":"USD"}' : '{"products":[]}') : undefined));
    await runCrawl({ ...jp, stores: [flask], fetchFn: n.fetchFn });
    expect(n.storeCalls(flask.domain)[0]).toBe('/cart.js');
    expect(n.storeCalls(flask.domain)).not.toContain('/robots.txt');
  });
});
