import { describe, it, expect } from 'vitest';
import { parsePriceToCents, parsePriceMinor, formatUsd, withTaxCents } from '@/lib/money';

describe('parsePriceMinor', () => {
  it('parses JPY as whole yen', () => {
    expect(parsePriceMinor('27500', 'JPY')).toBe(27500);
    expect(parsePriceMinor('27500.00', 'JPY')).toBe(27500);
    expect(parsePriceMinor('27,500', 'JPY')).toBe(27500);
    expect(parsePriceMinor('¥27,500', 'JPY')).toBe(27500);
  });
  it('rejects a fractional yen amount', () => {
    expect(() => parsePriceMinor('27500.50', 'JPY')).toThrow();
    expect(() => parsePriceMinor('abc', 'JPY')).toThrow();
  });
  it('parses USD as cents', () => {
    expect(parsePriceMinor('129.99', 'USD')).toBe(12999);
    expect(parsePriceMinor('129.99', 'USD')).toBe(parsePriceToCents('129.99'));
  });
});

describe('money', () => {
  it('parses price strings exactly', () => {
    expect(parsePriceToCents('64.50')).toBe(6450);
    expect(parsePriceToCents('64.5')).toBe(6450);
    expect(parsePriceToCents('0.29')).toBe(29);
    expect(parsePriceToCents('1,299.97')).toBe(129997);
    expect(parsePriceToCents('175')).toBe(17500);
    expect(() => parsePriceToCents('abc')).toThrow();
  });
  it('handles edge cases', () => {
    expect(parsePriceToCents('12.345')).toBe(1234);
    expect(parsePriceToCents('$1,299.97')).toBe(129997);
    expect(parsePriceToCents(' 64.50 ')).toBe(6450);
    expect(() => parsePriceToCents('.5')).toThrow();
    expect(() => parsePriceToCents('-1')).toThrow();
    expect(() => parsePriceToCents('')).toThrow();
  });
  it('formats USD', () => {
    expect(formatUsd(6450)).toBe('$64.50');
    expect(formatUsd(129997)).toBe('$1,299.97');
  });
  it('applies tax with rounding', () => {
    expect(withTaxCents(6499, 0.06625)).toBe(6930);
  });
});
