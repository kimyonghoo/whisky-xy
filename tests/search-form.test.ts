import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { parseDollarsToCents, parseSearchForm, searchFormValues, sizeLabel } from '@/lib/search-form';
import { SearchForm } from '@/components/search/SearchForm';

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
    expect(parseSearchForm({ q: ' stagg ', inStock: 'on', min: '10', max: '99.99' })).toEqual({
      q: 'stagg', inStockOnly: true, minCents: 1000, maxCents: 9999,
    });
  });
  it('accepts only known store ids', () => {
    expect(parseSearchForm({ store: 'flask' })).toEqual({ q: '', storeId: 'flask' });
    expect(parseSearchForm({ q: 'stagg', store: ['dewinespot', 'flask'] })).toEqual({ q: 'stagg', storeId: 'dewinespot' });
    expect(parseSearchForm({ store: 'nope' })).toEqual({ q: '' });
    expect(parseSearchForm({ store: '' })).toEqual({ q: '' });
    expect(parseSearchForm({ store: "flask' OR 1=1" })).toEqual({ q: '' });
  });
  it('accepts only offered sizes', () => {
    expect(parseSearchForm({ q: 'a', size: '750' })).toEqual({ q: 'a', sizeMl: 750 });
    expect(parseSearchForm({ q: 'a', size: '1750' })).toEqual({ q: 'a', sizeMl: 1750 });
    expect(parseSearchForm({ q: 'a', size: '751' })).toEqual({ q: 'a' });
    expect(parseSearchForm({ q: 'a', size: '' })).toEqual({ q: 'a' });
    expect(parseSearchForm({ q: 'a', size: '750abc' })).toEqual({ q: 'a' });
  });
  it('labels sizes', () => {
    expect(sizeLabel(750)).toBe('750ml');
    expect(sizeLabel(1000)).toBe('1L');
    expect(sizeLabel(1750)).toBe('1.75L');
  });
  it('handles arrays and no longer reads region or city', () => {
    expect(parseSearchForm({ q: ['a', 'b'], region: 'la', city: 'nj' })).toEqual({ q: 'a' });
  });
});

describe('searchFormValues', () => {
  it('carries the given (resolved) city as the hidden field, with the parsed filters', () => {
    const raw = { q: 'stagg', min: '50', size: '750', inStock: '1', store: 'flask' };
    expect(searchFormValues(raw, parseSearchForm(raw), 'la')).toEqual({
      q: 'stagg', city: 'la', size: '750', min: '50', max: '', inStock: true, store: 'flask',
    });
  });
  it('leaves the city out when the landing page has none', () => {
    expect(searchFormValues({}, parseSearchForm({}), undefined).city).toBeUndefined();
  });
});

describe('SearchForm hidden city field', () => {
  it('renders the city so a submitted search URL names it', () => {
    const values = searchFormValues({ q: 'stagg' }, parseSearchForm({ q: 'stagg' }), 'nj');
    const html = renderToStaticMarkup(createElement(SearchForm, { values, filterCount: 0 }));
    expect(html).toContain('<input type="hidden" name="city" value="nj"/>');
  });
});
