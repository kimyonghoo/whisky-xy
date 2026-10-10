import type { Region } from '@/lib/stores';
import type { SearchParams } from '@/lib/search';

/** Parse a dollar string like "64.5" or "1,299.97" into integer cents without float math. */
export function parseDollarsToCents(s: string | undefined): number | undefined {
  if (!s) return undefined;
  const cleaned = s.trim().replace(/[$,\s]/g, '');
  if (!/^\d+(\.\d{0,2})?$/.test(cleaned)) return undefined;
  const [whole, frac = ''] = cleaned.split('.');
  return parseInt(whole, 10) * 100 + parseInt((frac + '00').slice(0, 2), 10);
}

const REGIONS: Region[] = ['brooklyn', 'nj', 'ca'];

type Raw = Record<string, string | string[] | undefined>;

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export function parseSearchForm(raw: Raw): SearchParams {
  const q = (first(raw.q) ?? '').trim().slice(0, 200);
  const region = first(raw.region);
  const params: SearchParams = { q };
  if (region && (REGIONS as string[]).includes(region)) params.region = region as Region;
  if (first(raw.inStock)) params.inStockOnly = true;
  const min = parseDollarsToCents(first(raw.min));
  const max = parseDollarsToCents(first(raw.max));
  if (min !== undefined) params.minCents = min;
  if (max !== undefined) params.maxCents = max;
  return params;
}
