import { ko } from '@/lib/i18n/ko';

export type Region = 'brooklyn' | 'nj' | 'ca';

export interface Store {
  id: string;
  name: string;
  domain: string;
  region: Region;
  address: string;
  lat: number;
  lng: number;
  phone: string;
  taxRate: number;
  stockReliability: 'high' | 'low';
  onlineOnly: boolean;
  publicAllowed: boolean;
  note?: string;
}

export const MAIN_REGIONS: Region[] = ['brooklyn', 'nj'];
export const REGION_LABEL: Record<Region, string> = ko.region;

// Address/phone from each store's own site; lat/lng geocoded once via Nominatim.
export const STORES: Store[] = [
  {
    id: 'dewinespot', name: 'De Wine Spot', domain: 'dewinespot.co', region: 'brooklyn',
    address: '428 Lorimer St, Brooklyn, NY 11206', lat: 40.7096302, lng: -73.9485132,
    phone: '718-388-9463', taxRate: 0.08875, stockReliability: 'high', onlineOnly: false, publicAllowed: true,
  },
  {
    id: 'theliquorstore', name: 'The Liquor Store', domain: 'theliquorstore.com', region: 'brooklyn',
    address: '55 Flatbush Ave, Brooklyn, NY 11217', lat: 40.6872047, lng: -73.9794964,
    phone: '718-222-0100', taxRate: 0.08875, stockReliability: 'high', onlineOnly: false, publicAllowed: true,
  },
  {
    id: 'grainvine', name: 'Grain & Vine', domain: 'grainvine.com', region: 'brooklyn',
    address: '190 Union Ave, Brooklyn, NY 11211', lat: 40.7060339, lng: -73.9501105,
    phone: '718-782-9463', taxRate: 0.08875, stockReliability: 'high', onlineOnly: false, publicAllowed: true,
  },
  {
    id: 'slopecellars', name: 'Slope Cellars', domain: 'slopecellars.com', region: 'brooklyn',
    address: '436 7th Ave, Brooklyn, NY 11215', lat: 40.6635689, lng: -73.9846378,
    phone: '718-369-7307', taxRate: 0.08875, stockReliability: 'high', onlineOnly: false, publicAllowed: true,
  },
  {
    id: 'liquorcave', name: 'Liquor Cave', domain: 'liquorcave.com', region: 'nj',
    address: '775 US-1, Edison, NJ 08817', lat: 40.5125877, lng: -74.3837563,
    phone: '732-662-4699', taxRate: 0.06625, stockReliability: 'low', onlineOnly: false, publicAllowed: true,
    note: '여러 지점 있음 — 방문 전 전화 확인',
  },
  {
    id: 'winechateau', name: 'Wine Chateau', domain: 'winechateau.com', region: 'nj',
    address: '85 Central Ave, Metuchen, NJ 08840', lat: 40.5414336, lng: -74.3678358,
    phone: '800-946-3190', taxRate: 0.06625, stockReliability: 'high', onlineOnly: false, publicAllowed: true,
  },
  {
    id: 'coolvines', name: 'CoolVines', domain: 'coolvines.com', region: 'nj',
    address: '350 Warren St, Jersey City, NJ 07302', lat: 40.7200248, lng: -74.0378045,
    phone: '201-432-8910', taxRate: 0.06625, stockReliability: 'low', onlineOnly: false, publicAllowed: true,
  },
  {
    id: 'flask', name: 'Flask Fine Wine & Whisky', domain: 'flaskfinewines.com', region: 'ca',
    address: '12194 Ventura Blvd, Studio City, CA 91604', lat: 34.1432209, lng: -118.3982,
    // CDTFA lists 10.25% for this address (LA Measure A), not the plan's 9.75%.
    phone: '818-761-5373', taxRate: 0.1025, stockReliability: 'high', onlineOnly: false, publicAllowed: true,
  },
  {
    id: 'bittersandbottles', name: 'Bitters & Bottles', domain: 'bittersandbottles.com', region: 'ca',
    address: '240 Grand Ave, South San Francisco, CA 94080', lat: 37.6551751, lng: -122.409552,
    phone: '650-741-6430', taxRate: 0.09875, stockReliability: 'high', onlineOnly: true, publicAllowed: true,
  },
];

export function getStore(id: string): Store | undefined {
  return STORES.find((s) => s.id === id);
}
