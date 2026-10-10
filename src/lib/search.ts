import { and, asc, desc, gte, ilike, inArray, lte, eq } from 'drizzle-orm';
import type { Db } from '@/lib/db/client';
import { listings, type FxRate, type KrLink, type Listing } from '@/lib/db/schema';
import { STORES, getStore, MAIN_REGIONS, type Region, type Store } from '@/lib/stores';
import { withTaxCents } from '@/lib/money';
import { normalizeText } from '@/lib/whisky/parse';
import { getKrLinks } from '@/lib/krlinks';
import { getLatestFx } from '@/lib/fx';
import { compareKr } from '@/lib/compare';

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
  /**
   * Korea (Dailyshot) comparison, present only when the bottle is linked.
   * `compare` uses this section's cheapest in-stock tax-included price; it is null
   * when the section has no in-stock row or no fx rate exists. `fx` is the rate used.
   */
  kr?: { link: KrLink; compare: ReturnType<typeof compareKr> | null; fx: FxRate | null };
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
  await attachKr(db, [...main, ...ca]);
  return { main, ca };
}

/** Fills `group.kr` for linked bottles. Each group compares against its own section's best price. */
async function attachKr(db: Db, groups: BottleGroup[]): Promise<void> {
  if (groups.length === 0) return;
  const [links, fx] = await Promise.all([getKrLinks(db, [...new Set(groups.map((g) => g.bottleKey))]), getLatestFx(db)]);
  if (links.size === 0) return;
  for (const g of groups) {
    const link = links.get(g.bottleKey);
    if (!link) continue;
    const compare = g.bestAvailableCents !== null && fx ? compareKr(g.bestAvailableCents, fx.usdKrw, link.lowPriceKrw) : null;
    g.kr = { link, compare, fx };
  }
}
