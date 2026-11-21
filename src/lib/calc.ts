import { buildActivity } from './activity';
import type { Account, AppData, Favor, Loan, Person, RecurringRule, Transaction } from './types';

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export type LoanStatus = 'open' | 'partial' | 'settled' | 'overdue';

export function repaidAmount(loan: Loan): number {
  return loan.repayments.reduce((sum, r) => sum + r.amount, 0);
}

export function remainingAmount(loan: Loan): number {
  return Math.max(0, loan.principal - repaidAmount(loan));
}

export function loanStatus(loan: Loan, today: string): LoanStatus {
  const remaining = remainingAmount(loan);
  if (remaining === 0) return 'settled';
  if (loan.dueDate && loan.dueDate < today) return 'overdue';
  return repaidAmount(loan) > 0 ? 'partial' : 'open';
}

export interface LoanTotals {
  owe: number; // remaining amount on loans I borrowed
  owed: number; // remaining amount on loans I lent
  net: number; // owed - owe
}

export function loanTotals(loans: Loan[]): LoanTotals {
  let owe = 0;
  let owed = 0;
  for (const loan of loans) {
    const rem = remainingAmount(loan);
    if (loan.direction === 'borrowed') owe += rem;
    else owed += rem;
  }
  return { owe, owed, net: owed - owe };
}

export interface FavorBalance {
  theyCovered: number; // what they paid for me
  iCovered: number; // what I paid for them
  net: number; // theyCovered - iCovered; positive means I still owe them
  settled: boolean; // the two sides cancel out
}

/**
 * One person's favor ledger. Settlement is arithmetic, not a stored flag: once I have paid
 * for them as much as they paid for me, the person reads as settled.
 */
export function favorBalance(favors: Favor[]): FavorBalance {
  let theyCovered = 0;
  let iCovered = 0;
  for (const favor of favors) {
    if (favor.direction === 'theyCovered') theyCovered += favor.amount;
    else iCovered += favor.amount;
  }
  const net = theyCovered - iCovered;
  return { theyCovered, iCovered, net, settled: net === 0 };
}

export interface FavorSummary {
  owe: number; // across the people I still owe
  owed: number; // across the people who still owe me
}

/** Headline figures: a person whose two sides cancel out contributes nothing. */
export function favorSummary(favors: Favor[], people: Person[]): FavorSummary {
  let owe = 0;
  let owed = 0;
  for (const person of people) {
    const { net } = favorBalance(favors.filter((favor) => favor.personId === person.id));
    if (net > 0) owe += net;
    else if (net < 0) owed += -net;
  }
  return { owe, owed };
}

/** Balance of one account: opening balance plus its transactions and loan cash movements. */
export function accountBalance(data: AppData, accountId: string): number {
  const account = data.accounts.find((a) => a.id === accountId);
  if (!account) return 0;
  let balance = account.openingBalance;
  for (const t of data.transactions) {
    if (t.accountId !== accountId) continue;
    balance += t.type === 'income' ? t.amount : -t.amount;
  }
  for (const transfer of data.transfers) {
    if (transfer.fromAccountId === accountId) balance -= transfer.amount;
    if (transfer.toAccountId === accountId) balance += transfer.amount;
  }
  for (const loan of data.loans) {
    for (const r of loan.repayments) {
      if (r.accountId !== accountId) continue;
      // Repaying a borrowed loan moves money out; receiving a repayment of a lent loan moves money in.
      balance += loan.direction === 'borrowed' ? -r.amount : r.amount;
    }
  }
  return balance;
}

export function totalBalance(data: AppData): number {
  return data.accounts.reduce((sum, a) => sum + accountBalance(data, a.id), 0);
}

/** Key for one activity entry in the map returned by balancesAfterEntries(). */
export function balanceKey(kind: 'tx' | 'transfer' | 'repayment', ...ids: string[]): string {
  return `${kind}:${ids.join(':')}`;
}

/** An account and what it held right after one activity entry. */
export interface BalanceAfter {
  accountId: string;
  name: string;
  balance: number;
}

/** Every account still holding money, with its running balance. Zeros are left out. */
function snapshotBalances(accounts: Account[], balances: Map<string, number>): BalanceAfter[] {
  const out: BalanceAfter[] = [];
  for (const account of accounts) {
    const balance = balances.get(account.id) ?? 0;
    if (balance === 0) continue;
    out.push({ accountId: account.id, name: account.name, balance });
  }
  return out;
}

/**
 * Running balance of every account after each activity entry, oldest first. The replay uses
 * the same rules as accountBalance(), so a row shows what that account really held at that
 * point in time rather than what the current sort order would suggest. The chronological
 * order is activity.ts's own, reversed, so a row's figure always matches the feed's order
 * even for legacy records that share a date.
 */
