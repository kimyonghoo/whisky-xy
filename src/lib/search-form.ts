import { getStore } from '@/lib/stores';
import type { SearchFilters } from '@/lib/search';
import { WATCH_LIMITS } from '@/lib/watch-form';

/** Parse a dollar string like "64.5" or "1,299.97" into integer cents without float math. */
export function parseDollarsToCents(s: string | undefined): number | undefined {
  if (!s) return undefined;
  const cleaned = s.trim().replace(/[$,\s]/g, '');
  if (!/^\d+(\.\d{0,2})?$/.test(cleaned)) return undefined;
  const [whole, frac = ''] = cleaned.split('.');
  // Absurd values (e.g. ?max=99999999999) would overflow the int4 price column: drop them.
  if (whole.length > 9) return undefined;
  const cents = parseInt(whole, 10) * 100 + parseInt((frac + '00').slice(0, 2), 10);
  return cents <= WATCH_LIMITS.maxPriceCents ? cents : undefined;
}

/** Bottle sizes offered by the 용량 filter (ml). Anything else in `?size=` is ignored. */
export const SIZE_OPTIONS = [375, 700, 750, 1000, 1750] as const;

/** 750 → "750ml", 1750 → "1.75L". */
export function sizeLabel(ml: number): string {
  return ml >= 1000 ? `${ml / 1000}L` : `${ml}ml`;
}

type Raw = Record<string, string | string[] | undefined>;

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/** The city is not parsed here: the page resolves it (`resolveCity`) from the URL, a store and the cookie. */
export function parseSearchForm(raw: Raw): SearchFilters {
  const q = (first(raw.q) ?? '').trim().slice(0, 200);
  const params: SearchFilters = { q };
  const store = getStore(first(raw.store) ?? '');
  if (store?.publicAllowed) params.storeId = store.id;
  if (first(raw.inStock)) params.inStockOnly = true;
  const size = Number(first(raw.size));
  if ((SIZE_OPTIONS as readonly number[]).includes(size)) params.sizeMl = size;
  const min = parseDollarsToCents(first(raw.min));
  const max = parseDollarsToCents(first(raw.max));
  if (min !== undefined) params.minCents = min;
  if (max !== undefined) params.maxCents = max;
  return params;
}
