import { useMemo, useState } from 'react';
import type { Store } from '../store';
import type { Transaction, Transfer, TxType } from '../lib/types';
import { formatDate, formatMoney } from '../lib/format';
import { TransactionForm } from '../components/TransactionForm';
import { TransferForm } from '../components/TransferForm';
import { Select } from '../components/Select';
import { DatePicker } from '../components/DatePicker';
import { confirmDialog } from '../components/confirm';
import { categoryGroup, groupLabel } from '../lib/groups';
import { Icon } from '../components/Icon';

type SortKey = 'date-desc' | 'date-asc' | 'amount-desc' | 'amount-asc';
type TypeFilter = 'all' | TxType | 'transfer';

type LedgerEntry =
  | { kind: 'transaction'; tx: Transaction }
  | { kind: 'transfer'; transfer: Transfer };

export function Transactions({ store }: { store: Store }) {
  const { data, update } = store;
  const cur = data.settings.currency;
  const [search, setSearch] = useState('');
  const [type, setType] = useState<TypeFilter>('all');
  const [categoryId, setCategoryId] = useState('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [sort, setSort] = useState<SortKey>('date-desc');
  const [editing, setEditing] = useState<Transaction | 'new' | null>(null);
  const [editingTransfer, setEditingTransfer] = useState<Transfer | 'new' | null>(null);

  const catName = (id: string) => data.categories.find((c) => c.id === id)?.name ?? '';
  const accName = (id: string | null) => data.accounts.find((a) => a.id === id)?.name ?? '—';

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const entries: LedgerEntry[] = [];

    if (type !== 'transfer') {
      for (const t of data.transactions) {
        if (type !== 'all' && t.type !== type) continue;
        if (categoryId !== 'all' && t.categoryId !== categoryId) continue;
        if (from && t.date < from) continue;
        if (to && t.date > to) continue;
        if (q) {
          const haystack = `${catName(t.categoryId)} ${t.note} ${accName(t.accountId)}`.toLowerCase();
          if (!haystack.includes(q)) continue;
        }
        entries.push({ kind: 'transaction', tx: t });
      }
    }

    // A category is a transaction concept, so choosing one filters transfers out.
    if ((type === 'all' || type === 'transfer') && categoryId === 'all') {
      for (const transfer of data.transfers) {
        if (from && transfer.date < from) continue;
        if (to && transfer.date > to) continue;
        if (q) {
          const haystack =
            `transfer ${transfer.note} ${accName(transfer.fromAccountId)} ${accName(transfer.toAccountId)}`.toLowerCase();
          if (!haystack.includes(q)) continue;
        }
        entries.push({ kind: 'transfer', transfer });
      }
    }

    const dateOf = (entry: LedgerEntry) =>
      entry.kind === 'transaction' ? entry.tx.date : entry.transfer.date;
    const amountOf = (entry: LedgerEntry) =>
      entry.kind === 'transaction' ? entry.tx.amount : entry.transfer.amount;

    const cmp: Record<SortKey, (a: LedgerEntry, b: LedgerEntry) => number> = {
      'date-desc': (a, b) => dateOf(b).localeCompare(dateOf(a)),
      'date-asc': (a, b) => dateOf(a).localeCompare(dateOf(b)),
      'amount-desc': (a, b) => amountOf(b) - amountOf(a),
      'amount-asc': (a, b) => amountOf(a) - amountOf(b),
    };
    return entries.sort(cmp[sort]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, search, type, categoryId, from, to, sort]);

  async function removeTransaction(id: string) {
    const ok = await confirmDialog({
      title: 'Delete this transaction?',
      message: 'The transaction is removed permanently.',
      confirmLabel: 'Delete',
      tone: 'danger',
    });
    if (!ok) return;
    update((prev) => ({ ...prev, transactions: prev.transactions.filter((t) => t.id !== id) }));
  }

  async function removeTransfer(id: string) {
    const ok = await confirmDialog({
      title: 'Delete this transfer?',
      message: 'Both account balances will return to what they were before the transfer.',
      confirmLabel: 'Delete',
      tone: 'danger',
    });
    if (!ok) return;
    update((prev) => ({ ...prev, transfers: prev.transfers.filter((t) => t.id !== id) }));
  }

  return (
    <>
      <div className="topbar">
        <div className="page-head">
          <span className="eyebrow">Ledger</span>
          <h1>Transactions<span className="accent">.</span></h1>
        </div>
        <div className="topbar-actions">
          <button className="btn" onClick={() => setEditingTransfer('new')}>
            <Icon name="swap" size={17} /> Transfer
          </button>
          <button className="btn primary" data-tour="add-entry" onClick={() => setEditing('new')}>
            <Icon name="plus" size={17} /> Add transaction
          </button>
        </div>
      </div>

      <div className="card">
        <div className="toolbar">
          <input placeholder="Search note, category or account" value={search} onChange={(e) => setSearch(e.target.value)} />
          <Select
            value={type}
            ariaLabel="Filter by type"
            options={[
              { value: 'all', label: 'All types' },
              { value: 'expense', label: 'Expenses' },
              { value: 'income', label: 'Income' },
              { value: 'transfer', label: 'Transfers' },
            ]}
            onChange={(v) => {
              setType(v as TypeFilter);
              if (v === 'transfer') setCategoryId('all');
            }}
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
          <div className="empty">No entries match these filters.</div>
        ) : (
          <div className="table-wrap">
            <table className="tx-table">
              <thead>
                <tr>
                  <th>Date</th><th>Category</th><th>Account</th><th>Note</th><th className="num">Amount</th><th />
                </tr>
              </thead>
              <tbody>
                {rows.map((entry) => {
                  if (entry.kind === 'transfer') {
                    const t = entry.transfer;
                    return (
                      <tr key={`transfer-${t.id}`}>
                        <td>{formatDate(t.date)}</td>
                        <td>Transfer</td>
                        <td>{accName(t.fromAccountId)} → {accName(t.toAccountId)}</td>
                        <td className="muted">{t.note}</td>
                        <td className="num muted">{formatMoney(t.amount, cur)}</td>
                        <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                            <button className="icon-btn" aria-label="Edit transfer" onClick={() => setEditingTransfer(t)}>
                              <Icon name="pencil" size={16} />
                            </button>
                            <button className="icon-btn danger" aria-label="Delete transfer" onClick={() => removeTransfer(t.id)}>
                              <Icon name="trash" size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  }

                  const t = entry.tx;
                  return (
                    <tr key={`tx-${t.id}`}>
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
                          <button className="icon-btn danger" aria-label="Delete transaction" onClick={() => removeTransaction(t.id)}>
                            <Icon name="trash" size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
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
      {editingTransfer && (
        <TransferForm
          store={store}
          existing={editingTransfer === 'new' ? undefined : editingTransfer}
          onClose={() => setEditingTransfer(null)}
        />
      )}
    </>
  );
}
