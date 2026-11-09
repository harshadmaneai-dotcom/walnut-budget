import { useState } from 'react';
import type { Store } from '../store';
import type { Loan } from '../lib/types';
import { newId } from '../lib/storage';
import { formatMoney, parseAmount, todayISO } from '../lib/format';
import { remainingAmount } from '../lib/calc';
import { Modal } from './Modal';
import { Select } from './Select';
import { DatePicker } from './DatePicker';

export function RepaymentForm({ store, loan, onClose }: { store: Store; loan: Loan; onClose: () => void }) {
  const { data, update } = store;
  const remaining = remainingAmount(loan);
  const [amount, setAmount] = useState((remaining / 100).toFixed(2));
  const [date, setDate] = useState(todayISO());
  const [accountId, setAccountId] = useState(loan.accountId ?? data.accounts[0]?.id ?? '');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  const isBorrowed = loan.direction === 'borrowed';

  function save() {
    const cents = parseAmount(amount);
    if (Number.isNaN(cents) || cents <= 0) return setError('Enter a valid amount greater than 0.');
    if (cents > remaining) return setError(`Amount cannot exceed the remaining ${(remaining / 100).toFixed(2)}.`);
    update((prev) => ({
      ...prev,
      loans: prev.loans.map((l) =>
        l.id === loan.id
          ? {
              ...l,
              repayments: [
                ...l.repayments,
                { id: newId(), amount: cents, date, accountId: accountId || null, note: note.trim() },
              ],
            }
          : l,
      ),
    }));
    onClose();
  }

  return (
    <Modal title={isBorrowed ? `Repay ${loan.counterparty}` : `Record repayment from ${loan.counterparty}`} onClose={onClose}>
      <p className="muted" style={{ marginTop: 0 }}>Remaining: {formatMoney(remaining, data.settings.currency)}</p>
      <div className="form-grid">
        <label>
          Amount
          <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </label>
        <label>
          Date
          <DatePicker value={date} onChange={setDate} clearable={false} />
        </label>
        <label className="full">
          Account (balance updates here)
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
