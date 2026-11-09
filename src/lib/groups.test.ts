import { describe, expect, it } from 'vitest';
import { defaultData, normalizeData } from './storage';
import { groupSpend, groupTotal } from './groups';
import type { AppData } from './types';

describe('spending groups', () => {
  it('splits one month of expenses into needs, expenses and investments', () => {
    const data: AppData = {
      ...defaultData(),
      transactions: [
        { id: 't1', type: 'expense', amount: 100_00, date: '2026-03-02', categoryId: 'c-food', accountId: null, note: '' },
        { id: 't2', type: 'expense', amount: 40_00, date: '2026-03-03', categoryId: 'c-shopping', accountId: null, note: '' },
        { id: 't3', type: 'expense', amount: 500_00, date: '2026-03-04', categoryId: 'c-invest', accountId: null, note: '' },
        { id: 't4', type: 'expense', amount: 999_00, date: '2026-02-04', categoryId: 'c-food', accountId: null, note: '' },
        { id: 't5', type: 'income', amount: 700_00, date: '2026-03-05', categoryId: 'c-salary', accountId: null, note: '' },
      ],
    };

    const totals = groupSpend(data.transactions, data.categories, '2026-03');
    expect(totals).toEqual({ need: 100_00, want: 40_00, investment: 500_00 });
    expect(groupTotal(totals)).toBe(640_00);
  });

  it('groups legacy categories and adds the investment bucket when missing', () => {
    const legacy = {
      ...defaultData(),
      categories: [
        { id: 'c-food', name: 'Food', type: 'expense' as const, monthlyBudget: null },
        { id: 'c-fun', name: 'Entertainment', type: 'expense' as const, monthlyBudget: null },
      ],
    };

    const normalized = normalizeData(legacy);
    expect(normalized.categories.find((c) => c.id === 'c-food')?.group).toBe('need');
    expect(normalized.categories.find((c) => c.id === 'c-fun')?.group).toBe('want');
    expect(normalized.categories.filter((c) => c.group === 'investment')).toHaveLength(1);
  });
});
