import { useState } from 'react';
import type { Store } from '../store';
import type { Transfer } from '../lib/types';
import { newId } from '../lib/storage';
import { accountBalance } from '../lib/calc';
import { currencySymbol, formatMoney, parseAmount, todayISO } from '../lib/format';
import { Modal } from './Modal';
import { Select } from './Select';
import { DatePicker } from './DatePicker';

interface Props {
  store: Store;
  existing?: Transfer;
  onClose: () => void;
}

export function TransferForm({ store, existing, onClose }: Props) {
  const { data, update } = store;
  const cur = data.settings.currency;
  const initialFrom = existing?.fromAccountId ?? data.accounts[0]?.id ?? '';
  const [fromAccountId, setFromAccountId] = useState(initialFrom);
  const [toAccountId, setToAccountId] = useState(
    existing?.toAccountId ?? data.accounts.find((a) => a.id !== initialFrom)?.id ?? '',
  );
  const [amount, setAmount] = useState(existing ? (existing.amount / 100).toFixed(2) : '');
  const [date, setDate] = useState(existing?.date ?? todayISO());
  const [note, setNote] = useState(existing?.note ?? '');
  const [error, setError] = useState('');

  const fromAccount = data.accounts.find((a) => a.id === fromAccountId);
  const fromBalance = fromAccount ? accountBalance(data, fromAccount.id) : 0;

  function save(close: () => void) {
    if (data.accounts.length < 2) {
      return setError('Add a second account in Settings → Accounts before transferring.');
    }
    if (!data.accounts.some((a) => a.id === fromAccountId)) {
      return setError('Choose the account the money comes from.');
    }
    if (!data.accounts.some((a) => a.id === toAccountId)) {
      return setError('Choose the account the money goes to.');
    }
    if (fromAccountId === toAccountId) return setError('Choose two different accounts.');
    const cents = parseAmount(amount);
    if (Number.isNaN(cents) || cents <= 0) return setError('Enter a valid amount greater than 0.');
    if (!date) return setError('Pick a date.');

    const transfer: Transfer = {
      id: existing?.id ?? newId(),
      fromAccountId,
      toAccountId,
      amount: cents,
      date,
      note: note.trim(),
    };
    update((prev) => ({
      ...prev,
      transfers: existing
        ? prev.transfers.map((t) => (t.id === existing.id ? transfer : t))
        : [...prev.transfers, transfer],
    }));
    close();
  }

  return (
    <Modal title={existing ? 'Edit transfer' : 'Transfer money'} onClose={onClose}>
      {(close) => (
        <>
          <div className="form-grid">
            {data.accounts.length < 2 && (
              <div className="full group-note">
                <span className="badge up">2 accounts needed</span>
                <span className="muted">Add a second account in Settings → Accounts.</span>
              </div>
            )}
            <label>
              From account
              <Select
                value={fromAccountId}
                ariaLabel="From account"
                options={data.accounts.map((a) => ({ value: a.id, label: a.name }))}
                onChange={(v) => {
                  setFromAccountId(v);
                  if (toAccountId === v) {
                    setToAccountId(data.accounts.find((a) => a.id !== v)?.id ?? '');
                  }
                }}
              />
            </label>
            <label>
              To account
              <Select
                value={toAccountId}
                ariaLabel="To account"
                options={data.accounts
                  .filter((a) => a.id !== fromAccountId)
                  .map((a) => ({ value: a.id, label: a.name }))}
                onChange={setToAccountId}
              />
            </label>
            <label>
              Amount ({currencySymbol(cur)})
              <input
                inputMode="decimal"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </label>
            <label>
              Date
              <DatePicker value={date} onChange={setDate} clearable={false} />
            </label>
            {fromAccount && (
              <p className="muted full" style={{ margin: 0, fontSize: 12 }}>
                Available in {fromAccount.name}: {formatMoney(fromBalance, cur)}
              </p>
            )}
            <label className="full">
              Note
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. Cash deposit to SBI"
              />
            </label>
          </div>
          {error && <p className="error">{error}</p>}
          <div className="modal-actions">
            <button className="btn" onClick={close}>Cancel</button>
            <button className="btn primary" onClick={() => save(close)}>Save transfer</button>
          </div>
        </>
      )}
    </Modal>
  );
}
