import { useState } from 'react';
import type { Store } from '../store';
import type { Asset, AssetEffort, AssetKind } from '../lib/types';
import { newId } from '../lib/storage';
import { currencySymbol, parseAmount, todayISO } from '../lib/format';
import { ASSET_EFFORT_LABEL } from '../lib/assets';
import { Modal } from './Modal';
import { DatePicker } from './DatePicker';

function targetValue(value: string): number | null | undefined {
  if (!value.trim()) return null;
  const cents = parseAmount(value);
  return Number.isNaN(cents) || cents <= 0 ? undefined : cents;
}

const EFFORTS: AssetEffort[] = ['active', 'hybrid', 'passive'];

export function AssetForm({ store, onClose }: { store: Store; onClose: () => void }) {
  const { data, update } = store;
  const [name, setName] = useState('');
  const [kind, setKind] = useState<AssetKind>('stream');
  const [effort, setEffort] = useState<AssetEffort | ''>('');
  const [monthlyTarget, setMonthlyTarget] = useState('');
  const [capitalTarget, setCapitalTarget] = useState('');
  const [startedOn, setStartedOn] = useState(todayISO());
  const [milestone, setMilestone] = useState('');
  const [milestoneDue, setMilestoneDue] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  function save(close: () => void) {
    const cleanName = name.trim();
    if (!cleanName) return setError('Give the asset a name.');
    if (!startedOn) return setError('Pick a start date.');

    const monthly = targetValue(monthlyTarget);
    const capital = targetValue(capitalTarget);
    if (monthly === undefined) return setError('Enter a valid monthly income target, or leave it empty.');
    if (capital === undefined) return setError('Enter a valid funding target, or leave it empty.');

    const firstMilestone = milestone.trim();
    const asset: Asset = {
      id: newId(),
      name: cleanName,
      kind,
      ...(effort ? { effort } : {}),
      stage: 'planning',
      paused: false,
      startedOn,
      monthlyTarget: monthly,
      capitalTarget: capital,
      milestones: firstMilestone
        ? [
            {
              id: newId(),
              text: firstMilestone,
              dueDate: milestoneDue || null,
              done: false,
            },
          ]
        : [],
      notes: notes.trim(),
    };

    update((prev) => ({ ...prev, assets: [asset, ...prev.assets] }));
    close();
  }

  return (
    <Modal title="New asset" onClose={onClose}>
      {(close) => (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            save(close);
          }}
        >
          <div className="form-grid">
            <label className="full">
              Name
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="e.g. Website sales commissions"
                maxLength={60}
                autoFocus
              />
            </label>
          </div>

          <fieldset className="asset-fieldset">
            <legend>What are you building?</legend>
            <div className="asset-choice-grid">
              <label className={`asset-choice${kind === 'stream' ? ' selected' : ''}`}>
                <input
                  type="radio"
                  name="asset-kind"
                  checked={kind === 'stream'}
                  onChange={() => setKind('stream')}
                />
                <span className="asset-choice-dot" aria-hidden="true" />
                <span>
                  <strong>Income stream</strong>
                  <small>Work or a venture that earns money, like commissions.</small>
                </span>
              </label>
              <label className={`asset-choice${kind === 'goal' ? ' selected' : ''}`}>
                <input
                  type="radio"
                  name="asset-kind"
                  checked={kind === 'goal'}
                  onChange={() => setKind('goal')}
                />
                <span className="asset-choice-dot" aria-hidden="true" />
                <span>
                  <strong>Ownership goal</strong>
                  <small>Something you intend to own, like a property.</small>
                </span>
              </label>
            </div>
          </fieldset>

          <div className="asset-field-block">
            <span className="asset-field-label">
              Effort style <span className="asset-optional">Optional</span>
            </span>
            <div className="asset-chip-row" role="group" aria-label="Effort style">
              {EFFORTS.map((value) => (
                <button
                  key={value}
                  type="button"
                  className={`asset-chip${effort === value ? ' selected' : ''}`}
                  aria-pressed={effort === value}
                  onClick={() => setEffort(effort === value ? '' : value)}
                >
                  {ASSET_EFFORT_LABEL[value]}
                </button>
              ))}
            </div>
            <p className="asset-helper">A description only — it never decides whether income counts.</p>
          </div>

          <div className="form-grid">
            <label>
              Monthly income target <span className="asset-optional">Optional</span>
              <input
                inputMode="decimal"
                value={monthlyTarget}
                onChange={(event) => setMonthlyTarget(event.target.value)}
                placeholder="e.g. 2500"
              />
            </label>
            <label>
              {kind === 'goal' ? 'Funding target' : 'Launch investment target'}{' '}
              <span className="asset-optional">Optional</span>
              <input
                inputMode="decimal"
                value={capitalTarget}
                onChange={(event) => setCapitalTarget(event.target.value)}
                placeholder={kind === 'goal' ? 'e.g. 75000' : 'e.g. 2500'}
              />
            </label>
            <label>
              Started
              <DatePicker value={startedOn} onChange={setStartedOn} clearable={false} />
            </label>
            <label>
              First milestone <span className="asset-optional">Optional</span>
              <input
                value={milestone}
                onChange={(event) => setMilestone(event.target.value)}
                placeholder="e.g. Land the first client"
                maxLength={80}
              />
            </label>
            <label>
              Milestone date <span className="asset-optional">Optional</span>
              <DatePicker
                value={milestoneDue}
                onChange={setMilestoneDue}
                placeholder="No date"
              />
            </label>
            <label className="full">
              Notes <span className="asset-optional">Optional</span>
              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="What does progress look like?"
                maxLength={240}
              />
            </label>
          </div>

          <p className="asset-helper">
            Targets are in {data.settings.currency} ({currencySymbol(data.settings.currency)}). They
            are targets, not forecasts.
          </p>
          {error && <p className="error">{error}</p>}
          <div className="modal-actions">
            <button type="button" className="btn" onClick={close}>
              Cancel
            </button>
            <button type="submit" className="btn primary">
              Create asset
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
