import { describe, it, expect } from 'vitest';
import { cardMeta, mapsUrl, safeHttpsUrl, telHref, parseCardId } from '@/lib/card';
import { getStore } from '@/lib/stores';
import type { Listing } from '@/lib/db/schema';
import { displayBottleName } from '@/lib/ko-name';
import { ko } from '@/lib/i18n/ko';
import { en } from '@/lib/i18n/en';

const dewinespot = getStore('dewinespot')!;

function listing(over: Partial<Listing> = {}): Listing {
  const d = new Date('2026-10-10T15:00:00Z');
  return {
    id: 1, storeId: 'dewinespot', productId: 'p', variantId: 'v', handle: 'h', title: "Blanton's Original", variantTitle: null,
    vendor: 'x', productType: 'Whiskey', imageUrl: 'https://cdn.shopify.com/a.jpg', url: 'https://dewinespot.co/products/h',
    priceCents: 17500, currency: 'USD', available: true, sizeMl: 750, proof: 93, batch: null, bottleKey: 'k', searchText: 's',
    firstSeenAt: d, lastSeenAt: d, checkedAt: d, updatedAt: d, ...over,
  };
}

describe('cardMeta', () => {
  it('builds description with NY date, price, stock, store and address', () => {
    const m = cardMeta(listing(), dewinespot);
    expect(m.description).toMatch(/^10\/10 기준 \$175\.00 · 재고 있음 · De Wine Spot/);
    expect(m.description).toContain('428 Lorimer St');
    expect(m.image).toBe('https://cdn.shopify.com/a.jpg');
  });
  it('uses America/New_York date, not UTC', () => {
    const m = cardMeta(listing({ checkedAt: new Date('2026-10-11T02:00:00Z') }), dewinespot);
    expect(m.description).toMatch(/^10\/10 기준/);
  });
  it('shows sold out', () => {
    expect(cardMeta(listing({ available: false }), dewinespot).description).toContain('품절');
  });
  it('quotes the Korean name with the English in parentheses on /ko; English alone on /en', () => {
    const l = listing();
    const now = new Date('2026-10-10T16:00:00Z');
    expect(cardMeta(l, dewinespot, now, ko, displayBottleName({ english: l.title, locale: 'ko' })).title).toBe("블랑톤 오리지널 (Blanton's Original)");
    expect(cardMeta(l, dewinespot, now, en, displayBottleName({ english: l.title, locale: 'en' })).title).toBe("Blanton's Original");
  });
  it('drops non-https image', () => {
    expect(cardMeta(listing({ imageUrl: 'javascript:alert(1)' }), dewinespot).image).toBeNull();
    expect(cardMeta(listing({ imageUrl: 'http://x/a.jpg' }), dewinespot).image).toBeNull();
  });
});

describe('helpers', () => {
  it('mapsUrl', () => {
    expect(mapsUrl('428 Lorimer St, Brooklyn, NY')).toBe('https://www.google.com/maps/dir/?api=1&destination=428%20Lorimer%20St%2C%20Brooklyn%2C%20NY');
  });
  it('safeHttpsUrl', () => {
    expect(safeHttpsUrl('https://a.com/x')).toBe('https://a.com/x');
    expect(safeHttpsUrl('http://a.com')).toBeNull();
    expect(safeHttpsUrl('javascript:alert(1)')).toBeNull();
    expect(safeHttpsUrl('nope')).toBeNull();
    expect(safeHttpsUrl(null)).toBeNull();
  });
  it('telHref strips junk', () => {
    expect(telHref('718-388-9463')).toBe('tel:7183889463');
    expect(telHref('+1 (718) 388-9463"><x')).toBe('tel:+17183889463');
  });
  it('parseCardId', () => {
    expect(parseCardId('12')).toBe(12);
    for (const bad of ['abc', '-1', '0', '1.5', '', '1e3', '99999999999999999999']) expect(parseCardId(bad)).toBeNull();
  });
});
