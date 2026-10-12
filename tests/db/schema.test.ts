import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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

  it('migration 0003 renames regions to cities and maps ca to la', async () => {
    const { PGlite } = await import('@electric-sql/pglite');
    const pg = new PGlite();
    const sqlOf = (name: string) => readFileSync(join(process.cwd(), 'drizzle', name), 'utf8');
    const run = async (name: string) => {
      for (const stmt of sqlOf(name).split('--> statement-breakpoint')) if (stmt.trim()) await pg.exec(stmt);
    };
    await run('0000_condemned_charles_xavier.sql');
    await run('0001_steep_morgan_stark.sql');
    await run('0002_store_live_budget.sql');
    await pg.exec(`INSERT INTO watches (label, include_terms, exclude_terms, regions, created_at)
      VALUES ('w', '{stagg}', '{}', '{brooklyn,ca}', now())`);
    await run('0003_watch_cities.sql');
    const res = await pg.query<{ cities: string[] }>('SELECT cities FROM watches');
    expect(res.rows[0].cities).toEqual(['brooklyn', 'la']);
  });

  it('migration 0004 adds listings.currency and existing rows read USD', async () => {
    const { PGlite } = await import('@electric-sql/pglite');
    const pg = new PGlite();
    const sqlOf = (name: string) => readFileSync(join(process.cwd(), 'drizzle', name), 'utf8');
    const run = async (name: string) => {
      for (const stmt of sqlOf(name).split('--> statement-breakpoint')) if (stmt.trim()) await pg.exec(stmt);
    };
    for (const f of ['0000_condemned_charles_xavier.sql', '0001_steep_morgan_stark.sql', '0002_store_live_budget.sql', '0003_watch_cities.sql']) {
      await run(f);
    }
    await pg.exec(`INSERT INTO listings (store_id, product_id, variant_id, handle, title, vendor, product_type, url, price_cents,
      available, bottle_key, search_text, first_seen_at, last_seen_at, checked_at, updated_at)
      VALUES ('flask', '1', '11', 'h', 'T', 'V', 'Whiskey', 'https://x/p/h', 6499, true, 'k', 't', now(), now(), now(), now())`);
    await run('0004_listing_currency.sql');
    const res = await pg.query<{ currency: string }>('SELECT currency FROM listings');
    expect(res.rows).toEqual([{ currency: 'USD' }]);
  });
});
