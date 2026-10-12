import type { Currency } from '@/lib/stores';

/** Thousands separators, whitespace and the currency's own symbol(s); a foreign symbol is left in and fails the parse. */
const CURRENCY_STRIP: Record<Currency, RegExp> = {
  USD: /[$,\s]/g,
  JPY: /[¥￥,\s]/g,
};

/**
 * Parse a price string into the currency's minor unit without float math:
 * USD "1,299.97" -> 129997 cents; JPY "27,500" -> 27500 yen (yen has no fraction).
 */
export function parsePriceMinor(s: string, currency: Currency): number {
  const cleaned = s.trim().replace(CURRENCY_STRIP[currency], '');
  if (!/^\d+(\.\d*)?$/.test(cleaned)) {
    throw new Error(`Invalid price: ${JSON.stringify(s)}`);
  }
  const [whole, frac = ''] = cleaned.split('.');
  if (currency === 'JPY') {
    if (/[1-9]/.test(frac)) throw new Error(`Invalid JPY price (fraction): ${JSON.stringify(s)}`);
    return parseInt(whole, 10);
  }
  const fraction = (frac + '00').slice(0, 2);
  return parseInt(whole, 10) * 100 + parseInt(fraction, 10);
}

/** Parse a USD price string like "1,299.97" into integer cents. */
export function parsePriceToCents(s: string): number {
  return parsePriceMinor(s, 'USD');
}

export function formatUsd(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(Math.round(cents));
  const dollars = Math.floor(abs / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${sign}$${dollars}.${(abs % 100).toString().padStart(2, '0')}`;
}

export function withTaxCents(priceCents: number, taxRate: number): number {
  return Math.round(priceCents * (1 + taxRate));
}
