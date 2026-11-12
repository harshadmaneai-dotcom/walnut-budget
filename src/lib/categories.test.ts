import { describe, expect, it } from 'vitest';
import { categoryUsage, eligibleTargets, mergeCategory } from './categories';
import type { AppData } from './types';

function sample(): AppData {
  return {
    version: 1,
    settings: { currency: 'USD', firstDayOfWeek: 1 },
    accounts: [],
    categories: [
      { id: 'food', name: 'Food', type: 'expense', group: 'need', monthlyBudget: 300_00 },
      { id: 'dining', name: 'Dining', type: 'expense', group: 'want', monthlyBudget: null },
      { id: 'invest', name: 'Investments', type: 'expense', group: 'investment', monthlyBudget: null },
      { id: 'salary', name: 'Salary', type: 'income', monthlyBudget: null },
    ],
    transfers: [],
    transactions: [
      { id: 't1', type: 'expense', amount: 100_00, date: '2026-01-02', categoryId: 'food', accountId: null, note: '' },
      { id: 't2', type: 'expense', amount: 200_00, date: '2026-01-03', categoryId: 'food', accountId: null, note: '' },
      { id: 't3', type: 'expense', amount: 300_00, date: '2026-01-04', categoryId: 'dining', accountId: null, note: '' },
    ],
    loans: [],
    recurring: [
      {
        id: 'r1',
        type: 'expense',
        amount: 500_00,
        categoryId: 'food',
        accountId: null,
        note: 'Groceries',
        frequency: 'monthly',
        startDate: '2026-01-01',
        lastApplied: null,
      },
      {
        id: 'r2',
        type: 'expense',
        amount: 600_00,
        categoryId: 'dining',
        accountId: null,
        note: '',
        frequency: 'weekly',
        startDate: '2026-01-01',
        lastApplied: null,
      },
    ],
  };
}

describe('categoryUsage', () => {
  it('counts transactions and recurring rules', () => {
    expect(categoryUsage(sample(), 'food')).toEqual({ transactions: 2, recurring: 1 });
    expect(categoryUsage(sample(), 'invest')).toEqual({ transactions: 0, recurring: 0 });
  });
});

describe('eligibleTargets', () => {
  it('offers same-type categories and excludes the source', () => {
    const data = sample();
    const food = data.categories.find((c) => c.id === 'food')!;
    expect(eligibleTargets(data.categories, food).map((c) => c.id)).toEqual(['dining', 'invest']);
  });
});

describe('mergeCategory', () => {
  it('moves transactions and recurring rules, then removes the source', () => {
    const merged = mergeCategory(sample(), 'food', 'dining');

    expect(merged.categories.map((c) => c.id)).toEqual(['dining', 'invest', 'salary']);
    expect(merged.transactions.map((t) => [t.id, t.categoryId])).toEqual([
      ['t1', 'dining'],
      ['t2', 'dining'],
      ['t3', 'dining'],
    ]);
    expect(merged.recurring.map((r) => [r.id, r.categoryId])).toEqual([
      ['r1', 'dining'],
      ['r2', 'dining'],
    ]);
  });

  it('leaves other rows untouched', () => {
    const before = sample();
    const after = mergeCategory(before, 'food', 'dining');
    expect(after.transactions.find((t) => t.id === 't3')).toBe(before.transactions.find((t) => t.id === 't3'));
    expect(after.recurring.find((r) => r.id === 'r2')).toBe(before.recurring.find((r) => r.id === 'r2'));
    expect(after.settings).toBe(before.settings);
  });

  it('refuses to move across types', () => {
    const data = sample();
    expect(mergeCategory(data, 'food', 'salary')).toBe(data);
  });

  it('no-ops for an unknown source, unknown target or the same id', () => {
    const data = sample();
    expect(mergeCategory(data, 'missing', 'dining')).toBe(data);
    expect(mergeCategory(data, 'food', 'missing')).toBe(data);
    expect(mergeCategory(data, 'food', 'food')).toBe(data);
  });
});
