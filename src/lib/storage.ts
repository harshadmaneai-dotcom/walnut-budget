import type { AppData, Category, CategoryGroup } from './types';
import { DEFAULT_CURRENCY } from './format';

/** Local cache is namespaced per account, so two people on one device never share a document. */
export const STORAGE_PREFIX = 'walnut:data';
/** Pre-multi-user cache. Imported once into the first account signed in on this device. */
export const LEGACY_STORAGE_KEY = 'budget-tracker:data';
export const LEGACY_CLAIM_KEY = 'walnut:legacy-claimed';

export const DATA_VERSION = 2;
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
export function normalizeData(data: AppData): AppData {
  const merged = { ...defaultData(), ...data, version: DATA_VERSION } as AppData;
  merged.settings = { ...merged.settings, currency: normalizeCurrency(merged.settings?.currency) };
  merged.categories = migrateCategories(merged.categories ?? []);
  return merged;
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

export function newId(): string {
  return crypto.randomUUID();
}
