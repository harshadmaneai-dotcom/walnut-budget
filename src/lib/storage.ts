import type {
  Account,
  AppData,
  Category,
  CategoryGroup,
  Loan,
  RecurringRule,
  Repayment,
  Transaction,
  Transfer,
} from './types';
import { DEFAULT_CURRENCY } from './format';

/** Local cache is namespaced per account, so two people on one device never share a document. */
export const STORAGE_PREFIX = 'walnut:data';
/** Pre-multi-user cache. Imported once into the first account signed in on this device. */
export const LEGACY_STORAGE_KEY = 'budget-tracker:data';
export const LEGACY_CLAIM_KEY = 'walnut:legacy-claimed';

export const DATA_VERSION = 3;
export const INVESTMENT_CATEGORY_ID = 'c-invest';

export const DEFAULT_CATEGORIES: Category[] = [
  { id: 'c-food', name: 'Food', type: 'expense', group: 'need', monthlyBudget: 500_00 },
  { id: 'c-rent', name: 'Rent', type: 'expense', group: 'need', monthlyBudget: 1200_00 },
  { id: 'c-transport', name: 'Transport', type: 'expense', group: 'need', monthlyBudget: 150_00 },
  { id: 'c-bills', name: 'Bills', type: 'expense', group: 'need', monthlyBudget: 300_00 },
  { id: 'c-shopping', name: 'Shopping', type: 'expense', group: 'want', monthlyBudget: 200_00 },
  { id: 'c-fun', name: 'Entertainment', type: 'expense', group: 'want', monthlyBudget: null },
  { id: 'c-other-exp', name: 'Other', type: 'expense', group: 'need', monthlyBudget: null },
  { id: INVESTMENT_CATEGORY_ID, name: 'Investments', type: 'expense', group: 'investment', monthlyBudget: null },
  { id: 'c-salary', name: 'Salary', type: 'income', monthlyBudget: null },
  { id: 'c-freelance', name: 'Freelance', type: 'income', monthlyBudget: null },
  { id: 'c-refund', name: 'Refund', type: 'income', monthlyBudget: null },
  { id: 'c-gift', name: 'Gift', type: 'income', monthlyBudget: null },
  { id: 'c-other-inc', name: 'Other', type: 'income', monthlyBudget: null },
];

export function defaultData(): AppData {
  return {
    version: DATA_VERSION,
    settings: { currency: DEFAULT_CURRENCY, firstDayOfWeek: 1 },
    accounts: [{ id: 'a-cash', name: 'Cash', kind: 'cash', openingBalance: 0 }],
    categories: DEFAULT_CATEGORIES,
    transactions: [],
    transfers: [],
    loans: [],
    recurring: [],
  };
}

const CURRENCY_RE = /^[A-Za-z]{3}$/;

