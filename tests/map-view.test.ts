import { describe, it, expect } from 'vitest';
import {
  buildMapStores, cityBounds, cityView, escapeHtml, initialView, mapTileConfig, parseBottleParam, OSM_ATTRIBUTION, OSM_TILE_URL, NYC_CENTER, NYC_ZOOM, LA_CENTER, LA_ZOOM,
} from '@/lib/map-view';
import type { BottleOffers } from '@/lib/listings';
import { STORES } from '@/lib/stores';

const avail = new Map([['dewinespot', 120], ['flask', 40]]);

describe('parseBottleParam', () => {
  it('takes the first trimmed value and rejects empty or oversized keys', () => {
    expect(parseBottleParam(' stagg|750 ')).toBe('stagg|750');
    expect(parseBottleParam(['a', 'b'])).toBe('a');
    expect(parseBottleParam(undefined)).toBeNull();
    expect(parseBottleParam('  ')).toBeNull();
    expect(parseBottleParam('x'.repeat(301))).toBeNull();
  });
});

describe('buildMapStores', () => {
  it('without a bottle: all public stores in config order, numbered, with links', () => {
    const s = buildMapStores(STORES, avail, null);
    expect(s.map((x) => x.id)).toEqual(STORES.map((x) => x.id));
    expect(s.map((x) => x.n)).toEqual(STORES.map((_, i) => i + 1));
    const dws = s[0];
    expect(dws.inStockCount).toBe(120);
    expect(dws.storeHref).toBe('/?store=dewinespot');
    expect(dws.tel).toBe('tel:7183889463');
    expect(dws.directionsHref).toContain('destination=428%20Lorimer');
    expect(dws.offer).toBeNull();
    expect(s.every((x) => !x.dimmed)).toBe(true);
    expect(s.find((x) => x.id === 'coolvines')?.inStockCount).toBe(0);
    expect(s.find((x) => x.id === 'liquorcave')?.lowReliability).toBe(true);
    expect(s.find((x) => x.id === 'bittersandbottles')?.onlineOnly).toBe(true);
  });

  it('with a bottle: in-stock by tax-included price first, then sold out, then not listed (dimmed)', () => {
    const bottle: BottleOffers = {
      title: 'Stagg Bourbon',
      sizeMl: 750,
      offers: new Map([
        ['dewinespot', { storeId: 'dewinespot', listed: 1, inStock: 1, unverified: 0, minAvailablePriceCents: 10000 }],
        // same pre-tax price, lower NJ tax => cheaper
        ['winechateau', { storeId: 'winechateau', listed: 2, inStock: 2, unverified: 0, minAvailablePriceCents: 10000 }],
        ['coolvines', { storeId: 'coolvines', listed: 1, inStock: 0, unverified: 0, minAvailablePriceCents: null }],
        // only an available row older than 48 h: "재고 확인 필요", after in-stock, before sold out
        ['liquorcave', { storeId: 'liquorcave', listed: 1, inStock: 0, unverified: 1, minAvailablePriceCents: null }],
      ]),
    };
    const s = buildMapStores(STORES, avail, bottle);
    expect(s.slice(0, 4).map((x) => x.id)).toEqual(['winechateau', 'dewinespot', 'liquorcave', 'coolvines']);
    expect(s[0]).toMatchObject({ n: 1, dimmed: false, offer: { status: 'instock', inStock: 2, priceCents: 10000, taxIncludedCents: 10663 } });
    expect(s[2]).toMatchObject({ dimmed: true, offer: { status: 'unverified', priceCents: null } });
    expect(s[3]).toMatchObject({ dimmed: true, offer: { status: 'soldout', priceCents: null } });
    expect(s.slice(4).every((x) => x.dimmed && x.offer?.status === 'none')).toBe(true);
    // stores that don't list it keep config order
    expect(s.slice(4).map((x) => x.id)).toEqual(
      STORES.map((x) => x.id).filter((id) => !['dewinespot', 'winechateau', 'coolvines', 'liquorcave'].includes(id)),
    );
  });
});

