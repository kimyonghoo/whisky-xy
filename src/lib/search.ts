import { and, asc, desc, gte, ilike, inArray, lte, eq } from 'drizzle-orm';
import type { Db } from '@/lib/db/client';
import { listings, type Listing } from '@/lib/db/schema';
import { STORES, getStore, MAIN_REGIONS, type Region, type Store } from '@/lib/stores';
import { withTaxCents } from '@/lib/money';
import { normalizeText } from '@/lib/whisky/parse';

export interface SearchParams {
  q: string;
  region?: Region;
  storeId?: string;
  inStockOnly?: boolean;
  minCents?: number;
  maxCents?: number;
}

export interface ListingRow extends Listing {
  store: Store;
  taxIncludedCents: number;
}

export interface BottleGroup {
  bottleKey: string;
  displayTitle: string;
  sizeMl: number | null;
  proof: number | null;
  batch: string | null;
  imageUrl: string | null;
  rows: ListingRow[];
  bestAvailableCents: number | null;
}

export const SECTION_ROW_LIMIT = 500;

export function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

function rowCmp(a: ListingRow, b: ListingRow): number {
  if (a.available !== b.available) return a.available ? -1 : 1;
  return a.taxIncludedCents - b.taxIncludedCents;
}

function buildGroups(rows: ListingRow[]): BottleGroup[] {
  const map = new Map<string, ListingRow[]>();
  for (const r of rows) {
    const arr = map.get(r.bottleKey);
    if (arr) arr.push(r);
    else map.set(r.bottleKey, [r]);
  }
  const groups: BottleGroup[] = [];
  for (const [key, rs] of map) {
    rs.sort(rowCmp);
    const first = rs[0];
    const avail = rs.filter((r) => r.available).map((r) => r.taxIncludedCents);
    groups.push({
      bottleKey: key,
      displayTitle: first.title,
      sizeMl: first.sizeMl,
      proof: first.proof,
      batch: first.batch,
      imageUrl: rs.find((r) => r.imageUrl)?.imageUrl ?? null,
      rows: rs,
      bestAvailableCents: avail.length ? Math.min(...avail) : null,
    });
  }
  groups.sort((a, b) => {
    const A = a.bestAvailableCents;
    const B = b.bestAvailableCents;
    if (A !== null && B !== null) return A - B || a.displayTitle.localeCompare(b.displayTitle);
    if (A !== null) return -1;
    if (B !== null) return 1;
    return a.displayTitle.localeCompare(b.displayTitle);
  });
  return groups;
}

export interface SearchOptions {
  /** Per-section row limit; override is intended for tests only. */
  rowLimit?: number;
}

export async function searchListings(
  db: Db,
  p: SearchParams,
  opts: SearchOptions = {},
): Promise<{ main: BottleGroup[]; ca: BottleGroup[] }> {
  const tokens = normalizeText(p.q ?? '').split(' ').filter(Boolean);
  if (tokens.length === 0 && !p.storeId) return { main: [], ca: [] };
  const limit = opts.rowLimit ?? SECTION_ROW_LIMIT;

  let stores = STORES.filter((s) => s.publicAllowed);
  if (p.region) stores = stores.filter((s) => s.region === p.region);
  if (p.storeId) stores = stores.filter((s) => s.id === p.storeId);

  // Each section is queried separately so one region can never crowd out the other.
  const section = async (sectionStores: Store[]): Promise<BottleGroup[]> => {
    if (sectionStores.length === 0) return [];
    const conds = [
      inArray(listings.storeId, sectionStores.map((s) => s.id)),
      ...tokens.map((t) => ilike(listings.searchText, `%${escapeLike(t)}%`)),
    ];
    if (p.inStockOnly) conds.push(eq(listings.available, true));
    if (p.minCents != null) conds.push(gte(listings.priceCents, p.minCents));
    if (p.maxCents != null) conds.push(lte(listings.priceCents, p.maxCents));
    const found = await db
      .select()
      .from(listings)
      .where(and(...conds))
      .orderBy(desc(listings.available), asc(listings.priceCents), asc(listings.id))
      .limit(limit);
    const rows: ListingRow[] = [];
    for (const l of found) {
      const store = getStore(l.storeId);
      if (!store) continue;
      rows.push({ ...l, store, taxIncludedCents: withTaxCents(l.priceCents, store.taxRate) });
    }
    return buildGroups(rows);
  };

  const [main, ca] = await Promise.all([
    section(stores.filter((s) => MAIN_REGIONS.includes(s.region))),
    section(stores.filter((s) => !MAIN_REGIONS.includes(s.region))),
  ]);
  return { main, ca };
}
