import { useState } from 'react';
import type { Store } from '../store';
import type { Account } from '../lib/types';
import { newId } from '../lib/storage';
import { formatMoney, parseAmount } from '../lib/format';
import { accountBalance } from '../lib/calc';
import { Select } from './Select';
import { Modal } from './Modal';
import { Icon } from './Icon';
import { alertDialog, confirmDialog } from './confirm';

const KINDS: { value: Account['kind']; label: string }[] = [
  { value: 'cash', label: 'Cash' },
  { value: 'bank', label: 'Bank' },
  { value: 'card', label: 'Card' },
  { value: 'other', label: 'Other' },
];

export function AccountsPanel({ store }: { store: Store }) {
  const { data, update } = store;
  const cur = data.settings.currency;
  const [name, setName] = useState('');
  const [kind, setKind] = useState<Account['kind']>('bank');
  const [opening, setOpening] = useState('');
  const [error, setError] = useState('');

  const [editing, setEditing] = useState<Account | null>(null);
  const [editName, setEditName] = useState('');
  const [editKind, setEditKind] = useState<Account['kind']>('bank');
  const [editOpening, setEditOpening] = useState('');
  const [editError, setEditError] = useState('');

  function add() {
    const cents = opening.trim() === '' ? 0 : parseAmount(opening);
    if (!name.trim()) return setError('Enter an account name.');
    if (Number.isNaN(cents)) return setError('Opening balance must be a valid number.');
    update((p) => ({
      ...p,
      accounts: [...p.accounts, { id: newId(), name: name.trim(), kind, openingBalance: cents }],
    }));
    setName('');
    setOpening('');
    setError('');
  }

  function startEdit(account: Account) {
    setEditing(account);
    setEditName(account.name);
    setEditKind(account.kind);
    setEditOpening((account.openingBalance / 100).toFixed(2));
    setEditError('');
  }

  function saveEdit() {
    if (!editing) return;
    const cents = editOpening.trim() === '' ? 0 : parseAmount(editOpening);
    if (!editName.trim()) return setEditError('Enter an account name.');
    if (Number.isNaN(cents)) return setEditError('Opening balance must be a valid number.');
    update((p) => ({
      ...p,
      accounts: p.accounts.map((a) =>
        a.id === editing.id ? { ...a, name: editName.trim(), kind: editKind, openingBalance: cents } : a,
      ),
    }));
    setEditing(null);
  }

  async function remove(id: string) {
    if (data.accounts.length <= 1) {
      await alertDialog('You need at least one account.', 'Cannot delete');
      return;
    }
    const ok = await confirmDialog({
      title: 'Delete this account?',
      message: 'Transactions linked to it are kept but become unlinked.',
      confirmLabel: 'Delete',
      tone: 'danger',
    });
    if (!ok) return;
    update((p) => ({
      ...p,
      accounts: p.accounts.filter((a) => a.id !== id),
      transactions: p.transactions.map((t) => (t.accountId === id ? { ...t, accountId: null } : t)),
      loans: p.loans.map((l) => ({
        ...l,
        accountId: l.accountId === id ? null : l.accountId,
        repayments: l.repayments.map((r) => (r.accountId === id ? { ...r, accountId: null } : r)),
      })),
    }));
  }

  return (
    <>
      <div className="card-head"><div><h2>Accounts</h2><p>Wallets, bank accounts and cards</p></div></div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Name</th><th>Type</th><th className="num">Balance</th><th /></tr></thead>
          <tbody>
            {data.accounts.map((a) => (
              <tr key={a.id}>
                <td>{a.name}</td>
                <td className="muted">{a.kind}</td>
                <td className="num">{formatMoney(accountBalance(data, a.id), cur)}</td>
                <td style={{ textAlign: 'right' }}>
                  <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                    <button className="icon-btn" aria-label={`Edit ${a.name}`} onClick={() => startEdit(a)}>
                      <Icon name="pencil" size={16} />
                    </button>
                    <button className="icon-btn danger" aria-label={`Delete ${a.name}`} onClick={() => remove(a.id)}>
                      <Icon name="trash" size={16} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="form-grid" style={{ marginTop: 16 }}>
        <label>
          New account name
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Savings" />
        </label>
        <label>
          Type
          <Select
            value={kind}
            ariaLabel="Account type"
            options={KINDS}
            onChange={(v) => setKind(v as Account['kind'])}
          />
        </label>
        <label>
          Opening balance
          <input inputMode="decimal" value={opening} onChange={(e) => setOpening(e.target.value)} placeholder="0.00" />
        </label>
        <div style={{ display: 'flex', alignItems: 'end' }}>
          <button className="btn primary" onClick={add}>Add account</button>
        </div>
      </div>
      {error && <p className="error">{error}</p>}

      {editing && (
        <Modal title="Edit account" onClose={() => setEditing(null)}>
          <div className="form-grid">
            <label>
              Name
              <input value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="Account name" />
            </label>
            <label>
              Type
              <Select
                value={editKind}
                ariaLabel="Account type"
                options={KINDS}
                onChange={(v) => setEditKind(v as Account['kind'])}
              />
            </label>
            <label className="full">
              Opening balance ({cur})
              <input
                inputMode="decimal"
                value={editOpening}
                onChange={(e) => setEditOpening(e.target.value)}
                placeholder="0.00"
              />
            </label>
            <p className="muted full" style={{ margin: 0, fontSize: 12 }}>
              Changing this shifts the account balance by the difference; transactions are untouched.
            </p>
          </div>
          {editError && <p className="error">{editError}</p>}
          <div className="modal-actions">
            <button className="btn" onClick={() => setEditing(null)}>Cancel</button>
            <button className="btn primary" onClick={saveEdit}>Save changes</button>
          </div>
        </Modal>
      )}
    </>
  );
}
