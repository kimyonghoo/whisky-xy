/** Parse a price string like "1,299.97" into integer cents without float math. */
export function parsePriceToCents(s: string): number {
  const cleaned = s.trim().replace(/[$,\s]/g, '');
  if (!/^\d+(\.\d*)?$/.test(cleaned)) {
    throw new Error(`Invalid price: ${JSON.stringify(s)}`);
  }
  const [whole, frac = ''] = cleaned.split('.');
  const fraction = (frac + '00').slice(0, 2);
  return parseInt(whole, 10) * 100 + parseInt(fraction, 10);
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
