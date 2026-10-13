import { describe, it, expect, vi, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb } from './helpers/db';
import { seed } from './helpers/seed';
import { listings, priceHistory } from '@/lib/db/schema';
import { recheckListing, resetRecheckCooldowns, setLiveRecheckPaused } from '@/lib/recheck';
import { claimLiveCheck, LIVE_BURST, LIVE_REFILL_MS } from '@/lib/live-budget';

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
  beforeEach(() => {
    resetRecheckCooldowns();
    setLiveRecheckPaused(false);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('paused: returns stored data and never contacts the store', async () => {
    setLiveRecheckPaused(true);
    const { db, row } = await setup();
    const fetchFn = fakeFetch({ variants: [{ id: 555, price: 9000, available: true }] });
    const r = await recheckListing(db, row.id, { fetchFn, now: NOW });
    expect(r?.status).toBe('paused');
    expect(r?.listing.priceCents).toBe(10000);
    expect(r?.listing.checkedAt.getTime()).toBe(OLD.getTime());
    expect(fetchFn).not.toHaveBeenCalled();
  });

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

  it('failure cooldown: no fetch within 60s, fetches again after', async () => {
    const { db, row } = await setup();
    const bad = fakeFetch({ throws: true });
    expect((await recheckListing(db, row.id, { fetchFn: bad, now: NOW }))?.status).toBe('failed');
    const again = fakeFetch({ variants: [{ id: 555, price: 9000, available: true }] });
    const r2 = await recheckListing(db, row.id, { fetchFn: again, now: new Date(NOW.getTime() + 10_000) });
    expect(r2?.status).toBe('failed');
    expect(again).not.toHaveBeenCalled();
    const r3 = await recheckListing(db, row.id, { fetchFn: again, now: new Date(NOW.getTime() + 61_000) });
    expect(r3?.status).toBe('updated');
    expect(again).toHaveBeenCalled();
  });

  it('per-store budget: walking many card ids stops contacting the store once the bucket is empty (I3)', async () => {
    const db = await createTestDb();
    const rows = await db
      .insert(listings)
      .values(Array.from({ length: LIVE_BURST + 4 }, (_, i) => ({ ...seed({ storeId: 'dewinespot', title: `Bottle ${i}`, priceCents: 1000 }), variantId: String(600 + i), checkedAt: OLD })))
      .returning();
    const other = (await db.insert(listings).values({ ...seed({ storeId: 'flask', title: 'Other', priceCents: 1000 }), variantId: '555', checkedAt: OLD }).returning())[0];
    const fetchFn = fakeFetch({ variants: [555, ...Array.from({ length: 20 }, (_, i) => 600 + i)].map((id) => ({ id, price: 1000, available: true })) });
    const statuses = [];
    for (const r of rows) statuses.push((await recheckListing(db, r.id, { fetchFn, now: NOW }))?.status);
    expect(statuses.filter((s) => s === 'updated')).toHaveLength(LIVE_BURST);
    expect(statuses.slice(LIVE_BURST).every((s) => s === 'throttled')).toBe(true);
    // 2 store requests per live check, and none once throttled
    expect(fetchFn).toHaveBeenCalledTimes(LIVE_BURST * 2);
    // throttled returns the stored row unchanged
    const t = await recheckListing(db, rows[LIVE_BURST].id, { fetchFn, now: NOW });
    expect(t?.listing.checkedAt.getTime()).toBe(OLD.getTime());
    // another store has its own budget
    expect((await recheckListing(db, other.id, { fetchFn, now: NOW }))?.status).toBe('updated');
    // one token refills after LIVE_REFILL_MS
    const later = new Date(NOW.getTime() + LIVE_REFILL_MS);
    expect((await recheckListing(db, rows[LIVE_BURST + 1].id, { fetchFn, now: later }))?.status).toBe('updated');
    expect((await recheckListing(db, rows[LIVE_BURST + 2].id, { fetchFn, now: later }))?.status).toBe('throttled');
  });
});

describe('claimLiveCheck', () => {
  it('is a token bucket: burst, refill, cap, and no negative refill on clock skew', async () => {
    const db = await createTestDb();
    for (let i = 0; i < LIVE_BURST; i++) expect(await claimLiveCheck(db, 's', NOW)).toBe(true);
    expect(await claimLiveCheck(db, 's', NOW)).toBe(false);
    expect(await claimLiveCheck(db, 's', new Date(NOW.getTime() - 60_000))).toBe(false); // clock behind
    expect(await claimLiveCheck(db, 's', new Date(NOW.getTime() + LIVE_REFILL_MS - 100))).toBe(false);
    expect(await claimLiveCheck(db, 's', new Date(NOW.getTime() + LIVE_REFILL_MS))).toBe(true);
    // a long idle period refills only up to the burst size
    const idle = new Date(NOW.getTime() + 24 * 3_600_000);
    let n = 0;
    while (await claimLiveCheck(db, 's', idle)) n++;
    expect(n).toBe(LIVE_BURST);
  });
});
