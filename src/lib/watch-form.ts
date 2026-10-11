// Pure watch-form logic (no DB imports) so the client form can share it with the server action.
import { normalizeText } from '@/lib/whisky/parse';
import { parsePriceToCents } from '@/lib/money';
import type { CityId } from '@/lib/geo';
import { ko } from '@/lib/i18n/ko';

/**
 * Bottle lines whose name is contained in sibling products' names.
 * A watch on exactly "stagg" should exclude Stagg Jr. and George T. Stagg.
 */
export const LINE_SIBLINGS: Record<string, string[]> = { stagg: ['jr', 'junior', 'george'] };

/** Exclude suggestions for the include terms. Only an exact (normalized) line key triggers. */
export function suggestExcludes(includeTerms: string[]): string[] {
  const out: string[] = [];
  for (const t of includeTerms) {
    const key = normalizeText(t);
    if (!Object.hasOwn(LINE_SIBLINGS, key)) continue;
    for (const s of LINE_SIBLINGS[key]) if (!out.includes(s)) out.push(s);
  }
  return out;
}

export interface WatchInput {
  label: string;
  includeTerms: string[];
  excludeTerms: string[];
  batch: string | null;
  sizeMl: number | null;
  maxPriceCents: number | null;
  regions: WatchRegion[];
}

export type WatchField = 'label' | 'include' | 'exclude' | 'batch' | 'sizeMl' | 'maxPrice' | 'regions';
export interface WatchFormError {
  error: string;
  field?: WatchField;
}

export const WATCH_LIMITS = {
  label: 80,
  term: 60,
  terms: 10,
  batch: 12,
  maxSizeMl: 5000,
  maxPriceCents: 10_000_000, // $100,000
} as const;

/**
 * Stored watch region values. The DB still holds the legacy 'ca' for Los Angeles until the
 * watches migration (Task 2); these helpers map at the boundary.
 */
export type WatchRegion = 'brooklyn' | 'nj' | 'ca';
export const ALL_REGIONS: readonly WatchRegion[] = ['brooklyn', 'nj', 'ca'];
export const watchRegionCity = (r: WatchRegion): CityId => (r === 'ca' ? 'la' : r);
export const cityWatchRegion = (c: CityId): string => (c === 'la' ? 'ca' : c);
export const DEFAULT_REGIONS: WatchRegion[] = ['brooklyn', 'nj'];

function str(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === 'string' ? v.trim() : '';
}

/** Comma-separated → normalized terms; blanks and duplicates dropped. */
export function splitTerms(raw: string): string[] {
  const out: string[] = [];
  for (const part of raw.split(/[,，、]/)) {
    const t = normalizeText(part);
    if (t && !out.includes(t)) out.push(t);
  }
  return out;
}

/** Same shape as listing batches from the crawler: uppercase, no "batch"/"#" prefix, no leading zeros. */
function normalizeBatch(raw: string): string {
  return raw
    .replace(/^batch\s*/i, '')
    .replace(/^#\s*/, '')
    .toUpperCase()
    .replace(/^0+(?=\d)/, '');
}

export function parseWatchForm(fd: FormData): WatchInput | WatchFormError {
  const e = ko.watch.errors;
  const includeRaw = str(fd, 'include');
  const includeTerms = splitTerms(includeRaw);
  if (includeTerms.length === 0) return { error: e.includeRequired, field: 'include' };
  const excludeTerms = splitTerms(str(fd, 'exclude'));
  if (includeTerms.length > WATCH_LIMITS.terms) return { error: e.tooManyTerms(WATCH_LIMITS.terms), field: 'include' };
  if (excludeTerms.length > WATCH_LIMITS.terms) return { error: e.tooManyTerms(WATCH_LIMITS.terms), field: 'exclude' };
  if (includeTerms.some((t) => t.length > WATCH_LIMITS.term)) return { error: e.termTooLong(WATCH_LIMITS.term), field: 'include' };
  if (excludeTerms.some((t) => t.length > WATCH_LIMITS.term)) return { error: e.termTooLong(WATCH_LIMITS.term), field: 'exclude' };
  if (excludeTerms.some((t) => includeTerms.includes(t))) return { error: e.overlap, field: 'exclude' };

  const label = str(fd, 'label') || includeRaw;
  if (label.length > WATCH_LIMITS.label) return { error: e.labelTooLong(WATCH_LIMITS.label), field: 'label' };

  const batchRaw = str(fd, 'batch');
  let batch: string | null = null;
  if (batchRaw) {
    batch = normalizeBatch(batchRaw);
    if (!/^[0-9A-Z]+$/.test(batch) || batch.length > WATCH_LIMITS.batch) return { error: e.batch, field: 'batch' };
  }

  const sizeRaw = str(fd, 'sizeMl');
  let sizeMl: number | null = null;
  if (sizeRaw) {
    if (!/^\d{1,5}$/.test(sizeRaw)) return { error: e.size, field: 'sizeMl' };
    sizeMl = parseInt(sizeRaw, 10);
    if (sizeMl < 1 || sizeMl > WATCH_LIMITS.maxSizeMl) return { error: e.size, field: 'sizeMl' };
  }

  const priceRaw = str(fd, 'maxPrice');
  let maxPriceCents: number | null = null;
  if (priceRaw) {
    try {
      maxPriceCents = parsePriceToCents(priceRaw);
    } catch {
      return { error: e.price, field: 'maxPrice' };
    }
    if (maxPriceCents <= 0 || maxPriceCents > WATCH_LIMITS.maxPriceCents) return { error: e.price, field: 'maxPrice' };
  }

  const picked = fd.getAll('regions').map((v) => (typeof v === 'string' ? v : ''));
  if (picked.some((r) => !(ALL_REGIONS as readonly string[]).includes(r))) return { error: e.regionInvalid, field: 'regions' };
  let regions: WatchRegion[];
  if (picked.length > 0) {
    // Canonical order, no duplicates.
    regions = ALL_REGIONS.filter((r) => picked.includes(r));
  } else if (fd.has('regionsSubmitted')) {
    // The form rendered checkboxes and the user unchecked them all.
    return { error: e.regionRequired, field: 'regions' };
  } else {
    regions = [...DEFAULT_REGIONS];
  }

  return { label, includeTerms, excludeTerms, batch, sizeMl, maxPriceCents, regions };
}

/** Delete id from a form: a positive 32-bit integer in plain decimal, else null. */
export function parseWatchId(raw: FormDataEntryValue | string | null | undefined): number | null {
  if (typeof raw !== 'string' || !/^[1-9]\d{0,9}$/.test(raw)) return null;
  const n = Number(raw);
  return n <= 2_147_483_647 ? n : null;
}
