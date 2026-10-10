import { eq } from 'drizzle-orm';
import type { Db } from '@/lib/db/client';
import { listings, priceHistory, type Listing } from '@/lib/db/schema';
import type { Observation } from './map';

export type { Observation } from './map';

export type ChangeKind = 'new' | 'restock' | 'sold_out' | 'price_drop' | 'price_change';

export interface ChangeEvent {
  kind: ChangeKind;
  listingId: number;
  prevPriceCents: number | null;
  priceCents: number;
  available: boolean;
}

function classify(
  prev: { priceCents: number; available: boolean },
  next: { priceCents: number; available: boolean },
): ChangeKind | null {
  if (!prev.available && next.available) return 'restock';
  if (prev.available && !next.available) return 'sold_out';
  if (next.priceCents !== prev.priceCents) {
    return next.priceCents < prev.priceCents && next.available ? 'price_drop' : 'price_change';
  }
  return null;
}

/**
 * Upserts one store's crawl. The first crawl of a store (no existing rows) is silent.
 * Listings missing from `obs` are marked sold out unless opts.markMissingSoldOut is false
 * (use false for incomplete/truncated catalogs); in that case they are left untouched.
 */
export async function ingestStoreCrawl(
  db: Db,
  storeId: string,
  obs: Observation[],
  now: Date,
  opts?: { markMissingSoldOut?: boolean },
): Promise<ChangeEvent[]> {
  const markMissing = opts?.markMissingSoldOut ?? true;
  // last observation wins for duplicate variants
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
        priceCents: o.priceCents, available: o.available, sizeMl: o.sizeMl, proof: o.proof,
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
        if (!firstCrawl && o.available) {
          events.push({ kind: 'new', listingId: row.id, prevPriceCents: null, priceCents: o.priceCents, available: true });
        }
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
        await tx
          .update(listings)
          .set({ available: false, checkedAt: now, updatedAt: now })
          .where(eq(listings.id, prev.id));
        await tx.insert(priceHistory).values({ listingId: prev.id, priceCents: prev.priceCents, available: false, recordedAt: now });
        events.push({ kind: 'sold_out', listingId: prev.id, prevPriceCents: prev.priceCents, priceCents: prev.priceCents, available: false });
      }
    }
    return events;
  });
}

/** Applies a live store check to one listing; writes history only when price/availability changed. */
export async function recordLiveCheck(
  db: Db,
  listing: Listing,
  live: { priceCents: number; available: boolean },
  now: Date,
): Promise<ChangeEvent | null> {
  return db.transaction(async (tx) => {
    // re-read so a stale Listing object cannot cause a bogus diff
    const [cur] = await tx.select().from(listings).where(eq(listings.id, listing.id));
    if (!cur) return null;
    const kind = classify(cur, live);
    await tx
      .update(listings)
      .set({ priceCents: live.priceCents, available: live.available, checkedAt: now, updatedAt: kind ? now : cur.updatedAt })
      .where(eq(listings.id, cur.id));
    if (!kind) return null;
    await tx.insert(priceHistory).values({ listingId: cur.id, priceCents: live.priceCents, available: live.available, recordedAt: now });
    return { kind, listingId: cur.id, prevPriceCents: cur.priceCents, priceCents: live.priceCents, available: live.available };
  });
}
