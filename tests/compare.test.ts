import { describe, it, expect } from 'vitest';
import { compareKr, krCheaperRatio } from '@/lib/compare';
import { diffLabel } from '@/components/KrCompareChip';

describe('compareKr', () => {
  it('must-buy savings', () => {
    expect(compareKr(19045, 1380, 649000)).toEqual({ usKrw: 262821, diffKrw: 386179, savingsPct: 60, krCheaperPct: null, verdict: 'must' });
  });
  it('small', () => {
    expect(compareKr(6930, 1380, 100000).verdict).toBe('small');
    expect(compareKr(6930, 1380, 100000).savingsPct).toBe(4);
  });
  it('tier boundaries use the rounded savingsPct', () => {
    // usdKrw 1000, krLow 1000: cents * 10 = usKrw
    const at = (cents: number) => compareKr(cents, 1000, 1000);
    expect(at(50)).toMatchObject({ savingsPct: 50, verdict: 'must' });
    expect(at(51)).toMatchObject({ savingsPct: 49, verdict: 'big' });
    expect(at(70)).toMatchObject({ savingsPct: 30, verdict: 'big' });
    expect(at(71)).toMatchObject({ savingsPct: 29, verdict: 'good' });
    expect(at(85)).toMatchObject({ savingsPct: 15, verdict: 'good' });
    expect(at(86)).toMatchObject({ savingsPct: 14, verdict: 'small' });
    expect(at(100)).toMatchObject({ savingsPct: 0, verdict: 'small', diffKrw: 0 });
    expect(at(101)).toMatchObject({ savingsPct: -1, verdict: 'worse' });
  });
  it('worse', () => {
    const r = compareKr(6930, 1380, 90000);
    expect(r.verdict).toBe('worse');
    expect(r.diffKrw).toBeLessThan(0);
  });

  it('−0.4 %: the sign decides the verdict (no -0, chip and text agree)', () => {
    // US 502,000원 vs Korea 500,000원: −0.4 % rounds to 0 but Korea is cheaper.
    const r = compareKr(50200, 1000, 500000);
    expect(r).toMatchObject({ usKrw: 502000, diffKrw: -2000, verdict: 'worse', krCheaperPct: 0 });
    expect(Object.is(r.savingsPct, -0)).toBe(false);
    expect(diffLabel(r)).toBe('한국이 2,000원(1% 미만) 더 저렴');
  });

  it('+0.4 %: a small gain stays "small" and reads "1% 미만 절약"', () => {
    const r = compareKr(49800, 1000, 500000);
    expect(r).toMatchObject({ diffKrw: 2000, savingsPct: 0, verdict: 'small', krCheaperPct: null });
    expect(diffLabel(r)).toBe('2,000원(1% 미만) 절약');
  });

  it('a modest loss is measured against the US price', () => {
    // US 600,000 vs Korea 550,000: Korea is 50,000원 (8 % of the US price) cheaper.
    const r = compareKr(60000, 1000, 550000);
    expect(r.krCheaperPct).toBe(8);
    expect(diffLabel(r)).toBe('한국이 50,000원(8%) 더 저렴');
  });

  it('a large loss (US 2.7× Korea) never reads over 100 %; it reads as a multiple', () => {
    // Old wording: "1,066,000원(171%) 손해" (relative to the Korean price).
    const r = compareKr(162600, 1000, 600000);
    expect(r).toMatchObject({ usKrw: 1626000, diffKrw: -1026000, verdict: 'worse' });
    expect(r.savingsPct).toBe(-171);
    expect(r.krCheaperPct).toBe(63);
    expect(r.krCheaperPct!).toBeLessThanOrEqual(100);
    expect(krCheaperRatio(r)).toBe('2.7');
    expect(diffLabel(r)).toBe('한국이 2.7배 저렴 · 1,026,000원 차이');
    expect(diffLabel(r)).not.toMatch(/\d{3,}%/);
  });

  it('equal prices', () => {
    const r = compareKr(50000, 1000, 500000);
    expect(r).toMatchObject({ diffKrw: 0, savingsPct: 0, verdict: 'small' });
    expect(diffLabel(r)).toBe('가격 동일');
  });
});
