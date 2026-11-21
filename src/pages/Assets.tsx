import { useMemo, useState } from 'react';
import type { Store } from '../store';
import type { Asset, AssetKind, AssetStage } from '../lib/types';
import { lastMonths } from '../lib/calc';
import {
  ASSET_KIND_LABEL,
  ASSET_ROLE_LABEL,
  ASSET_STAGE_LABEL,
  allAssetLinkedEntries,
  assetCapitalTotal,
  assetMonthTotals,
  assetOverview,
  assetStatus,
  milestoneProgress,
} from '../lib/assets';
import {
  formatDate,
  formatMoney,
  formatMonthYear,
  monthLabel,
  monthYearLabel,
  todayISO,
} from '../lib/format';
import { AssetForm } from '../components/AssetForm';
import { AssetDetailSheet } from '../components/AssetDetailSheet';
import { LogMoneyForm } from '../components/LogMoneyForm';
import { Modal } from '../components/Modal';
import { Select } from '../components/Select';
import { Icon } from '../components/Icon';

type Filter = 'all' | AssetKind;

const STAGES: AssetStage[] = ['planning', 'building', 'operating'];

function signedMoney(value: number, currency: string): string {
  return `${value < 0 ? '−' : ''}${formatMoney(Math.abs(value), currency)}`;
}

function CardStageTrack({ stage }: { stage: AssetStage }) {
  const index = Math.max(0, STAGES.indexOf(stage));
  const fill = index === 0 ? 0 : index === 1 ? 50 : 100;
  return (
    <div className="asset-stage-track" aria-hidden="true">
      <span className="asset-stage-line">
        <span style={{ width: `${fill}%` }} />
      </span>
      {STAGES.map((item, i) => (
        <div
          key={item}
          className={`asset-stage-step ${i < index ? 'done' : i === index ? 'current' : ''}`}
        >
          <span className="asset-stage-dot">
            {i < index ? <Icon name="check" size={12} /> : null}
          </span>
          <span>{ASSET_STAGE_LABEL[item]}</span>
        </div>
      ))}
    </div>
  );
}

