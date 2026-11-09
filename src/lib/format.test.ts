import { describe, expect, it } from 'vitest';
import { currencySymbol, formatMoney } from './format';

describe('currency formatting', () => {
  it('uses the rupee symbol for INR', () => {
    expect(currencySymbol('INR')).toBe('₹');
  });

  it('formats INR amounts with the rupee symbol', () => {
    const out = formatMoney(123_400, 'INR');
    expect(out).toContain('₹');
    expect(out).toContain('1,234.00');
  });

  it('falls back to the default currency for invalid or partial codes', () => {
    expect(currencySymbol('')).toBe('₹');
    expect(currencySymbol('I')).toBe('₹');
    expect(formatMoney(100, 'I')).toContain('₹');
  });
});
