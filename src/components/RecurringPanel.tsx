import { useState } from 'react';
import type { Store } from '../store';
import type { RecurringFrequency, RecurringRule, TxType } from '../lib/types';
import { newId } from '../lib/storage';
import { currencySymbol, formatMoney, parseAmount, todayISO } from '../lib/format';
import { Select } from './Select';
import { DatePicker } from './DatePicker';
import { confirmDialog } from './confirm';

export function RecurringPanel({ store }: { store: Store }) {
  const { data, update } = store;
  const cur = data.settings.currency;
  const [type, setType] = useState<TxType>('expense');
  const [amount, setAmount] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [accountId, setAccountId] = useState(data.accounts[0]?.id ?? '');
  const [frequency, setFrequency] = useState<RecurringFrequency>('monthly');
  const [startDate, setStartDate] = useState(todayISO());
  const [note, setNote] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const categories = data.categories.filter((c) => c.type === type);

  function reset() {
    setEditingId(null);
    setAmount('');
    setNote('');
    setStartDate(todayISO());
    setFrequency('monthly');
    setError('');
  }

  function startEdit(rule: RecurringRule) {
    setEditingId(rule.id);
    setType(rule.type);
    setAmount((rule.amount / 100).toFixed(2));
    setCategoryId(rule.categoryId);
    setAccountId(rule.accountId ?? '');
    setFrequency(rule.frequency);
    setStartDate(rule.startDate);
    setNote(rule.note);
    setError('');
  }

  function save() {
    const cents = parseAmount(amount);
    if (Number.isNaN(cents) || cents <= 0) return setError('Enter a valid amount greater than 0.');
    const catId = categories.some((c) => c.id === categoryId) ? categoryId : categories[0]?.id;
    if (!catId) return setError('Add a category for this type first.');
    if (!startDate) return setError('Pick a start date.');

    if (editingId) {
      update((p) => ({
        ...p,
        recurring: p.recurring.map((r) =>
          r.id === editingId
            ? {
                ...r,
                type,
                amount: cents,
                categoryId: catId,
                accountId: accountId || null,
                note: note.trim(),
                frequency,
                startDate,
              }
            : r,
        ),
      }));
    } else {
      update((p) => ({
        ...p,
        recurring: [
          ...p.recurring,
          {
            id: newId(),
            type,
            amount: cents,
            categoryId: catId,
            accountId: accountId || null,
            note: note.trim(),
            frequency,
            startDate,
            lastApplied: null,
          },
        ],
      }));
    }
    reset();
  }

  async function remove(id: string) {
    const ok = await confirmDialog({
      title: 'Stop this recurring entry?',
      message: 'Transactions it already created are kept.',
      confirmLabel: 'Stop',
      tone: 'danger',
    });
    if (!ok) return;
    update((p) => ({ ...p, recurring: p.recurring.filter((r) => r.id !== id) }));
    if (editingId === id) reset();
  }

  return (
    <>
      <div className="card-head">
        <div><h2>Recurring entries</h2><p>Created automatically when you open the app, on or after each due date</p></div>
      </div>
      {data.recurring.length === 0 && <div className="empty">No recurring entries yet.</div>}
      {data.recurring.map((r) => (
        <div
          className="list-row"
          key={r.id}
          style={editingId === r.id ? { background: '#f8faf3', borderRadius: 12, paddingLeft: 10, paddingRight: 10 } : undefined}
        >
          <div>
            <div>{r.note || data.categories.find((c) => c.id === r.categoryId)?.name}</div>
            <div className="meta">
              {r.note ? `${data.categories.find((c) => c.id === r.categoryId)?.name ?? ''} · ` : ''}
              {r.frequency} from {r.startDate}
              {r.accountId ? ` · ${data.accounts.find((a) => a.id === r.accountId)?.name ?? ''}` : ''}
              {r.lastApplied ? ` · last ${r.lastApplied}` : ''}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span className={r.type === 'income' ? 'pos' : 'neg'}>{formatMoney(r.amount, cur)}</span>
            <button className="btn small" onClick={() => startEdit(r)}>Edit</button>
            <button className="btn small danger" onClick={() => remove(r.id)}>Stop</button>
          </div>
        </div>
      ))}

      <div className="form-grid" style={{ marginTop: 16 }}>
        <label>
          Type
          <Select
            value={type}
            ariaLabel="Type"
            options={[
              { value: 'expense', label: 'Expense' },
              { value: 'income', label: 'Income' },
            ]}
            onChange={(v) => { setType(v as TxType); setCategoryId(''); }}
          />
        </label>
        <label>
          Amount ({currencySymbol(cur)})
          <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
        </label>
        <label>
          Category
          <Select
            value={categoryId || categories[0]?.id || ''}
            ariaLabel="Category"
            options={categories.map((c) => ({ value: c.id, label: c.name }))}
            onChange={setCategoryId}
          />
        </label>
        <label>
          Account
          <Select
            value={accountId}
            ariaLabel="Account"
            options={[{ value: '', label: 'None' }, ...data.accounts.map((a) => ({ value: a.id, label: a.name }))]}
            onChange={setAccountId}
          />
        </label>
        <label>
          Frequency
          <Select
            value={frequency}
            ariaLabel="Frequency"
            options={[
              { value: 'monthly', label: 'Monthly' },
              { value: 'weekly', label: 'Weekly' },
            ]}
            onChange={(v) => setFrequency(v as RecurringFrequency)}
          />
        </label>
        <label>
          Start date
          <DatePicker value={startDate} onChange={setStartDate} clearable={false} />
        </label>
        <label>
          Note
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Rent" />
        </label>
      </div>
      <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="btn primary" onClick={save}>
          {editingId ? 'Save changes' : 'Add recurring entry'}
        </button>
        {editingId && <button className="btn" onClick={reset}>Cancel</button>}
      </div>
      {error && <p className="error">{error}</p>}
    </>
  );
}
