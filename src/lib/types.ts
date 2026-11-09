// All money amounts are integer minor units (cents).

export type TxType = 'expense' | 'income';
/** Expense categories fall into one of three groups. */
export type CategoryGroup = 'need' | 'want' | 'investment';
export type LoanDirection = 'borrowed' | 'lent'; // borrowed = I owe, lent = owed to me
export type RecurringFrequency = 'weekly' | 'monthly';

export interface Account {
  id: string;
  name: string;
  kind: 'cash' | 'bank' | 'card' | 'other';
  openingBalance: number;
}

export interface Category {
  id: string;
  name: string;
  type: TxType;
  /** Expense categories only: needs, wants (expenses) or investments. */
  group?: CategoryGroup;
  monthlyBudget: number | null; // only meaningful for needs/expenses
}

export interface Transaction {
  id: string;
  type: TxType;
  amount: number;
  date: string; // YYYY-MM-DD
  categoryId: string;
  accountId: string | null;
  note: string;
  recurringId?: string;
}

export interface Repayment {
  id: string;
  amount: number;
  date: string;
  accountId: string | null;
  note: string;
}

export interface Loan {
  id: string;
  counterparty: string;
  direction: LoanDirection;
  principal: number;
  date: string;
  dueDate: string | null;
  note: string;
  accountId: string | null;
  repayments: Repayment[];
}

export interface RecurringRule {
  id: string;
  type: TxType;
  amount: number;
  categoryId: string;
  accountId: string | null;
  note: string;
  frequency: RecurringFrequency;
  startDate: string; // YYYY-MM-DD
  lastApplied: string | null; // date of the last generated transaction
}

export interface Settings {
  currency: string;
  firstDayOfWeek: 0 | 1; // 0 = Sunday, 1 = Monday
}

export interface AppData {
  version: number;
  settings: Settings;
  accounts: Account[];
  categories: Category[];
  transactions: Transaction[];
  loans: Loan[];
  recurring: RecurringRule[];
}
