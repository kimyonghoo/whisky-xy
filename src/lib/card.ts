import type { Listing } from '@/lib/db/schema';
import type { Store } from '@/lib/stores';
import { formatUsd } from '@/lib/money';
import { ko } from '@/lib/i18n/ko';

export function mapsUrl(address: string): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`;
}

/** Returns the URL string only if it parses and is https:, else null. */
export function safeHttpsUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
}

export function telHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, '')}`;
}

/** Positive safe integer from a route param, else null. */
export function parseCardId(raw: string): number | null {
  if (!/^\d+$/.test(raw)) return null;
  const n = Number(raw);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

/** M/D in America/New_York. */
export function nyDate(d: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', month: 'numeric', day: 'numeric' }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('month')}/${get('day')}`;
}

export function cardMeta(listing: Listing, store: Store): { title: string; description: string; image: string | null } {
  const stock = listing.available ? ko.stock.inStock : ko.stock.soldOut;
  return {
    title: listing.title,
    description: `${ko.card.asOf(nyDate(listing.checkedAt), formatUsd(listing.priceCents))} · ${stock} · ${store.name} · ${store.address}`,
    image: safeHttpsUrl(listing.imageUrl),
  };
}
