import { describe, it, expect, beforeAll } from 'vitest';
import { createTestDb } from './helpers/db';
import { listings } from '@/lib/db/schema';
import { ilike } from 'drizzle-orm';
import { searchListings, escapeLike, SECTION_ROW_LIMIT } from '@/lib/search';
import { seed } from './helpers/seed';
import type { Db } from '@/lib/db/client';

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

  it('orders rows in-stock first then tax-included; CA in separate section', async () => {
    const r = await searchListings(db, { q: "jack daniel's barrel proof" });
    // same price: NJ 6.625% tax is cheaper than NY 8.875%; sold-out winechateau last
    expect(r.main[0].rows.map((x) => x.storeId)).toEqual(['liquorcave', 'dewinespot', 'winechateau']);
    expect(r.main[0].bestAvailableCents).toBe(Math.round(7000 * 1.06625));
    expect(r.ca.length).toBeGreaterThan(0);
    expect(r.main.flatMap((g) => g.rows).every((x) => x.store.region !== 'ca')).toBe(true);
    expect(r.ca.flatMap((g) => g.rows).every((x) => x.store.region === 'ca')).toBe(true);
  });

  it('inStockOnly, region, price filters', async () => {
    const r = await searchListings(db, { q: 'stagg', inStockOnly: true });
    const rows = r.main.flatMap((g) => g.rows);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((x) => x.available)).toBe(true);
    const nj = await searchListings(db, { q: 'jack', region: 'nj' });
    expect(nj.main.flatMap((g) => g.rows).every((x) => x.store.region === 'nj')).toBe(true);
    expect(nj.ca).toEqual([]);
    const pr = await searchListings(db, { q: 'jack', minCents: 6000, maxCents: 7500 });
    expect(pr.main.flatMap((g) => g.rows).every((x) => x.priceCents >= 6000 && x.priceCents <= 7500)).toBe(true);
  });

  it('does not group Stagg with Stagg Jr', async () => {
    const r = await searchListings(db, { q: 'stagg' });
    expect(r.main.length).toBe(2);
  });

  it('empty query behaviour', async () => {
    expect(await searchListings(db, { q: '' })).toEqual({ main: [], ca: [] });
    expect((await searchListings(db, { q: '', storeId: 'flask' })).ca.length).toBeGreaterThan(0);
  });

  it('storeId scopes results to one store, with or without a query', async () => {
    const all = await searchListings(db, { q: '', storeId: 'dewinespot' });
    const rows = all.main.flatMap((g) => g.rows);
    expect(rows.length).toBe(6);
    expect(rows.every((x) => x.storeId === 'dewinespot')).toBe(true);
    expect(all.ca).toEqual([]);
    const q = await searchListings(db, { q: 'stagg', storeId: 'liquorcave' });
    expect(q.main.flatMap((g) => g.rows).map((x) => x.storeId)).toEqual(['liquorcave']);
    expect(await searchListings(db, { q: '', storeId: 'coolvines' })).toEqual({ main: [], ca: [] });
  });

  it('special characters are safe and literal', async () => {
    await expect(searchListings(db, { q: "100% o'brien _ 위스키" })).resolves.toEqual({ main: [], ca: [] });
    expect(await searchListings(db, { q: '%' })).toEqual({ main: [], ca: [] });
    expect(escapeLike('a%b_c\\d')).toBe('a\\%b\\_c\\\\d');
  });

  it('groups with in-stock rows sort before all-sold-out groups', async () => {
    const r = await searchListings(db, { q: 'whiskey' });
    const titles = r.main.map((g) => g.displayTitle);
    expect(titles.indexOf('Sold Out Only Whiskey')).toBeGreaterThan(titles.indexOf('Zeta Whiskey'));
    const g = r.main.find((x) => x.displayTitle === 'Sold Out Only Whiskey')!;
    expect(g.bestAvailableCents).toBeNull();
  });

  it('has a per-section limit constant of 500', () => {
    expect(SECTION_ROW_LIMIT).toBe(500);
  });

  it('CA rows cannot crowd main rows out of the limit', async () => {
    const d = await createTestDb();
    await d.insert(listings).values([
      seed({ storeId: 'flask', title: 'Crowd Rye A', priceCents: 100 }),
      seed({ storeId: 'flask', title: 'Crowd Rye B', priceCents: 200 }),
      seed({ storeId: 'bittersandbottles', title: 'Crowd Rye C', priceCents: 300 }),
      seed({ storeId: 'dewinespot', title: 'Crowd Rye D', priceCents: 9000 }),
      seed({ storeId: 'liquorcave', title: 'Crowd Rye E', priceCents: 9500 }),
    ]);
    const r = await searchListings(d, { q: 'crowd rye' }, { rowLimit: 2 });
    expect(r.main.flatMap((g) => g.rows).map((x) => x.storeId).sort()).toEqual(['dewinespot', 'liquorcave']);
    expect(r.ca.flatMap((g) => g.rows).length).toBe(2);
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
    const r = await searchListings(d, { q: '100%' });
    const titles = r.main.flatMap((g) => g.rows).map((x) => x.title).sort();
    expect(titles).toEqual(['Foo 100 Proof', 'Foo 1000', 'Raw', 'Raw2']);
    // '%' alone never matches everything
    expect(await searchListings(d, { q: '%' })).toEqual({ main: [], ca: [] });
    // escapeLike through the same ilike builder against raw searchText containing % and _
    const hit = async (pat: string) =>
      (await d.select({ t: listings.title }).from(listings).where(ilike(listings.searchText, `%${escapeLike(pat)}%`))).map((x) => x.t);
    expect(await hit('100%')).toEqual(['Raw']);
    expect(await hit('a_b')).toEqual(['Und']);
    expect(await hit('%')).toEqual(['Raw']);
    expect(await hit('_')).toEqual(['Und']);
  });
});
