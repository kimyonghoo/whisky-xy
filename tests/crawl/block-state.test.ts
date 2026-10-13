import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb } from '../helpers/db';
import { crawlState } from '@/lib/db/schema';
import { clearBlock, getBlock, markBlocked } from '@/lib/crawl/block-state';
import { getNextListPage, saveNextListPage } from '@/lib/crawl/page-state';

let db: Awaited<ReturnType<typeof createTestDb>>;
beforeEach(async () => { db = await createTestDb(); });

const AT = new Date('2026-10-13T03:17:00Z');

describe('crawl block state', () => {
  it('no block by default', async () => {
    expect(await getBlock(db, 'nemoto')).toBeNull();
  });

  it('marks a store with no crawl_state row (Shopify) as blocked, with list page 1', async () => {
    await markBlocked(db, 'nemoto', 'challenge', AT);
    expect(await getBlock(db, 'nemoto')).toEqual({ at: AT, reason: 'challenge' });
    expect(await getNextListPage(db, 'nemoto')).toBe(1);
  });

  it('keeps the page-crawl bookmark when blocking, and saving the bookmark keeps the block', async () => {
    await saveNextListPage(db, 'shinanoya', 21, AT);
    await markBlocked(db, 'shinanoya', 'http-403', AT);
    expect(await getNextListPage(db, 'shinanoya')).toBe(21);
    await saveNextListPage(db, 'shinanoya', 5, new Date('2026-10-14T00:00:00Z'));
    expect(await getBlock(db, 'shinanoya')).toEqual({ at: AT, reason: 'http-403' });
  });

  it('clearBlock removes the block, returns what it cleared, and keeps the bookmark; clearing nothing returns null', async () => {
    await saveNextListPage(db, 'shinanoya', 21, AT);
    await markBlocked(db, 'shinanoya', 'http-429', AT);
    expect(await clearBlock(db, 'shinanoya')).toEqual({ at: AT, reason: 'http-429' });
    expect(await getBlock(db, 'shinanoya')).toBeNull();
    expect(await getNextListPage(db, 'shinanoya')).toBe(21);
    expect(await clearBlock(db, 'shinanoya')).toBeNull();
    expect(await clearBlock(db, 'nemoto')).toBeNull();
    expect(await db.select().from(crawlState)).toHaveLength(1);
  });
});
