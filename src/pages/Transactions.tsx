import { useMemo, useState } from 'react';
import type { Store } from '../store';
import type { Transaction, TxType } from '../lib/types';
import { formatDate, formatMoney } from '../lib/format';
import { TransactionForm } from '../components/TransactionForm';
import { Select } from '../components/Select';
import { DatePicker } from '../components/DatePicker';
import { confirmDialog } from '../components/confirm';
import { categoryGroup, groupLabel } from '../lib/groups';
import { Icon } from '../components/Icon';

type SortKey = 'date-desc' | 'date-asc' | 'amount-desc' | 'amount-asc';

export function Transactions({ store }: { store: Store }) {
  const { data, update } = store;
  const cur = data.settings.currency;
  const [search, setSearch] = useState('');
  const [type, setType] = useState<'all' | TxType>('all');
  const [categoryId, setCategoryId] = useState('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [sort, setSort] = useState<SortKey>('date-desc');
  const [editing, setEditing] = useState<Transaction | 'new' | null>(null);

  const catName = (id: string) => data.categories.find((c) => c.id === id)?.name ?? '';
  const accName = (id: string | null) => data.accounts.find((a) => a.id === id)?.name ?? '—';

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = data.transactions.filter((t) => {
      if (type !== 'all' && t.type !== type) return false;
      if (categoryId !== 'all' && t.categoryId !== categoryId) return false;
      if (from && t.date < from) return false;
      if (to && t.date > to) return false;
      if (q && !`${catName(t.categoryId)} ${t.note}`.toLowerCase().includes(q)) return false;
      return true;
    });
    const cmp: Record<SortKey, (a: Transaction, b: Transaction) => number> = {
      'date-desc': (a, b) => (a.date < b.date ? 1 : -1),
      'date-asc': (a, b) => (a.date < b.date ? -1 : 1),
      'amount-desc': (a, b) => b.amount - a.amount,
      'amount-asc': (a, b) => a.amount - b.amount,
    };
    return filtered.sort(cmp[sort]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, search, type, categoryId, from, to, sort]);

  async function remove(id: string) {
    const ok = await confirmDialog({
      title: 'Delete this transaction?',
      message: 'The transaction is removed permanently.',
      confirmLabel: 'Delete',
      tone: 'danger',
    });
    if (!ok) return;
    update((prev) => ({ ...prev, transactions: prev.transactions.filter((t) => t.id !== id) }));
  }

  return (
    <>
      <div className="topbar">
        <div className="page-head">
          <span className="eyebrow">Ledger</span>
          <h1>Transactions<span className="accent">.</span></h1>
        </div>
        <div className="topbar-actions">
          <button className="btn primary" data-tour="add-entry" onClick={() => setEditing('new')}>
            <Icon name="plus" size={17} /> Add transaction
          </button>
        </div>
      </div>

      <div className="card">
        <div className="toolbar">
          <input placeholder="Search note or category" value={search} onChange={(e) => setSearch(e.target.value)} />
          <Select
            value={type}
            ariaLabel="Filter by type"
            options={[
              { value: 'all', label: 'All types' },
              { value: 'expense', label: 'Expenses' },
              { value: 'income', label: 'Income' },
            ]}
            onChange={(v) => setType(v as 'all' | TxType)}
          />
          <Select
            value={categoryId}
            ariaLabel="Filter by category"
            options={[
              { value: 'all', label: 'All categories' },
              ...data.categories.map((c) => ({
                value: c.id,
                label:
                  c.type === 'income'
                    ? `${c.name} (income)`
                    : `${c.name} (${groupLabel(categoryGroup(c) ?? 'need')})`,
              })),
            ]}
            onChange={setCategoryId}
          />
          <DatePicker value={from} onChange={setFrom} placeholder="From" />
          <DatePicker value={to} onChange={setTo} placeholder="To" />
          <Select
            value={sort}
            ariaLabel="Sort transactions"
            options={[
              { value: 'date-desc', label: 'Newest first' },
              { value: 'date-asc', label: 'Oldest first' },
              { value: 'amount-desc', label: 'Amount high to low' },
              { value: 'amount-asc', label: 'Amount low to high' },
            ]}
            onChange={(v) => setSort(v as SortKey)}
          />
        </div>

        {rows.length === 0 ? (
          <div className="empty">No transactions match these filters.</div>
        ) : (
          <div className="table-wrap">
            <table className="tx-table">
              <thead>
                <tr>
                  <th>Date</th><th>Category</th><th>Account</th><th>Note</th><th className="num">Amount</th><th />
                </tr>
              </thead>
              <tbody>
                {rows.map((t) => (
                  <tr key={t.id}>
                    <td>{formatDate(t.date)}</td>
                    <td>{catName(t.categoryId)}{t.recurringId && <span className="badge up" style={{ marginLeft: 8 }}>Recurring</span>}</td>
                    <td>{accName(t.accountId)}</td>
                    <td className="muted">{t.note}</td>
                    <td className={`num ${t.type === 'income' ? 'pos' : 'neg'}`}>
                      {t.type === 'income' ? '+' : '−'}{formatMoney(t.amount, cur)}
                    </td>
                    <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        <button className="icon-btn" aria-label="Edit transaction" onClick={() => setEditing(t)}>
                          <Icon name="pencil" size={16} />
                        </button>
                        <button className="icon-btn danger" aria-label="Delete transaction" onClick={() => remove(t.id)}>
                          <Icon name="trash" size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editing && (
        <TransactionForm
          store={store}
          existing={editing === 'new' ? undefined : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}
