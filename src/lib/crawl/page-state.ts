// Page-crawl bookkeeping between runs: which product pages are due, and where list reading resumes.
import { asc, eq } from 'drizzle-orm';
import type { Db } from '@/lib/db/client';
import { crawlState, listings } from '@/lib/db/schema';

/** `pathname + search` of a stored listing url. */
function pathOf(url: string): string | null {
  try {
    const u = new URL(url);
    return u.pathname + u.search;
  } catch {
    return null;
  }
}

/** The store's listing paths, least recently checked first (ties by id), at most `limit`. */
export async function dueProductPaths(db: Db, storeId: string, limit: number): Promise<string[]> {
  const rows = await db
    .select({ url: listings.url })
    .from(listings)
    .where(eq(listings.storeId, storeId))
    .orderBy(asc(listings.checkedAt), asc(listings.id))
    .limit(limit);
  return rows.map((r) => pathOf(r.url)).filter((p): p is string => p !== null);
}

/** Every listing path of the store (list-discovered paths among these are not fetched as new). */
export async function storeListingPaths(db: Db, storeId: string): Promise<string[]> {
  const rows = await db.select({ url: listings.url }).from(listings).where(eq(listings.storeId, storeId));
  return rows.map((r) => pathOf(r.url)).filter((p): p is string => p !== null);
}

/** The list page the store's next run starts at; 1 when none is saved. */
export async function getNextListPage(db: Db, storeId: string): Promise<number> {
  const [row] = await db.select().from(crawlState).where(eq(crawlState.storeId, storeId));
  return row?.nextListPage ?? 1;
}

export async function saveNextListPage(db: Db, storeId: string, page: number, now: Date): Promise<void> {
  await db
    .insert(crawlState)
    .values({ storeId, nextListPage: page, updatedAt: now })
    .onConflictDoUpdate({ target: crawlState.storeId, set: { nextListPage: page, updatedAt: now } });
}
