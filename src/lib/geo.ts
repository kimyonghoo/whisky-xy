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
