import { useRef, useState } from 'react';
import type { Store } from '../store';
import type { Asset, AssetEffort, AssetMilestone, AssetStage, Transaction, Transfer } from '../lib/types';
import { newId } from '../lib/storage';
import { formatDate, formatMoney, formatMonthYear, monthYearLabel, parseAmount } from '../lib/format';
import {
  ASSET_EFFORT_LABEL,
  ASSET_KIND_LABEL,
  ASSET_ROLE_LABEL,
  ASSET_STAGE_LABEL,
  assetCapitalTotal,
  assetLinkedEntries,
  assetMonthTotals,
  assetStatus,
  milestoneProgress,
  type AssetLinkedRow,
} from '../lib/assets';
import { confirmDialog } from './confirm';
import { Icon } from './Icon';
import { Modal } from './Modal';
import { DatePicker } from './DatePicker';
import { LogMoneyForm } from './LogMoneyForm';
import { LinkAssetEntryForm } from './LinkAssetEntryForm';

const STAGES: AssetStage[] = ['planning', 'building', 'operating'];
const EFFORTS: AssetEffort[] = ['active', 'hybrid', 'passive'];

function moneyInput(cents: number | null): string {
  if (!cents) return '';
  return cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2);
}

function targetValue(value: string): number | null | undefined {
  if (!value.trim()) return null;
  const cents = parseAmount(value);
  return Number.isNaN(cents) || cents <= 0 ? undefined : cents;
}

function unlinkTransaction(tx: Transaction): Transaction {
  const next: Transaction = { ...tx };
  delete next.assetId;
  delete next.assetRole;
  return next;
}

function unlinkTransfer(transfer: Transfer): Transfer {
  const next: Transfer = { ...transfer };
  delete next.assetId;
  return next;
}

