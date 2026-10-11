import { describe, it, expect, beforeAll } from 'vitest';
import { createTestDb } from './helpers/db';
import { listings, fxRates } from '@/lib/db/schema';
import { upsertKrLink } from '@/lib/krlinks';
import { compareKr } from '@/lib/compare';
import { ilike } from 'drizzle-orm';
import { searchListings, escapeLike, SECTION_ROW_LIMIT, type CitySection, type SearchOptions, type SearchParams } from '@/lib/search';
import { getStore } from '@/lib/stores';
import { withTaxCents } from '@/lib/money';
import { seed } from './helpers/seed';
import type { Db } from '@/lib/db/client';

const run = (db: Db, p: SearchParams, opts?: SearchOptions) => searchListings(db, p, opts);
const rowsOf = (s: CitySection) => s.groups.flatMap((g) => g.rows);

describe('searchListings', () => {
  let db: Db;
  const JD = "Jack Daniel's Barrel Proof Tennessee Whiskey";
  beforeAll(async () => {
    db = await createTestDb();
    await db.insert(listings).values([
      seed({ storeId: 'dewinespot', title: JD, priceCents: 7000 }),
      seed({ storeId: 'liquorcave', title: JD, priceCents: 7000 }),
      seed({ storeId: 'winechateau', title: JD, priceCents: 5000, available: false }),
      seed({ storeId: 'flask', title: JD, priceCents: 6500 }),
      seed({ storeId: 'dewinespot', title: 'Stagg Bourbon', priceCents: 10000 }),
      seed({ storeId: 'liquorcave', title: 'Stagg Bourbon', priceCents: 9000, available: false }),
      seed({ storeId: 'dewinespot', title: 'Stagg Jr Bourbon', priceCents: 8000, available: false }),
      seed({ storeId: 'dewinespot', title: 'Sold Out Only Whiskey', priceCents: 1000, available: false }),
      seed({ storeId: 'dewinespot', title: 'Zeta Whiskey', priceCents: 99900 }),
      seed({ storeId: 'dewinespot', title: 'Zeta Whiskey Soldout', priceCents: 100, available: false }),
    ]);
  });

  it('orders rows in-stock first then tax-included within a city section', async () => {
    const r = await run(db, { q: "jack daniel's barrel proof", city: 'nj' });
    const nj = r.sections[0];
    expect(nj.city).toBe('nj');
    expect(nj.groups[0].rows.map((x) => x.storeId)).toEqual(['liquorcave', 'winechateau']);
    expect(nj.groups[0].bestAvailableCents).toBe(Math.round(7000 * 1.06625));
    for (const sec of r.sections) expect(rowsOf(sec).every((x) => x.store.city === sec.city)).toBe(true);
  });

  it('orders in-stock rows by tax-included price, not shelf price, within one city', async () => {
    const d = await createTestDb();
    await d.insert(listings).values([
      seed({ storeId: 'liquorcave', title: 'Tax Order Rye', priceCents: 7000 }),
      // cheaper shelf price but sold out: last despite the lower number
      seed({ storeId: 'winechateau', title: 'Tax Order Rye', priceCents: 5000, available: false }),
      seed({ storeId: 'coolvines', title: 'Tax Order Rye', priceCents: 6900 }),
    ]);
    const nj = (await run(d, { q: 'tax order rye', city: 'nj' })).sections[0];
    const rows = nj.groups[0].rows;
    const inStock = rows.filter((x) => x.available);
    expect(inStock.map((x) => x.taxIncludedCents)).toEqual([...inStock.map((x) => x.taxIncludedCents)].sort((a, b) => a - b));
    expect(inStock.map((x) => x.storeId)).toEqual(['coolvines', 'liquorcave']);
    expect(rows[rows.length - 1].storeId).toBe('winechateau');
    expect(nj.bestAvailableCents).toBe(Math.min(...inStock.map((x) => x.taxIncludedCents)));
  });

  it('puts the selected city first, then same-country cities', async () => {
    const r = await run(db, { q: 'jack', city: 'nj' });
    expect(r.sections.map((s) => s.city)).toEqual(['nj', 'brooklyn', 'la']);
    expect((await run(db, { q: 'jack', city: 'la' })).sections.map((s) => s.city)).toEqual(['la', 'brooklyn', 'nj']);
  });

  it('drops empty other-city sections but keeps the selected one', async () => {
    const r = await run(db, { q: 'stagg jr', city: 'la' });
    expect(r.sections.map((s) => [s.city, s.groups.length])).toEqual([['la', 0], ['brooklyn', 1]]);
    expect(r.sections[0]).toMatchObject({ bestAvailableCents: null, storeCount: 0 });
  });

  it('reports each section best in-stock price and store count', async () => {
    const r = await run(db, { q: 'jack', city: 'brooklyn' });
    const by = Object.fromEntries(r.sections.map((s) => [s.city, s]));
    expect(by.brooklyn).toMatchObject({ storeCount: 1, bestAvailableCents: Math.round(7000 * 1.08875) });
    // winechateau is sold out; liquorcave is the only in-stock NJ store, but both count as stores
    expect(by.nj).toMatchObject({ storeCount: 2, bestAvailableCents: Math.round(7000 * 1.06625) });
    expect(by.la.storeCount).toBe(1);
    expect(by.la.bestAvailableCents).toBe(withTaxCents(6500, getStore('flask')!.taxRate));
  });

  it('returns no sections for a soon city', async () => {
    expect(await run(db, { q: 'jack', city: 'tokyo' })).toEqual({ sections: [] });
  });

  it('inStockOnly, price and size filters', async () => {
    const r = await run(db, { q: 'stagg', inStockOnly: true, city: 'brooklyn' });
    const rows = r.sections.flatMap(rowsOf);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((x) => x.available)).toBe(true);
    const pr = await run(db, { q: 'jack', minCents: 6000, maxCents: 7500, city: 'brooklyn' });
    expect(pr.sections.flatMap(rowsOf).every((x) => x.priceCents >= 6000 && x.priceCents <= 7500)).toBe(true);
    // seeded rows are all 750 ml
    expect((await run(db, { q: 'jack', sizeMl: 750, city: 'brooklyn' })).sections[0].groups.length).toBeGreaterThan(0);
    expect((await run(db, { q: 'jack', sizeMl: 1750, city: 'brooklyn' })).sections.flatMap((s) => s.groups)).toEqual([]);
  });

  it('understands Korean spellings, abbreviations-style typos and ranks phrase matches first', async () => {
    expect((await run(db, { q: '스태그', city: 'brooklyn' })).sections[0].groups.length).toBe(2);
    expect((await run(db, { q: 'stagg bourbn', city: 'brooklyn' })).sections[0].groups.length).toBe(2);
    expect((await run(db, { q: 'jack daniel barel proof', city: 'brooklyn' })).sections[0].groups.length).toBe(1);
    // "stagg jr" phrase: Stagg Jr first even though plain Stagg is in stock and Jr is sold out
    expect((await run(db, { q: 'stagg jr', city: 'brooklyn' })).sections[0].groups[0].displayTitle).toBe('Stagg Jr Bourbon');
  });

  it('does not group Stagg with Stagg Jr', async () => {
    const r = await run(db, { q: 'stagg', city: 'brooklyn' });
    expect(r.sections[0].groups.length).toBe(2);
  });

  it('empty query behaviour', async () => {
    expect(await run(db, { q: '', city: 'brooklyn' })).toEqual({ sections: [] });
    const store = await run(db, { q: '', storeId: 'flask', city: 'la' });
    expect(store.sections.map((s) => s.city)).toEqual(['la']);
    expect(store.sections[0].groups.length).toBeGreaterThan(0);
  });

  it('storeId scopes results to one store, with or without a query', async () => {
    const all = await run(db, { q: '', storeId: 'dewinespot', city: 'brooklyn' });
    const rows = all.sections.flatMap(rowsOf);
    expect(rows.length).toBe(6);
    expect(rows.every((x) => x.storeId === 'dewinespot')).toBe(true);
    expect(all.sections.map((s) => s.city)).toEqual(['brooklyn']);
    const q = await run(db, { q: 'stagg', storeId: 'liquorcave', city: 'nj' });
    expect(q.sections.flatMap(rowsOf).map((x) => x.storeId)).toEqual(['liquorcave']);
    // coolvines has no listings: the selected city's section stays, empty
    const none = await run(db, { q: '', storeId: 'coolvines', city: 'nj' });
    expect(none.sections.flatMap((s) => s.groups)).toEqual([]);
  });

  it('special characters are safe and literal', async () => {
    const groups = (r: { sections: CitySection[] }) => r.sections.flatMap((s) => s.groups);
    expect(groups(await run(db, { q: "100% o'brien _ 위스키", city: 'brooklyn' }))).toEqual([]);
    expect(groups(await run(db, { q: '%', city: 'brooklyn' }))).toEqual([]);
    expect(escapeLike('a%b_c\\d')).toBe('a\\%b\\_c\\\\d');
  });

  it('groups with in-stock rows sort before all-sold-out groups', async () => {
    const r = await run(db, { q: 'whiskey', city: 'brooklyn' });
    const titles = r.sections[0].groups.map((g) => g.displayTitle);
    expect(titles.indexOf('Sold Out Only Whiskey')).toBeGreaterThan(titles.indexOf('Zeta Whiskey'));
    const g = r.sections[0].groups.find((x) => x.displayTitle === 'Sold Out Only Whiskey')!;
    expect(g.bestAvailableCents).toBeNull();
  });

  it('has a per-section limit constant of 500', () => {
    expect(SECTION_ROW_LIMIT).toBe(500);
  });

  it('one city cannot crowd another out of the row limit', async () => {
    const d = await createTestDb();
    await d.insert(listings).values([
      seed({ storeId: 'flask', title: 'Crowd Rye A', priceCents: 100 }),
      seed({ storeId: 'flask', title: 'Crowd Rye B', priceCents: 200 }),
      seed({ storeId: 'bittersandbottles', title: 'Crowd Rye C', priceCents: 300 }),
      seed({ storeId: 'dewinespot', title: 'Crowd Rye D', priceCents: 9000 }),
      seed({ storeId: 'liquorcave', title: 'Crowd Rye E', priceCents: 9500 }),
    ]);
    const r = await run(d, { q: 'crowd rye', city: 'brooklyn' }, { rowLimit: 2 });
    const by = Object.fromEntries(r.sections.map((s) => [s.city, rowsOf(s)]));
    expect(by.brooklyn.map((x) => x.storeId)).toEqual(['dewinespot']);
    expect(by.nj.map((x) => x.storeId)).toEqual(['liquorcave']);
    expect(by.la.length).toBe(2);
  });

  it('percent and underscore in input never act as wildcards', async () => {
    const d = await createTestDb();
    await d.insert(listings).values([
      seed({ storeId: 'dewinespot', title: 'Foo 100 Proof', priceCents: 1000 }),
      seed({ storeId: 'dewinespot', title: 'Foo 1000', priceCents: 1000 }),
      seed({ storeId: 'dewinespot', title: 'Raw', priceCents: 1000, searchText: 'raw 100% pure' }),
      seed({ storeId: 'dewinespot', title: 'Raw2', priceCents: 1000, searchText: 'raw 100x pure' }),
      seed({ storeId: 'dewinespot', title: 'Und', priceCents: 1000, searchText: 'und a_b' }),
      seed({ storeId: 'dewinespot', title: 'Und2', priceCents: 1000, searchText: 'und axb' }),
    ]);
    // normalization strips % so the token is just '100' (substring semantics, no wildcard)
    const r = await run(d, { q: '100%', city: 'brooklyn' });
    const titles = r.sections.flatMap(rowsOf).map((x) => x.title).sort();
    expect(titles).toEqual(['Foo 100 Proof', 'Foo 1000', 'Raw', 'Raw2']);
    // '%' alone never matches everything
    expect(await run(d, { q: '%', city: 'brooklyn' })).toEqual({ sections: [] });
    // escapeLike through the same ilike builder against raw searchText containing % and _
    const hit = async (pat: string) =>
      (await d.select({ t: listings.title }).from(listings).where(ilike(listings.searchText, `%${escapeLike(pat)}%`))).map((x) => x.t);
    expect(await hit('100%')).toEqual(['Raw']);
    expect(await hit('a_b')).toEqual(['Und']);
    expect(await hit('%')).toEqual(['Raw']);
    expect(await hit('_')).toEqual(['Und']);
  });
});

