// Pure helpers for the Korea (Dailyshot) comparison UI. No DB, no network.
import { normalizeText } from '@/lib/whisky/parse';

/** Dailyshot prices older than this are flagged on the chip and on /compare. */
export const KR_STALE_AFTER_MS = 7 * 86_400_000;
/** An fx row (one per UTC day) older than this many days is flagged. */
export const FX_STALE_AFTER_DAYS = 3;

const krwFmt = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 0 });

/** 649000 → "649,000원" (ko-KR grouping, whole won). */
export function formatKrw(krw: number): string {
  return `${krwFmt.format(Math.round(krw))}원`;
}

/** USD cents → KRW rounded to the nearest 1,000원: a ballpark next to a dollar price, not a quote. */
export function approxKrw(usdCents: number, usdKrw: number): number {
  return Math.round((usdCents * usdKrw) / 100_000) * 1000;
}

// Generic category/spec words that say nothing about the brand.
const GENERIC = new Set([
  'bourbon', 'whiskey', 'whisky', 'kentucky', 'tennessee', 'straight', 'rye', 'single', 'malt', 'scotch', 'barrel',
  'barrels', 'proof', 'cask', 'strength', 'year', 'years', 'yr', 'old', 'ml', 'batch', 'edition', 'limited', 'release',
  'the', 'of', 'and', 'bottled', 'in', 'bond', 'small', 'american', 'blended', 'sour', 'mash', 'finish', 'finished',
  'pick', 'store', 'private', 'selection', 'ltr', 'liter', 'litre', 'btac', 'vs', 'set', 'bundle', 'pack', 'bottle',
  'bottles', 'gift', 'box',
]);

/**
 * A short brand query for the Dailyshot search box: "Stagg Kentucky Straight Bourbon … 750ml" → "stagg".
 * Drops generic words, numbers and single letters; keeps at most 3 words. Falls back to the
 * normalized title when nothing distinctive is left.
 */
export function brandQuery(title: string): string {
  const tokens = normalizeText(title).split(' ').filter(Boolean);
  const brand = [...new Set(tokens.filter((t) => t.length > 1 && !/\d/.test(t) && !GENERIC.has(t)))].slice(0, 3);
  return (brand.length > 0 ? brand : tokens.slice(0, 3)).join(' ');
}

type Raw = string | string[] | null | undefined | FormDataEntryValue;

/** Dailyshot product ids are 1–12 digits; anything else is rejected. */
export function parseProductId(v: Raw): string | null {
  if (Array.isArray(v)) return null;
  return typeof v === 'string' && /^\d{1,12}$/.test(v) ? v : null;
}

export function isKrStale(checkedAt: Date, now: Date): boolean {
  return now.getTime() - checkedAt.getTime() > KR_STALE_AFTER_MS;
}

/** `date` is the fx row's UTC "YYYY-MM-DD". Unparseable dates count as stale. */
export function isFxStale(date: string, now: Date): boolean {
  const t = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(t)) return true;
  const today = Date.parse(`${now.toISOString().slice(0, 10)}T00:00:00Z`);
  return (today - t) / 86_400_000 > FX_STALE_AFTER_DAYS;
}

/** Bar length on a shared zero-based scale, in %. Non-zero values stay visible (≥ 1.5%). */
export function barPct(value: number, max: number): number {
  if (!(max > 0) || !(value > 0)) return 0;
  return Math.max(1.5, Math.min(100, (value / max) * 100));
}

/** "2026-10-10" → "10/10" (fx rows are dated in UTC). */
export function fxDateLabel(date: string): string {
  const m = /^\d{4}-(\d{2})-(\d{2})$/.exec(date);
  return m ? `${Number(m[1])}/${Number(m[2])}` : date;
}

/** Longest search query carried back to `/` after linking. */
export const MAX_FROM_Q = 120;

/** The search to return to after linking: the validated `from` value, else the bottle's brand words. */
export function returnQuery(from: unknown, title: string): string {
  const q = typeof from === 'string' ? from.trim() : '';
  return q && q.length <= MAX_FROM_Q ? q : brandQuery(title);
}

/** Internal admin link to the linking screen, prefilled with the bottle's brand words. */
export function linkKrHref(bottleKey: string, displayTitle: string, from?: string): string {
  const usp = new URLSearchParams({ bottle: bottleKey, q: brandQuery(displayTitle) });
  if (from) usp.set('from', from);
  return `/link-kr?${usp.toString()}`;
}
