import { describe, it, expect } from 'vitest';
import { ko } from '@/lib/i18n/ko';
import { en } from '@/lib/i18n/en';
import { STORES } from '@/lib/stores';
import { DEFAULT_LOCALE, LOCALES, dictFor, isLocale, localizePath } from '@/lib/i18n';

/** Key paths of a dictionary; functions count as leaves (compared by presence), arrays by length. */
function shape(value: unknown, path = ''): string[] {
  if (typeof value === 'function') return [`${path}()`];
  if (Array.isArray(value)) return [`${path}[${value.length}]`, ...value.flatMap((v, i) => shape(v, `${path}[${i}]`))];
  if (value && typeof value === 'object') {
    return Object.keys(value)
      .sort()
      .flatMap((k) => shape((value as Record<string, unknown>)[k], path ? `${path}.${k}` : k));
  }
  return [path];
}

/** Arity of every function leaf, so a translated formatter takes the same arguments. */
function arity(value: unknown, path = ''): string[] {
  if (typeof value === 'function') return [`${path}/${value.length}`];
  if (value && typeof value === 'object') {
    return Object.keys(value)
      .sort()
      .flatMap((k) => arity((value as Record<string, unknown>)[k], `${path}.${k}`));
  }
  return [];
}

describe('dictionaries', () => {
  it('en has exactly the keys of ko', () => {
    expect(shape(en)).toEqual(shape(ko));
  });

  it('en functions take the same number of arguments as ko', () => {
    expect(arity(en)).toEqual(arity(ko));
  });

  it('keeps the brand, the clerk line and the curated bottle names', () => {
    expect(en.site.title).toBe('Whisky Index');
    expect(en.card.clerkQuestion).toBe(ko.card.clerkQuestion);
    expect(en.search.examples).toEqual(ko.search.examples);
    expect(en.city.brooklyn).toBe('Brooklyn');
    expect(en.country.us).toBe('United States');
  });

  it('store notes are keyed by real store ids, in both locales', () => {
    const ids = new Set(STORES.map((s) => s.id));
    expect(Object.keys(ko.storeNote).length).toBeGreaterThan(0);
    expect(Object.keys(en.storeNote).sort()).toEqual(Object.keys(ko.storeNote).sort());
    for (const id of Object.keys(ko.storeNote)) expect(ids.has(id)).toBe(true);
    expect(en.storeNote.liquorcave).not.toMatch(/[가-힣]/);
  });

  it('formats won per locale', () => {
    expect(ko.krw('126,000')).toBe('126,000원');
    expect(en.krw('126,000')).toBe('₩126,000');
  });

  it('dictFor picks the locale dictionary', () => {
    expect(dictFor('ko')).toBe(ko);
    expect(dictFor('en')).toBe(en);
  });
});

describe('locales', () => {
  it('lists ko (default) and en', () => {
    expect(LOCALES).toEqual(['ko', 'en']);
    expect(DEFAULT_LOCALE).toBe('ko');
  });

  it('isLocale whitelists', () => {
    expect(isLocale('ko')).toBe(true);
    expect(isLocale('en')).toBe(true);
    expect(isLocale('xx')).toBe(false);
    expect(isLocale('EN')).toBe(false);
    expect(isLocale('')).toBe(false);
    expect(isLocale(undefined)).toBe(false);
    expect(isLocale('__proto__')).toBe(false);
  });
});

describe('localizePath', () => {
  it('prefixes the root and keeps the query', () => {
    expect(localizePath('en', '/?q=x')).toBe('/en?q=x');
    expect(localizePath('ko', '/')).toBe('/ko');
  });

  it('prefixes nested paths', () => {
    expect(localizePath('ko', '/card/5')).toBe('/ko/card/5');
    expect(localizePath('en', '/map?bottle=a%2Fb#x')).toBe('/en/map?bottle=a%2Fb#x');
  });

  it('leaves api routes, absolute URLs and fragments untouched', () => {
    expect(localizePath('en', '/api/recheck/1')).toBe('/api/recheck/1');
    expect(localizePath('en', 'https://example.com/a')).toBe('https://example.com/a');
    expect(localizePath('en', 'http://example.com/a')).toBe('http://example.com/a');
    expect(localizePath('en', '//example.com/a')).toBe('//example.com/a');
    expect(localizePath('en', '#main')).toBe('#main');
  });

  it('swaps an existing locale prefix instead of stacking it', () => {
    expect(localizePath('en', '/ko/card/5')).toBe('/en/card/5');
    expect(localizePath('ko', '/en')).toBe('/ko');
    expect(localizePath('ko', '/en?q=x')).toBe('/ko?q=x');
    // "/english" is not a locale prefix.
    expect(localizePath('ko', '/english')).toBe('/ko/english');
  });
});
