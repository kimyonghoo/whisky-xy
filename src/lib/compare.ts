export type Verdict = 'must' | 'big' | 'good' | 'small' | 'worse';

export interface KrComparison {
  usKrw: number;
  /** Korea lowest − US tax-included, in KRW. Positive = buying in the US saves money. */
  diffKrw: number;
  /** Savings relative to the Korean price, rounded (spec: tiers use this). Never -0. */
  savingsPct: number;
  /**
   * Only when Korea is cheaper (diffKrw < 0): how much cheaper Korea is relative to the US
   * price, rounded. Bounded to 0–100, unlike a loss measured against the Korean price.
   */
  krCheaperPct: number | null;
  verdict: Verdict;
}

export function compareKr(usTaxIncludedCents: number, usdKrw: number, krLowKrw: number): KrComparison {
  const usKrw = Math.round((usTaxIncludedCents * usdKrw) / 100);
  const diffKrw = krLowKrw - usKrw;
  // `|| 0` turns Math.round(-0.4) = -0 into 0.
  const savingsPct = krLowKrw > 0 ? Math.round((diffKrw / krLowKrw) * 100) || 0 : 0;
  const krCheaperPct = diffKrw < 0 && usKrw > 0 ? Math.round((-diffKrw / usKrw) * 100) : null;
  // Sign first: a loss is always 'worse', even when it rounds to 0 %.
  const verdict: Verdict =
    diffKrw < 0
      ? 'worse'
      : savingsPct >= 50
        ? 'must'
        : savingsPct >= 30
          ? 'big'
          : savingsPct >= 15
            ? 'good'
            : 'small';
  return { usKrw, diffKrw, savingsPct, krCheaperPct, verdict };
}

/** US price / Korea price, one decimal ("2.7"), for "한국이 2.7배 저렴". */
export function krCheaperRatio(c: Pick<KrComparison, 'usKrw' | 'diffKrw'>): string {
  const kr = c.usKrw + c.diffKrw;
  return kr > 0 ? (Math.round((c.usKrw / kr) * 10) / 10).toFixed(1) : '∞';
}
