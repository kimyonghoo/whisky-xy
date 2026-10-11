import { describe, it, expect } from 'vitest';
import { getCity } from '@/lib/geo';
import { cityCookieFor, langCookieFor, withCity } from '@/lib/city-cookie';

describe('cityCookieFor', () => {
  it('never stores a coming-soon city', () => {
    expect(cityCookieFor(getCity('tokyo')!)).toBeNull();
    expect(cityCookieFor(getCity('taipei')!)).toBeNull();
  });

  it('stores a live city for a year, site-wide, SameSite=Lax', () => {
    const c = cityCookieFor(getCity('nj')!);
    expect(c).toContain('wi_city=nj');
    expect(c).toContain('Max-Age=31536000');
    expect(c).toContain('Path=/');
    expect(c).toContain('SameSite=Lax');
  });
});

describe('langCookieFor', () => {
  it('stores the locale in wi_lang for a year', () => {
    expect(langCookieFor('en')).toBe('wi_lang=en; Path=/; Max-Age=31536000; SameSite=Lax');
  });
});

describe('withCity', () => {
  it('replaces an existing city and keeps the other params', () => {
    expect(withCity('/en?q=x&city=la', 'nj')).toBe('/en?q=x&city=nj');
  });

  it('adds the city to a bare path or one with other params', () => {
    expect(withCity('/ko/map', 'la')).toBe('/ko/map?city=la');
    expect(withCity('/ko?q=lagavulin+16&size=750', 'tokyo')).toBe('/ko?q=lagavulin+16&size=750&city=tokyo');
  });

  it('keeps a fragment and drops a duplicate city param', () => {
    expect(withCity('/ko/compare?city=la&city=nj#top', 'brooklyn')).toBe('/ko/compare?city=brooklyn#top');
  });
});
