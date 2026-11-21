import type { AppData, Asset, AssetMilestone, Transaction, Transfer } from './types';

export const ASSET_KIND_LABEL = {
  stream: 'Income stream',
  goal: 'Ownership goal',
} as const;

export const ASSET_STAGE_LABEL = {
  planning: 'Planning',
  building: 'Building',
  operating: 'Operating',
} as const;

export const ASSET_EFFORT_LABEL = {
  active: 'Active work',
  hybrid: 'Hybrid',
  passive: 'Mostly passive',
} as const;

export const ASSET_ROLE_LABEL = {
  income: 'Income',
  expense: 'Operating expense',
  capital: 'Contribution',
} as const;

export type AssetEntryRole = 'income' | 'expense' | 'capital';

export interface AssetMonthTotals {
  income: number;
  expenses: number;
  capital: number;
  net: number;
}

function isInMonth(date: string, month: string): boolean {
  return date.startsWith(month);
}

/** The selected month's operating cash flow and contributions for one asset. */
export function assetMonthTotals(data: AppData, assetId: string, month: string): AssetMonthTotals {
  let income = 0;
  let expenses = 0;
  let capital = 0;

  for (const tx of data.transactions) {
    if (tx.assetId !== assetId || !isInMonth(tx.date, month)) continue;
    if (tx.type === 'income') {
      income += tx.amount;
      continue;
    }
    if (tx.assetRole === 'capital') capital += tx.amount;
    else expenses += tx.amount;
  }

  for (const transfer of data.transfers) {
    if (transfer.assetId === assetId && isInMonth(transfer.date, month)) {
      capital += transfer.amount;
    }
  }

  return { income, expenses, capital, net: income - expenses };
}

/** Every contribution ever linked, across months, plus transfers into the asset's fund. */
export function assetCapitalTotal(data: AppData, assetId: string): number {
  let total = 0;
  for (const tx of data.transactions) {
    if (tx.assetId === assetId && tx.type === 'expense' && tx.assetRole === 'capital') {
      total += tx.amount;
    }
  }
  for (const transfer of data.transfers) {
    if (transfer.assetId === assetId) total += transfer.amount;
  }
  return total;
}

/** Headline figures for the selected month, which are the sum of the asset cards. */
export function assetOverview(data: AppData, month: string): AssetMonthTotals {
  let income = 0;
  let expenses = 0;
  let capital = 0;
  for (const asset of data.assets) {
    const totals = assetMonthTotals(data, asset.id, month);
    income += totals.income;
    expenses += totals.expenses;
    capital += totals.capital;
  }
  return { income, expenses, capital, net: income - expenses };
}

export interface MilestoneProgress {
  list: AssetMilestone[];
  total: number;
  done: number;
  nextIndex: number;
  next: AssetMilestone | null;
}

export function milestoneProgress(asset: Asset): MilestoneProgress {
  const list = asset.milestones ?? [];
  const done = list.filter((item) => item.done).length;
  const nextIndex = list.findIndex((item) => !item.done);
  return {
    list,
    total: list.length,
    done,
    nextIndex: nextIndex === -1 ? list.length : nextIndex,
    next: nextIndex === -1 ? null : list[nextIndex],
  };
}

export type AssetStatusTone = 'up' | 'warn' | 'paused' | 'planning';

/** Paused wins over the stage, the same way the card and detail badge read. */
export function assetStatus(asset: Asset): { label: string; tone: AssetStatusTone } {
  if (asset.paused) return { label: 'Paused', tone: 'paused' };
  if (asset.stage === 'building') return { label: ASSET_STAGE_LABEL.building, tone: 'warn' };
  if (asset.stage === 'operating') return { label: ASSET_STAGE_LABEL.operating, tone: 'up' };
  return { label: ASSET_STAGE_LABEL.planning, tone: 'planning' };
}

function transactionRole(tx: Transaction): AssetEntryRole {
  if (tx.type === 'income') return 'income';
  return tx.assetRole === 'capital' ? 'capital' : 'expense';
}

export interface AssetLinkedRow {
  key: string;
  kind: 'transaction' | 'transfer';
  id: string;
  date: string;
  title: string;
  meta: string;
  role: AssetEntryRole;
  amount: number;
  assetId: string;
  assetName?: string;
}

function transactionRow(
  data: AppData,
  tx: Transaction,
  asset: Asset,
): AssetLinkedRow {
  const category = data.categories.find((item) => item.id === tx.categoryId);
  const account = data.accounts.find((item) => item.id === tx.accountId);
  const role = transactionRole(tx);
  return {
    key: `tx:${tx.id}`,
    kind: 'transaction',
    id: tx.id,
    date: tx.date,
    title: tx.note.trim() || category?.name || ASSET_ROLE_LABEL[role],
    meta: [category?.name, account?.name].filter(Boolean).join(' · '),
    role,
    amount: tx.amount,
    assetId: asset.id,
    assetName: asset.name,
  };
}

function transferRow(data: AppData, transfer: Transfer, asset: Asset): AssetLinkedRow {
  const from = data.accounts.find((item) => item.id === transfer.fromAccountId)?.name ?? 'Account';
  const to = data.accounts.find((item) => item.id === transfer.toAccountId)?.name ?? 'Account';
  return {
    key: `transfer:${transfer.id}`,
    kind: 'transfer',
    id: transfer.id,
    date: transfer.date,
    title: transfer.note.trim() || `${from} → ${to}`,
    meta: 'Transfer · capital',
    role: 'capital',
    amount: transfer.amount,
    assetId: asset.id,
    assetName: asset.name,
  };
}

function newestFirst(a: AssetLinkedRow, b: AssetLinkedRow): number {
  if (a.date !== b.date) return b.date.localeCompare(a.date);
  return b.key.localeCompare(a.key);
}

/** One asset's linked rows for the selected month, newest first. */
export function assetLinkedEntries(data: AppData, asset: Asset, month: string): AssetLinkedRow[] {
  const rows: AssetLinkedRow[] = [];
  for (const tx of data.transactions) {
    if (tx.assetId === asset.id && isInMonth(tx.date, month)) rows.push(transactionRow(data, tx, asset));
  }
  for (const transfer of data.transfers) {
    if (transfer.assetId === asset.id && isInMonth(transfer.date, month)) {
      rows.push(transferRow(data, transfer, asset));
    }
  }
  return rows.sort(newestFirst);
}

/** Every asset's linked rows for the selected month, newest first. */
export function allAssetLinkedEntries(data: AppData, month: string): AssetLinkedRow[] {
  const rows: AssetLinkedRow[] = [];
  for (const asset of data.assets) rows.push(...assetLinkedEntries(data, asset, month));
  return rows.sort(newestFirst);
}