function normalizeCurrency(value: unknown): string {
  return typeof value === 'string' && CURRENCY_RE.test(value)
    ? value.toUpperCase()
    : DEFAULT_CURRENCY;
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** True for a real calendar date in the YYYY-MM-DD form the app stores everywhere. */
export function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !ISO_DATE_RE.test(value)) return false;
  // Date.parse rolls 2026-02-29 over to March instead of rejecting it, so compare the
  // components back: that is the only way to tell a real day from an overflow.
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asText(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

/** Amounts are integer cents, so a stray string or NaN becomes 0 instead of poisoning totals. */
function asCents(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : 0;
}

function asOptionalId(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null;
}

const ACCOUNT_KINDS: Account['kind'][] = ['cash', 'bank', 'card', 'other'];
const CATEGORY_GROUPS: CategoryGroup[] = ['need', 'want', 'investment'];

function normalizeAccounts(value: unknown): Account[] {
  const accounts: Account[] = [];
  for (const entry of asArray(value)) {
    const record = asRecord(entry);
    if (!record || typeof record.id !== 'string' || !record.id) continue;
    accounts.push({
      id: record.id,
      name: asText(record.name, 'Account'),
      kind: ACCOUNT_KINDS.includes(record.kind as Account['kind'])
        ? (record.kind as Account['kind'])
        : 'other',
      openingBalance: asCents(record.openingBalance),
    });
  }
  return accounts;
}

function normalizeCategories(value: unknown): Category[] {
  const categories: Category[] = [];
  for (const entry of asArray(value)) {
    const record = asRecord(entry);
    if (!record || typeof record.id !== 'string' || !record.id) continue;
    const type = record.type === 'income' ? 'income' : 'expense';
    categories.push({
      id: record.id,
      name: asText(record.name, 'Category'),
      type,
      group:
        type === 'expense' && CATEGORY_GROUPS.includes(record.group as CategoryGroup)
          ? (record.group as CategoryGroup)
          : undefined,
      monthlyBudget:
        typeof record.monthlyBudget === 'number' && Number.isFinite(record.monthlyBudget)
          ? Math.round(record.monthlyBudget)
          : null,
    });
  }
  return categories;
}

function normalizeTransactions(value: unknown): Transaction[] {
  const transactions: Transaction[] = [];
  for (const entry of asArray(value)) {
    const record = asRecord(entry);
    if (!record || typeof record.id !== 'string' || !record.id) continue;
    transactions.push({
      id: record.id,
      type: record.type === 'income' ? 'income' : 'expense',
      amount: asCents(record.amount),
      date: asText(record.date),
      categoryId: asText(record.categoryId),
      accountId: asOptionalId(record.accountId),
      note: asText(record.note),
      recurringId: asText(record.recurringId) || undefined,
    });
  }
  return transactions;
}

function normalizeTransfers(value: unknown): Transfer[] {
  const transfers: Transfer[] = [];
  for (const entry of asArray(value)) {
    const record = asRecord(entry);
    if (!record || typeof record.id !== 'string' || !record.id) continue;
    const fromAccountId = asOptionalId(record.fromAccountId);
    const toAccountId = asOptionalId(record.toAccountId);
    // A transfer needs both ends and they must be different accounts.
    if (!fromAccountId || !toAccountId || fromAccountId === toAccountId) continue;
    transfers.push({
      id: record.id,
      fromAccountId,
      toAccountId,
      amount: asCents(record.amount),
      date: asText(record.date),
      note: asText(record.note),
    });
  }
  return transfers;
}

function normalizeRepayments(value: unknown): Repayment[] {
  const repayments: Repayment[] = [];
  for (const entry of asArray(value)) {
    const record = asRecord(entry);
    if (!record || typeof record.id !== 'string' || !record.id) continue;
    repayments.push({
      id: record.id,
      amount: asCents(record.amount),
      date: asText(record.date),
      accountId: asOptionalId(record.accountId),
      note: asText(record.note),
    });
  }
  return repayments;
}

function normalizeLoans(value: unknown): Loan[] {
  const loans: Loan[] = [];
  for (const entry of asArray(value)) {
    const record = asRecord(entry);
    if (!record || typeof record.id !== 'string' || !record.id) continue;
    loans.push({
      id: record.id,
      counterparty: asText(record.counterparty, 'Someone'),
      direction: record.direction === 'lent' ? 'lent' : 'borrowed',
      principal: asCents(record.principal),
      date: asText(record.date),
      dueDate: isIsoDate(record.dueDate) ? record.dueDate : null,
      note: asText(record.note),
      accountId: asOptionalId(record.accountId),
      repayments: normalizeRepayments(record.repayments),
    });
  }
  return loans;
}

function normalizeRecurring(value: unknown): RecurringRule[] {
  const rules: RecurringRule[] = [];
  for (const entry of asArray(value)) {
    const record = asRecord(entry);
    if (!record || typeof record.id !== 'string' || !record.id) continue;
    // A rule without a real start date cannot be scheduled, and it used to crash the app
    // on open. Dropping it is the only safe repair.
    if (!isIsoDate(record.startDate)) continue;
    rules.push({
      id: record.id,
      type: record.type === 'income' ? 'income' : 'expense',
      amount: asCents(record.amount),
      categoryId: asText(record.categoryId),
      accountId: asOptionalId(record.accountId),
      note: asText(record.note),
      frequency: record.frequency === 'weekly' ? 'weekly' : 'monthly',
      startDate: record.startDate,
      lastApplied: isIsoDate(record.lastApplied) ? record.lastApplied : null,
    });
  }
  return rules;
}

/** Groups introduced in version 2, applied to categories saved before groups existed. */
const LEGACY_GROUPS: Record<string, CategoryGroup> = {
  'c-shopping': 'want',
  'c-fun': 'want',
  'c-invest': 'investment',
};

function migrateCategories(categories: Category[]): Category[] {
  const withGroups = categories.map((c) => {
    if (c.type === 'income' || c.group) return c;
    return { ...c, group: LEGACY_GROUPS[c.id] ?? 'need' };
  });
  const hasInvestments = withGroups.some((c) => c.type === 'expense' && c.group === 'investment');
  if (hasInvestments) return withGroups;
  const bucket = DEFAULT_CATEGORIES.find((c) => c.group === 'investment')!;
  return [...withGroups, { ...bucket }];
}

/** Fill in missing fields and repair invalid values (e.g. a half-typed currency code). */
/**
 * Repairs a stored, imported or remote document. Everything here arrives from outside the
 * app's control (localStorage can be edited, backups are user files), so each section is
 * validated instead of trusted: a bad value must degrade, never crash the app on launch.
 */
export function normalizeData(data: AppData): AppData {
  const source = asRecord(data) ?? {};
  const settings = asRecord(source.settings) ?? {};
  const accounts = normalizeAccounts(source.accounts);
  const categories = normalizeCategories(source.categories);
  const fallback = defaultData();

  return {
    version: DATA_VERSION,
    settings: {
      currency: normalizeCurrency(settings.currency),
      firstDayOfWeek: settings.firstDayOfWeek === 0 ? 0 : 1,
    },
    // The app is unusable without at least one account and one category.
    accounts: accounts.length ? accounts : fallback.accounts,
    categories: migrateCategories(categories.length ? categories : fallback.categories),
    transactions: normalizeTransactions(source.transactions),
    transfers: normalizeTransfers(source.transfers),
    loans: normalizeLoans(source.loans),
    recurring: normalizeRecurring(source.recurring),
  };
}

/** Parse stored JSON, migrating older versions. Falls back to defaults on bad data. */
export function parseData(raw: string | null): AppData {
  if (!raw) return defaultData();
  try {
    const parsed = JSON.parse(raw) as Partial<AppData>;
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.transactions)) {
      return defaultData();
    }
    // Future migrations go here, keyed on parsed.version.
    return normalizeData(parsed as AppData);
  } catch {
    return defaultData();
  }
}

