import { describe, it, expect } from 'vitest';
import { asc, eq } from 'drizzle-orm';
import { createTestDb } from '../helpers/db';
import { listings, priceHistory } from '@/lib/db/schema';
import type { Db } from '@/lib/db/client';
import { ingestStoreCrawl, type ChangeEvent, type ChangeKind, type Observation } from '@/lib/crawl/ingest';

// Verbatim copy of the pre-batching per-row ingest, kept as the reference semantics.
function classify(prev: { priceCents: number; available: boolean }, next: { priceCents: number; available: boolean }): ChangeKind | null {
  if (!prev.available && next.available) return 'restock';
  if (prev.available && !next.available) return 'sold_out';
  if (next.priceCents !== prev.priceCents) {
    return next.priceCents < prev.priceCents && next.available ? 'price_drop' : 'price_change';
  }
  return null;
}
async function referenceIngest(
  db: Db, storeId: string, obs: Observation[], now: Date,
  opts?: { markMissingSoldOut?: boolean; catalogVariantIds?: Set<string> },
): Promise<ChangeEvent[]> {
  const markMissing = opts?.markMissingSoldOut ?? true;
  const catalogIds = opts?.catalogVariantIds;
  const byVariant = new Map<string, Observation>();
  for (const o of obs) byVariant.set(o.variantId, o);
  return db.transaction(async (tx) => {
    const existingRows = await tx.select().from(listings).where(eq(listings.storeId, storeId));
    const existing = new Map(existingRows.map((r) => [r.variantId, r]));
    const firstCrawl = existing.size === 0;
    const events: ChangeEvent[] = [];
    for (const o of byVariant.values()) {
      const prev = existing.get(o.variantId);
      const fields = {
        productId: o.productId, handle: o.handle, title: o.title, variantTitle: o.variantTitle,
        vendor: o.vendor, productType: o.productType, imageUrl: o.imageUrl, url: o.url,
        currency: o.currency, priceCents: o.priceCents, available: o.available, sizeMl: o.sizeMl, proof: o.proof,
        batch: o.batch, bottleKey: o.bottleKey, searchText: o.searchText,
        lastSeenAt: now, checkedAt: now, updatedAt: now,
      };
      const [row] = await tx
        .insert(listings)
        .values({ storeId, variantId: o.variantId, firstSeenAt: now, ...fields })
        .onConflictDoUpdate({ target: [listings.storeId, listings.variantId], set: fields })
        .returning({ id: listings.id });
      if (!prev) {
        await tx.insert(priceHistory).values({ listingId: row.id, priceCents: o.priceCents, available: o.available, recordedAt: now });
        if (!firstCrawl && o.available) events.push({ kind: 'new', listingId: row.id, prevPriceCents: null, priceCents: o.priceCents, available: true });
        continue;
      }
      const kind = classify(prev, o);
      if (kind) {
        await tx.insert(priceHistory).values({ listingId: row.id, priceCents: o.priceCents, available: o.available, recordedAt: now });
        events.push({ kind, listingId: row.id, prevPriceCents: prev.priceCents, priceCents: o.priceCents, available: o.available });
      }
    }
    if (markMissing) {
      for (const prev of existingRows) {
        if (byVariant.has(prev.variantId) || !prev.available) continue;
        if (catalogIds?.has(prev.variantId)) continue;
        await tx.update(listings).set({ available: false, checkedAt: now, updatedAt: now }).where(eq(listings.id, prev.id));
        await tx.insert(priceHistory).values({ listingId: prev.id, priceCents: prev.priceCents, available: false, recordedAt: now });
        events.push({ kind: 'sold_out', listingId: prev.id, prevPriceCents: prev.priceCents, priceCents: prev.priceCents, available: false });
      }
    }
    return events;
  });
}

// Deterministic PRNG so both DBs see identical input.
function rng(seed: number) {
  return () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
}

const N = 2000;
function ob(storeId: string, i: number, priceCents: number, available: boolean, rev = 0): Observation {
  const id = String(100000 + i);
  return {
    storeId, productId: 'p' + id, variantId: id, handle: 'h' + id, title: `Whisky ${id} r${rev}`,
    variantTitle: i % 7 === 0 ? `${i} ml` : null, vendor: 'V' + (i % 13), productType: 'Whiskey',
    imageUrl: i % 3 === 0 ? null : `https://img.test/${id}.jpg`, url: `https://s.test/products/h${id}`,
    currency: 'USD', priceCents, available, sizeMl: i % 5 === 0 ? null : 750, proof: i % 4 === 0 ? 101.4 : null,
    batch: i % 11 === 0 ? 'B' + rev : null, bottleKey: `k${id}|r${rev}`, searchText: `whisky ${id} r${rev}`,
  };
}

