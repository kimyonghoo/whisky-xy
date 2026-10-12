import { and, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import type { Db } from '@/lib/db/client';
import { listings, priceHistory, type Listing, type PriceHistoryRow } from '@/lib/db/schema';
import { confirmedSince, stockState } from '@/lib/freshness';
import { STORES } from '@/lib/stores';

/** Ids of the stores that may be shown publicly. Private stores are crawled but never read by a public query. */
export function publicStoreIds(): string[] {
  return STORES.filter((s) => s.publicAllowed).map((s) => s.id);
}

export async function getListing(db: Db, id: number): Promise<Listing | null> {
  const rows = await db.select().from(listings).where(eq(listings.id, id)).limit(1);
  return rows[0] ?? null;
}

/** Newest first. */
export async function getPriceHistory(db: Db, listingId: number, limit = 20): Promise<PriceHistoryRow[]> {
  return db
    .select()
    .from(priceHistory)
    .where(eq(priceHistory.listingId, listingId))
    .orderBy(desc(priceHistory.recordedAt), desc(priceHistory.id))
    .limit(limit);
}

/** storeId -> number of confirmed in-stock listings (optionally only for one bottleKey). Unverified (> 48 h) rows don't count. */
export async function storeAvailability(db: Db, bottleKey?: string, now: Date = new Date()): Promise<Map<string, number>> {
  const confirmed = and(eq(listings.available, true), gte(listings.checkedAt, confirmedSince(now)));
  const where = bottleKey ? and(confirmed, eq(listings.bottleKey, bottleKey)) : confirmed;
  const rows = await db
    .select({ storeId: listings.storeId, n: sql<number>`count(*)::int` })
    .from(listings)
    .where(where)
    .groupBy(listings.storeId);
  return new Map(rows.map((r) => [r.storeId, Number(r.n)]));
}

export interface BottleStoreOffer {
  storeId: string;
  /** Listings of this bottle at the store (any stock state). */
  listed: number;
  /** Listings confirmed in stock (available and checked within 48 h). */
  inStock: number;
  /** Listings marked available but not checked for 48 h ("재고 확인 필요"). */
  unverified: number;
  /** Cheapest pre-tax price among confirmed in-stock listings, else null. */
  minAvailablePriceCents: number | null;
}

export interface BottleOffers {
  title: string;
  sizeMl: number | null;
  offers: Map<string, BottleStoreOffer>;
}

/** Per-store offers for one bottleKey (map view). Null when no public store lists the bottle. */
export async function bottleStoreOffers(db: Db, bottleKey: string, now: Date = new Date()): Promise<BottleOffers | null> {
  const rows = await db
    .select({
      storeId: listings.storeId,
      title: listings.title,
      sizeMl: listings.sizeMl,
      priceCents: listings.priceCents,
      available: listings.available,
      checkedAt: listings.checkedAt,
    })
    .from(listings)
    // Public stores only: the representative title below must never come from a private store.
    .where(and(eq(listings.bottleKey, bottleKey), inArray(listings.storeId, publicStoreIds())))
    .orderBy(desc(listings.available), listings.priceCents, listings.id);
  if (rows.length === 0) return null;
  const offers = new Map<string, BottleStoreOffer>();
  for (const r of rows) {
    const o = offers.get(r.storeId) ?? { storeId: r.storeId, listed: 0, inStock: 0, unverified: 0, minAvailablePriceCents: null };
    o.listed++;
    const state = stockState(r, now);
    if (state === 'unverified') o.unverified++;
    if (state === 'instock') {
      o.inStock++;
      if (o.minAvailablePriceCents === null || r.priceCents < o.minAvailablePriceCents) o.minAvailablePriceCents = r.priceCents;
    }
    offers.set(r.storeId, o);
  }
  // Rows are ordered in-stock first, then cheapest: the first row's title is the representative one.
  return { title: rows[0].title, sizeMl: rows[0].sizeMl, offers };
}
