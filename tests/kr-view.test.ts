import { describe, it, expect } from 'vitest';
import {
  formatKrw,
  brandQuery,
  parseProductId,
  returnQuery,
  isKrStale,
  isFxStale,
  barPct,
  linkKrHref,
  KR_STALE_AFTER_MS,
} from '@/lib/kr-view';

describe('kr-view', () => {
  it('formats KRW with ko-KR grouping and 원', () => {
    expect(formatKrw(649000)).toBe('649,000원');
    expect(formatKrw(0)).toBe('0원');
    expect(formatKrw(-50000)).toBe('-50,000원');
    expect(formatKrw(1234.6)).toBe('1,235원');
  });

  it('strips titles to brand words for the Dailyshot query', () => {
    expect(brandQuery('Stagg Kentucky Straight Bourbon Whiskey Batch 24A 750ml')).toBe('stagg');
    expect(brandQuery('Stagg Jr Bourbon')).toBe('stagg jr');
    expect(brandQuery('George T. Stagg Bourbon 2024')).toBe('george stagg');
    expect(brandQuery("Jack Daniel's Single Barrel Barrel Proof Tennessee Whiskey")).toBe('jack daniels');
    expect(brandQuery('Lagavulin 16 Year Old Single Malt Scotch Whisky')).toBe('lagavulin');
    expect(brandQuery('Bourbon Whiskey')).toBe('bourbon whiskey');
    expect(brandQuery('BTAC George T. Stagg Kentucky Straight Bourbon Whiskey')).toBe('george stagg');
    expect(brandQuery('Stagg vs Stagg Jr Bourbon 2 Bottle Bundle Set')).toBe('stagg jr');
  });

  it('accepts digit-only product ids', () => {
    expect(parseProductId('20583')).toBe('20583');
    expect(parseProductId(' 1')).toBeNull();
    expect(parseProductId('12a')).toBeNull();
    expect(parseProductId('')).toBeNull();
    expect(parseProductId('1234567890123')).toBeNull();
    expect(parseProductId(null)).toBeNull();
    expect(parseProductId(['1'])).toBeNull();
  });

  it('picks the search to return to after linking', () => {
    expect(returnQuery('stagg', 'Stagg Bourbon')).toBe('stagg');
    expect(returnQuery('  ', 'Stagg Bourbon')).toBe('stagg');
    expect(returnQuery(undefined, 'Stagg Jr Bourbon')).toBe('stagg jr');
    expect(returnQuery('x'.repeat(121), 'Stagg Bourbon')).toBe('stagg');
  });

  it('flags Dailyshot data older than 7 days and fx older than 3 days', () => {
    const now = new Date('2026-10-10T12:00:00Z');
    expect(KR_STALE_AFTER_MS).toBe(7 * 86_400_000);
    expect(isKrStale(new Date(now.getTime() - KR_STALE_AFTER_MS), now)).toBe(false);
    expect(isKrStale(new Date(now.getTime() - KR_STALE_AFTER_MS - 1), now)).toBe(true);
    expect(isFxStale('2026-10-08', now)).toBe(false);
    expect(isFxStale('2026-10-06', now)).toBe(true);
    expect(isFxStale('garbage', now)).toBe(true);
  });

  it('scales bars against a shared zero-based max with a visible minimum', () => {
    expect(barPct(500, 1000)).toBe(50);
    expect(barPct(1000, 1000)).toBe(100);
    expect(barPct(1, 1000)).toBe(1.5);
    expect(barPct(0, 1000)).toBe(0);
    expect(barPct(10, 0)).toBe(0);
  });

  it('builds an internal /link-kr href', () => {
    expect(linkKrHref('bourbon stagg|p|b|s750', 'Stagg Bourbon')).toBe('/link-kr?bottle=bourbon+stagg%7Cp%7Cb%7Cs750&q=stagg');
    expect(linkKrHref('k', 'Stagg Bourbon', 'stagg 750')).toBe('/link-kr?bottle=k&q=stagg&from=stagg+750');
  });
});
