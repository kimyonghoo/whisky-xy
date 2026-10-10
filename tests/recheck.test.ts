import { describe, it, expect, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb } from './helpers/db';
import { seed } from './helpers/seed';
import { listings, priceHistory } from '@/lib/db/schema';
import { recheckListing } from '@/lib/recheck';

const NOW = new Date('2026-10-10T12:00:00Z');
const OLD = new Date('2026-10-10T10:00:00Z');

function fakeFetch(opts: { variants?: { id: number; price: number; available: boolean }[]; status?: number; throws?: boolean }) {
  return vi.fn(async (input: RequestInfo | URL) => {
    if (opts.throws) throw new Error('timeout');
    const url = String(input);
    if (url.includes('/cart.js')) return new Response(JSON.stringify({ currency: 'USD' }), { status: 200 });
    if (opts.status && opts.status !== 200) return new Response('nope', { status: opts.status });
    return new Response(JSON.stringify({ variants: opts.variants ?? [] }), { status: 200 });
  }) as unknown as typeof fetch;
}

async function setup(checkedAt = OLD) {
  const db = await createTestDb();
  const [row] = await db.insert(listings).values({ ...seed({ storeId: 'dewinespot', title: 'Stagg', priceCents: 10000 }), variantId: '555', checkedAt }).returning();
  return { db, row };
}

describe('recheckListing', () => {
  it('updated: price change adds history and sets checkedAt', async () => {
    const { db, row } = await setup();
    const fetchFn = fakeFetch({ variants: [{ id: 555, price: 9000, available: true }] });
    const r = await recheckListing(db, row.id, { fetchFn, now: NOW });
    expect(r?.status).toBe('updated');
    expect(r?.listing.priceCents).toBe(9000);
    expect(r?.listing.checkedAt.getTime()).toBe(NOW.getTime());
    const h = await db.select().from(priceHistory).where(eq(priceHistory.listingId, row.id));
    expect(h.some((x) => x.priceCents === 9000)).toBe(true);
  });

  it('cached: within 60s makes no fetch', async () => {
    const { db, row } = await setup(new Date(NOW.getTime() - 30_000));
    const fetchFn = fakeFetch({});
    const r = await recheckListing(db, row.id, { fetchFn, now: NOW });
    expect(r?.status).toBe('cached');
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('failed: fetch throws, listing unchanged', async () => {
    const { db, row } = await setup();
    const r = await recheckListing(db, row.id, { fetchFn: fakeFetch({ throws: true }), now: NOW });
    expect(r?.status).toBe('failed');
    expect(r?.listing.priceCents).toBe(10000);
    expect(r?.listing.checkedAt.getTime()).toBe(OLD.getTime());
  });

  it('gone: 404 records unavailable', async () => {
    const { db, row } = await setup();
    const r = await recheckListing(db, row.id, { fetchFn: fakeFetch({ status: 404 }), now: NOW });
    expect(r?.status).toBe('gone');
    expect(r?.listing.available).toBe(false);
  });

  it('gone: variant missing records unavailable', async () => {
    const { db, row } = await setup();
    const r = await recheckListing(db, row.id, { fetchFn: fakeFetch({ variants: [{ id: 1, price: 1, available: true }] }), now: NOW });
    expect(r?.status).toBe('gone');
    expect(r?.listing.available).toBe(false);
    expect(r?.listing.priceCents).toBe(10000);
  });

  it('null for unknown id', async () => {
    const db = await createTestDb();
    expect(await recheckListing(db, 99999, { fetchFn: fakeFetch({}), now: NOW })).toBeNull();
  });
});
