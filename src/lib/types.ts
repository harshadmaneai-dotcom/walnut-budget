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
  /** When the record was added. Optional on documents saved before activity ordering used it. */
  createdAt?: string;
  /** An asset this entry is summarised under. The transaction remains the only record. */
  assetId?: string;
  /** A capital contribution recorded as an Investments expense, kept out of asset operating net. */
  assetRole?: 'capital';
  /**
   * How the entry was captured. Absent on everything typed by hand, so documents saved before
   * auto-tracking existed stay valid without a migration.
   */
  source?: 'auto_upi';
  /** Which app posted the payment notification: gpay, phonepe, paytm, bhim, amazonpay. */
  sourceApp?: string;
  /** Auto-detected entries wait here until the user confirms or discards them. */
  reviewStatus?: 'needs_review' | 'confirmed';
  /** ISO timestamp of the notification, kept so review can show when the payment happened. */
  detectedAt?: string;
  /** Identity of the notification this came from: the dedupe key, and what a discard remembers. */
  upiKey?: string;
}

export interface Transfer {
  id: string;
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  date: string; // YYYY-MM-DD
  note: string;
  /** When the record was added. Optional on documents saved before activity ordering used it. */
  createdAt?: string;
  /** A transfer to a goal fund; it counts as capital for this asset. */
  assetId?: string;
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

/** Someone you swap favors with, kept as a reusable entry in the picker. */
export interface Person {
  id: string;
  name: string;
}

/** Who spent the money on a favor: they covered my bill, or I covered theirs. */
export type FavorDirection = 'theyCovered' | 'iCovered';

/**
 * One entry in a person's favor ledger, like a repayment on a loan. Favors are tracked only:
 * no cash left or entered an account, so they never change an account balance. Whether the
 * two sides balance is worked out from the amounts, not stored as a flag.
 */
export interface Favor {
  id: string;
  personId: string;
  amount: number;
  date: string; // YYYY-MM-DD
  note: string;
  direction: FavorDirection;
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
  /** Account auto-detected UPI payments are added to; null uses the first account. */
  upiAccountId?: string | null;
}

/** Something being built for income, or something intended to be owned. */
export type AssetKind = 'stream' | 'goal';
/** Operating does not mean finished; it means the asset is running. */
export type AssetStage = 'planning' | 'building' | 'operating';
export type AssetEffort = 'active' | 'hybrid' | 'passive';

export interface AssetMilestone {
  id: string;
  text: string;
  dueDate: string | null;
  done: boolean;
}

/**
 * A goal and the cash flow linked to it. The asset owns no money of its own: entries point
 * back at ordinary Walnut transactions and transfers, so nothing is duplicated.
 */
export interface Asset {
  id: string;
  name: string;
  kind: AssetKind;
  effort?: AssetEffort;
  stage: AssetStage;
  paused: boolean;
  /** YYYY-MM-DD */
  startedOn: string;
  /** Integer cents per month; a target, never a forecast. */
  monthlyTarget: number | null;
  /** Integer cents. */
  capitalTarget: number | null;
  milestones: AssetMilestone[];
  notes: string;
}

export interface AppData {
  version: number;
  settings: Settings;
  accounts: Account[];
  categories: Category[];
  transactions: Transaction[];
  transfers: Transfer[];
  loans: Loan[];
  favors: Favor[];
  favorPeople: Person[];
  recurring: RecurringRule[];
  assets: Asset[];
  /**
   * Detections the user discarded. A re-posted notification must not recreate one, and the
   * transaction itself is gone, so the key has to outlive it. Oldest entries fall off the cap.
   */
  upiIgnored?: string[];
}