/** Crawls of ~2000 listings covering every event kind, dupes, both sweep guards, and another store. */
function scenario() {
  const r = rng(42);
  const base = Array.from({ length: N }, (_, i) => ob('flask', i, 1000 + Math.floor(r() * 50000), r() > 0.2));
  const crawl1 = [...base, ob('flask', 5, 1, true), ob('flask', 5, 1234, false)]; // dupes: last wins
  const crawl2: Observation[] = [];
  for (let i = 0; i < N; i++) {
    const p = base[i];
    const x = r();
    if (x < 0.08) continue; // missing -> sold_out sweep (if it was available)
    if (x < 0.2) crawl2.push({ ...p, priceCents: p.priceCents - 100 }); // price_drop / price_change
    else if (x < 0.3) crawl2.push({ ...p, priceCents: p.priceCents + 100 }); // price_change
    else if (x < 0.4) crawl2.push({ ...p, available: !p.available }); // restock / sold_out
    else if (x < 0.45) crawl2.push({ ...p, available: !p.available, priceCents: p.priceCents - 1 });
    else if (x < 0.5) crawl2.push(ob('flask', i, p.priceCents, p.available, 1)); // metadata only
    else crawl2.push(p); // unchanged
  }
  for (let i = N; i < N + 150; i++) crawl2.push(ob('flask', i, 2000 + i, i % 3 !== 0)); // new
  const crawl2Catalog = new Set(crawl2.map((o) => o.variantId));
  for (let i = 0; i < N; i += 9) crawl2Catalog.add(base[i].variantId); // guarded from the sweep
  const crawl3 = crawl2.filter((_, i) => i % 6 !== 0).map((o, i) => (i % 10 === 0 ? { ...o, priceCents: o.priceCents + 7 } : o));
  return { crawl1, crawl2, crawl2Catalog, crawl3 };
}

async function runScenario(ingest: typeof ingestStoreCrawl) {
  const db = await createTestDb();
  const { crawl1, crawl2, crawl2Catalog, crawl3 } = scenario();
  const t = (h: number) => new Date(Date.UTC(2026, 0, 1, h));
  const other = Array.from({ length: 50 }, (_, i) => ob('dewinespot', i, 500 + i, true));
  const events: ChangeEvent[][] = [];
  events.push(await ingest(db, 'dewinespot', other, t(0)));
  events.push(await ingest(db, 'flask', crawl1, t(1)));
  events.push(await ingest(db, 'flask', crawl2, t(2), { catalogVariantIds: crawl2Catalog }));
  events.push(await ingest(db, 'flask', crawl3.slice(0, 1500), t(3), { markMissingSoldOut: false }));
  events.push(await ingest(db, 'flask', crawl3, t(4)));
  events.push(await ingest(db, 'dewinespot', other.slice(10), t(5)));
  const rows = await db.select().from(listings).orderBy(asc(listings.id));
  const history = await db.select().from(priceHistory).orderBy(asc(priceHistory.id));
  return { events, rows, history };
}

describe('ingestStoreCrawl batching', () => {
  it('matches the per-row reference exactly on ~2000 observations', async () => {
    const got = await runScenario(ingestStoreCrawl);
    const want = await runScenario(referenceIngest);

    expect(got.rows.length).toBeGreaterThan(2000);
    const kinds = new Set(got.events.flat().map((e) => e.kind));
    expect([...kinds].sort()).toEqual(['new', 'price_change', 'price_drop', 'restock', 'sold_out']);
    expect(got.events[0]).toEqual([]); // first crawl of each store is silent
    expect(got.events[1]).toEqual([]);

    expect(got.events.map((e) => e.length)).toEqual(want.events.map((e) => e.length));
    expect(got.events).toEqual(want.events);
    expect(got.rows).toEqual(want.rows);
    expect(got.history.length).toBe(want.history.length);
    expect(got.history).toEqual(want.history);
  }, 600_000);
});
