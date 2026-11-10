import { useState } from 'react';
import type { Store } from '../store';
import type { Loan, LoanDirection } from '../lib/types';
import { newId } from '../lib/storage';
import { currencySymbol, formatMoney, parseAmount, todayISO } from '../lib/format';
import { repaidAmount } from '../lib/calc';
import { Modal } from './Modal';
import { Select } from './Select';
import { DatePicker } from './DatePicker';

interface Props {
  store: Store;
  direction: LoanDirection;
  existing?: Loan;
  onClose: () => void;
}

export function LoanForm({ store, direction, existing, onClose }: Props) {
  const { data, update } = store;
  const isBorrowed = (existing?.direction ?? direction) === 'borrowed';
  const [counterparty, setCounterparty] = useState(existing?.counterparty ?? '');
  const [principal, setPrincipal] = useState(existing ? (existing.principal / 100).toFixed(2) : '');
  const [date, setDate] = useState(existing?.date ?? todayISO());
  const [dueDate, setDueDate] = useState(existing?.dueDate ?? '');
  const [accountId, setAccountId] = useState(existing?.accountId ?? data.accounts[0]?.id ?? '');
  const [note, setNote] = useState(existing?.note ?? '');
  const [error, setError] = useState('');

  function save(close: () => void) {
    const cents = parseAmount(principal);
    if (!counterparty.trim()) return setError('Enter a name.');
    if (Number.isNaN(cents) || cents <= 0) return setError('Enter a valid amount greater than 0.');
    if (dueDate && dueDate < date) return setError('Due date cannot be before the loan date.');

    if (existing) {
      const repaid = repaidAmount(existing);
      if (cents < repaid) {
        return setError(`Amount cannot be less than the ${formatMoney(repaid, data.settings.currency)} already repaid.`);
      }
      update((prev) => ({
        ...prev,
        loans: prev.loans.map((l) =>
          l.id === existing.id
            ? {
                ...l,
                counterparty: counterparty.trim(),
                principal: cents,
                date,
                dueDate: dueDate || null,
                note: note.trim(),
                accountId: accountId || null,
              }
            : l,
        ),
      }));
    } else {
      update((prev) => ({
        ...prev,
        loans: [
          ...prev.loans,
          {
            id: newId(),
            counterparty: counterparty.trim(),
            direction,
            principal: cents,
            date,
            dueDate: dueDate || null,
            note: note.trim(),
            accountId: accountId || null,
            repayments: [],
          },
        ],
      }));
    }
    close();
  }

  return (
    <Modal title={existing ? 'Edit loan' : isBorrowed ? 'Record money you borrowed' : 'Record money you lent'} onClose={onClose}>
      {(close) => (
        <>
          <div className="form-grid">
            <label className="full">
              {isBorrowed ? 'Borrowed from' : 'Lent to'}
              <input value={counterparty} onChange={(e) => setCounterparty(e.target.value)} placeholder="Name" />
            </label>
            <label>
              Amount ({currencySymbol(data.settings.currency)})
              <input inputMode="decimal" placeholder="0.00" value={principal} onChange={(e) => setPrincipal(e.target.value)} />
            </label>
            <label>
              Date
              <DatePicker value={date} onChange={setDate} clearable={false} />
            </label>
            <label>
              Due date (optional)
              <DatePicker value={dueDate} onChange={setDueDate} placeholder="No due date" />
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
            <label className="full">
              Note
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" />
            </label>
          </div>
          {existing && existing.repayments.length > 0 && (
            <p className="muted" style={{ margin: '10px 0 0', fontSize: 12 }}>
              Repayments are kept; the amount cannot drop below {formatMoney(repaidAmount(existing), data.settings.currency)}.
            </p>
          )}
          {error && <p className="error">{error}</p>}
          <div className="modal-actions">
            <button className="btn" onClick={close}>Cancel</button>
            <button className="btn primary" onClick={() => save(close)}>{existing ? 'Save changes' : 'Save'}</button>
          </div>
        </>
      )}
    </Modal>
  );
}
