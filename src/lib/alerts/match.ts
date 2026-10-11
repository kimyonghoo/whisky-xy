import type { Listing, Watch } from '@/lib/db/schema';
import type { Store } from '@/lib/stores';
import type { ChangeEvent } from '@/lib/crawl/ingest';
import { getStore } from '@/lib/stores';
import { normalizeText } from '@/lib/whisky/parse';
import { formatUsd, withTaxCents } from '@/lib/money';
import { cityWatchRegion } from '@/lib/watch-form';
import { ko } from '@/lib/i18n/ko';

function hasPhrase(haystack: string, term: string): boolean {
  const t = normalizeText(term);
  if (!t) return false;
  return haystack.includes(` ${t} `);
}

export function watchMatches(w: Watch, l: Listing, store: Store): boolean {
  const hay = ` ${l.searchText} `;
  if (!w.includeTerms.every((t) => hasPhrase(hay, t))) return false;
  if (w.excludeTerms.some((t) => hasPhrase(hay, t))) return false;
  if (w.batch != null && w.batch !== l.batch) return false;
  if (w.sizeMl != null && w.sizeMl !== l.sizeMl) return false;
  return w.regions.includes(cityWatchRegion(store.city));
}

export interface AlertCandidate {
  watch: Watch;
  listing: Listing;
  event: ChangeEvent;
}

export function selectAlerts(
  watches: Watch[],
  events: ChangeEvent[],
  listingsById: Map<number, Listing>,
): AlertCandidate[] {
  const out: AlertCandidate[] = [];
  for (const event of events) {
    if (event.kind !== 'new' && event.kind !== 'restock' && event.kind !== 'price_drop') continue;
    const listing = listingsById.get(event.listingId);
    if (!listing) continue;
    const store = getStore(listing.storeId);
    if (!store) continue;
    for (const watch of watches) {
      if (!watchMatches(watch, listing, store)) continue;
      const max = watch.maxPriceCents;
      if (event.kind === 'price_drop') {
        if (max == null || event.prevPriceCents == null) continue;
        if (!(event.prevPriceCents > max && max >= event.priceCents)) continue;
      } else if (max != null && event.priceCents > max) {
        continue;
      }
      out.push({ watch, listing, event });
    }
  }
  return out;
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const KIND_LABEL: Record<string, string> = {
  restock: '🔔 재입고',
  new: '🆕 새로 입고',
  price_drop: '💸 목표가 이하',
};

export function formatAlert(c: AlertCandidate, store: Store, siteUrl: string): string {
  const { listing, event } = c;
  const price = event.priceCents;
  const lines = [
    `<b>${escapeHtml(KIND_LABEL[event.kind] ?? event.kind)}</b>`,
    escapeHtml(listing.title),
    `${formatUsd(price)} (세금 포함 ${formatUsd(withTaxCents(price, store.taxRate))})`,
    `${escapeHtml(store.name)} · ${escapeHtml(ko.city[store.city])}`,
  ];
  if (store.stockReliability === 'low') {
    lines.push('⚠️ 재고 표시 부정확 — 방문 전 전화 확인');
  }
  lines.push(`${siteUrl.replace(/\/+$/, '')}/card/${listing.id}`);
  return lines.join('\n');
}
