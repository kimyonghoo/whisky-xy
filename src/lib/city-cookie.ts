// Pure helpers for the header city selector and language switch (no DOM, no Next imports).
import { CITY_COOKIE, type City, type CityId } from '@/lib/geo';
import { LANG_COOKIE, type Locale } from '@/lib/i18n';

const ONE_YEAR = 60 * 60 * 24 * 365;

function prefCookie(name: string, value: string): string {
  return `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${ONE_YEAR}; SameSite=Lax`;
}

/**
 * The `document.cookie` string that remembers a city, or null for a coming-soon city:
 * only live cities are ever stored, so a visitor never lands on an empty site next time.
 */
export function cityCookieFor(city: City): string | null {
  return city.status === 'live' ? prefCookie(CITY_COOKIE, city.id) : null;
}

/** The `document.cookie` string that remembers the language for unprefixed URLs. */
export function langCookieFor(locale: Locale): string {
  return prefCookie(LANG_COOKIE, locale);
}

/** Sets (or replaces) `city` in a path's query, keeping every other param and the fragment. */
export function withCity(href: string, city: CityId): string {
  const hashAt = href.indexOf('#');
  const hash = hashAt === -1 ? '' : href.slice(hashAt);
  const beforeHash = hashAt === -1 ? href : href.slice(0, hashAt);
  const queryAt = beforeHash.indexOf('?');
  const path = queryAt === -1 ? beforeHash : beforeHash.slice(0, queryAt);
  const params = new URLSearchParams(queryAt === -1 ? '' : beforeHash.slice(queryAt + 1));
  params.set('city', city);
  return `${path}?${params.toString()}${hash}`;
}

/**
 * The query string (`?…`) a page about `city` should show when the current one doesn't name it
 * (no `?city=`, a different or invalid one, or a legacy `?region=`), else null. Every other param
 * is kept. Shared links then open on that city.
 */
export function pinnedCitySearch(search: string, city: CityId): string | null {
  const params = new URLSearchParams(search);
  if (params.get('city') === city && !params.has('region')) return null;
  params.delete('region');
  params.set('city', city);
  return `?${params.toString()}`;
}