describe('searchListings Korea comparison', () => {
  const now = new Date('2026-10-10T00:00:00Z');
  const ds = (bottleKey: string, lowPriceKrw: number) => ({
    bottleKey, productId: '12345', nameKo: '스태그', nameEn: 'Stagg', imageUrl: null,
    price: { lowPriceKrw, highPriceKrw: null, offerCount: null },
  });

  it('attaches the Korea link and compares against the cheapest in-stock tax-included row', async () => {
    const d = await createTestDb();
    const stagg = seed({ storeId: 'dewinespot', title: 'Stagg Bourbon', priceCents: 10000 });
    const jr = seed({ storeId: 'dewinespot', title: 'Stagg Jr Bourbon', priceCents: 8000, available: false });
    await d.insert(listings).values([
      stagg,
      seed({ storeId: 'liquorcave', title: 'Stagg Bourbon', priceCents: 9000, available: false }),
      jr,
      seed({ storeId: 'dewinespot', title: 'Unlinked Rye', priceCents: 5000 }),
    ]);
    await upsertKrLink(d, ds(stagg.bottleKey, 649000), now);
    await upsertKrLink(d, ds(jr.bottleKey, 300000), now);
    await d.insert(fxRates).values({ date: '2026-10-10', usdKrw: 1380, fetchedAt: now });

    const r = await run(d, { q: 'stagg', city: 'brooklyn' });
    const g = r.sections[0].groups.find((x) => x.bottleKey === stagg.bottleKey)!;
    expect(g.kr?.link.lowPriceKrw).toBe(649000);
    // cheapest in-stock = dewinespot $100 + NY tax = 10888 cents (sold-out liquorcave $90 ignored)
    expect(g.kr?.compare).toEqual(compareKr(10888, 1380, 649000));
    expect(g.kr?.compare?.verdict).toBe('must');
    expect(g.kr?.fx?.usdKrw).toBe(1380);
    const j = r.sections[0].groups.find((x) => x.bottleKey === jr.bottleKey)!;
    expect(j.kr?.link).toBeDefined();
    expect(j.kr?.compare).toBeNull();
    const u = await run(d, { q: 'unlinked', city: 'brooklyn' });
    expect(u.sections[0].groups[0].kr).toBeUndefined();
  });

  it('compares every section against the national best', async () => {
    const d = await createTestDb();
    const b = seed({ storeId: 'dewinespot', title: 'Stagg Bourbon', priceCents: 12000 });
    const la = seed({ storeId: 'flask', title: 'Stagg Bourbon', priceCents: 9500 });
    await d.insert(listings).values([b, la]);
    await upsertKrLink(d, ds(b.bottleKey, 649000), now);
    await d.insert(fxRates).values({ date: '2026-10-10', usdKrw: 1380, fetchedAt: now });
    const r = await run(d, { q: 'stagg', city: 'brooklyn' });
    expect(r.sections.map((s) => s.city)).toEqual(['brooklyn', 'la']);
    const [g1, g2] = r.sections.map((s) => s.groups[0]);
    const best = withTaxCents(9500, getStore('flask')!.taxRate);
    expect(g1.kr?.compare).toEqual(compareKr(best, 1380, 649000));
    expect(g2.kr?.compare).toEqual(g1.kr?.compare);
    expect(g1.kr?.baseCity).toBe('la');
    expect(g2.kr?.baseCity).toBe('la');
  });

  it('compare is null when there is no fx rate', async () => {
    const d = await createTestDb();
    const s = seed({ storeId: 'dewinespot', title: 'Stagg Bourbon', priceCents: 10000 });
    await d.insert(listings).values([s]);
    await upsertKrLink(d, ds(s.bottleKey, 649000), now);
    const r = await run(d, { q: 'stagg', city: 'brooklyn' });
    const g = r.sections[0].groups[0];
    expect(g.kr?.link).toBeDefined();
    expect(g.kr?.compare).toBeNull();
    expect(g.kr?.fx).toBeNull();
    expect(g.kr?.baseCity).toBe('brooklyn');
  });
});