function AssetCard({
  store,
  asset,
  month,
  collapsed,
  onToggle,
  onOpen,
  onLog,
}: {
  store: Store;
  asset: Asset;
  month: string;
  collapsed: boolean;
  onToggle: () => void;
  onOpen: () => void;
  onLog: () => void;
}) {
  const { data } = store;
  const cur = data.settings.currency;
  const totals = assetMonthTotals(data, asset.id, month);
  const capital = assetCapitalTotal(data, asset.id);
  const progress = milestoneProgress(asset);
  const status = assetStatus(asset);
  const percent = asset.capitalTarget
    ? Math.min(100, Math.round((capital / asset.capitalTarget) * 100))
    : 0;
  const targetMet = Boolean(asset.capitalTarget && capital >= asset.capitalTarget);
  const bodyId = `asset-body-${asset.id}`;
  const monthShort = monthLabel(month);
  const netClass = totals.net < 0 ? 'neg' : totals.net > 0 ? 'pos' : '';

  return (
    <article className={`asset-card${asset.paused ? ' is-paused' : ''}${collapsed ? ' is-collapsed' : ''}`}>
      <div className="asset-card-top">
        <div className="asset-card-identity">
          <div className={`asset-icon ${asset.kind}`}>
            <Icon name={asset.kind === 'stream' ? 'chart' : 'assets'} size={21} />
          </div>
          <div className="asset-title-block">
            <span className={`asset-kind-pill ${asset.kind}`}>{ASSET_KIND_LABEL[asset.kind]}</span>
            <h3>
              <button type="button" className="asset-title-btn" onClick={onOpen}>
                {asset.name}
              </button>
            </h3>
            <div className="asset-card-meta">
              <span>Started {formatMonthYear(asset.startedOn)}</span>
            </div>
          </div>
        </div>
        <div className="asset-card-controls">
          <span className={`asset-status ${status.tone}`}>{status.label}</span>
          <button
            type="button"
            className={`asset-collapse${collapsed ? ' is-collapsed' : ''}`}
            aria-expanded={!collapsed}
            aria-controls={bodyId}
            aria-label={`${collapsed ? 'Expand' : 'Collapse'} ${asset.name}`}
            onClick={onToggle}
          >
            <Icon name="chevronDown" size={18} />
          </button>
        </div>
      </div>

      <div className="asset-card-body" id={bodyId}>
        {collapsed ? (
          <div className="asset-collapsed-summary">
            <span>
              <strong className={netClass}>{signedMoney(totals.net, cur)}</strong> net · {monthShort}
            </span>
            <span>
              {formatMoney(totals.income, cur)} in · {formatMoney(totals.expenses, cur)} out
            </span>
          </div>
        ) : (
          <>
            {asset.stage !== 'operating' && (
              <div className="asset-journey">
                <div className="asset-journey-head">
                  <strong>Build journey</strong>
                  <span>{asset.stage === 'building' ? 'In build' : 'Setting up'}</span>
                </div>
                <CardStageTrack stage={asset.stage} />
              </div>
            )}

            <div className="asset-stats">
              <div>
                <span>Income · {monthShort}</span>
                <strong className={totals.income > 0 ? 'pos' : ''}>
                  {formatMoney(totals.income, cur)}
                </strong>
              </div>
              <div>
                <span>Operating expenses · {monthShort}</span>
                <strong>{formatMoney(totals.expenses, cur)}</strong>
              </div>
              <div>
                <span>Net cash flow · {monthShort}</span>
                <strong className={`${netClass} small-value`}>{signedMoney(totals.net, cur)}</strong>
              </div>
            </div>

            <div className="asset-capital">
              <div className="asset-capital-head">
                <span>{asset.kind === 'stream' ? 'Capital invested' : 'Goal funding'}</span>
                <strong>
                  {formatMoney(capital, cur)}
                  {asset.capitalTarget ? (
                    <small>{targetMet ? ' · target met' : ` of ${formatMoney(asset.capitalTarget, cur)}`}</small>
                  ) : null}
                </strong>
              </div>
              {asset.capitalTarget ? (
                <div className={`progress${asset.kind === 'goal' ? ' blue' : ''}`}>
                  <span style={{ width: `${percent}%` }} />
                </div>
              ) : null}
              {totals.capital > 0 && (
                <p className="asset-capital-sub">
                  {formatMoney(totals.capital, cur)} contributed in {monthShort}
                </p>
              )}
            </div>

            {progress.total > 0 && (
              <div className={`asset-milestone-peek${progress.next ? '' : ' done'}`}>
                <Icon name={progress.next ? 'flag' : 'check'} size={17} />
                {progress.next ? (
                  <div>
                    <strong>Next: {progress.next.text}</strong>
                    <small>
                      Step {progress.nextIndex + 1} of {progress.total}
                      {progress.next.dueDate ? ` · ${formatDate(progress.next.dueDate)}` : ''}
                    </small>
                  </div>
                ) : (
                  <div>
                    <strong>All milestones complete</strong>
                    <small>
                      {progress.done} of {progress.total} steps done
                    </small>
                  </div>
                )}
              </div>
            )}

            <div className="asset-card-foot">
              <button type="button" className="btn small primary" onClick={onLog}>
                Log money
              </button>
              <button type="button" className="btn small" onClick={onOpen}>
                Open
              </button>
            </div>
          </>
        )}
      </div>
    </article>
  );
}

