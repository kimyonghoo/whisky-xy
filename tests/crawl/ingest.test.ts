import { describe, it, expect, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb } from '../helpers/db';
import { listings, priceHistory } from '@/lib/db/schema';
import { ingestStoreCrawl, recordLiveCheck, type Observation } from '@/lib/crawl/ingest';

const t0 = new Date('2026-01-01T00:00:00Z');
const t1 = new Date('2026-01-01T06:00:00Z');
const t2 = new Date('2026-01-01T12:00:00Z');

const mk = (id: string) => (priceCents: number, available: boolean): Observation => ({
  storeId: 'flask', productId: 'p' + id, variantId: id, handle: 'h' + id, title: 'Whisky ' + id, variantTitle: null,
  vendor: 'V', productType: 'Whiskey', imageUrl: null, url: 'https://flaskfinewines.com/products/h' + id,
  priceCents, available, sizeMl: 750, proof: null, batch: null, bottleKey: 'k' + id, searchText: 'whisky ' + id,
});
const a = mk('a'), b = mk('b'), c = mk('c');

let db: Awaited<ReturnType<typeof createTestDb>>;
beforeEach(async () => { db = await createTestDb(); });

const rowFor = async (variantId: string) => (await db.select().from(listings)).find((l) => l.variantId === variantId)!;

describe('ingestStoreCrawl', () => {
  it('first crawl of a store inserts silently', async () => {
    expect(await ingestStoreCrawl(db, 'flask', [a(6499, true), b(3499, false)], t0)).toEqual([]);
    expect(await db.select().from(priceHistory)).toHaveLength(2);
  });
  it('emits new / restock / price_drop / sold_out on later crawls', async () => {
    await ingestStoreCrawl(db, 'flask', [a(6499, true), b(3499, false)], t0);
    const ev = await ingestStoreCrawl(db, 'flask', [a(5999, true), b(3499, true), c(17500, true)], t1);
    expect(ev.map((e) => e.kind).sort()).toEqual(['new', 'price_drop', 'restock']);
    const ev2 = await ingestStoreCrawl(db, 'flask', [b(3499, true), c(17500, true)], t2);
    expect(ev2).toEqual([expect.objectContaining({ kind: 'sold_out', prevPriceCents: 5999 })]);
    expect((await rowFor('a')).available).toBe(false);
  });
  it('unchanged crawl writes no history but bumps checkedAt', async () => {
    await ingestStoreCrawl(db, 'flask', [a(6499, true)], t0);
    expect(await ingestStoreCrawl(db, 'flask', [a(6499, true)], t1)).toEqual([]);
    expect(await db.select().from(priceHistory)).toHaveLength(1);
    const row = await rowFor('a');
    expect(row.checkedAt).toEqual(t1);
    expect(row.lastSeenAt).toEqual(t1);
    expect(row.firstSeenAt).toEqual(t0);
  });
  it('duplicate variant in one crawl does not throw (last wins)', async () => {
    await ingestStoreCrawl(db, 'flask', [a(6499, true), a(6000, true)], t0);
    const rows = await db.select().from(listings);
    expect(rows).toHaveLength(1);
    expect(rows[0].priceCents).toBe(6000);
  });
  it('new variant that is out of stock emits nothing', async () => {
    await ingestStoreCrawl(db, 'flask', [a(6499, true)], t0);
    expect(await ingestStoreCrawl(db, 'flask', [a(6499, true), b(3499, false)], t1)).toEqual([]);
  });
  it('price increase is price_change; other stores are untouched', async () => {
    await ingestStoreCrawl(db, 'flask', [a(6499, true)], t0);
    await ingestStoreCrawl(db, 'dewinespot', [{ ...b(100, true), storeId: 'dewinespot' }], t0);
    const ev = await ingestStoreCrawl(db, 'flask', [a(6999, true)], t1);
    expect(ev).toEqual([expect.objectContaining({ kind: 'price_change', prevPriceCents: 6499, priceCents: 6999 })]);
    expect((await rowFor('b')).available).toBe(true);
  });
  it('markMissingSoldOut false leaves missing listings untouched', async () => {
    await ingestStoreCrawl(db, 'flask', [a(6499, true), b(3499, true)], t0);
    const ev = await ingestStoreCrawl(db, 'flask', [b(3499, true)], t1, { markMissingSoldOut: false });
    expect(ev).toEqual([]);
    const row = await rowFor('a');
    expect(row.available).toBe(true);
    expect(row.checkedAt).toEqual(t0);
    const hist = await db.select().from(priceHistory).where(eq(priceHistory.listingId, row.id));
    expect(hist).toHaveLength(1);
  });
});

describe('recordLiveCheck', () => {
  it('writes history only when changed', async () => {
    await ingestStoreCrawl(db, 'flask', [a(6499, true)], t0);
    const row = await rowFor('a');
    expect(await recordLiveCheck(db, row, { priceCents: 6499, available: true }, t1)).toBeNull();
    expect(await db.select().from(priceHistory)).toHaveLength(1);
    expect((await rowFor('a')).checkedAt).toEqual(t1);
    const ev = await recordLiveCheck(db, await rowFor('a'), { priceCents: 6999, available: true }, t2);
    expect(ev).toMatchObject({ kind: 'price_change', prevPriceCents: 6499, priceCents: 6999 });
    expect(await db.select().from(priceHistory)).toHaveLength(2);
    expect((await rowFor('a')).priceCents).toBe(6999);
  });
});
