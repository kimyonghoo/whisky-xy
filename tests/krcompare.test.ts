import { describe, it, expect } from 'vitest';
import { createTestDb } from './helpers/db';
import { seed } from './helpers/seed';
import { listings, fxRates } from '@/lib/db/schema';
import { upsertKrLink } from '@/lib/krlinks';
import { listKrComparisons, getBottleSummary } from '@/lib/krcompare';
import { compareKr } from '@/lib/compare';

const now = new Date('2026-10-10T00:00:00Z');
const link = (bottleKey: string, lowPriceKrw: number) => ({
  bottleKey, productId: '1', nameKo: '한', nameEn: null, imageUrl: null, price: { lowPriceKrw, highPriceKrw: null, offerCount: null },
});

describe('listKrComparisons', () => {
  it('ranks linked in-stock bottles by savings, main region first, CA only as fallback', async () => {
    const db = await createTestDb();
    const a = seed({ storeId: 'dewinespot', title: 'Alpha Bourbon', priceCents: 10000 });
    const aCa = seed({ storeId: 'flask', title: 'Alpha Bourbon', priceCents: 5000 });
    const b = seed({ storeId: 'liquorcave', title: 'Beta Rye', priceCents: 10000 });
    const c = seed({ storeId: 'flask', title: 'Gamma Malt', priceCents: 10000 });
    const d = seed({ storeId: 'dewinespot', title: 'Delta Sold', priceCents: 10000, available: false });
    await db.insert(listings).values([a, aCa, b, c, d]);
    for (const [s, krw] of [[a, 150000], [b, 400000], [c, 100000], [d, 300000]] as const) await upsertKrLink(db, link(s.bottleKey, krw), now);
    await upsertKrLink(db, link('no-listing|p|b|s', 1), now);

    expect((await listKrComparisons(db)).rows).toEqual([]);
    await db.insert(fxRates).values({ date: '2026-10-09', usdKrw: 1380, fetchedAt: now });
    const r = await listKrComparisons(db);
    expect(r.fx?.usdKrw).toBe(1380);
    expect(r.rows.map((x) => x.title)).toEqual(['Beta Rye', 'Alpha Bourbon', 'Gamma Malt']);
    const alpha = r.rows[1];
    // main (dewinespot) wins over the cheaper CA row
    expect(alpha.best.storeId).toBe('dewinespot');
    expect(alpha.compare).toEqual(compareKr(10888, 1380, 150000));
    expect(r.rows[2].best.store.city).toBe('la');
    expect(r.rows[2].compare.verdict).toBe('worse');
    expect(r.notInStock).toBe(2);
    expect(r.linked).toBe(5);
  });

  it('returns nothing when nothing is linked', async () => {
    const db = await createTestDb();
    expect(await listKrComparisons(db)).toEqual({ fx: null, rows: [], linked: 0, notInStock: 0 });
  });
});

describe('getBottleSummary', () => {
  it('summarizes a bottle from public listings and returns null for unknown keys', async () => {
    const db = await createTestDb();
    const a = seed({ storeId: 'dewinespot', title: 'Alpha Bourbon', priceCents: 10000 });
    await db.insert(listings).values([
      a,
      seed({ storeId: 'liquorcave', title: 'Alpha Bourbon', priceCents: 9000, available: false }),
      seed({ storeId: 'flask', title: 'Alpha Bourbon', priceCents: 5000 }),
    ]);
    const s = await getBottleSummary(db, a.bottleKey);
    expect(s).toMatchObject({ title: 'Alpha Bourbon', sizeMl: 750, storeCount: 3, inStockCount: 2, bestTaxIncludedCents: 10888 });
    expect(await getBottleSummary(db, 'nope')).toBeNull();
  });
});
