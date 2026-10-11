import { STORES, type Store } from '@/lib/stores';

export type CountryId = 'us' | 'jp' | 'tw';
export type CityId = 'brooklyn' | 'nj' | 'la' | 'tokyo' | 'osaka' | 'sapporo' | 'taipei';

export interface City {
  id: CityId;
  country: CountryId;
  status: 'live' | 'soon';
  /** Latin labels (the Korean ones live in the i18n dictionary). */
  nameEn: string;
  subEn: string;
}

export const COUNTRIES: readonly CountryId[] = ['us', 'jp', 'tw'];

export const CITIES: readonly City[] = [
  { id: 'brooklyn', country: 'us', status: 'live', nameEn: 'Brooklyn', subEn: 'New York' },
  { id: 'nj', country: 'us', status: 'live', nameEn: 'New Jersey', subEn: 'New Jersey' },
  { id: 'la', country: 'us', status: 'live', nameEn: 'Los Angeles', subEn: 'California' },
  { id: 'tokyo', country: 'jp', status: 'soon', nameEn: 'Tokyo', subEn: 'Japan' },
  { id: 'osaka', country: 'jp', status: 'soon', nameEn: 'Osaka', subEn: 'Japan' },
  { id: 'sapporo', country: 'jp', status: 'soon', nameEn: 'Sapporo', subEn: 'Japan' },
  { id: 'taipei', country: 'tw', status: 'soon', nameEn: 'Taipei', subEn: 'Taiwan' },
];

export const DEFAULT_CITY: CityId = 'brooklyn';

/** Remembers the last live city a visitor picked. */
export const CITY_COOKIE = 'wi_city';

export function getCity(id: string): City | undefined {
  return CITIES.find((c) => c.id === id);
}

export function isCityId(v: unknown): v is CityId {
  return typeof v === 'string' && CITIES.some((c) => c.id === v);
}

export function citiesOf(country: CountryId): City[] {
  return CITIES.filter((c) => c.country === country);
}

export function liveCities(): City[] {
  return CITIES.filter((c) => c.status === 'live');
}

/** Public stores in a city. */
export function storesIn(city: CityId): Store[] {
  return STORES.filter((s) => s.city === city && s.publicAllowed);
}

/** Pre-city URLs (`?region=`) keep working: `ca` became `la`. */
const LEGACY_REGION: Record<string, CityId> = { brooklyn: 'brooklyn', nj: 'nj', la: 'la', ca: 'la' };

/**
 * The city a request is about. Precedence: the store's own city, a valid `city` param (any status),
 * the legacy `region` param, a cookie naming a live city, then the default.
 */
export function resolveCity(input: { city?: string; region?: string; cookie?: string; storeCity?: CityId }): {
  city: City;
  soon: boolean;
} {
  const liveCity = (id: string | undefined) => {
    const c = id ? getCity(id) : undefined;
    return c?.status === 'live' ? c : undefined;
  };
  const legacy = input.region && Object.hasOwn(LEGACY_REGION, input.region) ? getCity(LEGACY_REGION[input.region]) : undefined;
  const city =
    (input.storeCity ? getCity(input.storeCity) : undefined) ??
    (input.city ? getCity(input.city) : undefined) ??
    legacy ??
    liveCity(input.cookie) ??
    getCity(DEFAULT_CITY)!;
  return { city, soon: city.status === 'soon' };
}