describe('initialView / cityBounds', () => {
  const only = (id: string): BottleOffers => ({
    title: 't', sizeMl: null,
    offers: new Map([[id, { storeId: id, listed: 1, inStock: 1, unverified: 0, minAvailablePriceCents: 100 }]]),
  });
  it('opens on the selected city when it carries the bottle', () => {
    expect(initialView(buildMapStores(STORES, avail, null), 'nj')).toBe('nj');
    expect(initialView(buildMapStores(STORES, avail, only('liquorcave')), 'nj')).toBe('nj');
    const nobody: BottleOffers = { title: 't', sizeMl: null, offers: new Map() };
    expect(initialView(buildMapStores(STORES, avail, nobody), 'la')).toBe('la');
  });
  it('opens on LA when only LA carries the bottle, even with brooklyn selected', () => {
    expect(initialView(buildMapStores(STORES, avail, only('flask')), 'brooklyn')).toBe('la');
  });
  it('bounds only the given city', () => {
    const stores = buildMapStores(STORES, avail, null);
    const b = cityBounds(stores, 'nj')!;
    expect(b[0][0]).toBeCloseTo(40.5125877);
    expect(b[0][1]).toBeCloseTo(-74.3837563);
    expect(b[1][0]).toBeCloseTo(40.7200248);
    expect(b[1][1]).toBeCloseTo(-74.0378045);
    const brooklyn = cityBounds(stores, 'brooklyn')!;
    expect(brooklyn[0][0]).toBeCloseTo(40.6635689);
    expect(brooklyn[1][0]).toBeCloseTo(40.7096302);
    expect(brooklyn[1][1]).toBeCloseTo(-73.9485132);
    expect(cityBounds(stores, 'tokyo')).toBeNull();
    expect(cityBounds([], 'nj')).toBeNull();
  });
});

describe('cityView', () => {
  const stores = buildMapStores(STORES, avail, null);
  it('frames LA on its physical store, not the online-only SF store', () => {
    const v = cityView(stores, 'la');
    expect(v).not.toHaveProperty('bounds');
    expect('center' in v && v.center[0]).toBeCloseTo(34.1432209);
    expect('center' in v && v.center[1]).toBeCloseTo(-118.3982);
  });
  it('fits bounds for several stores, falls back to fixed centres when none', () => {
    expect(cityView(stores, 'nj')).toHaveProperty('bounds');
    expect(cityView(stores, 'tokyo')).toEqual({ center: NYC_CENTER, zoom: NYC_ZOOM });
    expect(cityView(stores.filter((s) => s.id !== 'flask'), 'la')).toEqual({ center: LA_CENTER, zoom: LA_ZOOM });
  });
});

describe('mapTileConfig', () => {
  it('falls back to OSM without subdomains', () => {
    expect(mapTileConfig(undefined, undefined)).toEqual({ url: OSM_TILE_URL, attribution: OSM_ATTRIBUTION });
    expect(OSM_TILE_URL).toBe('https://tile.openstreetmap.org/{z}/{x}/{y}.png');
    expect(OSM_ATTRIBUTION).toContain('OpenStreetMap</a> contributors');
  });
  it('accepts only https template URLs and escapes configured attribution', () => {
    expect(mapTileConfig('http://tiles.example.com/{z}/{x}/{y}.png', 'X').url).toBe(OSM_TILE_URL);
    expect(mapTileConfig('https://tiles.example.com/static.png', 'X').url).toBe(OSM_TILE_URL);
    expect(mapTileConfig('javascript:alert(1)//{z}{x}{y}', 'X').url).toBe(OSM_TILE_URL);
    const c = mapTileConfig(' https://tiles.example.com/{z}/{x}/{y}.png?key=k ', '© Example <script>');
    expect(c.url).toBe('https://tiles.example.com/{z}/{x}/{y}.png?key=k');
    expect(c.attribution).toBe('© Example &lt;script&gt;');
    expect(mapTileConfig('https://tiles.example.com/{z}/{x}/{y}.png', '').attribution).toBe(OSM_ATTRIBUTION);
  });
  it('escapeHtml', () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
  });
});
