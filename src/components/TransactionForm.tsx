import { useState } from 'react';
import type { Store } from '../store';
import type { CategoryGroup, Transaction, TxType } from '../lib/types';
import { newId } from '../lib/storage';
import { currencySymbol, parseAmount, todayISO } from '../lib/format';
import { GROUPS, categoryGroup } from '../lib/groups';
import { Modal } from './Modal';
import { Select } from './Select';
import { DatePicker } from './DatePicker';

interface Props {
  store: Store;
  existing?: Transaction;
  defaultType?: TxType;
  onClose: () => void;
}

export function TransactionForm({ store, existing, defaultType = 'expense', onClose }: Props) {
  const { data, update } = store;
  const existingCategory = data.categories.find((c) => c.id === existing?.categoryId);
  const [type, setType] = useState<TxType>(existing?.type ?? defaultType);
  const [group, setGroup] = useState<CategoryGroup>(categoryGroup(existingCategory) ?? 'need');
  const [amount, setAmount] = useState(existing ? (existing.amount / 100).toFixed(2) : '');
  const [date, setDate] = useState(existing?.date ?? todayISO());
  const [categoryId, setCategoryId] = useState(existing?.categoryId ?? '');
  const [accountId, setAccountId] = useState(existing?.accountId ?? data.accounts[0]?.id ?? '');
  const [note, setNote] = useState(existing?.note ?? '');
  const [error, setError] = useState('');

  const isInvestment = type === 'expense' && group === 'investment';
  const categories =
    type === 'income'
      ? data.categories.filter((c) => c.type === 'income')
      : data.categories.filter((c) => c.type === 'expense' && categoryGroup(c) === group);

  // Investments are a single bucket, so the category is implied rather than chosen.
  const effectiveCategoryId = isInvestment
    ? categories[0]?.id ?? ''
    : categories.some((c) => c.id === categoryId)
      ? categoryId
      : categories[0]?.id ?? '';

  function save() {
    const cents = parseAmount(amount);
    if (Number.isNaN(cents) || cents <= 0) return setError('Enter a valid amount greater than 0.');
    if (!date) return setError('Pick a date.');
    if (!effectiveCategoryId) {
      return setError(
        isInvestment ? 'The Investments category is missing. Add it in Settings.' : 'Add a category for this type first.',
      );
    }
    const tx: Transaction = {
      id: existing?.id ?? newId(),
      type,
      amount: cents,
      date,
      categoryId: effectiveCategoryId,
      accountId: accountId || null,
      note: note.trim(),
      recurringId: existing?.recurringId,
    };
    update((prev) => ({
      ...prev,
      transactions: existing
        ? prev.transactions.map((t) => (t.id === existing.id ? tx : t))
        : [...prev.transactions, tx],
    }));
    onClose();
  }

  return (
    <Modal title={existing ? 'Edit transaction' : 'Add transaction'} onClose={onClose}>
      <div className="form-grid">
        <label>
          Type
          <Select
            value={type}
            ariaLabel="Type"
            options={[
              { value: 'expense', label: 'Expense' },
              { value: 'income', label: 'Income' },
            ]}
            onChange={(v) => {
              setType(v as TxType);
              setCategoryId('');
              setGroup('need');
            }}
          />
        </label>
        <label>
          Amount ({currencySymbol(data.settings.currency)})
          <input inputMode="decimal" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </label>
        <label>
          Date
          <DatePicker value={date} onChange={setDate} clearable={false} />
        </label>
        {type === 'expense' && (
          <label>
            Group
            <Select
              value={group}
              ariaLabel="Group"
              options={GROUPS.map((g) => ({ value: g.id, label: g.label }))}
              onChange={(v) => {
                setGroup(v as CategoryGroup);
                setCategoryId('');
              }}
            />
          </label>
        )}
        {isInvestment ? (
          <div className="full group-note">
            <span className="badge up">Investments</span>
            <span className="muted">Tracked as one bucket — no subcategory needed.</span>
          </div>
        ) : (
          <label>
            Category
            <Select
              value={effectiveCategoryId}
              ariaLabel="Category"
              options={categories.map((c) => ({ value: c.id, label: c.name }))}
              onChange={setCategoryId}
            />
          </label>
        )}
        <label className="full">
          Account
          <Select
            value={accountId}
            ariaLabel="Account"
            options={[{ value: '', label: 'None' }, ...data.accounts.map((a) => ({ value: a.id, label: a.name }))]}
            onChange={setAccountId}
          />
        </label>
        <label className="full">
          Note
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" />
        </label>
      </div>
      {error && <p className="error">{error}</p>}
      <div className="modal-actions">
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" onClick={save}>Save</button>
      </div>
    </Modal>
  );
}
