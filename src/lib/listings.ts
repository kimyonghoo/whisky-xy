import { and, desc, eq, sql } from 'drizzle-orm';
import type { Db } from '@/lib/db/client';
import { listings, priceHistory, type Listing, type PriceHistoryRow } from '@/lib/db/schema';

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

/** storeId -> number of available listings (optionally only for one bottleKey). */
export async function storeAvailability(db: Db, bottleKey?: string): Promise<Map<string, number>> {
  const where = bottleKey
    ? and(eq(listings.available, true), eq(listings.bottleKey, bottleKey))
    : eq(listings.available, true);
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
  /** Listings currently marked available. */
  inStock: number;
  /** Cheapest pre-tax price among available listings, else null. */
  minAvailablePriceCents: number | null;
}

export interface BottleOffers {
  title: string;
  sizeMl: number | null;
  offers: Map<string, BottleStoreOffer>;
}

/** Per-store offers for one bottleKey (map view). Null when no store lists the bottle. */
export async function bottleStoreOffers(db: Db, bottleKey: string): Promise<BottleOffers | null> {
  const rows = await db
    .select({
      storeId: listings.storeId,
      title: listings.title,
      sizeMl: listings.sizeMl,
      priceCents: listings.priceCents,
      available: listings.available,
    })
    .from(listings)
    .where(eq(listings.bottleKey, bottleKey))
    .orderBy(desc(listings.available), listings.priceCents, listings.id);
  if (rows.length === 0) return null;
  const offers = new Map<string, BottleStoreOffer>();
  for (const r of rows) {
    const o = offers.get(r.storeId) ?? { storeId: r.storeId, listed: 0, inStock: 0, minAvailablePriceCents: null };
    o.listed++;
    if (r.available) {
      o.inStock++;
      if (o.minAvailablePriceCents === null || r.priceCents < o.minAvailablePriceCents) o.minAvailablePriceCents = r.priceCents;
    }
    offers.set(r.storeId, o);
  }
  // Rows are ordered in-stock first, then cheapest: the first row's title is the representative one.
  return { title: rows[0].title, sizeMl: rows[0].sizeMl, offers };
}
