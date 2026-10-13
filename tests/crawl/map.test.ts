import { describe, it, expect } from 'vitest';
import { toObservations, catalogVariantIds } from '@/lib/crawl/map';
import { getStore, type Store } from '@/lib/stores';

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

describe('toObservations currency', () => {
  const jp = { ...flask, id: 'jpshop', domain: 'jp.example', currency: 'JPY' } as Store;
  it('US stores yield USD', () => {
    expect(toObservations(flask, p)[0].currency).toBe('USD');
  });
  it('a JPY store yields JPY and the whole-yen price', () => {
    const obs = toObservations(jp, { ...p, variants: [{ id: 21, title: '700ml', price: '27500', available: true }] });
    expect(obs[0]).toMatchObject({ currency: 'JPY', priceCents: 27500 });
  });
  it('keeps an untyped Japanese title only for a whisky-only catalog store', () => {
    const yamazaki = { ...p, title: '山崎 12年 700ml', product_type: '', tags: [], variants: [{ id: 31, title: 'Default Title', price: '27500', available: true }] };
    expect(toObservations({ ...jp, whiskyOnlyCatalog: true }, yamazaki)).toHaveLength(1);
    expect(toObservations({ ...jp, whiskyOnlyCatalog: false }, yamazaki)).toEqual([]);
    expect(toObservations(jp, yamazaki)).toEqual([]);
    // reject terms still apply to a whisky-only catalog
    expect(toObservations({ ...jp, whiskyOnlyCatalog: true }, { ...yamazaki, title: '山崎 飲み比べセット' })).toEqual([]);
  });
  it('a JPY store never stores an image url (facts only)', () => {
    const obs = toObservations(jp, { ...p, variants: [{ id: 21, title: '700ml', price: '27500', available: true }] });
    expect(obs[0].imageUrl).toBeNull();
  });
  it('skips a JPY variant with a fractional price', () => {
    expect(toObservations(jp, { ...p, variants: [{ id: 22, title: '700ml', price: '27500.50', available: true }] })).toEqual([]);
  });
});

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

describe('catalogVariantIds', () => {
  it('includes every variant, even filtered, unparseable and non-whisky ones', () => {
    const glass = { ...p, id: 2, title: 'Wine Glass Set', product_type: 'Glassware', vendor: 'X', tags: 'gift',
      variants: [{ id: 31, title: 'One', price: '5.00', available: true }] };
    const bad = { ...p, id: 3, variants: [{ id: 41, title: '750ml', price: 'abc', available: true }] };
    expect([...catalogVariantIds([p, glass, bad])].sort()).toEqual(['11', '12', '13', '31', '41']);
  });
});
