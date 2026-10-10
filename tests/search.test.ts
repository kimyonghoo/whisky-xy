import { describe, it, expect, beforeAll } from 'vitest';
import { createTestDb } from './helpers/db';
import { listings } from '@/lib/db/schema';
import { searchListings, escapeLike } from '@/lib/search';
import { bottleKey, normalizeText } from '@/lib/whisky/parse';
import type { Db } from '@/lib/db/client';

let n = 0;
export function seed(over: { storeId: string; title: string; priceCents: number; available?: boolean; variantTitle?: string | null; vendor?: string }) {
  n++;
  const variantTitle = over.variantTitle ?? null;
  const vendor = over.vendor ?? 'Vendor';
  const now = new Date();
  return {
    storeId: over.storeId, productId: `p${n}`, variantId: `v${n}`, handle: `h${n}`, title: over.title, variantTitle, vendor,
    productType: 'Whiskey', imageUrl: null, url: `https://x/${n}`, priceCents: over.priceCents, available: over.available ?? true,
    sizeMl: 750, proof: null, batch: null, bottleKey: bottleKey({ title: over.title, variantTitle }),
    searchText: normalizeText(`${over.title} ${variantTitle ?? ''} ${vendor}`),
    firstSeenAt: now, lastSeenAt: now, checkedAt: now, updatedAt: now,
  };
}

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
});
