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
