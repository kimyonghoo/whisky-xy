import type { Db } from '@/lib/db/client';
import type { Listing } from '@/lib/db/schema';
import { getListing } from '@/lib/listings';
import { getStore } from '@/lib/stores';
import { fetchLiveProduct, type FetchFn } from '@/lib/shopify/client';
import { recordLiveCheck } from '@/lib/crawl/ingest';

export const MIN_RECHECK_INTERVAL_MS = 60_000;

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

  // Only ever the registered store's domain; nothing comes from user input.
  const store = getStore(listing.storeId);
  if (!store) return { listing, status: 'failed' };

  try {
    const variants = await fetchLiveProduct(store, listing.handle, { fetchFn: opts.fetchFn });
    const live = variants?.find((v) => String(v.id) === listing.variantId);
    if (!live) {
      await recordLiveCheck(db, listing, { priceCents: listing.priceCents, available: false }, now);
      return { listing: (await getListing(db, id)) ?? listing, status: 'gone' };
    }
    await recordLiveCheck(db, listing, { priceCents: live.priceCents, available: live.available }, now);
    return { listing: (await getListing(db, id)) ?? listing, status: 'updated' };
  } catch {
    return { listing, status: 'failed' };
  }
}
