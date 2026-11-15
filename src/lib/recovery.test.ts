import { describe, expect, it } from 'vitest';
import { missingEntryCount } from './recovery';
import { defaultData } from './storage';
import type { AppData } from './types';

describe('missingEntryCount', () => {
  const local: AppData = {
    ...defaultData(),
    transactions: [
      { id: 't1', type: 'expense', amount: 100, date: '2026-11-01', categoryId: 'c-food', accountId: null, note: '' },
      { id: 't2', type: 'income', amount: 200, date: '2026-11-02', categoryId: 'c-salary', accountId: null, note: '' },
    ],
    transfers: [
      { id: 'tr1', fromAccountId: 'a-cash', toAccountId: 'a-bank', amount: 50, date: '2026-11-03', note: '' },
    ],
    loans: [
      {
        id: 'l1',
        counterparty: 'Sam',
        direction: 'borrowed',
        principal: 1_000,
        date: '2026-11-01',
        dueDate: null,
        note: '',
        accountId: null,
        repayments: [{ id: 'r1', amount: 100, date: '2026-11-04', accountId: null, note: '' }],
      },
    ],
  };

  it('is zero when the remote copy contains every local record', () => {
    expect(missingEntryCount(local, local)).toBe(0);
  });

  it('counts a dropped transaction', () => {
    const remote = { ...local, transactions: local.transactions.slice(0, 1) };
    expect(missingEntryCount(local, remote)).toBe(1);
  });

  it('counts a dropped repayment inside a surviving loan', () => {
    const remote = {
      ...local,
      loans: [{ ...local.loans[0], repayments: [] }],
    };
    expect(missingEntryCount(local, remote)).toBe(1);
  });

  it('counts a dropped favor and a dropped person', () => {
    const withFavor: AppData = {
      ...local,
      favorPeople: [{ id: 'p-sam', name: 'Sam' }],
      favors: [
        { id: 'f1', personId: 'p-sam', amount: 500, date: '2026-11-05', note: '', direction: 'theyCovered' },
      ],
    };
    expect(missingEntryCount(withFavor, withFavor)).toBe(0);
    // The person and the entry that depends on them are both gone.
    expect(missingEntryCount(withFavor, local)).toBe(2);
  });
});
