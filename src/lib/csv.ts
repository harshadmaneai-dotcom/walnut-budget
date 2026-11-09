import type { AppData } from './types';
import { categoryGroup, groupLabel } from './groups';

function escapeCell(value: string | number): string {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function transactionsToCsv(data: AppData): string {
  const catName = (id: string) => data.categories.find((c) => c.id === id)?.name ?? '';
  const accName = (id: string | null) => data.accounts.find((a) => a.id === id)?.name ?? '';
  const catGroup = (id: string) => {
    const group = categoryGroup(data.categories.find((c) => c.id === id));
    return group ? groupLabel(group) : 'Income';
  };
  const rows = [['date', 'type', 'amount', 'category', 'group', 'account', 'note']];
  for (const t of [...data.transactions].sort((a, b) => a.date.localeCompare(b.date))) {
    rows.push([
      t.date,
      t.type,
      (t.amount / 100).toFixed(2),
      catName(t.categoryId),
      catGroup(t.categoryId),
      accName(t.accountId),
      t.note,
    ]);
  }
  return rows.map((r) => r.map(escapeCell).join(',')).join('\n');
}

export function downloadFile(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
