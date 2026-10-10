import type { BottleGroup, ListingRow } from '@/lib/search';
import type { SearchParams } from '@/lib/search';
import type { Region } from '@/lib/stores';

/** Bottle groups rendered per section before "더 보기". */
export const SECTION_PAGE_SIZE = 20;
/** Hard ceiling for ?main= / ?ca= so a hand-edited URL can't force a huge page. */
export const MAX_SECTION_SHOW = 500;
/** Store rows shown per bottle before the rest collapse. */
export const ROWS_PER_GROUP = 3;

const REGION_ORDER: Region[] = ['brooklyn', 'nj', 'ca'];

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
  inStockCount: number;
  regions: Region[];
  /** Cheapest in-stock row (rows are pre-sorted in-stock first, then tax-included price). */
  cheapest: ListingRow | null;
}

export function summarizeGroup(group: BottleGroup): GroupSummary {
  const stores = new Set<string>();
  const inStock = new Set<string>();
  const regions = new Set<Region>();
  for (const r of group.rows) {
    stores.add(r.storeId);
    regions.add(r.store.region);
    if (r.available) inStock.add(r.storeId);
  }
  let cheapest: ListingRow | null = null;
  for (const r of group.rows) {
    if (r.available && (cheapest === null || r.taxIncludedCents < cheapest.taxIncludedCents)) cheapest = r;
  }
  return {
    storeCount: stores.size,
    inStockCount: inStock.size,
    regions: REGION_ORDER.filter((r) => regions.has(r)),
    cheapest,
  };
}

/** Store-scoped search (`?store=`) never counts as a filter: it has its own header. */
export function activeFilterCount(p: SearchParams): number {
  return (p.region ? 1 : 0) + (p.inStockOnly ? 1 : 0) + (p.minCents != null ? 1 : 0) + (p.maxCents != null ? 1 : 0);
}

/** Query params the search page understands, in canonical order. */
const SEARCH_KEYS = ['q', 'store', 'region', 'min', 'max', 'inStock', 'main', 'ca'] as const;
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
