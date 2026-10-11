import { describe, it, expect } from 'vitest';
import {
  SECTION_PAGE_SIZE,
  MAX_SECTION_SHOW,
  parseShowCount,
  capGroups,
  nextShowCount,
  summarizeGroup,
  activeFilterCount,
  distinctBottleCount,
  searchHref,
} from '@/lib/search-view';
import { identifyingVariant, type BottleGroup, type ListingRow } from '@/lib/search';
import { getStore } from '@/lib/stores';

function row(storeId: string, taxIncludedCents: number, available: boolean | 'unverified', id: number): ListingRow {
  const store = getStore(storeId)!;
  const stock = available === 'unverified' ? 'unverified' : available ? 'instock' : 'soldout';
  return { id, storeId, store, taxIncludedCents, available: available !== false, stock, priceCents: taxIncludedCents } as unknown as ListingRow;
}

function group(rows: ListingRow[]): BottleGroup {
  return {
    bottleKey: 'k', displayTitle: 'T', sizeMl: 750, proof: null, batch: null, imageUrl: null, rows,
    bestAvailableCents: rows.filter((r) => r.stock === 'instock').map((r) => r.taxIncludedCents).sort((a, b) => a - b)[0] ?? null,
  };
}

describe('parseShowCount', () => {
  it('defaults to one page for missing or junk input', () => {
    expect(parseShowCount(undefined)).toBe(SECTION_PAGE_SIZE);
    expect(parseShowCount('')).toBe(SECTION_PAGE_SIZE);
    expect(parseShowCount('abc')).toBe(SECTION_PAGE_SIZE);
    expect(parseShowCount('-40')).toBe(SECTION_PAGE_SIZE);
    expect(parseShowCount('1e3')).toBe(SECTION_PAGE_SIZE);
    expect(parseShowCount('0')).toBe(SECTION_PAGE_SIZE);
  });
  it('accepts positive integers and takes the first array value', () => {
    expect(parseShowCount('40')).toBe(40);
    expect(parseShowCount(['60', '80'])).toBe(60);
  });
  it('never goes below one page or above the hard cap', () => {
    expect(parseShowCount('5')).toBe(SECTION_PAGE_SIZE);
    expect(parseShowCount('999999')).toBe(MAX_SECTION_SHOW);
    expect(parseShowCount('99999999999999999999')).toBe(MAX_SECTION_SHOW);
  });
});

describe('capGroups', () => {
  const items = Array.from({ length: 45 }, (_, i) => i);
  it('caps rendering and reports how many are hidden', () => {
    expect(capGroups(items, 20)).toEqual({ visible: items.slice(0, 20), hiddenCount: 25 });
  });
  it('shows everything when under the cap', () => {
    expect(capGroups(items.slice(0, 3), 20)).toEqual({ visible: [0, 1, 2], hiddenCount: 0 });
  });
  it('nextShowCount advances one page without overshooting', () => {
    expect(nextShowCount(20, 45)).toBe(40);
    expect(nextShowCount(40, 45)).toBe(45);
    expect(nextShowCount(480, 1000)).toBe(MAX_SECTION_SHOW);
  });
});

describe('summarizeGroup', () => {
  it('counts stores and in-stock stores, lists regions in fixed order, picks cheapest in stock', () => {
    const g = group([row('liquorcave', 9000, true, 1), row('dewinespot', 9500, true, 2), row('grainvine', 8000, false, 3)]);
    const s = summarizeGroup(g);
    expect(s.storeCount).toBe(3);
    expect(s.inStockCount).toBe(2);
    expect(s.cities).toEqual(['brooklyn', 'nj']);
    expect(s.cheapest?.id).toBe(1);
  });
  it('has no cheapest when everything is sold out', () => {
    const s = summarizeGroup(group([row('dewinespot', 9500, false, 2)]));
    expect(s.inStockCount).toBe(0);
    expect(s.cheapest).toBeNull();
  });
  it('never picks an unverified (> 48 h) row as cheapest and counts it separately', () => {
    const s = summarizeGroup(group([row('dewinespot', 9500, true, 1), row('liquorcave', 5000, 'unverified', 2), row('grainvine', 4000, false, 3)]));
    expect(s.cheapest?.id).toBe(1);
    expect(s.inStockCount).toBe(1);
    expect(s.unverifiedCount).toBe(1);
  });
  it('has no cheapest when the only available rows are unverified', () => {
    const s = summarizeGroup(group([row('liquorcave', 5000, 'unverified', 2), row('dewinespot', 9000, false, 3)]));
    expect(s.cheapest).toBeNull();
    expect(s.inStockCount).toBe(0);
    expect(s.unverifiedCount).toBe(1);
  });
  it('does not count a store as unverified when it also has a confirmed row', () => {
    const s = summarizeGroup(group([row('dewinespot', 9500, true, 1), row('dewinespot', 5000, 'unverified', 2)]));
    expect(s.inStockCount).toBe(1);
    expect(s.unverifiedCount).toBe(0);
  });
  it('counts a store once even with several listings', () => {
    const s = summarizeGroup(group([row('dewinespot', 9500, true, 1), row('dewinespot', 9900, true, 2)]));
    expect(s.storeCount).toBe(1);
    expect(s.inStockCount).toBe(1);
  });
});

describe('identifyingVariant', () => {
  it('keeps variants that identify the bottle and drops pure sizes', () => {
    expect(identifyingVariant('2024')).toBe('2024');
    expect(identifyingVariant('2024 / 750ml')).toBe('2024 / 750ml');
    expect(identifyingVariant('750ml')).toBeNull();
    expect(identifyingVariant('1.75 L')).toBeNull();
    expect(identifyingVariant(null)).toBeNull();
  });
});

describe('activeFilterCount', () => {
  it('counts each applied filter', () => {
    expect(activeFilterCount({ q: 'x' })).toBe(0);
    expect(activeFilterCount({ q: 'x', city: 'nj', inStockOnly: true, minCents: 0, maxCents: 100 })).toBe(3);
  });
});

describe('distinctBottleCount', () => {
  it('counts a bottle sold in several cities once', () => {
    const g = (k: string) => ({ bottleKey: k });
    expect(distinctBottleCount([{ groups: [g('a'), g('b')] }, { groups: [g('a')] }, { groups: [g('a')] }])).toBe(2);
    expect(distinctBottleCount([])).toBe(0);
  });
});

describe('searchHref', () => {
  it('keeps known params, drops unknown/empty ones, applies overrides', () => {
    const href = searchHref({ q: 'jack & coke', city: 'nj', min: '', evil: 'x', show: '20' }, { show: '40' });
    expect(href).toBe('/?q=jack+%26+coke&city=nj&show=40');
  });
  it('drops the legacy region, main and ca keys', () => {
    expect(searchHref({ q: 'x', region: 'ca', main: '40', ca: '40' })).toBe('/?q=x');
    expect(searchHref({ q: 'x', others: '40' })).toBe('/?q=x&others=40');
  });
  it('can remove a param with undefined', () => {
    expect(searchHref({ q: 'a', inStock: '1' }, { inStock: undefined })).toBe('/?q=a');
  });
  it('keeps store scope in canonical position', () => {
    expect(searchHref({ store: 'flask' })).toBe('/?store=flask');
    expect(searchHref({ show: '40', store: 'flask', q: 'stagg' }, { show: undefined })).toBe('/?q=stagg&store=flask');
    expect(searchHref({ q: 'a', store: 'flask' }, { store: undefined })).toBe('/?q=a');
  });
  it('returns / with no params', () => {
    expect(searchHref({})).toBe('/');
  });
});
