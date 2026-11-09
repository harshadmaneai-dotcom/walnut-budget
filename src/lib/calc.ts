import type { AppData, Loan, RecurringRule, Transaction } from './types';

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

/** Balance of one account: opening balance plus its transactions and loan cash movements. */
export function accountBalance(data: AppData, accountId: string): number {
  const account = data.accounts.find((a) => a.id === accountId);
  if (!account) return 0;
  let balance = account.openingBalance;
  for (const t of data.transactions) {
    if (t.accountId !== accountId) continue;
    balance += t.type === 'income' ? t.amount : -t.amount;
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
  makeId: () => string,
): { created: Transaction[]; rules: RecurringRule[] } {
  const created: Transaction[] = [];
  const updated = rules.map((rule) => {
    let next = rule.lastApplied
      ? rule.frequency === 'weekly'
        ? addDays(rule.lastApplied, 7)
        : addMonths(rule.lastApplied, 1)
      : rule.startDate;
    let last = rule.lastApplied;
    while (next <= today) {
      created.push({
        id: makeId(),
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
