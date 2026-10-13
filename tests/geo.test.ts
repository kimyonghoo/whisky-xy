import { describe, it, expect } from 'vitest';
import { citiesOf, getCity, isCityId, resolveCity, storesIn } from '@/lib/geo';
import { STORES } from '@/lib/stores';

describe('geo', () => {
  it('lists US cities live and Asian cities soon, in order', () => {
    expect(citiesOf('us').map((c) => [c.id, c.status])).toEqual([['brooklyn', 'live'], ['nj', 'live'], ['la', 'live']]);
    expect(citiesOf('jp').map((c) => c.id)).toEqual(['tokyo', 'osaka', 'sapporo']);
    expect(citiesOf('tw').map((c) => c.status)).toEqual(['soon']);
  });
  it('validates ids', () => {
    expect(isCityId('la')).toBe(true);
    for (const bad of ['ca', 'LA', '', '<script>', undefined]) expect(isCityId(bad)).toBe(false);
  });
  it('assigns every public store to a live city; LA holds the former CA stores', () => {
    expect(storesIn('la').map((s) => s.id)).toContain('bittersandbottles');
    for (const s of STORES.filter((x) => x.publicAllowed)) expect(getCity(s.city)?.status).toBe('live');
    expect(storesIn('tokyo')).toEqual([]);
  });
  describe('resolveCity', () => {
    it('maps the legacy region param (ca -> la)', () => {
      expect(resolveCity({ region: 'ca' })).toEqual({ city: getCity('la'), soon: false });
      expect(resolveCity({ region: 'nj' }).city.id).toBe('nj');
      expect(resolveCity({ region: 'la' }).city.id).toBe('la');
    });
    it('honours a soon city from the param over the cookie', () => {
      const r = resolveCity({ city: 'tokyo', cookie: 'nj' });
      expect(r.city.id).toBe('tokyo');
      expect(r.soon).toBe(true);
    });
    it('ignores a soon or unknown cookie', () => {
      expect(resolveCity({ cookie: 'tokyo' }).city.id).toBe('brooklyn');
      expect(resolveCity({ city: '<x>', cookie: 'xx' }).city.id).toBe('brooklyn');
      expect(resolveCity({ cookie: 'nj' }).city.id).toBe('nj');
    });
    it('lets the store city win', () => {
      expect(resolveCity({ city: 'nj', storeCity: 'la' }).city.id).toBe('la');
    });
  });
});
