import { useState } from 'react';
import type { Store } from '../store';
import type { Asset, Transaction, Transfer } from '../lib/types';
import { formatMoney, monthYearLabel } from '../lib/format';
import { Modal } from './Modal';
import { Select } from './Select';

type Candidate =
  | { key: string; kind: 'transaction'; id: string; label: string; tx: Transaction }
  | { key: string; kind: 'transfer'; id: string; label: string; transfer: Transfer };

type LinkRole = 'operating' | 'capital';

function shortDate(date: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

export function LinkAssetEntryForm({
  store,
  asset,
  month,
  onClose,
}: {
  store: Store;
  asset: Asset;
  month: string;
  onClose: () => void;
}) {
  const { data, update } = store;
  const cur = data.settings.currency;
  const categoryName = (id: string) => data.categories.find((category) => category.id === id)?.name;
  const accountName = (id: string | null) => data.accounts.find((account) => account.id === id)?.name;

  const candidates: Candidate[] = [];
  for (const tx of data.transactions) {
    if (tx.assetId || !tx.date.startsWith(month)) continue;
    const title = tx.note.trim() || categoryName(tx.categoryId) || (tx.type === 'income' ? 'Income' : 'Expense');
    candidates.push({
      key: `tx:${tx.id}`,
      kind: 'transaction',
      id: tx.id,
      label: `${shortDate(tx.date)} · ${tx.type === 'income' ? 'Income' : 'Expense'} · ${formatMoney(tx.amount, cur)} · ${title}`,
      tx,
    });
  }
  for (const transfer of data.transfers) {
    if (transfer.assetId || !transfer.date.startsWith(month)) continue;
    const from = accountName(transfer.fromAccountId) ?? 'Account';
    const to = accountName(transfer.toAccountId) ?? 'Account';
    candidates.push({
      key: `transfer:${transfer.id}`,
      kind: 'transfer',
      id: transfer.id,
      label: `${shortDate(transfer.date)} · Transfer · ${formatMoney(transfer.amount, cur)} · ${transfer.note.trim() || `${from} → ${to}`}`,
      transfer,
    });
  }

  const [entryKey, setEntryKey] = useState(candidates[0]?.key ?? '');
  const [role, setRole] = useState<LinkRole>('operating');
  const [error, setError] = useState('');
  const selected = candidates.find((candidate) => candidate.key === entryKey) ?? candidates[0];

  function save(close: () => void) {
    if (!selected) return setError('Choose an entry to link.');
    if (selected.kind === 'transaction') {
      update((prev) => ({
        ...prev,
        transactions: prev.transactions.map((tx) => {
          if (tx.id !== selected.id) return tx;
          const next: Transaction = { ...tx, assetId: asset.id };
          if (tx.type === 'expense' && role === 'capital') next.assetRole = 'capital';
          else delete next.assetRole;
          return next;
        }),
      }));
    } else {
      update((prev) => ({
        ...prev,
        transfers: prev.transfers.map((transfer) =>
          transfer.id === selected.id ? { ...transfer, assetId: asset.id } : transfer,
        ),
      }));
    }
    close();
  }

  return (
    <Modal title="Link an existing entry" onClose={onClose}>
      {(close) => (
        <>
          <p className="asset-helper" style={{ marginTop: 0 }}>
            {monthYearLabel(month)} · unlinked entries. Linking changes where the entry is summarised;
            it does not create another transaction.
          </p>

          {candidates.length === 0 ? (
            <div className="empty">
              No unlinked transactions or transfers in {monthYearLabel(month)}. Log money from this
              asset, or pick another month on the Assets page.
            </div>
          ) : (
            <div className="form-grid">
              <label className="full">
                Entry
                <Select
                  value={selected?.key ?? ''}
                  ariaLabel="Entry to link"
                  options={candidates.map((candidate) => ({
                    value: candidate.key,
                    label: candidate.label,
                  }))}
                  onChange={(value) => {
                    setEntryKey(value);
                    setRole('operating');
                    setError('');
                  }}
                />
              </label>

              {selected?.kind === 'transaction' && selected.tx.type === 'expense' ? (
                <label className="full">
                  Count it as
                  <Select
                    value={role}
                    ariaLabel="How to count this entry"
                    options={[
                      { value: 'operating', label: 'Operating expense' },
                      { value: 'capital', label: 'Capital contribution' },
                    ]}
                    onChange={(value) => setRole(value as LinkRole)}
                  />
                </label>
              ) : (
                <div className="full group-note">
                  <span className="badge up">
                    {selected?.kind === 'transfer' ? 'Capital' : 'Income'}
                  </span>
                  <span className="muted">
                    {selected?.kind === 'transfer'
                      ? 'A linked transfer builds capital and is kept out of operating cash flow.'
                      : 'Income is counted once in this asset’s operating cash flow.'}
                  </span>
                </div>
              )}
            </div>
          )}

          {error && <p className="error">{error}</p>}
          <div className="modal-actions">
            <button type="button" className="btn" onClick={close}>
              Cancel
            </button>
            <button
              type="button"
              className="btn primary"
              disabled={candidates.length === 0}
              onClick={() => save(close)}
            >
              Link entry
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
