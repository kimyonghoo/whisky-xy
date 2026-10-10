import { describe, it, expect } from 'vitest';
import { toObservations } from '@/lib/crawl/map';
import { getStore } from '@/lib/stores';

const flask = getStore('flask')!;
const p = {
  id: 1, title: 'Jack Daniels Bonded Tennessee Whiskey', handle: 'jd-bonded', vendor: 'Jack Daniel', product_type: 'Whiskey', tags: 'bourbon, usa',
  images: [{ src: 'https://cdn.shopify.com/a.jpg' }],
  variants: [
    { id: 11, title: '700ml', price: '34.99', available: true },
    { id: 12, title: '1 Liter', price: '38.87', available: false },
    { id: 13, title: '50ml', price: '2.99', available: true },
  ],
};

describe('toObservations', () => {
  it('maps variants, drops minis, builds url and distinct bottle keys', () => {
    const obs = toObservations(flask, p);
    expect(obs.map((o) => [o.variantId, o.sizeMl, o.priceCents])).toEqual([['11', 700, 3499], ['12', 1000, 3887]]);
    expect(obs[0].bottleKey).not.toBe(obs[1].bottleKey);
    expect(obs[0].url).toBe('https://flaskfinewines.com/products/jd-bonded');
    expect(obs[0].imageUrl).toBe('https://cdn.shopify.com/a.jpg');
  });
  it('Default Title becomes null variantTitle and tiny price parses', () => {
    expect(toObservations(flask, { ...p, variants: [{ id: 14, title: 'Default Title', price: '0.29', available: true }] })[0])
      .toMatchObject({ variantTitle: null, priceCents: 29 });
  });
  it('parses prices exactly', () => {
    const prices = ['64.5', '1,299.97'].map(
      (price, i) => toObservations(flask, { ...p, variants: [{ id: i, title: '750ml', price, available: true }] })[0].priceCents,
    );
    expect(prices).toEqual([6450, 129997]);
  });
  it('accepts array tags and returns [] for non-whisky', () => {
    expect(toObservations(flask, { ...p, tags: ['bourbon'] })).toHaveLength(2);
    expect(toObservations(flask, { ...p, title: 'Wine Glass Set', product_type: 'Glassware', vendor: 'X', tags: 'gift' })).toEqual([]);
  });
  it('skips a variant with an unparseable price without throwing', () => {
    const obs = toObservations(flask, {
      ...p,
      variants: [{ id: 21, title: '750ml', price: 'abc', available: true }, { id: 22, title: '750ml', price: '10.00', available: true }],
    });
    expect(obs.map((o) => o.variantId)).toEqual(['22']);
  });
});
