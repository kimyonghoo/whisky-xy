import { ko } from '@/lib/i18n/ko';
import type { Dict } from '@/lib/i18n';

export const STALE_AFTER_MS = 86_400_000;

export function freshness(checkedAt: Date, now: Date, staleAfterMs = STALE_AFTER_MS, d: Dict = ko): { stale: boolean; label: string } {
  const diff = Math.max(0, now.getTime() - checkedAt.getTime());
  const stale = diff > staleAfterMs;
  const minutes = Math.floor(diff / 60_000);
  let label: string;
  if (minutes < 1) label = d.freshness.justNow;
  else if (minutes < 60) label = d.freshness.minutesAgo(minutes);
  else if (minutes < 1440) label = d.freshness.hoursAgo(Math.floor(minutes / 60));
  else label = d.freshness.daysAgo(Math.floor(minutes / 1440));
  return { stale, label };
}

/**
 * An "available" row not checked for this long is no longer trusted as in stock: two missed
 * 6-hourly crawls plus margin (a failing store, or a product deleted instead of marked sold out
 * where the missing-sweep can't run). Such rows show "재고 확인 필요" and are never ranked,
 * never the cheapest price, and never the base of a Korea comparison.
 */
export const UNVERIFIED_AFTER_MS = 48 * 3_600_000;

export type StockState = 'instock' | 'unverified' | 'soldout';

export function stockState(row: { available: boolean; checkedAt: Date }, now: Date): StockState {
  if (!row.available) return 'soldout';
  return now.getTime() - row.checkedAt.getTime() > UNVERIFIED_AFTER_MS ? 'unverified' : 'instock';
}

/** Oldest checkedAt that still counts as confirmed in stock (for SQL filters). */
export function confirmedSince(now: Date): Date {
  return new Date(now.getTime() - UNVERIFIED_AFTER_MS);
}
