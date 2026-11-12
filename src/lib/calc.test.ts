import { describe, expect, it } from 'vitest';
import {
  accountBalance,
  addMonths,
  applyRecurring,
  loanStatus,
  loanTotals,
  monthTotals,
  remainingAmount,
  repaidAmount,
  totalBalance,
} from './calc';
import { defaultData } from './storage';
import type { AppData, Loan, RecurringRule } from './types';

const baseLoan: Loan = {
  id: 'l1',
  counterparty: 'Sam',
  direction: 'borrowed',
  principal: 100_00,
  date: '2026-01-01',
  dueDate: '2026-06-01',
  note: '',
  accountId: null,
  repayments: [],
};

describe('loans', () => {
  it('tracks partial repayments and remaining balance', () => {
    const loan = { ...baseLoan, repayments: [{ id: 'r1', amount: 30_00, date: '2026-02-01', accountId: null, note: '' }] };
    expect(repaidAmount(loan)).toBe(30_00);
    expect(remainingAmount(loan)).toBe(70_00);
    expect(loanStatus(loan, '2026-03-01')).toBe('partial');
  });

  it('is settled when fully repaid, even after the due date', () => {
    const loan = { ...baseLoan, repayments: [{ id: 'r1', amount: 100_00, date: '2026-05-01', accountId: null, note: '' }] };
    expect(remainingAmount(loan)).toBe(0);
    expect(loanStatus(loan, '2026-12-01')).toBe('settled');
  });

  it('is overdue when past due and not settled', () => {
    expect(loanStatus(baseLoan, '2026-07-01')).toBe('overdue');
    expect(loanStatus(baseLoan, '2026-05-01')).toBe('open');
  });

  it('splits totals into owe, owed and net', () => {
    const lent = { ...baseLoan, id: 'l2', direction: 'lent' as const, principal: 50_00 };
    const totals = loanTotals([baseLoan, lent]);
    expect(totals).toEqual({ owe: 100_00, owed: 50_00, net: -50_00 });
  });
});

describe('account balance', () => {
  it('applies transactions and loan repayments in the right direction', () => {
    const data: AppData = {
      ...defaultData(),
      accounts: [{ id: 'a1', name: 'Bank', kind: 'bank', openingBalance: 1000_00 }],
      transactions: [
        { id: 't1', type: 'income', amount: 200_00, date: '2026-01-02', categoryId: 'c-salary', accountId: 'a1', note: '' },
        { id: 't2', type: 'expense', amount: 50_00, date: '2026-01-03', categoryId: 'c-food', accountId: 'a1', note: '' },
      ],
      loans: [
        { ...baseLoan, repayments: [{ id: 'r1', amount: 30_00, date: '2026-02-01', accountId: 'a1', note: '' }] },
        { ...baseLoan, id: 'l2', direction: 'lent', repayments: [{ id: 'r2', amount: 20_00, date: '2026-02-01', accountId: 'a1', note: '' }] },
      ],
    };
    // 1000 + 200 - 50 - 30 (repaid a borrowed loan) + 20 (received on a lent loan) = 1140
    expect(accountBalance(data, 'a1')).toBe(1140_00);
  });
});

describe('account transfers', () => {
  it('moves money between accounts without changing totals or monthly income/expense', () => {
    const data: AppData = {
      ...defaultData(),
      accounts: [
        { id: 'cash', name: 'Cash', kind: 'cash', openingBalance: 100_00 },
        { id: 'bank', name: 'SBI', kind: 'bank', openingBalance: 500_00 },
      ],
      transactions: [
        { id: 't1', type: 'income', amount: 200_00, date: '2026-11-01', categoryId: 'c-salary', accountId: 'bank', note: '' },
        { id: 't2', type: 'expense', amount: 50_00, date: '2026-11-02', categoryId: 'c-food', accountId: 'bank', note: '' },
      ],
      transfers: [
        { id: 'tr1', fromAccountId: 'cash', toAccountId: 'bank', amount: 100_00, date: '2026-11-12', note: 'ATM deposit' },
      ],
    };

    // Cash goes to zero, SBI receives the deposit, and the total is unchanged by moving it.
    expect(accountBalance(data, 'cash')).toBe(0);
    expect(accountBalance(data, 'bank')).toBe(750_00);
    expect(totalBalance(data)).toBe(750_00);
    expect(monthTotals(data.transactions, '2026-11')).toEqual({ income: 200_00, expense: 50_00 });
  });
});

describe('recurring rules', () => {
  const rule: RecurringRule = {
    id: 'rr1',
    type: 'expense',
    amount: 10_00,
    categoryId: 'c-bills',
    accountId: null,
    note: 'Subscription',
    frequency: 'monthly',
    startDate: '2026-01-15',
    lastApplied: null,
  };

  it('creates one transaction per due period and does not duplicate on re-run', () => {
    let n = 0;
    const makeId = () => `gen${++n}`;
    const first = applyRecurring([rule], '2026-03-20', makeId);
    expect(first.created.map((t) => t.date)).toEqual(['2026-01-15', '2026-02-15', '2026-03-15']);
    expect(first.rules[0].lastApplied).toBe('2026-03-15');

    const second = applyRecurring(first.rules, '2026-03-20', makeId);
    expect(second.created).toHaveLength(0);
  });

  it('clamps month-end dates', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
  });
});
