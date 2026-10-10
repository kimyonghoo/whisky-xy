import { describe, it, expect } from 'vitest';
import { createTestDb } from './helpers/db';
import { listings, priceHistory } from '@/lib/db/schema';
import { getListing, getPriceHistory, storeAvailability } from '@/lib/listings';
import { bottleKey, normalizeText } from '@/lib/whisky/parse';

function row(n: number, storeId: string, title: string, available: boolean) {
  const now = new Date();
  return { storeId, productId: `p${n}`, variantId: `v${n}`, handle: `h${n}`, title, variantTitle: null, vendor: 'V', productType: 'Whiskey',
    imageUrl: null, url: 'https://x', priceCents: 1000, available, sizeMl: 750, proof: null, batch: null,
    bottleKey: bottleKey({ title, variantTitle: null }), searchText: normalizeText(title), firstSeenAt: now, lastSeenAt: now, checkedAt: now, updatedAt: now };
}

describe('listings queries', () => {
  it('getListing / getPriceHistory / storeAvailability', async () => {
    const db = await createTestDb();
    const ins = await db.insert(listings).values([
      row(1, 'dewinespot', 'Stagg Bourbon', true), row(2, 'dewinespot', 'Other', true),
      row(3, 'liquorcave', 'Stagg Bourbon', false), row(4, 'flask', 'Stagg Bourbon', true),
    ]).returning();
    expect((await getListing(db, ins[0].id))?.title).toBe('Stagg Bourbon');
    expect(await getListing(db, 99999)).toBeNull();

    await db.insert(priceHistory).values([1, 2, 3].map((i) => ({ listingId: ins[0].id, priceCents: i * 100, available: true, recordedAt: new Date(2026, 0, i) })));
    const h = await getPriceHistory(db, ins[0].id, 2);
    expect(h.map((x) => x.priceCents)).toEqual([300, 200]);

    const all = await storeAvailability(db);
    expect(all.get('dewinespot')).toBe(2);
    expect(all.get('liquorcave')).toBeUndefined();
    const key = ins[0].bottleKey;
    const one = await storeAvailability(db, key);
    expect(one.get('dewinespot')).toBe(1);
    expect(one.get('flask')).toBe(1);
    expect(one.get('liquorcave')).toBeUndefined();
  });
});

describe('bottleStoreOffers', () => {
  it('summarises per-store stock and cheapest available price', async () => {
    const { bottleStoreOffers } = await import('@/lib/listings');
    const db = await createTestDb();
    const a = { ...row(1, 'dewinespot', 'Stagg Bourbon', true), priceCents: 15000 };
    const b = { ...row(2, 'dewinespot', 'Stagg Bourbon', true), priceCents: 13000 };
    const c = { ...row(3, 'dewinespot', 'Stagg Bourbon', false), priceCents: 9000 };
    const d = { ...row(4, 'liquorcave', 'Stagg Bourbon', false), priceCents: 9000 };
    const e = row(5, 'flask', 'Stagg Jr Bourbon', true);
    await db.insert(listings).values([a, b, c, d, e]);

    const r = await bottleStoreOffers(db, a.bottleKey);
    expect(r?.title).toBe('Stagg Bourbon');
    expect(r?.offers.get('dewinespot')).toEqual({ storeId: 'dewinespot', listed: 3, inStock: 2, unverified: 0, minAvailablePriceCents: 13000 });
    expect(r?.offers.get('liquorcave')).toEqual({ storeId: 'liquorcave', listed: 1, inStock: 0, unverified: 0, minAvailablePriceCents: null });
    expect(r?.offers.has('flask')).toBe(false);
    expect(await bottleStoreOffers(db, 'no-such-key')).toBeNull();
  });
});
