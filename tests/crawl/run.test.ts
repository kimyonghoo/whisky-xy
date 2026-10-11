import { describe, it, expect, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb } from '../helpers/db';
import { listings, watches } from '@/lib/db/schema';
import { runCrawl } from '@/lib/crawl/run';
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
