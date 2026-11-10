import { describe, expect, it } from 'vitest';
import { defaultData, isIsoDate, normalizeData, parseData } from './storage';

describe('normalizeData', () => {
  it('keeps only recurring rules that have a usable start date', () => {
    const data = normalizeData({
      ...defaultData(),
      recurring: [
        {
          id: 'broken',
          type: 'expense',
          amount: 100,
          categoryId: 'c-food',
          accountId: null,
          note: '',
          frequency: 'monthly',
          startDate: '',
          lastApplied: null,
        },
        {
          id: 'good',
          type: 'expense',
          amount: 100,
          categoryId: 'c-food',
          accountId: null,
          note: '',
          frequency: 'monthly',
          startDate: '2026-01-31',
          lastApplied: null,
        },
      ],
    } as never);

    expect(data.recurring.map((rule) => rule.id)).toEqual(['good']);
  });

  it('replaces collections that are not arrays instead of throwing', () => {
    const data = normalizeData({
      ...defaultData(),
      loans: null,
      transactions: 'not a list',
      categories: 42,
    } as never);

    expect(data.loans).toEqual([]);
    expect(data.transactions).toEqual([]);
    expect(data.categories.length).toBeGreaterThan(0);
  });

  it('coerces amounts that are not finite numbers to zero', () => {
    const data = normalizeData({
      ...defaultData(),
      transactions: [
        {
          id: 't1',
          type: 'expense',
          amount: '12.50',
          date: '2026-11-01',
          categoryId: 'c-food',
          accountId: null,
          note: '',
        },
        {
          id: 't2',
          type: 'income',
          amount: Number.NaN,
          date: '2026-11-02',
          categoryId: 'c-salary',
          accountId: null,
          note: '',
        },
      ],
    } as never);

    expect(data.transactions.map((t) => t.amount)).toEqual([0, 0]);
  });

  it('always leaves at least one account and one expense category', () => {
    const data = normalizeData({ ...defaultData(), accounts: [], categories: [] } as never);
    expect(data.accounts.length).toBeGreaterThan(0);
    expect(data.categories.some((c) => c.type === 'expense')).toBe(true);
  });

  it('repairs invalid settings without losing the currency', () => {
    const data = normalizeData({
      ...defaultData(),
      settings: { currency: 'usd', firstDayOfWeek: 7 },
    } as never);
    expect(data.settings.currency).toBe('USD');
    expect(data.settings.firstDayOfWeek).toBe(1);
  });
});

describe('parseData', () => {
  it('falls back to defaults for unreadable JSON', () => {
    expect(parseData('{ not json').transactions).toEqual([]);
  });

  it('falls back to defaults when the shape is unrecognisable', () => {
    expect(parseData('{"hello":"world"}').transactions).toEqual([]);
  });

  it('round-trips a saved document', () => {
    const saved = defaultData();
    expect(parseData(JSON.stringify(saved)).categories).toHaveLength(saved.categories.length);
  });
});

describe('isIsoDate', () => {
  it('accepts real calendar dates only', () => {
    expect(isIsoDate('2024-02-29')).toBe(true);
    expect(isIsoDate('2026-02-29')).toBe(false);
    expect(isIsoDate('2026-1-1')).toBe(false);
    expect(isIsoDate('')).toBe(false);
    expect(isIsoDate(null)).toBe(false);
    expect(isIsoDate('2026-11-10T00:00:00Z')).toBe(false);
  });
});