function AllAssetActivity({
  store,
  month,
  onClose,
}: {
  store: Store;
  month: string;
  onClose: () => void;
}) {
  const { data } = store;
  const cur = data.settings.currency;
  const rows = allAssetLinkedEntries(data, month);
  const income = rows.filter((row) => row.role === 'income').reduce((sum, row) => sum + row.amount, 0);
  const expenses = rows.filter((row) => row.role === 'expense').reduce((sum, row) => sum + row.amount, 0);
  const capital = rows.filter((row) => row.role === 'capital').reduce((sum, row) => sum + row.amount, 0);

  return (
    <Modal title="All linked activity" onClose={onClose} wide>
      <div className="asset-section-top">
        <h3>{monthYearLabel(month)}</h3>
        <span className="asset-helper">
          {rows.length} {rows.length === 1 ? 'linked entry' : 'linked entries'}
        </span>
      </div>
      <div className="asset-all-summary">
        <div>
          <span>Income</span>
          <strong className="pos">{formatMoney(income, cur)}</strong>
        </div>
        <div>
          <span>Operating expenses</span>
          <strong>{formatMoney(expenses, cur)}</strong>
        </div>
        <div>
          <span>Contributions</span>
          <strong className="asset-blue-text">{formatMoney(capital, cur)}</strong>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="asset-detail-empty">
          No linked activity in {monthYearLabel(month)}. A quiet month does not change the goals.
        </div>
      ) : (
        <div className="asset-activity-list">
          {rows.map((row) => (
            <div className="asset-activity-row asset-all-row" key={row.key}>
              <time className="asset-activity-date" dateTime={row.date}>
                {formatDate(row.date)}
              </time>
              <div className="asset-activity-copy">
                <strong>{row.title}</strong>
                <span>
                  <span className={`asset-role ${row.role}`}>{ASSET_ROLE_LABEL[row.role]}</span>
                  {row.assetName ? ` · ${row.assetName}` : ''}
                </span>
              </div>
              <strong className={`asset-activity-amount ${row.role}`}>
                {row.role === 'income' ? '+' : row.role === 'expense' ? '−' : ''}
                {formatMoney(row.amount, cur)}
              </strong>
            </div>
          ))}
        </div>
      )}

      <p className="asset-all-foot">
        <strong>One ledger.</strong> Income and operating expenses affect cash flow. Contributions
        build capital and are excluded from it. Every row links to an existing Walnut entry, not a copy.
      </p>
    </Modal>
  );
}

