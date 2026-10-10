import { describe, it, expect } from 'vitest';
import { createTestDb } from '../helpers/db';
import { listings } from '@/lib/db/schema';

describe('schema', () => {
  it('round-trips a listing and enforces (storeId, variantId) uniqueness', async () => {
    const db = await createTestDb();
    const row = { storeId: 'dewinespot', productId: '1', variantId: '11', handle: 'stagg', title: 'Stagg Kentucky Straight Bourbon Whiskey',
      variantTitle: null, vendor: 'Buffalo Trace', productType: 'Bourbon', imageUrl: null, url: 'https://dewinespot.co/products/stagg',
      priceCents: 17500, available: true, sizeMl: 750, proof: null, batch: null, bottleKey: 'k', searchText: 'stagg kentucky straight bourbon whiskey',
      firstSeenAt: new Date(), lastSeenAt: new Date(), checkedAt: new Date(), updatedAt: new Date() };
    await db.insert(listings).values(row);
    expect((await db.select().from(listings))[0].priceCents).toBe(17500);
    await expect(db.insert(listings).values(row)).rejects.toThrow();
  });
});