function keyFor(userId: string): string {
  return `${STORAGE_PREFIX}:${userId}`;
}

/** True for a document with nothing of its own, so the old single-user cache may replace it. */
export function isBlankData(data: AppData): boolean {
  return (
    data.transactions.length === 0 &&
    data.transfers.length === 0 &&
    data.loans.length === 0 &&
    data.recurring.length === 0 &&
    data.accounts.every((a) => a.openingBalance === 0)
  );
}

/**
 * Cached document for this account, plus the unclaimed pre-multi-user cache (if any).
 * The legacy copy is adopted only once an account is confirmed to have no remote
 * document, so signing in before the backend existed can't strand an older budget.
 */
export function loadCached(userId: string): { data: AppData; legacy: AppData | null } {
  const own = localStorage.getItem(keyFor(userId));
  const alreadyClaimed = localStorage.getItem(LEGACY_CLAIM_KEY) === '1';
  const legacyRaw = alreadyClaimed ? null : localStorage.getItem(LEGACY_STORAGE_KEY);
  const legacy = legacyRaw ? parseData(legacyRaw) : null;
  return { data: own ? parseData(own) : legacy ?? defaultData(), legacy };
}

/** Remember that the old single-user cache now belongs to an account. */
export function markLegacyClaimed(): void {
  localStorage.setItem(LEGACY_CLAIM_KEY, '1');
}

export function loadData(userId: string): AppData {
  return loadCached(userId).data;
}

export function saveData(userId: string, data: AppData): void {
  localStorage.setItem(keyFor(userId), JSON.stringify(data));
}

function dirtyKeyFor(userId: string): string {
  return `${keyFor(userId)}:dirty`;
}

/**
 * True while the cached copy holds edits the cloud has not accepted yet. Without this, a
 * reload before a write lands would adopt the older remote document and lose the edit.
 */
export function isDirty(userId: string): boolean {
  return localStorage.getItem(dirtyKeyFor(userId)) === '1';
}

export function markDirty(userId: string): void {
  try {
    localStorage.setItem(dirtyKeyFor(userId), '1');
  } catch {
    // Storage can be full or blocked; sync still works, it is just not protected.
  }
}

export function clearDirty(userId: string): void {
  localStorage.removeItem(dirtyKeyFor(userId));
}

/**
 * Drops this account's local cache. Only called when everything is already in the cloud, so
 * signing out on a shared device does not leave the previous user's budget on disk.
 */
export function clearCached(userId: string): void {
  localStorage.removeItem(keyFor(userId));
  localStorage.removeItem(dirtyKeyFor(userId));
}

export function newId(): string {
  return crypto.randomUUID();
}