export function AssetDetailSheet({
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
  const totals = assetMonthTotals(data, asset.id, month);
  const capital = assetCapitalTotal(data, asset.id);
  const progress = milestoneProgress(asset);
  const rows = assetLinkedEntries(data, asset, month);
  const status = assetStatus(asset);
  const percent = asset.capitalTarget
    ? Math.min(100, Math.round((capital / asset.capitalTarget) * 100))
    : 0;
  const targetMet = Boolean(asset.capitalTarget && capital >= asset.capitalTarget);
  const capitalLabel = asset.kind === 'stream' ? 'Capital invested' : 'Goal funding';

  const [logType, setLogType] = useState<'income' | 'expense' | 'capital' | null>(null);
  const [linking, setLinking] = useState(false);
  const [milestoneText, setMilestoneText] = useState('');
  const [milestoneDue, setMilestoneDue] = useState('');
  const [milestoneError, setMilestoneError] = useState('');
  const [detailsError, setDetailsError] = useState('');
  const milestoneRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState(asset.name);
  const [startedOn, setStartedOn] = useState(asset.startedOn);
  const [effort, setEffort] = useState<AssetEffort | ''>(asset.effort ?? '');
  const [monthlyTarget, setMonthlyTarget] = useState(moneyInput(asset.monthlyTarget));
  const [capitalTarget, setCapitalTarget] = useState(moneyInput(asset.capitalTarget));
  const [notes, setNotes] = useState(asset.notes);

  function updateAsset(patch: Partial<Asset>) {
    update((prev) => ({
      ...prev,
      assets: prev.assets.map((item) => (item.id === asset.id ? { ...item, ...patch } : item)),
    }));
  }

  function moveStage(stage: AssetStage) {
    updateAsset({ stage, paused: false });
  }

  function addMilestone() {
    const text = milestoneText.trim();
    if (!text) {
      setMilestoneError('Write the next step first.');
      milestoneRef.current?.focus();
      return;
    }
    const milestone: AssetMilestone = {
      id: newId(),
      text,
      dueDate: milestoneDue || null,
      done: false,
    };
    updateAsset({ milestones: [...asset.milestones, milestone] });
    setMilestoneText('');
    setMilestoneDue('');
    setMilestoneError('');
    window.setTimeout(() => milestoneRef.current?.focus(), 30);
  }

  function completeNext() {
    const next = asset.milestones.find((milestone) => !milestone.done);
    if (!next) return;
    updateAsset({
      milestones: asset.milestones.map((milestone) =>
        milestone.id === next.id ? { ...milestone, done: true } : milestone,
      ),
    });
  }

  function saveDetails() {
    const cleanName = name.trim();
    if (!cleanName) return setDetailsError('Give the asset a name.');
    if (!startedOn) return setDetailsError('Pick a start date.');
    const monthly = targetValue(monthlyTarget);
    const capitalValue = targetValue(capitalTarget);
    if (monthly === undefined) return setDetailsError('Enter a valid monthly target, or leave it empty.');
    if (capitalValue === undefined) return setDetailsError('Enter a valid funding target, or leave it empty.');

    updateAsset({
      name: cleanName,
      startedOn,
      ...(effort ? { effort } : { effort: undefined }),
      monthlyTarget: monthly,
      capitalTarget: capitalValue,
      notes: notes.trim(),
    });
    setDetailsError('');
  }

  async function removeAsset() {
    const ok = await confirmDialog({
      title: `Delete ${asset.name}?`,
      message: 'Its transactions stay in Activity; they are only unlinked from this asset.',
      confirmLabel: 'Delete asset',
      tone: 'danger',
    });
    if (!ok) return;
    update((prev) => ({
      ...prev,
      assets: prev.assets.filter((item) => item.id !== asset.id),
      transactions: prev.transactions.map((tx) =>
        tx.assetId === asset.id ? unlinkTransaction(tx) : tx,
      ),
      transfers: prev.transfers.map((transfer) =>
        transfer.assetId === asset.id ? unlinkTransfer(transfer) : transfer,
      ),
    }));
    onClose();
  }

  async function unlink(row: AssetLinkedRow) {
    const ok = await confirmDialog({
      title: 'Unlink this entry?',
      message: 'The transaction stays in Activity and keeps its account balance. Only this asset link is removed.',
      confirmLabel: 'Unlink',
    });
    if (!ok) return;
    if (row.kind === 'transaction') {
      update((prev) => ({
        ...prev,
        transactions: prev.transactions.map((tx) =>
          tx.id === row.id ? unlinkTransaction(tx) : tx,
        ),
      }));
    } else {
      update((prev) => ({
        ...prev,
        transfers: prev.transfers.map((transfer) =>
          transfer.id === row.id ? unlinkTransfer(transfer) : transfer,
        ),
      }));
    }
  }

  const stageIndex = Math.max(0, STAGES.indexOf(asset.stage));
  const stageFill = stageIndex === 0 ? 0 : stageIndex === 1 ? 50 : 100;

  return (
    <>
      <Modal title={asset.name} onClose={onClose} wide>
        <div className="asset-detail">
          <div className="asset-detail-head">
            <span className={`asset-kind-pill ${asset.kind}`}>{ASSET_KIND_LABEL[asset.kind]}</span>
            <span className={`asset-status ${status.tone}`}>{status.label}</span>
            <span className="asset-started">Started {formatMonthYear(asset.startedOn)}</span>
            {asset.effort && (
              <span className="asset-effort-label">{ASSET_EFFORT_LABEL[asset.effort]}</span>
            )}
          </div>

          <section className="asset-detail-section">
            <div className="asset-section-top">
              <h3>Build stage</h3>
              <button
                type="button"
                className="btn small"
                onClick={() => updateAsset({ paused: !asset.paused })}
              >
                {asset.paused ? 'Resume' : 'Pause'}
              </button>
            </div>
            {asset.paused && (
              <div className="asset-paused-banner">
                <Icon name="pause" size={16} />
                <span>
                  <strong>Paused.</strong> Its history and every linked entry stay exactly where they are.
                </span>
              </div>
            )}
            <div className="asset-stage-track" role="group" aria-label="Build stage">
              <span className="asset-stage-line" aria-hidden="true">
                <span style={{ width: `${stageFill}%` }} />
              </span>
              {STAGES.map((stage, index) => {
                const className = index < stageIndex ? 'done' : index === stageIndex ? 'current' : '';
                return (
                  <button
                    key={stage}
                    type="button"
                    className={`asset-stage-step ${className}`}
                    aria-pressed={index === stageIndex}
                    onClick={() => moveStage(stage)}
                  >
                    <span className="asset-stage-dot">
                      {index < stageIndex ? <Icon name="check" size={12} /> : null}
                    </span>
                    <span>{ASSET_STAGE_LABEL[stage]}</span>
                  </button>
                );
              })}
            </div>
            <p className="asset-helper">
              Operating does not mean finished — it means the asset is running.
            </p>
          </section>

          <section className="asset-detail-section">
            <div className="asset-section-top">
              <h3>{monthYearLabel(month)}</h3>
              <span className="asset-helper">Linked activity</span>
            </div>
            <div className="asset-detail-stats">
              <div>
                <span>Income</span>
                <strong className={totals.income > 0 ? 'pos' : ''}>
                  {formatMoney(totals.income, cur)}
                </strong>
              </div>
              <div>
                <span>Operating expenses</span>
                <strong className={totals.expenses > 0 ? 'neg' : ''}>
                  {formatMoney(totals.expenses, cur)}
                </strong>
              </div>
              <div>
                <span>Net cash flow</span>
                <strong className={totals.net < 0 ? 'neg' : totals.net > 0 ? 'pos' : ''}>
                  {totals.net < 0 ? '−' : ''}
                  {formatMoney(Math.abs(totals.net), cur)}
                </strong>
              </div>
            </div>

            <div className="asset-capital-panel">
              <div className="asset-capital-head">
                <span>{capitalLabel}</span>
                <strong>
                  {formatMoney(capital, cur)}
                  {asset.capitalTarget ? (
                    <small>
                      {targetMet ? ' · target met' : ` of ${formatMoney(asset.capitalTarget, cur)}`}
                    </small>
                  ) : null}
                </strong>
              </div>
              {asset.capitalTarget ? (
                <div className={`progress${asset.kind === 'goal' ? ' blue' : ''}`}>
                  <span style={{ width: `${percent}%` }} />
                </div>
              ) : null}
              <p className="asset-capital-note">
                {totals.capital > 0
                  ? `${formatMoney(totals.capital, cur)} added in ${monthYearLabel(month)}. `
                  : ''}
                Contributions build capital; they are deliberately left out of operating cash flow.
              </p>
              {asset.monthlyTarget ? (
                <p className="asset-target-line">
                  Income target {formatMoney(asset.monthlyTarget, cur)} / month · a target, not a forecast.
                </p>
              ) : null}
            </div>
          </section>

          <section className="asset-detail-section">
            <div className="asset-section-top">
              <h3>Milestones</h3>
              <span className="asset-helper">
                {progress.total ? `${progress.done} of ${progress.total} complete` : 'Add your first step'}
              </span>
            </div>

            {progress.total === 0 ? (
              <div className="asset-detail-empty">
                No milestones yet. Add a concrete step below.
              </div>
            ) : (
              <div className="asset-milestone-list">
                {progress.list.map((milestone, index) => {
                  const isNext = !milestone.done && index === progress.nextIndex;
                  return (
                    <div
                      className={`asset-milestone-row${milestone.done ? ' done' : ''}${isNext ? ' next' : ''}`}
                      key={milestone.id}
                    >
                      <span className="asset-milestone-step">
                        {milestone.done ? <Icon name="check" size={12} /> : index + 1}
                      </span>
                      <div className="asset-milestone-copy">
                        <strong>{milestone.text}</strong>
                        <span>
                          {milestone.done
                            ? 'Completed'
                            : milestone.dueDate
                              ? `Due ${formatDate(milestone.dueDate)}`
                              : 'No date set'}
                          {isNext ? ' · Next step' : ''}
                        </span>
                      </div>
                      {isNext ? (
                        <button type="button" className="btn small" onClick={completeNext}>
                          Mark complete
                        </button>
                      ) : milestone.done ? null : (
                        <span className="asset-milestone-upcoming">Upcoming</span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            {progress.total > 0 && progress.done === progress.total && (
              <div className="asset-milestones-complete">
                <Icon name="check" size={15} /> All milestones complete
              </div>
            )}

            <form
              className="asset-milestone-form"
              onSubmit={(event) => {
                event.preventDefault();
                addMilestone();
              }}
            >
              <div className="form-grid">
                <label>
                  {progress.total ? 'Add another milestone' : 'First milestone'}
                  <input
                    ref={milestoneRef}
                    value={milestoneText}
                    onChange={(event) => {
                      setMilestoneText(event.target.value);
                      setMilestoneError('');
                    }}
                    placeholder="e.g. Shortlist three properties"
                    maxLength={80}
                  />
                </label>
                <label>
                  Date <span className="asset-optional">Optional</span>
                  <DatePicker
                    value={milestoneDue}
                    onChange={setMilestoneDue}
                    placeholder="No date"
                  />
                </label>
              </div>
              {milestoneError && <p className="error">{milestoneError}</p>}
              <div className="asset-save-row">
                <button type="submit" className="btn small primary">
                  {progress.total ? 'Add milestone' : 'Add first milestone'}
                </button>
              </div>
            </form>
          </section>

          <section className="asset-detail-section">
            <div className="asset-section-top">
              <h3>{monthYearLabel(month)} activity</h3>
              <span className="asset-helper">
                {rows.length} {rows.length === 1 ? 'entry' : 'entries'}
              </span>
            </div>

            <div className="asset-quick-log">
              <button type="button" className="btn small" onClick={() => setLogType('income')}>
                + Income
              </button>
              <button type="button" className="btn small" onClick={() => setLogType('expense')}>
                + Expense
              </button>
              <button type="button" className="btn small" onClick={() => setLogType('capital')}>
                + Contribution
              </button>
              <button type="button" className="btn small quiet" onClick={() => setLinking(true)}>
                Link existing
              </button>
            </div>
            <p className="asset-linked-note">
              <Icon name="assets" size={14} />
              Linked to existing Walnut entries — summarised here, never duplicated.
            </p>

            {rows.length === 0 ? (
              <div className="asset-detail-empty">
                No linked activity in {monthYearLabel(month)}. A quiet month does not reset progress.
              </div>
            ) : (
              <div className="asset-activity-list">
                {rows.map((row) => (
                  <div className="asset-activity-row" key={row.key}>
                    <time className="asset-activity-date" dateTime={row.date}>
                      {formatDate(row.date)}
                    </time>
                    <div className="asset-activity-copy">
                      <strong>{row.title}</strong>
                      <span>
                        <span className={`asset-role ${row.role}`}>{ASSET_ROLE_LABEL[row.role]}</span>
                        {row.meta ? ` · ${row.meta}` : ''}
                      </span>
                    </div>
                    <strong className={`asset-activity-amount ${row.role}`}>
                      {row.role === 'income' ? '+' : row.role === 'expense' ? '−' : ''}
                      {formatMoney(row.amount, cur)}
                    </strong>
                    <button
                      type="button"
                      className="icon-btn asset-unlink"
                      aria-label="Unlink entry"
                      title="Unlink entry"
                      onClick={() => void unlink(row)}
                    >
                      <Icon name="close" size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="asset-detail-section">
            <div className="asset-section-top">
              <h3>Asset details</h3>
            </div>
            <div className="form-grid">
              <label className="full">
                Name
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  maxLength={60}
                />
              </label>
              <label>
                Started
                <DatePicker value={startedOn} onChange={setStartedOn} clearable={false} />
              </label>
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
              </div>
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
                {capitalLabel === 'Goal funding' ? 'Funding target' : 'Launch investment target'}{' '}
                <span className="asset-optional">Optional</span>
                <input
                  inputMode="decimal"
                  value={capitalTarget}
                  onChange={(event) => setCapitalTarget(event.target.value)}
                  placeholder="e.g. 75000"
                />
              </label>
              <label className="full">
                Notes <span className="asset-optional">Optional</span>
                <textarea
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  maxLength={240}
                  placeholder="What does progress look like?"
                />
              </label>
            </div>
            {detailsError && <p className="error">{detailsError}</p>}
            <div className="asset-save-row">
              <button type="button" className="btn small primary" onClick={saveDetails}>
                Save details
              </button>
              <button type="button" className="btn small danger" onClick={() => void removeAsset()}>
                Delete asset
              </button>
            </div>
          </section>
        </div>
      </Modal>

      {logType && (
        <LogMoneyForm
          store={store}
          asset={asset}
          initialType={logType}
          onClose={() => setLogType(null)}
        />
      )}
      {linking && (
        <LinkAssetEntryForm
          store={store}
          asset={asset}
          month={month}
          onClose={() => setLinking(false)}
        />
      )}
    </>
  );
}
