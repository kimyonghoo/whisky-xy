import { sql } from 'drizzle-orm';
import type { Db } from '@/lib/db/client';
import { storeLiveBudget } from '@/lib/db/schema';

/**
 * Live-recheck budget per store: a token bucket of LIVE_BURST checks that refills one token every
 * LIVE_REFILL_MS. One live check = 2 store requests (/cart.js + product .js), so the sustained
 * ceiling is 2 requests per 6 s per store (≈ 20/min), below the crawl's own 1.1 s pacing, no
 * matter how many visitors, bots or link previews open cards.
 *
 * The bucket lives in the DB and is claimed with one atomic upsert, so it holds across
 * serverless instances (an in-memory counter would not).
 */
export const LIVE_BURST = 6;
export const LIVE_REFILL_MS = 6_000;

/** Takes one token for `storeId`. False = budget exhausted: do not contact the store. */
export async function claimLiveCheck(db: Db, storeId: string, now: Date = new Date()): Promise<boolean> {
  const nowIso = now.toISOString();
  const ratePerSec = 1000 / LIVE_REFILL_MS;
  // Tokens available now: refill since updated_at (never negative on clock skew), capped at the burst.
  const refilled = sql`least(${LIVE_BURST}::real, ${storeLiveBudget.tokens} + greatest(0, extract(epoch from (${nowIso}::timestamptz - ${storeLiveBudget.updatedAt}))) * ${ratePerSec}::real)`;
  const rows = await db
    .insert(storeLiveBudget)
    .values({ storeId, tokens: LIVE_BURST - 1, updatedAt: now })
    .onConflictDoUpdate({
      target: storeLiveBudget.storeId,
      set: { tokens: sql`${refilled} - 1`, updatedAt: now },
      setWhere: sql`${refilled} >= 1`,
    })
    .returning({ tokens: storeLiveBudget.tokens });
  return rows.length > 0;
}
