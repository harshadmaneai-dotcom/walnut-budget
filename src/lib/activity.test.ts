import { describe, expect, it } from 'vitest';
import { buildActivity } from './activity';
import { defaultData } from './storage';
import type { AppData, Transaction, Transfer } from './types';

function tx(id: string, date: string, createdAt?: string): Transaction {
  return {
    id,
    type: 'expense',
    amount: 100,
    date,
    categoryId: 'c-food',
    accountId: 'a-cash',
    note: '',
    ...(createdAt ? { createdAt } : {}),
  };
}

function transfer(id: string, date: string): Transfer {
  return {
    id,
    fromAccountId: 'a-cash',
    toAccountId: 'a-bank',
    amount: 500,
    date,
    note: '',
  };
}

const accounts = [
  { id: 'a-cash', name: 'Cash', kind: 'cash' as const, openingBalance: 0 },
  { id: 'a-bank', name: 'Bank', kind: 'bank' as const, openingBalance: 0 },
];

describe('buildActivity', () => {
  const crowdedDay: AppData = {
    ...defaultData(),
    accounts,
    transactions: Array.from({ length: 7 }, (_, index) => tx(`t${index + 1}`, '2026-11-12')),
    transfers: [transfer('tr1', '2026-11-12'), transfer('tr2', '2026-11-12')],
  };

  it('keeps every same-day entry when the limit allows it', () => {
    const result = buildActivity(crowdedDay, 10);
    expect(result.total).toBe(9);
    expect(result.hidden).toBe(0);
    expect(result.entries).toHaveLength(9);
  });

  it('puts the newest same-day additions first and reports what a cap hides', () => {
    const result = buildActivity(crowdedDay, 6);
    expect(result.total).toBe(9);
    expect(result.hidden).toBe(3);
    expect(result.entries.filter((entry) => entry.kind === 'transaction').map((entry) => entry.tx.id)).toEqual([
      't7',
      't6',
      't5',
      't4',
      't3',
      't2',
    ]);
  });

  it('treats createdAt as newer than a legacy record for a backdated entry', () => {
    const data: AppData = {
      ...defaultData(),
      accounts,
      transactions: [tx('legacy', '2026-11-12'), tx('backdated', '2026-10-01', '2026-11-12T23:00:00.000Z')],
    };
    const result = buildActivity(data, 1);
    expect(result.entries[0]).toMatchObject({ kind: 'transaction', tx: { id: 'backdated' } });
  });

  it('includes loan repayments as read-only entries', () => {
    const data: AppData = {
      ...defaultData(),
      accounts,
      loans: [
        {
          id: 'loan-1',
          counterparty: 'Sam',
          direction: 'borrowed',
          principal: 1_000,
          date: '2026-11-01',
          dueDate: null,
          note: '',
          accountId: 'a-cash',
          repayments: [{ id: 'r1', amount: 250, date: '2026-11-12', accountId: 'a-cash', note: '' }],
        },
      ],
    };
    const result = buildActivity(data, 10);
    expect(result.total).toBe(1);
    expect(result.entries[0]).toMatchObject({
      kind: 'repayment',
      id: 'r1',
      loan: { id: 'loan-1' },
      repayment: { amount: 250 },
    });
  });
});
