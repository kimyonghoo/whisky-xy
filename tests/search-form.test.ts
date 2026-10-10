import { describe, it, expect } from 'vitest';
import { parseDollarsToCents, parseSearchForm } from '@/lib/search-form';

describe('parseDollarsToCents', () => {
  it('parses exactly', () => {
    expect(parseDollarsToCents('0.29')).toBe(29);
    expect(parseDollarsToCents('64.5')).toBe(6450);
    expect(parseDollarsToCents('1,299.97')).toBe(129997);
    expect(parseDollarsToCents('$50')).toBe(5000);
  });
  it('rejects junk', () => {
    expect(parseDollarsToCents('')).toBeUndefined();
    expect(parseDollarsToCents('abc')).toBeUndefined();
    expect(parseDollarsToCents('-5')).toBeUndefined();
    expect(parseDollarsToCents('1.234')).toBeUndefined();
    // M2: values that would overflow int4 (or exceed $100,000) are dropped, not a 500
    expect(parseDollarsToCents('99999999999')).toBeUndefined();
    expect(parseDollarsToCents('100000.01')).toBeUndefined();
    expect(parseDollarsToCents('100000')).toBe(10_000_000);
  });
});

describe('parseSearchForm', () => {
  it('maps fields', () => {
    expect(parseSearchForm({ q: ' stagg ', region: 'ca', inStock: 'on', min: '10', max: '99.99' })).toEqual({
      q: 'stagg', region: 'ca', inStockOnly: true, minCents: 1000, maxCents: 9999,
    });
  });
  it('accepts only known store ids', () => {
    expect(parseSearchForm({ store: 'flask' })).toEqual({ q: '', storeId: 'flask' });
    expect(parseSearchForm({ q: 'stagg', store: ['dewinespot', 'flask'] })).toEqual({ q: 'stagg', storeId: 'dewinespot' });
    expect(parseSearchForm({ store: 'nope' })).toEqual({ q: '' });
    expect(parseSearchForm({ store: '' })).toEqual({ q: '' });
    expect(parseSearchForm({ store: "flask' OR 1=1" })).toEqual({ q: '' });
  });
  it('ignores invalid region and handles arrays', () => {
    expect(parseSearchForm({ q: ['a', 'b'], region: 'zz' })).toEqual({ q: 'a' });
  });
});
