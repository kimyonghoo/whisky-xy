import type { Db } from '@/lib/db/client';
import type { Listing } from '@/lib/db/schema';
import { getListing } from '@/lib/listings';
import { getStore } from '@/lib/stores';
import { fetchLiveProduct, type FetchFn } from '@/lib/shopify/client';
import { recordLiveCheck } from '@/lib/crawl/ingest';

export const MIN_RECHECK_INTERVAL_MS = 60_000;

export const FAILURE_COOLDOWN_MS = 60_000;

const failedAt = new Map<number, number>();

/** Test-only helper. */
export function resetRecheckCooldowns(): void {
  failedAt.clear();
}

export type RecheckStatus = 'updated' | 'cached' | 'failed' | 'gone';

export async function recheckListing(
  db: Db,
  id: number,
  opts: { fetchFn?: FetchFn; now?: Date } = {},
): Promise<{ listing: Listing; status: RecheckStatus } | null> {
  const listing = await getListing(db, id);
  if (!listing) return null;
  const now = opts.now ?? new Date();

  if (now.getTime() - listing.checkedAt.getTime() < MIN_RECHECK_INTERVAL_MS) {
    return { listing, status: 'cached' };
  }

  const lastFail = failedAt.get(id);
  if (lastFail !== undefined && now.getTime() - lastFail < FAILURE_COOLDOWN_MS) {
    return { listing, status: 'failed' };
  }

  // Only ever the registered store's domain; nothing comes from user input.
  const store = getStore(listing.storeId);
  if (!store) {
    console.warn(`recheck: listing ${id} has unregistered store ${listing.storeId}`);
    failedAt.set(id, now.getTime());
    return { listing, status: 'failed' };
  }

  try {
    const variants = await fetchLiveProduct(store, listing.handle, { fetchFn: opts.fetchFn });
    const live = variants?.find((v) => String(v.id) === listing.variantId);
    if (!live) {
      await recordLiveCheck(db, listing, { priceCents: listing.priceCents, available: false }, now);
      failedAt.delete(id);
      return { listing: (await getListing(db, id)) ?? listing, status: 'gone' };
    }
    await recordLiveCheck(db, listing, { priceCents: live.priceCents, available: live.available }, now);
    failedAt.delete(id);
    return { listing: (await getListing(db, id)) ?? listing, status: 'updated' };
  } catch (err) {
    failedAt.set(id, now.getTime());
    console.warn(`recheck: listing ${id} store ${listing.storeId} failed: ${err instanceof Error ? err.message : 'unknown error'}`);
    return { listing, status: 'failed' };
  }
}
