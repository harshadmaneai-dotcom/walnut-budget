import { describe, expect, it } from 'vitest';
import { defaultData } from './storage';
import type { AppData, Asset } from './types';
import {
  allAssetLinkedEntries,
  assetCapitalTotal,
  assetLinkedEntries,
  assetMonthTotals,
  assetOverview,
  assetStatus,
  milestoneProgress,
} from './assets';

const stream: Asset = {
  id: 'a-stream',
  name: 'Commissions',
  kind: 'stream',
  effort: 'active',
  stage: 'operating',
  paused: false,
  startedOn: '2026-03-01',
  monthlyTarget: 250_000,
  capitalTarget: 300_000,
  milestones: [
    { id: 'm1', text: 'Launch page', dueDate: '2026-04-10', done: true },
    { id: 'm2', text: 'Land two clients', dueDate: '2026-12-15', done: false },
    { id: 'm3', text: 'Reach target', dueDate: null, done: false },
  ],
  notes: '',
};

const goal: Asset = {
  id: 'a-goal',
  name: 'Property fund',
  kind: 'goal',
  stage: 'building',
  paused: false,
  startedOn: '2026-01-10',
  monthlyTarget: null,
  capitalTarget: 1_000_000,
  milestones: [],
  notes: '',
};

function sample(): AppData {
  return {
    ...defaultData(),
    accounts: [
      { id: 'a-cash', name: 'Cash', kind: 'cash', openingBalance: 0 },
      { id: 'a-fund', name: 'Property fund', kind: 'bank', openingBalance: 0 },
    ],
    assets: [stream, goal],
    transactions: [
      {
        id: 'income-1',
        type: 'income',
        amount: 100_00,
        date: '2026-11-05',
        categoryId: 'c-freelance',
        accountId: 'a-cash',
        note: 'Commission',
        assetId: 'a-stream',
      },
      {
        id: 'expense-1',
        type: 'expense',
        amount: 20_00,
        date: '2026-11-06',
        categoryId: 'c-other-exp',
        accountId: 'a-cash',
        note: 'Travel',
        assetId: 'a-stream',
      },
      {
        id: 'capital-1',
        type: 'expense',
        amount: 50_00,
        date: '2026-11-07',
        categoryId: 'c-invest',
        accountId: 'a-cash',
        note: 'Capital',
        assetId: 'a-stream',
        assetRole: 'capital',
      },
      {
        id: 'capital-old',
        type: 'expense',
        amount: 10_00,
        date: '2026-10-07',
        categoryId: 'c-invest',
        accountId: 'a-cash',
        note: 'Older capital',
        assetId: 'a-stream',
        assetRole: 'capital',
      },
      {
        id: 'unlinked',
        type: 'expense',
        amount: 3_00,
        date: '2026-11-08',
        categoryId: 'c-food',
        accountId: 'a-cash',
        note: 'Not an asset',
      },
    ],
    transfers: [
      {
        id: 'transfer-1',
        fromAccountId: 'a-cash',
        toAccountId: 'a-fund',
        amount: 40_00,
        date: '2026-11-09',
        note: 'November fund',
        assetId: 'a-stream',
      },
    ],
  };
}

describe('assetMonthTotals', () => {
  it('counts linked income and operating expenses, excluding capital', () => {
    expect(assetMonthTotals(sample(), 'a-stream', '2026-11')).toEqual({
      income: 100_00,
      expenses: 20_00,
      capital: 90_00,
      net: 80_00,
    });
  });

  it('ignores other assets and other months', () => {
    const totals = assetMonthTotals(sample(), 'a-stream', '2026-10');
    expect(totals.income).toBe(0);
    expect(totals.capital).toBe(10_00);
    expect(totals.net).toBe(0);
  });
});

describe('assetCapitalTotal', () => {
  it('adds every capital expense and linked transfer across months', () => {
    expect(assetCapitalTotal(sample(), 'a-stream')).toBe(100_00);
    expect(assetCapitalTotal(sample(), 'a-goal')).toBe(0);
  });
});

describe('assetOverview', () => {
  it('sums the selected month across assets and leaves capital separate', () => {
    expect(assetOverview(sample(), '2026-11')).toEqual({
      income: 100_00,
      expenses: 20_00,
      capital: 90_00,
      net: 80_00,
    });
  });
});

describe('milestones', () => {
  it('finds the first unfinished step and reports progress', () => {
    const progress = milestoneProgress(stream);
    expect(progress.total).toBe(3);
    expect(progress.done).toBe(1);
    expect(progress.nextIndex).toBe(1);
    expect(progress.next?.text).toBe('Land two clients');
  });

  it('reports all complete when every step is done', () => {
    const done = {
      ...stream,
      milestones: stream.milestones.map((milestone) => ({ ...milestone, done: true })),
    };
    expect(milestoneProgress(done).next).toBeNull();
    expect(milestoneProgress(done).done).toBe(3);
  });
});

describe('assetStatus', () => {
  it('paused wins over the stage', () => {
    expect(assetStatus({ ...stream, paused: true })).toEqual({ label: 'Paused', tone: 'paused' });
    expect(assetStatus(stream)).toEqual({ label: 'Operating', tone: 'up' });
    expect(assetStatus(goal)).toEqual({ label: 'Building', tone: 'warn' });
  });
});

describe('linked rows', () => {
  it('returns the selected month with roles and asset names', () => {
    const rows = allAssetLinkedEntries(sample(), '2026-11');
    expect(rows.map((row) => row.key)).toEqual([
      'transfer:transfer-1',
      'tx:capital-1',
      'tx:expense-1',
      'tx:income-1',
    ]);
    expect(rows.find((row) => row.key === 'transfer:transfer-1')?.role).toBe('capital');
    expect(rows.find((row) => row.key === 'tx:capital-1')?.role).toBe('capital');
    expect(rows.find((row) => row.key === 'tx:income-1')?.assetName).toBe('Commissions');
    expect(rows.some((row) => row.key === 'tx:unlinked')).toBe(false);
  });

  it('filters one asset without losing its linked entries', () => {
    const rows = assetLinkedEntries(sample(), stream, '2026-11');
    expect(rows).toHaveLength(4);
    expect(rows.every((row) => row.assetId === 'a-stream')).toBe(true);
  });
});
