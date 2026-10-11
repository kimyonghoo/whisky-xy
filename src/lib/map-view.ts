import type { BottleOffers } from '@/lib/listings';
import { mapsUrl, telHref } from '@/lib/card';
import { withTaxCents } from '@/lib/money';
import { searchHref } from '@/lib/search-view';
import type { Store } from '@/lib/stores';
import type { CityId } from '@/lib/geo';
import { ko } from '@/lib/i18n/ko';

// Temporary until the per-city map lands (Tasks 3-5 delete this).
const MAIN_CITIES: CityId[] = ['brooklyn', 'nj'];

/** Plain, serialisable store data for the client map + list. */
export interface MapStore {
  id: string;
  /** 1-based number shared by the marker and the list row. */
  n: number;
  name: string;
  city: CityId;
  cityLabel: string;
  address: string;
  lat: number;
  lng: number;
  phone: string;
  tel: string;
  directionsHref: string;
  /** `/?store=<id>`: that store's whiskies on the search page. */
  storeHref: string;
  onlineOnly: boolean;
  lowReliability: boolean;
  /** In-stock whiskies at the store (all bottles). */
  inStockCount: number;
  /** Only in bottle mode. */
  offer: MapOffer | null;
  /** Bottle mode and the store has no in-stock listing of the bottle. */
  dimmed: boolean;
}

export interface MapOffer {
  /** 'instock' | 'unverified' (only available rows older than 48 h) | 'soldout' (listed, none available) | 'none' (not listed). */
  status: 'instock' | 'unverified' | 'soldout' | 'none';
  inStock: number;
  priceCents: number | null;
  taxIncludedCents: number | null;
}

export type MapViewId = 'east' | 'la';

/** NYC centre from the brief; used when there are no east-coast stores to fit. */
export const NYC_CENTER: [number, number] = [40.7, -73.95];
export const NYC_ZOOM = 11;
/** "LA 보기" target from the brief. */
export const LA_CENTER: [number, number] = [34.14, -118.4];
export const LA_ZOOM = 11;
/** Zoom when a store is picked from the list. */
export const STORE_ZOOM = 14;

const MAX_BOTTLE_KEY = 300;

/** `?bottle=` value, or null when missing / empty / absurdly long. */
export function parseBottleParam(raw: string | string[] | undefined): string | null {
  const v = (Array.isArray(raw) ? raw[0] : raw)?.trim();
  if (!v || v.length > MAX_BOTTLE_KEY) return null;
  return v;
}

function offerFor(store: Store, bottle: BottleOffers): MapOffer {
  const o = bottle.offers.get(store.id);
  if (!o) return { status: 'none', inStock: 0, priceCents: null, taxIncludedCents: null };
  if (o.inStock === 0 || o.minAvailablePriceCents === null) return { status: o.unverified > 0 ? 'unverified' : 'soldout', inStock: 0, priceCents: null, taxIncludedCents: null };
  return {
    status: 'instock',
    inStock: o.inStock,
    priceCents: o.minAvailablePriceCents,
    taxIncludedCents: withTaxCents(o.minAvailablePriceCents, store.taxRate),
  };
}

const STATUS_ORDER: Record<MapOffer['status'], number> = { instock: 0, unverified: 1, soldout: 2, none: 3 };

/**
 * Stores for the map, in list order, numbered 1..n.
 * Without a bottle: config order (Brooklyn, NJ, CA). With a bottle: stores that have it in stock
 * first by tax-included price, then sold-out listings, then stores that don't list it.
 */
export function buildMapStores(stores: Store[], availability: Map<string, number>, bottle: BottleOffers | null): MapStore[] {
  const items = stores
    .filter((s) => s.publicAllowed)
    .map((s, i) => ({ s, i, offer: bottle ? offerFor(s, bottle) : null }));
  if (bottle) {
    items.sort((a, b) => {
      const sa = STATUS_ORDER[a.offer!.status];
      const sb = STATUS_ORDER[b.offer!.status];
      if (sa !== sb) return sa - sb;
      const pa = a.offer!.taxIncludedCents;
      const pb = b.offer!.taxIncludedCents;
      if (pa !== null && pb !== null && pa !== pb) return pa - pb;
      return a.i - b.i;
    });
  }
  return items.map(({ s, offer }, idx) => ({
    id: s.id,
    n: idx + 1,
    name: s.name,
    city: s.city,
    cityLabel: ko.city[s.city],
    address: s.address,
    lat: s.lat,
    lng: s.lng,
    phone: s.phone,
    tel: telHref(s.phone),
    directionsHref: mapsUrl(s.address),
    storeHref: searchHref({ store: s.id }),
    onlineOnly: s.onlineOnly,
    lowReliability: s.stockReliability === 'low',
    inStockCount: availability.get(s.id) ?? 0,
    offer,
    dimmed: offer !== null && offer.status !== 'instock',
  }));
}

/** Which region the map opens on: the east coast, unless only CA stores carry the bottle. */
export function initialView(stores: MapStore[]): MapViewId {
  const carrying = stores.filter((s) => !s.dimmed);
  if (carrying.length > 0 && carrying.every((s) => !MAIN_CITIES.includes(s.city))) return 'la';
  return 'east';
}

/** [[south, west], [north, east]] around the Brooklyn + NJ stores, or null if there are none. */
export function eastBounds(stores: Pick<MapStore, 'lat' | 'lng' | 'city'>[]): [[number, number], [number, number]] | null {
  const east = stores.filter((s) => MAIN_CITIES.includes(s.city));
  if (east.length === 0) return null;
  const lats = east.map((s) => s.lat);
  const lngs = east.map((s) => s.lng);
  return [
    [Math.min(...lats), Math.min(...lngs)],
    [Math.max(...lats), Math.max(...lngs)],
  ];
}

export const OSM_TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
export const OSM_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/**
 * Tile source. A commercial provider can be configured with NEXT_PUBLIC_MAP_TILE_URL
 * (+ NEXT_PUBLIC_MAP_TILE_ATTRIBUTION, plain text). OSM's public tiles are the fallback;
 * their usage policy does not allow heavy commercial traffic.
 * Leaflet renders attribution as HTML, so configured text is escaped.
 */
export function mapTileConfig(url: string | undefined, attribution: string | undefined): { url: string; attribution: string } {
  const u = url?.trim();
  const valid = !!u && /^https:\/\//.test(u) && u.includes('{z}') && u.includes('{x}') && u.includes('{y}');
  if (!valid) return { url: OSM_TILE_URL, attribution: OSM_ATTRIBUTION };
  const a = attribution?.trim();
  return { url: u, attribution: a ? escapeHtml(a) : OSM_ATTRIBUTION };
}
