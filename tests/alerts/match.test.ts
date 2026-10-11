import { describe, expect, it } from 'vitest';
import { watchMatches, selectAlerts, formatAlert, type AlertCandidate } from '@/lib/alerts/match';
import { getStore } from '@/lib/stores';
import { cityWatchRegion, watchRegionCity } from '@/lib/watch-form';
import { normalizeText } from '@/lib/whisky/parse';
import type { Listing, Watch } from '@/lib/db/schema';
import type { ChangeEvent } from '@/lib/crawl/ingest';

const dewinespot = getStore('dewinespot')!;
const flask = getStore('flask')!;

function watch(o: Partial<Watch> = {}): Watch {
  return {
    id: 1, label: 'w', includeTerms: [], excludeTerms: [], batch: null, sizeMl: null,
    maxPriceCents: null, regions: ['brooklyn', 'nj', 'ca'], createdAt: new Date(), ...o,
  } as Watch;
}
function listing(title: string, o: Partial<Listing> = {}): Listing {
  return {
    id: 1, storeId: 'dewinespot', title, variantTitle: '', priceCents: 17500, available: true,
    sizeMl: 750, proof: null, batch: null, bottleKey: 'k', searchText: normalizeText(title),
    url: 'https://x/p', imageUrl: null, ...o,
  } as unknown as Listing;
}
const stagg = watch({ includeTerms: ['stagg'], excludeTerms: ['jr', 'junior', 'george'], regions: ['brooklyn', 'nj'] });
const byId = new Map<number, Listing>([[1, listing('Stagg Kentucky Straight Bourbon Whiskey')]]);
function ev(kind: ChangeEvent['kind'], priceCents: number, prev: number | null = null): ChangeEvent {
  return { kind, listingId: 1, prevPriceCents: prev, priceCents, available: kind !== 'sold_out' };
}
function cand(o: Partial<Listing> = {}): AlertCandidate {
  return { watch: stagg, listing: listing('Stagg', o), event: ev('restock', 17500) };
}

describe('legacy watch region boundary', () => {
  it('maps ca <-> la and leaves other cities as they are', () => {
    expect(watchRegionCity('ca')).toBe('la');
    expect(cityWatchRegion('la')).toBe('ca');
    for (const r of ['brooklyn', 'nj'] as const) {
      expect(watchRegionCity(r)).toBe(r);
      expect(cityWatchRegion(r)).toBe(r);
    }
  });
  it('legacy ca watches still match LA stores; east-coast watches do not', () => {
    const bnb = getStore('bittersandbottles')!;
    expect(bnb.city).toBe('la');
    const l = listing('Stagg Bourbon', { storeId: 'bittersandbottles' });
    expect(watchMatches(watch({ includeTerms: ['stagg'], regions: ['ca'] }), l, bnb)).toBe(true);
    expect(watchMatches(watch({ includeTerms: ['stagg'], regions: ['brooklyn', 'nj'] }), l, bnb)).toBe(false);
  });
});

describe('watchMatches', () => {
  it('matches and excludes', () => {
    expect(watchMatches(stagg, listing('Stagg Kentucky Straight Bourbon Whiskey Batch 24A'), dewinespot)).toBe(true);
    expect(watchMatches(stagg, listing('Stagg Jr Barrel Proof Bourbon Batch 9'), dewinespot)).toBe(false);
    expect(watchMatches(stagg, listing('BTAC George T. Stagg Kentucky Straight Bourbon'), dewinespot)).toBe(false);
    expect(watchMatches(stagg, listing('Stagg Kentucky Straight Bourbon Whiskey'), flask)).toBe(false);
    expect(watchMatches(watch({ includeTerms: ['stag'] }), listing('Stagg Bourbon'), dewinespot)).toBe(false);
    expect(watchMatches({ ...stagg, batch: '24A' }, listing('Stagg Batch 23C', { batch: '23C' }), dewinespot)).toBe(false);
  });
  it('checks size', () => {
    expect(watchMatches({ ...stagg, sizeMl: 1750 }, listing('Stagg'), dewinespot)).toBe(false);
    expect(watchMatches({ ...stagg, sizeMl: 750 }, listing('Stagg'), dewinespot)).toBe(true);
  });
});

describe('selectAlerts', () => {
  const w = { ...stagg, maxPriceCents: 20000 };
  it('applies rules', () => {
    expect(selectAlerts([w], [ev('restock', 17500)], byId)).toHaveLength(1);
    expect(selectAlerts([w], [ev('restock', 64900)], byId)).toHaveLength(0);
    expect(selectAlerts([w], [ev('price_drop', 19900, 21000)], byId)).toHaveLength(1);
    expect(selectAlerts([w], [ev('price_drop', 18000, 19000)], byId)).toHaveLength(0);
    expect(selectAlerts([stagg], [ev('price_drop', 18000, 19000)], byId)).toHaveLength(0);
    expect(selectAlerts([stagg], [ev('sold_out', 17500)], byId)).toHaveLength(0);
    expect(selectAlerts([stagg], [ev('new', 17500)], byId)).toHaveLength(1);
  });
});

describe('formatAlert', () => {
  it('escapes and includes details', () => {
    const text = formatAlert(cand({ title: 'A <b> & "Stagg"' }), dewinespot, 'https://x.app');
    expect(text).toContain('A &lt;b&gt; &amp; "Stagg"');
    expect(text).toContain('https://x.app/card/');
    expect(text).toContain('$175.00');
    expect(text).toContain('🔔 재입고');
    expect(text).not.toContain('재고 표시 부정확');
  });
  it('warns for low reliability stores', () => {
    const low = { ...dewinespot, stockReliability: 'low' as const };
    expect(formatAlert(cand(), low, 'https://x.app')).toContain('⚠️ 재고 표시 부정확 — 방문 전 전화 확인');
  });
});
