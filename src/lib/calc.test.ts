import { describe, expect, it } from 'vitest';
import {
  accountBalance,
  addMonths,
  applyRecurring,
  balanceKey,
  balancesAfterEntries,
  favorBalance,
  favorSummary,
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
    const first = applyRecurring([rule], '2026-03-20');
    expect(first.created.map((t) => t.date)).toEqual(['2026-01-15', '2026-02-15', '2026-03-15']);
    expect(first.created.map((t) => t.id)).toEqual([
      'rec-rr1-2026-01-15',
      'rec-rr1-2026-02-15',
      'rec-rr1-2026-03-15',
    ]);
    expect(first.rules[0].lastApplied).toBe('2026-03-15');

    const second = applyRecurring(first.rules, '2026-03-20');
    expect(second.created).toHaveLength(0);
  });

  it('generates the same ids for the same due dates on another device', () => {
    const first = applyRecurring([rule], '2026-02-20');
    const second = applyRecurring([{ ...rule }], '2026-02-20');
    expect(second.created.map((t) => t.id)).toEqual(first.created.map((t) => t.id));
  });

  it('clamps month-end dates', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
  });
});

describe('balances after each entry', () => {
  it('carries every account forward from its opening balance and hides the empty ones', () => {
    const data: AppData = {
      ...defaultData(),
      accounts: [
        { id: 'cash', name: 'Cash', kind: 'cash', openingBalance: 500_00 },
        { id: 'bank', name: 'Bank', kind: 'bank', openingBalance: 0 },
      ],
      transactions: [
        { id: 't1', type: 'expense', amount: 200_00, date: '2026-11-01', categoryId: 'c-food', accountId: 'cash', note: '' },
        { id: 't2', type: 'income', amount: 1_000_00, date: '2026-11-02', categoryId: 'c-salary', accountId: 'bank', note: '' },
      ],
    };

    const after = balancesAfterEntries(data);
    // The bank still holds nothing after the first entry, so only cash is listed.
    expect(after.get(balanceKey('tx', 't1'))).toEqual([
      { accountId: 'cash', name: 'Cash', balance: 300_00 },
    ]);
    expect(after.get(balanceKey('tx', 't2'))).toEqual([
      { accountId: 'cash', name: 'Cash', balance: 300_00 },
      { accountId: 'bank', name: 'Bank', balance: 1_000_00 },
    ]);
  });

  it('moves money on a transfer and applies repayments in the right direction', () => {
    const data: AppData = {
      ...defaultData(),
      accounts: [
        { id: 'cash', name: 'Cash', kind: 'cash', openingBalance: 100_00 },
        { id: 'bank', name: 'Bank', kind: 'bank', openingBalance: 900_00 },
      ],
      transfers: [
        { id: 'tr1', fromAccountId: 'cash', toAccountId: 'bank', amount: 100_00, date: '2026-11-01', note: '' },
      ],
      loans: [
        { ...baseLoan, id: 'l1', repayments: [{ id: 'r1', amount: 30_00, date: '2026-11-02', accountId: 'bank', note: '' }] },
        { ...baseLoan, id: 'l2', direction: 'lent', repayments: [{ id: 'r2', amount: 20_00, date: '2026-11-03', accountId: 'bank', note: '' }] },
      ],
    };

    const after = balancesAfterEntries(data);
    // Cash hits zero in the transfer, so only the bank is left from that point on.
    expect(after.get(balanceKey('transfer', 'tr1'))).toEqual([
      { accountId: 'bank', name: 'Bank', balance: 1_000_00 },
    ]);
    expect(after.get(balanceKey('repayment', 'l1', 'r1'))).toEqual([
      { accountId: 'bank', name: 'Bank', balance: 970_00 },
    ]);
    expect(after.get(balanceKey('repayment', 'l2', 'r2'))).toEqual([
      { accountId: 'bank', name: 'Bank', balance: 990_00 },
    ]);
  });

  it('reports the balance at that point in time whatever order the ledger is sorted by', () => {
    const data: AppData = {
      ...defaultData(),
      accounts: [{ id: 'cash', name: 'Cash', kind: 'cash', openingBalance: 0 }],
      transactions: [
        { id: 'big', type: 'income', amount: 900_00, date: '2026-11-01', categoryId: 'c-salary', accountId: 'cash', note: '' },
        { id: 'small', type: 'expense', amount: 100_00, date: '2026-11-02', categoryId: 'c-food', accountId: 'cash', note: '' },
      ],
    };

    const after = balancesAfterEntries(data);
    expect(after.get(balanceKey('tx', 'small'))).toEqual([
      { accountId: 'cash', name: 'Cash', balance: 800_00 },
    ]);
  });
});

describe('favors', () => {
  const sam = { id: 'p-sam', name: 'Sam' };
  const riya = { id: 'p-riya', name: 'Riya' };
  const entries = [
    { id: 'f1', personId: 'p-sam', amount: 100_00, date: '2026-11-01', note: '', direction: 'theyCovered' as const },
    { id: 'f2', personId: 'p-sam', amount: 40_00, date: '2026-11-02', note: '', direction: 'iCovered' as const },
    { id: 'f3', personId: 'p-riya', amount: 25_00, date: '2026-11-03', note: '', direction: 'theyCovered' as const },
  ];

  it('subtracts what I covered from what they covered', () => {
    expect(favorBalance(entries.filter((entry) => entry.personId === 'p-sam'))).toEqual({
      theyCovered: 100_00,
      iCovered: 40_00,
      net: 60_00,
      settled: false,
    });
  });

  it('counts as settled when both sides are equal, and flips once I pay more', () => {
    const paidBack = [
      ...entries.filter((entry) => entry.personId === 'p-sam'),
      { id: 'f4', personId: 'p-sam', amount: 60_00, date: '2026-11-04', note: '', direction: 'iCovered' as const },
    ];
    expect(favorBalance(paidBack)).toEqual({ theyCovered: 100_00, iCovered: 100_00, net: 0, settled: true });

    const overpaid = [
      ...paidBack,
      { id: 'f5', personId: 'p-sam', amount: 10_00, date: '2026-11-05', note: '', direction: 'iCovered' as const },
    ];
    expect(favorBalance(overpaid).net).toBe(-10_00);
  });

  it('sums only the people whose two sides do not cancel out', () => {
    // Sam is 100 - 40 = 60 down, Riya is 25 down, so 85 is still owed in total.
    expect(favorSummary(entries, [sam, riya])).toEqual({ owe: 85_00, owed: 0 });

    // Paying Sam the 60 that was left leaves only Riya outstanding.
    const settledSam = [
      ...entries,
      { id: 'f4', personId: 'p-sam', amount: 60_00, date: '2026-11-04', note: '', direction: 'iCovered' as const },
    ];
    expect(favorSummary(settledSam, [sam, riya])).toEqual({ owe: 25_00, owed: 0 });
  });
});
