import { describe, it, expect, beforeAll } from 'vitest';
import { createTestDb } from './helpers/db';
import { seed } from './helpers/seed';
import { listings, fxRates } from '@/lib/db/schema';
import { upsertKrLink } from '@/lib/krlinks';
import { searchListings } from '@/lib/search';
import { listKrComparisons, getBottleSummary } from '@/lib/krcompare';
import { bottleStoreOffers, storeAvailability } from '@/lib/listings';
import { stockState, UNVERIFIED_AFTER_MS } from '@/lib/freshness';
import { withTaxCents } from '@/lib/money';
import { cardMeta } from '@/lib/card';
import { getStore } from '@/lib/stores';
import type { Db } from '@/lib/db/client';

const now = new Date('2026-10-11T12:00:00Z');
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000);

/** Seed row with an explicit checkedAt. */
function at(over: Parameters<typeof seed>[0], checkedAt: Date) {
  return { ...seed(over), checkedAt, lastSeenAt: checkedAt, updatedAt: checkedAt };
}

describe('stockState', () => {
  it('is instock up to 48 h, unverified after, soldout when not available', () => {
    expect(stockState({ available: true, checkedAt: hoursAgo(1) }, now)).toBe('instock');
    expect(stockState({ available: true, checkedAt: new Date(now.getTime() - UNVERIFIED_AFTER_MS) }, now)).toBe('instock');
    expect(stockState({ available: true, checkedAt: new Date(now.getTime() - UNVERIFIED_AFTER_MS - 1) }, now)).toBe('unverified');
    expect(stockState({ available: true, checkedAt: hoursAgo(24 * 21) }, now)).toBe('unverified');
    expect(stockState({ available: false, checkedAt: hoursAgo(1) }, now)).toBe('soldout');
    expect(stockState({ available: false, checkedAt: hoursAgo(100) }, now)).toBe('soldout');
  });
});

describe('stale "available" rows (I2)', () => {
  let db: Db;
  const T = 'Weller Full Proof Bourbon';
  const ONLY_STALE = 'Blantons Gold Bourbon';
  beforeAll(async () => {
    db = await createTestDb();
    await db.insert(listings).values([
      // 3 weeks old and cheapest: must not rank, must not be the price base.
      at({ storeId: 'theliquorstore', title: T, priceCents: 5000 }, hoursAgo(24 * 21)),
      at({ storeId: 'dewinespot', title: T, priceCents: 9000 }, hoursAgo(2)),
      at({ storeId: 'grainvine', title: T, priceCents: 9500, available: false }, hoursAgo(2)),
      at({ storeId: 'slopecellars', title: ONLY_STALE, priceCents: 12000 }, hoursAgo(72)),
    ]);
    await db.insert(fxRates).values({ date: '2026-10-11', usdKrw: 1400, fetchedAt: now });
  });

  it('search: sorts unverified after confirmed in-stock and before sold out; never the best price', async () => {
    const r = await searchListings(db, { q: 'weller full proof', city: 'brooklyn' }, { now });
    const g = r.sections[0].groups[0];
    expect(g.rows.map((x) => [x.storeId, x.stock])).toEqual([
      ['dewinespot', 'instock'],
      ['theliquorstore', 'unverified'],
      ['grainvine', 'soldout'],
    ]);
    expect(g.bestAvailableCents).toBe(withTaxCents(9000, getStore('dewinespot')!.taxRate));
    expect(r.sections[0].bestAvailableCents).toBe(g.bestAvailableCents);
  });

  it('search: a bottle whose only available row is unverified has no best price and sorts after priced groups', async () => {
    const r = await searchListings(db, { q: 'bourbon', city: 'brooklyn' }, { now });
    const groups = r.sections[0].groups;
    expect(groups.map((g) => g.displayTitle)).toEqual([T, ONLY_STALE]);
    expect(groups[1].bestAvailableCents).toBeNull();
    expect(groups[1].rows[0].stock).toBe('unverified');
  });

  it('search: "in stock only" leaves unverified rows out', async () => {
    const r = await searchListings(db, { q: 'bourbon', inStockOnly: true, city: 'brooklyn' }, { now });
    expect(r.sections.flatMap((x) => x.groups).flatMap((g) => g.rows).map((x) => x.storeId)).toEqual(['dewinespot']);
  });

  it('Korea compare in search uses only confirmed rows', async () => {
    const key = (await searchListings(db, { q: 'weller', city: 'brooklyn' }, { now })).sections[0].groups[0].bottleKey;
    const staleKey = (await searchListings(db, { q: 'blantons', city: 'brooklyn' }, { now })).sections[0].groups[0].bottleKey;
    const price = { lowPriceKrw: 300000, highPriceKrw: null, offerCount: null };
    await upsertKrLink(db, { bottleKey: key, productId: '1', nameKo: '웰러', nameEn: null, imageUrl: null, price }, now);
    await upsertKrLink(db, { bottleKey: staleKey, productId: '2', nameKo: '블랑톤', nameEn: null, imageUrl: null, price }, now);

    const r = await searchListings(db, { q: 'bourbon', city: 'brooklyn' }, { now });
    const all = r.sections.flatMap((x) => x.groups);
    const weller = r.sections[0].groups.find((g) => g.bottleKey === key)!;
    const usd = withTaxCents(9000, getStore('dewinespot')!.taxRate);
    expect(weller.kr?.compare?.usKrw).toBe(Math.round((usd / 100) * 1400));
    expect(all.find((g) => g.bottleKey === staleKey)!.kr?.compare).toBeNull();

    // /compare: same base; the stale-only bottle counts as "not in stock".
    const c = await listKrComparisons(db, now);
    expect(c.rows.map((x) => [x.bottleKey, x.best.storeId])).toEqual([[key, 'dewinespot']]);
    expect(c.notInStock).toBe(1);

    const summary = await getBottleSummary(db, key, now);
    expect(summary?.inStockCount).toBe(1);
    expect(summary?.bestTaxIncludedCents).toBe(usd);
    expect((await getBottleSummary(db, staleKey, now))?.bestTaxIncludedCents).toBeNull();
  });

  it('map: unverified rows are not counted as in stock', async () => {
    const key = (await searchListings(db, { q: 'weller', city: 'brooklyn' }, { now })).sections[0].groups[0].bottleKey;
    const offers = (await bottleStoreOffers(db, key, now))!;
    expect(offers.offers.get('theliquorstore')).toMatchObject({ listed: 1, inStock: 0, minAvailablePriceCents: null });
    expect(offers.offers.get('dewinespot')).toMatchObject({ inStock: 1, minAvailablePriceCents: 9000 });
    const avail = await storeAvailability(db, undefined, now);
    expect(avail.get('theliquorstore')).toBeUndefined();
    expect(avail.get('slopecellars')).toBeUndefined();
    expect(avail.get('dewinespot')).toBe(1);
  });

  it('card share text says "재고 확인 필요" for an unverified row', async () => {
    const [row] = await db.select().from(listings).limit(1);
    const m = cardMeta(row, getStore(row.storeId)!, now);
    expect(m.description).toContain('재고 확인 필요');
  });
});