export function balancesAfterEntries(data: AppData): Map<string, BalanceAfter[]> {
  const balances = new Map<string, number>();
  for (const account of data.accounts) balances.set(account.id, account.openingBalance);

  // Every entry, not the dashboard's preview, so each row gets its own figure.
  const { entries } = buildActivity(data, Number.MAX_SAFE_INTEGER);
  const result = new Map<string, BalanceAfter[]>();

  for (let i = entries.length - 1; i >= 0; i -= 1) {
    const entry = entries[i];
    if (entry.kind === 'transaction') {
      const accountId = entry.tx.accountId;
      const current = accountId === null ? undefined : balances.get(accountId);
      if (accountId !== null && current !== undefined) {
        balances.set(accountId, current + (entry.tx.type === 'income' ? entry.tx.amount : -entry.tx.amount));
      }
      result.set(balanceKey('tx', entry.tx.id), snapshotBalances(data.accounts, balances));
      continue;
    }

    if (entry.kind === 'transfer') {
      const { fromAccountId, toAccountId, amount } = entry.transfer;
      const from = balances.get(fromAccountId);
      if (from !== undefined) balances.set(fromAccountId, from - amount);
      const to = balances.get(toAccountId);
      if (to !== undefined) balances.set(toAccountId, to + amount);
      result.set(balanceKey('transfer', entry.transfer.id), snapshotBalances(data.accounts, balances));
      continue;
    }

    const accountId = entry.repayment.accountId;
    const current = accountId === null ? undefined : balances.get(accountId);
    if (accountId !== null && current !== undefined) {
      // Repaying a borrowed loan moves money out; collecting a lent loan moves money in.
      balances.set(accountId, current + (entry.loan.direction === 'borrowed' ? -entry.repayment.amount : entry.repayment.amount));
    }
    result.set(
      balanceKey('repayment', entry.loan.id, entry.repayment.id),
      snapshotBalances(data.accounts, balances),
    );
  }

  return result;
}

export function monthKey(date: string): string {
  return date.slice(0, 7); // YYYY-MM
}

export function sumByType(transactions: Transaction[], type: 'expense' | 'income'): number {
  return transactions.filter((t) => t.type === type).reduce((s, t) => s + t.amount, 0);
}

/** Expense and income totals for a given month key (YYYY-MM). */
export function monthTotals(transactions: Transaction[], month: string) {
  const inMonth = transactions.filter((t) => monthKey(t.date) === month);
  return { income: sumByType(inMonth, 'income'), expense: sumByType(inMonth, 'expense') };
}

/** Last N month keys ending at the given date, oldest first. */
export function lastMonths(today: string, count: number): string[] {
  const [y, m] = today.split('-').map(Number);
  const out: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    out.push(d.toISOString().slice(0, 7));
  }
  return out;
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function addMonths(date: string, months: number): string {
  const [y, m, day] = date.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target.toISOString().slice(0, 10);
}

/**
 * Generate transactions for recurring rules that are due on or before `today`.
 * Returns the new transactions and updated rules. Pure: does not mutate input.
 */
export function applyRecurring(
  rules: RecurringRule[],
  today: string,
): { created: Transaction[]; rules: RecurringRule[] } {
  const created: Transaction[] = [];
  const updated = rules.map((rule) => {
    // A malformed date used to reach addMonths() and throw, white-screening the app on every
    // launch. Skip such a rule rather than letting one bad record break startup.
    const dateOk = (value: string | null) => value === null || ISO_DATE_RE.test(value);
    if (!ISO_DATE_RE.test(rule.startDate) || !dateOk(rule.lastApplied)) return rule;

    let next = rule.lastApplied
      ? rule.frequency === 'weekly'
        ? addDays(rule.lastApplied, 7)
        : addMonths(rule.lastApplied, 1)
      : rule.startDate;
    let last = rule.lastApplied;
    while (next <= today) {
      created.push({
        // Derived from the rule and due date: every device generates the same id for the
        // same occurrence, so a reload or a second device cannot duplicate it.
        id: `rec-${rule.id}-${next}`,
        type: rule.type,
        amount: rule.amount,
        date: next,
        categoryId: rule.categoryId,
        accountId: rule.accountId,
        note: rule.note,
        recurringId: rule.id,
      });
      last = next;
      next = rule.frequency === 'weekly' ? addDays(next, 7) : addMonths(next, 1);
    }
    return { ...rule, lastApplied: last };
  });
  return { created, rules: updated };
}
