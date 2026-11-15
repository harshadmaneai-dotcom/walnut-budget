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

  it('defaults transfers on documents saved before transfers existed', () => {
    const legacy: Record<string, unknown> = { ...defaultData() };
    delete legacy.transfers;
    expect(normalizeData(legacy as never).transfers).toEqual([]);
  });

  it('normalizes transfers, drops same-account ones and survives a round trip', () => {
    const data = normalizeData({
      ...defaultData(),
      accounts: [
        { id: 'a-cash', name: 'Cash', kind: 'cash', openingBalance: 0 },
        { id: 'a-bank', name: 'Bank', kind: 'bank', openingBalance: 0 },
      ],
      transfers: [
        { id: 't1', fromAccountId: 'a-cash', toAccountId: 'a-bank', amount: 100_50, date: '2026-11-12', note: 'ATM' },
        { id: 't2', fromAccountId: 'a-cash', toAccountId: 'a-cash', amount: 10_00, date: '2026-11-12', note: '' },
      ],
    } as never);

    expect(data.transfers).toEqual([
      { id: 't1', fromAccountId: 'a-cash', toAccountId: 'a-bank', amount: 100_50, date: '2026-11-12', note: 'ATM' },
    ]);
    expect(parseData(JSON.stringify(data)).transfers).toEqual(data.transfers);
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

describe('favors', () => {
  it('fills in empty lists for documents saved before favors existed', () => {
    const data = normalizeData({ ...defaultData(), favors: undefined } as never);
    expect(data.favors).toEqual([]);
    expect(data.favorPeople).toEqual([]);
  });

  it('turns names on old favor records into people with ids every device agrees on', () => {
    const data = normalizeData({
      ...defaultData(),
      favors: [
        { id: 'f1', person: 'Abhishek', amount: 30_00, date: '2026-11-14', note: 'Cigarettes', direction: 'theyCovered', settled: false },
        { id: 'f2', person: 'Abhishek', amount: 10_00, date: '2026-11-15', note: '', direction: 'iCovered', settled: true },
        { id: 'f3', person: 'Riya', amount: 5_00, date: '2026-11-15', note: '', direction: 'theyCovered', settled: false },
      ],
    } as never);

    expect(data.favorPeople).toEqual([
      { id: 'p-abhishek', name: 'Abhishek' },
      { id: 'p-riya', name: 'Riya' },
    ]);
    expect(data.favors.map((favor) => favor.personId)).toEqual(['p-abhishek', 'p-abhishek', 'p-riya']);
    // The old settled flag is gone: the balance comes from the amounts themselves.
    expect(data.favors.every((favor) => !('settled' in favor))).toBe(true);
  });

  it('is idempotent, so re-normalising does not duplicate people', () => {
    const once = normalizeData({
      ...defaultData(),
      favors: [{ id: 'f1', person: 'Abhishek', amount: 30_00, date: '2026-11-14', note: '', direction: 'theyCovered' }],
    } as never);
    const twice = normalizeData(once);
    expect(twice.favorPeople).toEqual(once.favorPeople);
    expect(twice.favors).toEqual(once.favors);
  });

  it('drops the entries it cannot place and clamps bad amounts', () => {
    const data = normalizeData({
      ...defaultData(),
      favorPeople: [{ id: 'p-sam', name: 'Sam' }],
      favors: [
        { id: 'f1', personId: 'p-sam', amount: 25_00, date: '2026-11-01', note: 'Dinner', direction: 'theyCovered' },
        { id: 'no-date', personId: 'p-sam', amount: 10_00, date: 'yesterday', direction: 'iCovered' },
        { id: 'no-person', amount: 5_00, date: '2026-11-02', direction: 'iCovered' },
        { id: 'f2', personId: 'p-sam', amount: '12.50', date: '2026-11-03', note: '', direction: 'iCovered' },
      ],
    } as never);

    expect(data.favors.map((favor) => favor.id)).toEqual(['f1', 'f2']);
    expect(data.favors[1]).toMatchObject({ amount: 0, direction: 'iCovered', personId: 'p-sam' });
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
