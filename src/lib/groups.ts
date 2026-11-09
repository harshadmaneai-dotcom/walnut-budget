import type { Category, CategoryGroup, Transaction } from './types';

export interface GroupMeta {
  id: CategoryGroup;
  label: string;
  hint: string;
  color: string;
}

/** The three expense groups, in display order. */
export const GROUPS: GroupMeta[] = [
  { id: 'need', label: 'Needs', hint: 'Essentials you cannot skip', color: '#147a4f' },
  { id: 'want', label: 'Expenses', hint: 'Wants you can live without', color: '#e0912f' },
  { id: 'investment', label: 'Investments', hint: 'Money put to work', color: '#2e6fdb' },
];

export function groupMeta(id: CategoryGroup): GroupMeta {
  return GROUPS.find((g) => g.id === id) ?? GROUPS[0];
}

export function groupLabel(id: CategoryGroup): string {
  return groupMeta(id).label;
}

/** Group of an expense category; null for income categories. */
export function categoryGroup(category?: Category): CategoryGroup | null {
  if (!category || category.type === 'income') return null;
  return category.group ?? 'need';
}

export type GroupTotals = Record<CategoryGroup, number>;

/** Expense totals per group, optionally limited to one month (YYYY-MM). */
export function groupSpend(
  transactions: Transaction[],
  categories: Category[],
  month?: string,
): GroupTotals {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const totals: GroupTotals = { need: 0, want: 0, investment: 0 };
  for (const t of transactions) {
    if (t.type !== 'expense') continue;
    if (month && !t.date.startsWith(month)) continue;
    const group = categoryGroup(byId.get(t.categoryId));
    if (group) totals[group] += t.amount;
  }
  return totals;
}

export function groupTotal(totals: GroupTotals): number {
  return totals.need + totals.want + totals.investment;
}
