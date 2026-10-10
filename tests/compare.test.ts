import { describe, it, expect } from 'vitest';
import { compareKr } from '@/lib/compare';

describe('compareKr', () => {
  it('must-buy savings', () => {
    expect(compareKr(19045, 1380, 649000)).toEqual({ usKrw: 262821, diffKrw: 386179, savingsPct: 60, verdict: 'must' });
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
    expect(at(100)).toMatchObject({ savingsPct: 0, verdict: 'small' });
    expect(at(101)).toMatchObject({ savingsPct: -1, verdict: 'worse' });
  });
  it('worse', () => {
    const r = compareKr(6930, 1380, 90000);
    expect(r.verdict).toBe('worse');
    expect(r.diffKrw).toBeLessThan(0);
  });
});
