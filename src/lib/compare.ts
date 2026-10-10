export type Verdict = 'must' | 'big' | 'good' | 'small' | 'worse';

export interface KrComparison { usKrw: number; diffKrw: number; savingsPct: number; verdict: Verdict }

export function compareKr(usTaxIncludedCents: number, usdKrw: number, krLowKrw: number): KrComparison {
  const usKrw = Math.round((usTaxIncludedCents * usdKrw) / 100);
  const diffKrw = krLowKrw - usKrw;
  const savingsPct = krLowKrw > 0 ? Math.round((diffKrw / krLowKrw) * 100) : 0;
  const verdict: Verdict =
    savingsPct >= 50 ? 'must' : savingsPct >= 30 ? 'big' : savingsPct >= 15 ? 'good' : savingsPct >= 0 ? 'small' : 'worse';
  return { usKrw, diffKrw, savingsPct, verdict };
}
