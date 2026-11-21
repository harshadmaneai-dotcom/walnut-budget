import { useState } from 'react';
import type { Store } from '../store';
import type { Asset, Transaction } from '../lib/types';
import { newId } from '../lib/storage';
import { currencySymbol, parseAmount, todayISO } from '../lib/format';
import { categoryGroup } from '../lib/groups';
import { Modal } from './Modal';
import { DatePicker } from './DatePicker';
import { Select } from './Select';

type LogType = 'income' | 'expense' | 'capital';

const TYPE_LABEL: Record<LogType, string> = {
  income: 'Income',
  expense: 'Operating expense',
  capital: 'Contribution',
};

const TYPE_HELP: Record<LogType, string> = {
  income: 'Adds to income and net operating cash flow. It is linked to this asset once.',
  expense: 'Reduces operating net cash flow. It is linked to this asset once.',
  capital: 'Adds to capital instead of operating cash flow. It still moves cash and appears under Investments.',
};

export function LogMoneyForm({
  store,
  asset,
  initialType,
  onClose,
}: {
  store: Store;
  asset: Asset;
  initialType?: LogType;
  onClose: () => void;
}) {
  const { data, update } = store;
  const cur = data.settings.currency;
  const investmentCategory = data.categories.find(
    (category) => category.type === 'expense' && categoryGroup(category) === 'investment',
  );
  const incomeCategories = data.categories.filter((category) => category.type === 'income');
  const operatingCategories = data.categories.filter(
    (category) => category.type === 'expense' && categoryGroup(category) !== 'investment',
  );
  const expenseCategories = operatingCategories.length
    ? operatingCategories
    : data.categories.filter((category) => category.type === 'expense');

  const firstType = initialType ?? (asset.kind === 'goal' ? 'capital' : 'income');
  const [type, setType] = useState<LogType>(firstType);
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayISO());
  const [accountId, setAccountId] = useState(data.accounts[0]?.id ?? '');
  const [categoryId, setCategoryId] = useState(
    firstType === 'capital'
      ? investmentCategory?.id ?? ''
      : firstType === 'expense'
        ? expenseCategories[0]?.id ?? ''
        : incomeCategories[0]?.id ?? '',
  );
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  const categories =
    type === 'income' ? incomeCategories : type === 'expense' ? expenseCategories : [];
  const effectiveCategoryId =
    type === 'capital'
      ? investmentCategory?.id ?? ''
      : categories.some((category) => category.id === categoryId)
        ? categoryId
        : categories[0]?.id ?? '';

  function chooseType(next: LogType) {
    setType(next);
    setError('');
    if (next === 'income') setCategoryId(incomeCategories[0]?.id ?? '');
    else if (next === 'expense') setCategoryId(expenseCategories[0]?.id ?? '');
    else setCategoryId(investmentCategory?.id ?? '');
  }

  function save(close: () => void) {
    const cents = parseAmount(amount);
    if (Number.isNaN(cents) || cents <= 0) return setError('Enter a valid amount greater than 0.');
    if (!date) return setError('Pick a date.');
    if (type === 'capital' && !investmentCategory) {
      return setError('Add an Investments category in Settings before recording a contribution.');
    }
    if (!effectiveCategoryId) {
      return setError(
        type === 'income' ? 'Add an income category in Settings first.' : 'Add an expense category in Settings first.',
      );
    }

    const fallbackNote =
      type === 'income'
        ? `${asset.name} income`
        : type === 'expense'
          ? `${asset.name} operating cost`
          : `${asset.name} contribution`;
    const tx: Transaction = {
      id: newId(),
      type: type === 'income' ? 'income' : 'expense',
      amount: cents,
      date,
      categoryId: effectiveCategoryId,
      accountId: accountId || null,
      note: note.trim() || fallbackNote,
      createdAt: new Date().toISOString(),
      assetId: asset.id,
      ...(type === 'capital' ? { assetRole: 'capital' as const } : {}),
    };
    update((prev) => ({ ...prev, transactions: [...prev.transactions, tx] }));
    close();
  }

  return (
    <Modal title="Log money" onClose={onClose}>
      {(close) => (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            save(close);
          }}
        >
          <div className="asset-log-context">
            {asset.name} <span>·</span> {TYPE_LABEL[type]}
          </div>

          <div className="tabs asset-log-tabs" role="group" aria-label="Entry type">
            {(['income', 'expense', 'capital'] as LogType[]).map((value) => (
              <button
                key={value}
                type="button"
                className={`tab${type === value ? ' active' : ''}`}
                aria-pressed={type === value}
                onClick={() => chooseType(value)}
              >
                {TYPE_LABEL[value]}
              </button>
            ))}
          </div>
          <p className="asset-helper">{TYPE_HELP[type]}</p>

          <div className="form-grid">
            <label>
              Amount ({currencySymbol(cur)})
              <input
                inputMode="decimal"
                placeholder="0.00"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                autoFocus
              />
            </label>
            <label>
              Date
              <DatePicker value={date} onChange={setDate} clearable={false} />
            </label>
            <label>
              Account
              <Select
                value={accountId}
                ariaLabel="Account"
                options={[
                  { value: '', label: 'None' },
                  ...data.accounts.map((account) => ({ value: account.id, label: account.name })),
                ]}
                onChange={setAccountId}
              />
            </label>
            {type === 'capital' ? (
              <div className="full group-note">
                <span className="badge up">Investments</span>
                <span className="muted">Capital moves cash once, but stays out of the asset's operating net.</span>
              </div>
            ) : (
              <label>
                Category
                <Select
                  value={effectiveCategoryId}
                  ariaLabel="Category"
                  options={categories.map((category) => ({
                    value: category.id,
                    label: category.name,
                  }))}
                  onChange={setCategoryId}
                />
              </label>
            )}
            <label className="full">
              Note <span className="asset-optional">Optional</span>
              <input
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder={`e.g. ${type === 'income' ? 'Commission from bakery project' : type === 'expense' ? 'Lead generation' : 'Monthly fund top-up'}`}
                maxLength={80}
              />
            </label>
          </div>

          <p className="asset-helper">
            This creates one real transaction in Activity. Nothing is copied or counted twice.
          </p>
          {error && <p className="error">{error}</p>}
          <div className="modal-actions">
            <button type="button" className="btn" onClick={close}>
              Cancel
            </button>
            <button type="submit" className="btn primary">
              Add {TYPE_LABEL[type].toLowerCase()}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
