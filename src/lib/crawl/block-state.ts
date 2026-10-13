// Persisted crawl blocks (spec 3.5: a block is a block). A non-USD store that answered 403, 429 or a
// bot challenge is not requested again until the owner checks it and runs `npm run crawl:unblock`.
import { eq } from 'drizzle-orm';
import type { Db } from '@/lib/db/client';
import { crawlState } from '@/lib/db/schema';
import type { CrawlStopReason } from '@/lib/pagecrawl/fetcher';

/** The stop reasons that mean "this site does not want us": persisted, so later runs send nothing. */
export const BLOCK_REASONS = ['http-403', 'http-429', 'challenge'] as const satisfies readonly CrawlStopReason[];
export type BlockReason = (typeof BLOCK_REASONS)[number];

export const isBlockReason = (reason: string | undefined): reason is BlockReason =>
  (BLOCK_REASONS as readonly string[]).includes(reason ?? '');

export interface StoreBlock {
  at: Date;
  reason: string;
}

export async function getBlock(db: Db, storeId: string): Promise<StoreBlock | null> {
  const [row] = await db
    .select({ at: crawlState.blockedAt, reason: crawlState.blockReason })
    .from(crawlState)
    .where(eq(crawlState.storeId, storeId));
  return row?.at ? { at: row.at, reason: row.reason ?? 'unknown' } : null;
}

/** Records the block. A store without a crawl_state row (Shopify) gets one with list page 1. */
export async function markBlocked(db: Db, storeId: string, reason: BlockReason, at: Date): Promise<void> {
  await db
    .insert(crawlState)
    .values({ storeId, nextListPage: 1, updatedAt: at, blockedAt: at, blockReason: reason })
    .onConflictDoUpdate({ target: crawlState.storeId, set: { blockedAt: at, blockReason: reason, updatedAt: at } });
}

/** Clears the block and returns what was cleared (null when the store was not blocked). */
export async function clearBlock(db: Db, storeId: string): Promise<StoreBlock | null> {
  const block = await getBlock(db, storeId);
  if (!block) return null;
  await db.update(crawlState).set({ blockedAt: null, blockReason: null }).where(eq(crawlState.storeId, storeId));
  return block;
}
