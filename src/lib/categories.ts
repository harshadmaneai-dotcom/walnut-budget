import type { AppData, Category } from './types';

export interface CategoryUsage {
  transactions: number;
  recurring: number;
}

/** How many entries point at a category. Recurring rules count too, or they would dangle. */
export function categoryUsage(data: AppData, categoryId: string): CategoryUsage {
  let transactions = 0;
  let recurring = 0;
  for (const t of data.transactions) if (t.categoryId === categoryId) transactions += 1;
  for (const r of data.recurring) if (r.categoryId === categoryId) recurring += 1;
  return { transactions, recurring };
}

/**
 * Categories an entry can move to: same type only. Group may differ — merging a Need into
 * an Expenses category is a legitimate re-bucket, but an expense can never become income.
 */
export function eligibleTargets(categories: Category[], source: Category): Category[] {
  return categories.filter((c) => c.id !== source.id && c.type === source.type);
}

/**
 * Moves every transaction and recurring rule from one category to another and removes the
 * source category. Invalid input is a no-op, which keeps the caller's state untouched.
 */
export function mergeCategory(data: AppData, fromId: string, toId: string): AppData {
  if (fromId === toId) return data;
  const from = data.categories.find((c) => c.id === fromId);
  const to = data.categories.find((c) => c.id === toId);
  if (!from || !to || from.type !== to.type) return data;

  return {
    ...data,
    categories: data.categories.filter((c) => c.id !== fromId),
    transactions: data.transactions.map((t) => (t.categoryId === fromId ? { ...t, categoryId: toId } : t)),
    recurring: data.recurring.map((r) => (r.categoryId === fromId ? { ...r, categoryId: toId } : r)),
  };
}
