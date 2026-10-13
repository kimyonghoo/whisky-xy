import { describe, it, expect } from 'vitest';
import { STORES, getStore, isPublicStoreId } from '@/lib/stores';
import { getCity } from '@/lib/geo';
import { PAGE_STORE_CONFIGS } from '@/lib/pagecrawl/configs';

describe('stores', () => {
  it('has unique ids and complete data', () => {
    expect(new Set(STORES.map((s) => s.id)).size).toBe(STORES.length);
    for (const s of STORES) {
      expect(s.domain).not.toMatch(/^https?:/);
      expect(s.lat).not.toBe(0);
      expect(s.phone).not.toBe('');
    }
  });
  it('flags reliability and online-only', () => {
    expect(getStore('liquorcave')?.stockReliability).toBe('low');
    expect(getStore('coolvines')?.stockReliability).toBe('low');
    expect(getStore('bittersandbottles')?.onlineOnly).toBe(true);
  });
});

describe('isPublicStoreId (real implementation)', () => {
  it('is true for every registered public store and false for unknown or empty ids', () => {
    for (const s of STORES) expect(isPublicStoreId(s.id)).toBe(s.publicAllowed);
    expect(isPublicStoreId('dewinespot')).toBe(true);
    expect(isPublicStoreId('no-such-store')).toBe(false);
    expect(isPublicStoreId('')).toBe(false);
    expect(isPublicStoreId('constructor')).toBe(false);
  });
  it('is false for a store with publicAllowed false', () => {
    const real = getStore('dewinespot')!;
    const idx = STORES.indexOf(real);
    STORES[idx] = { ...real, publicAllowed: false };
    try {
      expect(isPublicStoreId('dewinespot')).toBe(false);
    } finally {
      STORES[idx] = real;
    }
  });
});

describe('Japanese stores (phase 1: private)', () => {
  it('every JPY store is tax-included, taxRate 0, private, and its city is still "soon"', () => {
    const jp = STORES.filter((s) => s.currency === 'JPY');
    expect(jp.map((s) => s.id).sort()).toEqual(['nemoto', 'shinanoya']);
    for (const s of jp) {
      expect(s.pricesIncludeTax, s.id).toBe(true);
      expect(s.taxRate, s.id).toBe(0);
      expect(s.publicAllowed, s.id).toBe(false);
      expect(getCity(s.city)?.status, s.id).toBe('soon');
    }
  });

  it('nemoto is the Shopify whisky collection in Sapporo; shinanoya is a page crawl in Tokyo', () => {
    expect(getStore('nemoto')).toMatchObject({
      city: 'sapporo', adapter: 'shopify', catalogPath: '/collections/whisky/products.json',
      stockReliability: 'high', onlineOnly: false, whiskyOnlyCatalog: true, domain: 'nemoto-shouten.com',
    });
    expect(getStore('shinanoya')).toMatchObject({
      city: 'tokyo', adapter: 'page', stockReliability: 'low', onlineOnly: false, whiskyOnlyCatalog: true,
      domain: 'shinanoya-tokyo.jp',
    });
  });

  it('every page store has a page-crawl config, and only page stores do', () => {
    for (const s of STORES) expect(PAGE_STORE_CONFIGS[s.id] !== undefined, s.id).toBe(s.adapter === 'page');
  });
});

describe('store catalog paths', () => {
  it('every configured catalogPath is a products.json endpoint; Wine Chateau crawls its whisky collection', async () => {
    const { catalogPathOf } = await import('@/lib/shopify/client');
    for (const s of STORES) expect(catalogPathOf(s)).toMatch(/products\.json$/);
    expect(getStore('winechateau')?.catalogPath).toBe('/collections/whiskeys/products.json');
    expect(catalogPathOf(getStore('dewinespot')!)).toBe('/products.json');
  });
});