export function Assets({ store }: { store: Store }) {
  const { data } = store;
  const today = todayISO();
  const [filter, setFilter] = useState<Filter>('all');
  const [month, setMonth] = useState(today.slice(0, 7));
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loggingId, setLoggingId] = useState<string | null>(null);
  const [allActivity, setAllActivity] = useState(false);

  const months = useMemo(() => {
    const set = new Set(lastMonths(today, 12));
    for (const tx of data.transactions) if (tx.assetId) set.add(tx.date.slice(0, 7));
    for (const transfer of data.transfers) if (transfer.assetId) set.add(transfer.date.slice(0, 7));
    for (const asset of data.assets) set.add(asset.startedOn.slice(0, 7));
    set.add(month);
    return [...set].sort().reverse();
  }, [data, month, today]);

  const overview = assetOverview(data, month);
  const filtered = data.assets.filter((asset) => filter === 'all' || asset.kind === filter);
  const activeAsset = data.assets.find((asset) => asset.id === activeId) ?? null;
  const logAsset = data.assets.find((asset) => asset.id === loggingId) ?? null;
  const count = (value: Filter) =>
    value === 'all' ? data.assets.length : data.assets.filter((asset) => asset.kind === value).length;

  function toggleCollapsed(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <>
      <div className="topbar">
        <div className="page-head">
          <span className="eyebrow">Build &amp; cash flow</span>
          <h1>
            Assets<span className="accent">.</span>
          </h1>
          <p className="page-sub">Income streams &amp; ownership goals, built one step at a time.</p>
        </div>
        <div className="topbar-actions asset-topbar-actions">
          <div className="asset-month">
            <Select
              value={month}
              ariaLabel="Asset month"
              options={months.map((value) => ({ value, label: monthYearLabel(value) }))}
              onChange={setMonth}
            />
          </div>
          <button type="button" className="btn primary" onClick={() => setAdding(true)}>
            <Icon name="plus" size={17} /> New asset
          </button>
        </div>
      </div>

      <section className="asset-overview" aria-label="Asset overview for the selected month">
        <article className="asset-metric primary">
          <span className="asset-metric-label">
            Asset net cash flow · <span>{monthLabel(month)}</span>
          </span>
          <strong className={overview.net < 0 ? 'neg' : overview.net > 0 ? 'pos' : ''}>
            {signedMoney(overview.net, data.settings.currency)}
          </strong>
          <small>
            {data.assets.length} {data.assets.length === 1 ? 'asset' : 'assets'} · income minus operating costs
          </small>
        </article>
        <article className="asset-metric">
          <span className="asset-metric-label">
            Income · <span>{monthLabel(month)}</span>
          </span>
          <strong className="pos">{formatMoney(overview.income, data.settings.currency)}</strong>
          <small>Every linked asset entry counts once</small>
        </article>
        <article className="asset-metric">
          <span className="asset-metric-label">
            Operating expenses · <span>{monthLabel(month)}</span>
          </span>
          <strong>{formatMoney(overview.expenses, data.settings.currency)}</strong>
          <small>Contributions excluded</small>
        </article>
        <article className="asset-metric">
          <span className="asset-metric-label">Capital contributed</span>
          <strong>{formatMoney(overview.capital, data.settings.currency)}</strong>
          <small>Kept separate from cash flow</small>
        </article>
      </section>

      <div className="asset-section-heading">
        <div>
          <h2>Your assets</h2>
          <p>Each card keeps the build goal and its linked cash flow together.</p>
        </div>
        <button type="button" className="btn small" onClick={() => setAllActivity(true)}>
          All linked activity <Icon name="arrowUp" size={14} />
        </button>
      </div>

      <div className="asset-filter-bar">
        <div className="asset-filters" role="group" aria-label="Filter assets">
          {(['all', 'stream', 'goal'] as Filter[]).map((value) => (
            <button
              key={value}
              type="button"
              className={`asset-filter${filter === value ? ' active' : ''}`}
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
            >
              {value === 'all' ? 'All assets' : value === 'stream' ? 'Income streams' : 'Ownership goals'}
              <span>{count(value)}</span>
            </button>
          ))}
        </div>
        <span className="asset-result-count">
          {filtered.length} of {data.assets.length} shown
        </span>
      </div>

      {data.assets.length === 0 ? (
        <div className="card empty asset-empty">
          No assets yet. Start with an income stream or an ownership goal, then link its cash flow.
        </div>
      ) : filtered.length === 0 ? (
        <div className="card empty asset-empty">
          Nothing in this view yet.
          <button type="button" className="btn small" onClick={() => setFilter('all')}>
            Show all assets
          </button>
        </div>
      ) : (
        <div className="asset-grid">
          {filtered.map((asset) => (
            <AssetCard
              key={asset.id}
              store={store}
              asset={asset}
              month={month}
              collapsed={collapsed.has(asset.id)}
              onToggle={() => toggleCollapsed(asset.id)}
              onOpen={() => setActiveId(asset.id)}
              onLog={() => setLoggingId(asset.id)}
            />
          ))}
        </div>
      )}

      {adding && <AssetForm store={store} onClose={() => setAdding(false)} />}
      {activeAsset && (
        <AssetDetailSheet
          store={store}
          asset={activeAsset}
          month={month}
          onClose={() => setActiveId(null)}
        />
      )}
      {logAsset && (
        <LogMoneyForm
          store={store}
          asset={logAsset}
          onClose={() => setLoggingId(null)}
        />
      )}
      {allActivity && (
        <AllAssetActivity store={store} month={month} onClose={() => setAllActivity(false)} />
      )}
    </>
  );
}
