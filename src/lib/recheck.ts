import type { Db } from '@/lib/db/client';
import type { Listing } from '@/lib/db/schema';
import { getListing } from '@/lib/listings';
import { getStore } from '@/lib/stores';
import { fetchLiveProduct, type FetchFn } from '@/lib/shopify/client';
import { recordLiveCheck } from '@/lib/crawl/ingest';
import { claimLiveCheck } from '@/lib/live-budget';

export const MIN_RECHECK_INTERVAL_MS = 60_000;

export const FAILURE_COOLDOWN_MS = 60_000;

const failedAt = new Map<number, number>();

/**
 * All crawling is stopped (owner, 2026-10-14), live checks included: no request reaches a store
 * and stored data is returned unchanged. Set to false to resume live checks.
 */
let livePaused = true;

/** Test-only helper. */
export function resetRecheckCooldowns(): void {
  failedAt.clear();
}

/** Test-only helper. */
export function setLiveRecheckPaused(paused: boolean): void {
  livePaused = paused;
}

export function isLiveRecheckPaused(): boolean {
  return livePaused;
}

/**
 * 'throttled' = the store's live-check budget is used up; 'paused' = live checks are switched
 * off. Both return stored data unchanged.
 */
export type RecheckStatus = 'updated' | 'cached' | 'failed' | 'gone' | 'throttled' | 'paused';

export async function recheckListing(
  db: Db,
  id: number,
  opts: { fetchFn?: FetchFn; now?: Date } = {},
): Promise<{ listing: Listing; status: RecheckStatus } | null> {
  const listing = await getListing(db, id);
  if (!listing) return null;
  if (livePaused) return { listing, status: 'paused' };
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

  // Per-store budget shared by card opens and "다시 확인" across all instances (I3).
  // Fail closed (show stored data) if the budget table is unavailable, e.g. deploy before migrate.
  let claimed = false;
  try {
    claimed = await claimLiveCheck(db, store.id, now);
  } catch (err) {
    console.warn(`recheck: live budget unavailable: ${(err as Error).message}`);
  }
  if (!claimed) {
    return { listing, status: 'throttled' };
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
