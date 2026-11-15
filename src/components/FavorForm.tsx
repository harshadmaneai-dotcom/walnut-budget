import { useState } from 'react';
import type { Store } from '../store';
import type { Favor, FavorDirection } from '../lib/types';
import { newId } from '../lib/storage';
import { currencySymbol, parseAmount, todayISO } from '../lib/format';
import { Modal } from './Modal';
import { Select } from './Select';
import { DatePicker } from './DatePicker';

const DIRECTIONS: { value: FavorDirection; label: string }[] = [
  { value: 'theyCovered', label: 'They paid for me' },
  { value: 'iCovered', label: 'I paid for them' },
];

interface Props {
  store: Store;
  existing?: Favor;
  onClose: () => void;
}

/** Logs something a friend covered (or you covered), separate from formal loans. */
export function FavorForm({ store, existing, onClose }: Props) {
  const { data, update } = store;
  const [person, setPerson] = useState(existing?.person ?? '');
  const [amount, setAmount] = useState(existing ? (existing.amount / 100).toFixed(2) : '');
  const [date, setDate] = useState(existing?.date ?? todayISO());
  const [direction, setDirection] = useState<FavorDirection>(existing?.direction ?? 'theyCovered');
  const [note, setNote] = useState(existing?.note ?? '');
  const [error, setError] = useState('');

  // Names already used, so the same friend is not retyped (or misspelt) every time.
  const people = Array.from(new Set(data.favors.map((f) => f.person)))
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));

  function save(close: () => void) {
    const cents = parseAmount(amount);
    if (!person.trim()) return setError('Enter a name.');
    if (Number.isNaN(cents) || cents <= 0) return setError('Enter a valid amount greater than 0.');

    if (existing) {
      update((prev) => ({
        ...prev,
        favors: prev.favors.map((f) =>
          f.id === existing.id
            ? {
                ...f,
                person: person.trim(),
                amount: cents,
                date,
                direction,
                note: note.trim(),
              }
            : f,
        ),
      }));
    } else {
      update((prev) => ({
        ...prev,
        favors: [
          ...prev.favors,
          {
            id: newId(),
            person: person.trim(),
            amount: cents,
            date,
            direction,
            note: note.trim(),
            settled: false,
          },
        ],
      }));
    }
    close();
  }

  return (
    <Modal title={existing ? 'Edit favor' : 'Log a favor'} onClose={onClose}>
      {(close) => (
        <>
          <div className="form-grid">
            <label className="full">
              Person
              <input
                list="favor-people"
                value={person}
                onChange={(e) => setPerson(e.target.value)}
                placeholder="Friend's name"
              />
              <datalist id="favor-people">
                {people.map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
            </label>
            <label>
              Amount ({currencySymbol(data.settings.currency)})
              <input inputMode="decimal" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </label>
            <label>
              Date
              <DatePicker value={date} onChange={setDate} clearable={false} />
            </label>
            <label className="full">
              Who paid?
              <Select
                value={direction}
                ariaLabel="Who paid"
                options={DIRECTIONS}
                onChange={(v) => setDirection(v as FavorDirection)}
              />
            </label>
            <label className="full">
              Note
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Dinner, cab, tickets…" />
            </label>
          </div>
          <p className="muted" style={{ margin: '10px 0 0', fontSize: 12 }}>
            Favors are tracked here only; they do not move an account balance.
          </p>
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
