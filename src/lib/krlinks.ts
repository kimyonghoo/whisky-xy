import { inArray, eq } from 'drizzle-orm';
import type { Db } from '@/lib/db/client';
import { krLinks, type KrLink } from '@/lib/db/schema';
import { fetchDailyshotPrice, type DailyshotPrice } from '@/lib/dailyshot/client';
import type { FetchFn } from '@/lib/shopify/client';

export interface KrLinkInput {
  bottleKey: string;
  productId: string;
  nameKo: string;
  nameEn: string | null;
  imageUrl: string | null;
  price: DailyshotPrice;
}

const sleep = (ms: number) => (ms > 0 ? new Promise<void>((r) => setTimeout(r, ms)) : Promise.resolve());

export async function upsertKrLink(db: Db, input: KrLinkInput, now: Date): Promise<void> {
  const values = {
    bottleKey: input.bottleKey,
    dailyshotProductId: input.productId,
    nameKo: input.nameKo,
    nameEn: input.nameEn,
    imageUrl: input.imageUrl && input.imageUrl.startsWith('https://') ? input.imageUrl : null,
    lowPriceKrw: input.price.lowPriceKrw,
    highPriceKrw: input.price.highPriceKrw,
    offerCount: input.price.offerCount,
    checkedAt: now,
  };
  await db.insert(krLinks).values(values).onConflictDoUpdate({ target: krLinks.bottleKey, set: values });
}

export async function deleteKrLink(db: Db, bottleKey: string): Promise<void> {
  await db.delete(krLinks).where(eq(krLinks.bottleKey, bottleKey));
}

export async function getKrLinks(db: Db, bottleKeys: string[]): Promise<Map<string, KrLink>> {
  if (bottleKeys.length === 0) return new Map();
  const rows = await db.select().from(krLinks).where(inArray(krLinks.bottleKey, bottleKeys));
  return new Map(rows.map((r) => [r.bottleKey, r]));
}

/** Dailyshot Korean names by bottle key, in one query (pages that show names but load no links). */
export async function getKrNames(db: Db, bottleKeys: string[]): Promise<Map<string, string>> {
  if (bottleKeys.length === 0) return new Map();
  const rows = await db
    .select({ bottleKey: krLinks.bottleKey, nameKo: krLinks.nameKo })
    .from(krLinks)
    .where(inArray(krLinks.bottleKey, bottleKeys));
  return new Map(rows.map((r) => [r.bottleKey, r.nameKo]));
}

export async function listKrLinks(db: Db): Promise<KrLink[]> {
  return db.select().from(krLinks).orderBy(krLinks.bottleKey);
}

export async function refreshKrLinks(
  db: Db,
  opts: { fetchFn?: FetchFn; delayMs?: number; now: Date },
): Promise<{ ok: number; failed: number }> {
  const delayMs = opts.delayMs ?? 1100;
  const rows = await listKrLinks(db);
  let ok = 0;
  let failed = 0;
  for (let i = 0; i < rows.length; i++) {
    if (i > 0) await sleep(delayMs);
    const row = rows[i];
    try {
      const price = await fetchDailyshotPrice(row.dailyshotProductId, { fetchFn: opts.fetchFn });
      if (!price) {
        failed++;
        console.warn(`[krlinks] product ${row.dailyshotProductId} unavailable`);
        continue;
      }
      await db
        .update(krLinks)
        .set({ lowPriceKrw: price.lowPriceKrw, highPriceKrw: price.highPriceKrw, offerCount: price.offerCount, checkedAt: opts.now })
        .where(eq(krLinks.id, row.id));
      ok++;
    } catch {
      failed++;
      console.warn(`[krlinks] product ${row.dailyshotProductId} refresh failed`);
    }
  }
  return { ok, failed };
}
