import type { BottleGroup, ListingRow } from '@/lib/search';
import type { SearchFilters, SearchParams } from '@/lib/search';
import type { CityId } from '@/lib/geo';

/** Bottle groups rendered per section before "더 보기". */
export const SECTION_PAGE_SIZE = 20;
/** Hard ceiling for ?show= / ?others= so a hand-edited URL can't force a huge page. */
export const MAX_SECTION_SHOW = 500;
/** Store rows shown per bottle before the rest collapse. */
export const ROWS_PER_GROUP = 3;

const CITY_ORDER: CityId[] = ['brooklyn', 'nj', 'la'];

type RawValue = string | string[] | undefined;

function first(v: RawValue): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/** How many groups to render for a section, from a raw query value. */
export function parseShowCount(raw: RawValue, pageSize = SECTION_PAGE_SIZE): number {
  const s = first(raw);
  if (!s || !/^\d+$/.test(s)) return pageSize;
  const n = Number(s);
  if (!Number.isSafeInteger(n)) return MAX_SECTION_SHOW;
  return Math.min(MAX_SECTION_SHOW, Math.max(pageSize, n));
}

export function capGroups<T>(groups: T[], show: number): { visible: T[]; hiddenCount: number } {
  return { visible: groups.slice(0, show), hiddenCount: Math.max(0, groups.length - show) };
}

export function nextShowCount(show: number, total: number, pageSize = SECTION_PAGE_SIZE): number {
  return Math.min(show + pageSize, total, MAX_SECTION_SHOW);
}

export interface GroupSummary {
  storeCount: number;
  /** Stores with a confirmed in-stock row (unverified rows don't count). */
  inStockCount: number;
  /** Stores whose only "available" rows are older than 48 h ("재고 확인 필요"). */
  unverifiedCount: number;
  cities: CityId[];
  /** Cheapest confirmed in-stock row; never an unverified one. */
  cheapest: ListingRow | null;
}

export function summarizeGroup(group: BottleGroup): GroupSummary {
  const stores = new Set<string>();
  const inStock = new Set<string>();
  const unverified = new Set<string>();
  const cities = new Set<CityId>();
  for (const r of group.rows) {
    stores.add(r.storeId);
    cities.add(r.store.city);
    if (r.stock === 'instock') inStock.add(r.storeId);
    else if (r.stock === 'unverified') unverified.add(r.storeId);
  }
  for (const id of inStock) unverified.delete(id);
  let cheapest: ListingRow | null = null;
  for (const r of group.rows) {
    if (r.stock === 'instock' && (cheapest === null || r.taxIncludedCents < cheapest.taxIncludedCents)) cheapest = r;
  }
  return {
    storeCount: stores.size,
    inStockCount: inStock.size,
    unverifiedCount: unverified.size,
    cities: CITY_ORDER.filter((r) => cities.has(r)),
    cheapest,
  };
}

/** Distinct bottles across all city sections: one bottle sold in several cities counts once. */
export function distinctBottleCount(sections: { groups: { bottleKey: string }[] }[]): number {
  return new Set(sections.flatMap((s) => s.groups.map((g) => g.bottleKey))).size;
}

/** Store-scoped search (`?store=`) never counts as a filter: it has its own header. */
export function activeFilterCount(p: SearchFilters | SearchParams): number {
  return (
    (p.inStockOnly ? 1 : 0) +
    (p.sizeMl != null ? 1 : 0) +
    (p.minCents != null ? 1 : 0) +
    (p.maxCents != null ? 1 : 0)
  );
}

/** A result row's map link: the stores carrying that bottle, opened on the page's city. */
export function bottleMapHref(bottleKey: string, city: CityId): string {
  return `/map?${new URLSearchParams({ bottle: bottleKey, city })}`;
}

/** A result row's "watch" link: the watchlist form prefilled with the query, keeping the page's city. */
export function watchPrefillHref(q: string, city: CityId): string {
  return `/watchlist?${new URLSearchParams({ q, city })}`;
}

/** Query params the search page understands, in canonical order. */
const SEARCH_KEYS = ['q', 'store', 'city', 'size', 'min', 'max', 'inStock', 'show', 'others'] as const;
export type SearchKey = (typeof SEARCH_KEYS)[number];

/** Build a search URL from raw params, keeping only known non-empty keys. */
export function searchHref(
  raw: Record<string, RawValue>,
  overrides: Partial<Record<SearchKey, string | undefined>> = {},
): string {
  const usp = new URLSearchParams();
  for (const key of SEARCH_KEYS) {
    const v = key in overrides ? overrides[key] : first(raw[key]);
    if (v) usp.set(key, v);
  }
  const qs = usp.toString();
  return qs ? `/?${qs}` : '/';
}
