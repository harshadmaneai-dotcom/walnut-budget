import { useState } from 'react';
import type { Store } from '../store';
import type { Person } from '../lib/types';
import { newId, personIdForName } from '../lib/storage';
import { Modal } from './Modal';

interface Props {
  store: Store;
  existing?: Person;
  onClose: () => void;
}

/** Adds a person to the favours list, or renames one that is already there. */
export function PersonForm({ store, existing, onClose }: Props) {
  const { data, update } = store;
  const [name, setName] = useState(existing?.name ?? '');
  const [error, setError] = useState('');

  function save(close: () => void) {
    const value = name.trim();
    if (!value) return setError("Enter the person's name.");

    const clash = data.favorPeople.find(
      (person) => person.id !== existing?.id && person.name.toLowerCase() === value.toLowerCase(),
    );
    if (clash) return setError('That person is already in the list.');

    if (existing) {
      update((prev) => ({
        ...prev,
        favorPeople: prev.favorPeople.map((person) =>
          person.id === existing.id ? { ...person, name: value } : person,
        ),
      }));
    } else {
      // The name slug is the id, so a re-added person keeps matching entries.
      const slug = personIdForName(value);
      const id = data.favorPeople.some((person) => person.id === slug) ? newId() : slug;
      update((prev) => ({ ...prev, favorPeople: [...prev.favorPeople, { id, name: value }] }));
    }
    close();
  }

  return (
    <Modal title={existing ? 'Rename person' : 'Add person'} onClose={onClose}>
      {(close) => (
        <>
          <div className="form-grid">
            <label className="full">
              Person
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Person's name"
                autoFocus
              />
            </label>
          </div>
          <p className="muted" style={{ margin: '10px 0 0', fontSize: 12 }}>
            People you add show up in the favor picker, so the same name is not retyped.
          </p>
          {error && <p className="error">{error}</p>}
          <div className="modal-actions">
            <button className="btn" onClick={close}>Cancel</button>
            <button className="btn primary" onClick={() => save(close)}>{existing ? 'Save' : 'Add person'}</button>
          </div>
        </>
      )}
    </Modal>
  );
}
