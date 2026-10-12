import { describe, it, expect } from 'vitest';
import { STORES, getStore, isPublicStoreId } from '@/lib/stores';

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

describe('store catalog paths', () => {
  it('every configured catalogPath is a products.json endpoint; Wine Chateau crawls its whisky collection', async () => {
    const { catalogPathOf } = await import('@/lib/shopify/client');
    for (const s of STORES) expect(catalogPathOf(s)).toMatch(/products\.json$/);
    expect(getStore('winechateau')?.catalogPath).toBe('/collections/whiskeys/products.json');
    expect(catalogPathOf(getStore('dewinespot')!)).toBe('/products.json');
  });
});
