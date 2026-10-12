import { eq, inArray, sql, type SQL } from 'drizzle-orm';
import type { Db } from '@/lib/db/client';
import { listings, priceHistory, type Listing } from '@/lib/db/schema';
import type { Observation } from './map';

export type { Observation } from './map';

export type ChangeKind = 'new' | 'restock' | 'sold_out' | 'price_drop' | 'price_change';

export interface ChangeEvent {
  kind: ChangeKind;
  listingId: number;
  prevPriceCents: number | null;
  priceCents: number;
  available: boolean;
}

function classify(
  prev: { priceCents: number; available: boolean },
  next: { priceCents: number; available: boolean },
): ChangeKind | null {
  if (!prev.available && next.available) return 'restock';
  if (prev.available && !next.available) return 'sold_out';
  if (next.priceCents !== prev.priceCents) {
    return next.priceCents < prev.priceCents && next.available ? 'price_drop' : 'price_change';
  }
  return null;
}

// Rows per statement. listings has 22 insert columns, so 500 rows = 10.5k bind params,
// well under Postgres' 65535 limit; priceHistory (4 cols) and id lists are far below it.
const CHUNK = 500;

function chunked<T>(xs: T[], size = CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += size) out.push(xs.slice(i, i + size));
  return out;
}

// Columns refreshed on conflict (everything except storeId, variantId, firstSeenAt).
const UPDATE_COLS = [
  'productId', 'handle', 'title', 'variantTitle', 'vendor', 'productType', 'imageUrl', 'url',
  'priceCents', 'currency', 'available', 'sizeMl', 'proof', 'batch', 'bottleKey', 'searchText',
  'lastSeenAt', 'checkedAt', 'updatedAt',
] as const satisfies readonly (keyof typeof listings.$inferInsert)[];

const UPSERT_SET = Object.fromEntries(
  UPDATE_COLS.map((k) => [k, sql`excluded.${sql.identifier(listings[k].name)}`]),
) as Record<(typeof UPDATE_COLS)[number], SQL>;

/**
 * Upserts one store's crawl. The first crawl of a store (no existing rows) is silent.
 * Listings missing from `obs` are marked sold out unless opts.markMissingSoldOut is false
 * (use false for incomplete/truncated catalogs); in that case they are left untouched.
 * If opts.catalogVariantIds is given, only listings absent from that raw catalog are swept.
 *
 * Diffs are computed in memory against the store's existing rows; writes are multi-row
 * statements in chunks, all in one transaction.
 */
export async function ingestStoreCrawl(
  db: Db,
  storeId: string,
  obs: Observation[],
  now: Date,
  opts?: { markMissingSoldOut?: boolean; catalogVariantIds?: Set<string> },
): Promise<ChangeEvent[]> {
  const markMissing = opts?.markMissingSoldOut ?? true;
  const catalogIds = opts?.catalogVariantIds;
  // last observation wins for duplicate variants
  const byVariant = new Map<string, Observation>();
  for (const o of obs) byVariant.set(o.variantId, o);
  const observed = [...byVariant.values()];

  return db.transaction(async (tx) => {
    const existingRows = await tx.select().from(listings).where(eq(listings.storeId, storeId));
    const existing = new Map(existingRows.map((r) => [r.variantId, r]));
    const firstCrawl = existing.size === 0;

    // 1. Upsert every observed listing; map variantId -> listing id.
    const idByVariant = new Map<string, number>();
    for (const part of chunked(observed)) {
      const rows = await tx
        .insert(listings)
        .values(
          part.map((o) => ({
            storeId, variantId: o.variantId, firstSeenAt: now,
            productId: o.productId, handle: o.handle, title: o.title, variantTitle: o.variantTitle,
            vendor: o.vendor, productType: o.productType, imageUrl: o.imageUrl, url: o.url,
            priceCents: o.priceCents, currency: o.currency, available: o.available, sizeMl: o.sizeMl, proof: o.proof,
            batch: o.batch, bottleKey: o.bottleKey, searchText: o.searchText,
            lastSeenAt: now, checkedAt: now, updatedAt: now,
          })),
        )
        .onConflictDoUpdate({ target: [listings.storeId, listings.variantId], set: UPSERT_SET })
        .returning({ id: listings.id, variantId: listings.variantId });
      for (const r of rows) idByVariant.set(r.variantId, r.id);
    }

    // 2. Diff in memory (same order and rules as the former per-row loop).
    const events: ChangeEvent[] = [];
    const history: (typeof priceHistory.$inferInsert)[] = [];
    for (const o of observed) {
      const id = idByVariant.get(o.variantId)!;
      const prev = existing.get(o.variantId);
      if (!prev) {
        history.push({ listingId: id, priceCents: o.priceCents, available: o.available, recordedAt: now });
        if (!firstCrawl && o.available) {
          events.push({ kind: 'new', listingId: id, prevPriceCents: null, priceCents: o.priceCents, available: true });
        }
        continue;
      }
      const kind = classify(prev, o);
      if (kind) {
        history.push({ listingId: id, priceCents: o.priceCents, available: o.available, recordedAt: now });
        events.push({ kind, listingId: id, prevPriceCents: prev.priceCents, priceCents: o.priceCents, available: o.available });
      }
    }

    // 3. Sweep listings missing from this crawl.
    const goneIds: number[] = [];
    if (markMissing) {
      for (const prev of existingRows) {
        if (byVariant.has(prev.variantId) || !prev.available) continue;
        // still in the store's raw catalog but filtered/unparseable by us: not gone
        if (catalogIds?.has(prev.variantId)) continue;
        goneIds.push(prev.id);
        history.push({ listingId: prev.id, priceCents: prev.priceCents, available: false, recordedAt: now });
        events.push({ kind: 'sold_out', listingId: prev.id, prevPriceCents: prev.priceCents, priceCents: prev.priceCents, available: false });
      }
    }
    for (const part of chunked(goneIds)) {
      await tx
        .update(listings)
        .set({ available: false, checkedAt: now, updatedAt: now })
        .where(inArray(listings.id, part));
    }

    for (const part of chunked(history)) {
      await tx.insert(priceHistory).values(part);
    }
    return events;
  });
}

/** Applies a live store check to one listing; writes history only when price/availability changed. */
export async function recordLiveCheck(
  db: Db,
  listing: Listing,
  live: { priceCents: number; available: boolean },
  now: Date,
): Promise<ChangeEvent | null> {
  return db.transaction(async (tx) => {
    // re-read so a stale Listing object cannot cause a bogus diff
    const [cur] = await tx.select().from(listings).where(eq(listings.id, listing.id));
    if (!cur) return null;
    const kind = classify(cur, live);
    await tx
      .update(listings)
      .set({ priceCents: live.priceCents, available: live.available, checkedAt: now, updatedAt: kind ? now : cur.updatedAt })
      .where(eq(listings.id, cur.id));
    if (!kind) return null;
    await tx.insert(priceHistory).values({ listingId: cur.id, priceCents: live.priceCents, available: live.available, recordedAt: now });
    return { kind, listingId: cur.id, prevPriceCents: cur.priceCents, priceCents: live.priceCents, available: live.available };
  });
}
