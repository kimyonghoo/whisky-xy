import { describe, it, expect } from 'vitest';
import { citiesOf, getCity, isCityId, storesIn } from '@/lib/geo';
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
    for (const s of STORES) expect(getCity(s.city)?.status).toBe('live');
    expect(storesIn('tokyo')).toEqual([]);
  });
});
