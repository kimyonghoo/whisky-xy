import { and, asc, desc, eq, gte, inArray } from 'drizzle-orm';
import type { Db } from '@/lib/db/client';
import { listings, type FxRate, type KrLink } from '@/lib/db/schema';
import { STORES } from '@/lib/stores';
import { withTaxCents } from '@/lib/money';
import { listKrLinks } from '@/lib/krlinks';
import { getLatestFx } from '@/lib/fx';
import { compareKr, type KrComparison } from '@/lib/compare';
import type { ListingRow } from '@/lib/search';
import { confirmedSince, stockState } from '@/lib/freshness';

export interface KrRankRow {
  bottleKey: string;
  title: string;
  sizeMl: number | null;
  proof: number | null;
  batch: string | null;
  imageUrl: string | null;
  link: KrLink;
  /** Cheapest in-stock tax-included US row across all public stores. */
  best: ListingRow;
  compare: KrComparison;
}

export interface KrRanking {
  fx: FxRate | null;
  /** Sorted by savingsPct desc. Empty when there is no fx rate. */
  rows: KrRankRow[];
  linked: number;
  /** Linked bottles left out because no public store has them in stock. */
  notInStock: number;
}

const cheaper = (a: ListingRow, b: ListingRow) => a.taxIncludedCents - b.taxIncludedCents || a.id - b.id;

/**
 * Every linked bottle with a confirmed in-stock US row, ranked by how much buying in the US saves.
 * "Available" rows not checked for 48 h (unverified) are never a price base.
 */
export async function listKrComparisons(db: Db, now: Date = new Date()): Promise<KrRanking> {
  const [links, fx] = await Promise.all([listKrLinks(db), getLatestFx(db)]);
  if (links.length === 0) return { fx, rows: [], linked: 0, notInStock: 0 };

  const publicStores = STORES.filter((s) => s.publicAllowed);
  const found = await db
    .select()
    .from(listings)
    .where(
      and(
        inArray(listings.bottleKey, links.map((l) => l.bottleKey)),
        inArray(listings.storeId, publicStores.map((s) => s.id)),
        eq(listings.available, true),
        gte(listings.checkedAt, confirmedSince(now)),
      ),
    );

  const byKey = new Map<string, ListingRow[]>();
  for (const l of found) {
    const store = publicStores.find((s) => s.id === l.storeId);
    if (!store) continue;
    const row: ListingRow = { ...l, store, taxIncludedCents: withTaxCents(l.priceCents, store.taxRate), stock: 'instock' };
    const pool = byKey.get(l.bottleKey);
    if (pool) pool.push(row);
    else byKey.set(l.bottleKey, [row]);
  }

  const notInStock = links.filter((l) => !byKey.has(l.bottleKey)).length;
  if (!fx) return { fx, rows: [], linked: links.length, notInStock };

  const rows: KrRankRow[] = [];
  for (const link of links) {
    const pool = byKey.get(link.bottleKey);
    if (!pool) continue;
    const best = [...pool].sort(cheaper)[0];
    rows.push({
      bottleKey: link.bottleKey,
      title: best.title,
      sizeMl: best.sizeMl,
      proof: best.proof,
      batch: best.batch,
      imageUrl: pool.find((r) => r.imageUrl)?.imageUrl ?? null,
      link,
      best,
      compare: compareKr(best.taxIncludedCents, fx.usdKrw, link.lowPriceKrw),
    });
  }
  rows.sort(
    (a, b) => b.compare.savingsPct - a.compare.savingsPct || b.compare.diffKrw - a.compare.diffKrw || a.title.localeCompare(b.title),
  );
  return { fx, rows, linked: links.length, notInStock };
}

export interface BottleSummary {
  bottleKey: string;
  title: string;
  sizeMl: number | null;
  proof: number | null;
  batch: string | null;
  imageUrl: string | null;
  storeCount: number;
  /** Stores with a confirmed (checked within 48 h) in-stock row. */
  inStockCount: number;
  /** Cheapest confirmed in-stock tax-included price across all public stores. */
  bestTaxIncludedCents: number | null;
}

/** The US bottle behind a `bottleKey`, or null when no public listing has that key (validation). */
export async function getBottleSummary(db: Db, bottleKey: string, now: Date = new Date()): Promise<BottleSummary | null> {
  const publicStores = STORES.filter((s) => s.publicAllowed);
  const found = await db
    .select()
    .from(listings)
    .where(and(eq(listings.bottleKey, bottleKey), inArray(listings.storeId, publicStores.map((s) => s.id))))
    .orderBy(desc(listings.available), asc(listings.priceCents), asc(listings.id))
    .limit(200);
  if (found.length === 0) return null;
  const first = found[0];
  const stores = new Set<string>();
  const inStock = new Set<string>();
  let best: number | null = null;
  for (const l of found) {
    const store = publicStores.find((s) => s.id === l.storeId)!;
    stores.add(l.storeId);
    if (stockState(l, now) !== 'instock') continue;
    inStock.add(l.storeId);
    const t = withTaxCents(l.priceCents, store.taxRate);
    best = best === null ? t : Math.min(best, t);
  }
  return {
    bottleKey,
    title: first.title,
    sizeMl: first.sizeMl,
    proof: first.proof,
    batch: first.batch,
    imageUrl: found.find((l) => l.imageUrl)?.imageUrl ?? null,
    storeCount: stores.size,
    inStockCount: inStock.size,
    bestTaxIncludedCents: best,
  };
}
