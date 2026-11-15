import { useState } from 'react';
import type { Store } from '../store';
import type { Favor, FavorDirection, Person } from '../lib/types';
import { newId, personIdForName } from '../lib/storage';
import { currencySymbol, parseAmount, todayISO } from '../lib/format';
import { Modal } from './Modal';
import { Select } from './Select';
import { DatePicker } from './DatePicker';

const DIRECTIONS: { value: FavorDirection; label: string }[] = [
  { value: 'theyCovered', label: 'They paid for me' },
  { value: 'iCovered', label: 'I paid for them' },
];

/** The picker's sentinel for "this person is not in the list yet". */
const NEW_PERSON = '__new';

interface Props {
  store: Store;
  existing?: Favor;
  /** Fixed person when the form is opened from their card. */
  person?: Person;
  /** Pre-selected direction for the card's "They paid" / "I paid" buttons. */
  direction?: FavorDirection;
  onClose: () => void;
}

/** Adds one entry to a person's favor ledger. */
export function FavorForm({ store, existing, person, direction, onClose }: Props) {
  const { data, update } = store;
  const people = [...data.favorPeople].sort((a, b) => a.name.localeCompare(b.name));
  const fixedPerson = person ?? (existing ? data.favorPeople.find((p) => p.id === existing.personId) : undefined);

  const [personId, setPersonId] = useState(fixedPerson?.id ?? people[0]?.id ?? NEW_PERSON);
  const [newName, setNewName] = useState('');
  const [amount, setAmount] = useState(existing ? (existing.amount / 100).toFixed(2) : '');
  const [date, setDate] = useState(existing?.date ?? todayISO());
  const [who, setWho] = useState<FavorDirection>(existing?.direction ?? direction ?? 'theyCovered');
  const [note, setNote] = useState(existing?.note ?? '');
  const [error, setError] = useState('');

  const needsNewName = !fixedPerson && (personId === NEW_PERSON || people.length === 0);

  function save(close: () => void) {
    const cents = parseAmount(amount);
    if (Number.isNaN(cents) || cents <= 0) return setError('Enter a valid amount greater than 0.');

    let targetId = fixedPerson?.id ?? '';
    let addedName = '';

    if (!targetId) {
      if (needsNewName) {
        addedName = newName.trim();
        if (!addedName) return setError("Enter the person's name.");
        // An existing name is reused instead of creating a near-duplicate person.
        targetId =
          data.favorPeople.find((p) => p.name.toLowerCase() === addedName.toLowerCase())?.id ?? '';
        if (!targetId) {
          targetId = personIdForName(addedName);
          if (data.favorPeople.some((p) => p.id === targetId)) targetId = newId();
        }
      } else {
        targetId = personId;
      }
      if (!targetId) return setError('Choose a person.');
    }

    update((prev) => {
      const favors = existing
        ? prev.favors.map((f) =>
            f.id === existing.id
              ? {
                  ...f,
                  personId: targetId,
                  amount: cents,
                  date,
                  direction: who,
                  note: note.trim(),
                }
              : f,
          )
        : [
            ...prev.favors,
            {
              id: newId(),
              personId: targetId,
              amount: cents,
              date,
              direction: who,
              note: note.trim(),
            },
          ];

      const favorPeople =
        addedName && !prev.favorPeople.some((p) => p.id === targetId)
          ? [...prev.favorPeople, { id: targetId, name: addedName }]
          : prev.favorPeople;

      return { ...prev, favors, favorPeople };
    });
    close();
  }

  return (
    <Modal title={existing ? 'Edit favor entry' : 'Log a favor'} onClose={onClose}>
      {(close) => (
        <>
          <div className="form-grid">
            {fixedPerson ? (
              <label className="full">
                Person
                <input value={fixedPerson.name} readOnly />
              </label>
            ) : (
              <>
                <label className="full">
                  Person
                  <Select
                    value={personId}
                    ariaLabel="Person"
                    options={[
                      ...people.map((p) => ({ value: p.id, label: p.name })),
                      { value: NEW_PERSON, label: 'Add another person…' },
                    ]}
                    onChange={setPersonId}
                  />
                </label>
                {needsNewName && (
                  <label className="full">
                    Person&apos;s name
                    <input
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      placeholder="Person's name"
                      autoFocus
                    />
                  </label>
                )}
              </>
            )}
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
                value={who}
                ariaLabel="Who paid"
                options={DIRECTIONS}
                onChange={(v) => setWho(v as FavorDirection)}
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
