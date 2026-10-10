import { desc, eq } from 'drizzle-orm';
import type { Db } from '@/lib/db/client';
import { watches, type Watch } from '@/lib/db/schema';
import type { WatchInput } from '@/lib/watch-form';

export {
  LINE_SIBLINGS,
  suggestExcludes,
  parseWatchForm,
  parseWatchId,
  splitTerms,
  type WatchInput,
  type WatchField,
  type WatchFormError,
} from '@/lib/watch-form';

export async function createWatch(db: Db, input: WatchInput): Promise<Watch> {
  const [row] = await db
    .insert(watches)
    .values({ ...input, createdAt: new Date() })
    .returning();
  return row;
}

/** Newest first. */
export async function listWatches(db: Db): Promise<Watch[]> {
  return db.select().from(watches).orderBy(desc(watches.createdAt), desc(watches.id));
}

/** True when a row was deleted. */
export async function deleteWatch(db: Db, id: number): Promise<boolean> {
  const rows = await db.delete(watches).where(eq(watches.id, id)).returning({ id: watches.id });
  return rows.length > 0;
}
