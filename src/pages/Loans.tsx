import { useState } from 'react';
import type { Store } from '../store';
import type { Favor, Loan, LoanDirection } from '../lib/types';
import { favorTotals, loanStatus, loanTotals, remainingAmount, repaidAmount } from '../lib/calc';
import { formatDate, formatMoney, todayISO } from '../lib/format';
import { LoanForm } from '../components/LoanForm';
import { RepaymentForm } from '../components/RepaymentForm';
import { FavorForm } from '../components/FavorForm';
import { confirmDialog } from '../components/confirm';
import { Icon } from '../components/Icon';

const STATUS_LABEL = { open: 'Open', partial: 'Partially paid', settled: 'Settled', overdue: 'Overdue' } as const;
const STATUS_CLASS = { open: 'up', partial: 'warn', settled: 'up', overdue: 'down' } as const;

type Tab = LoanDirection | 'favors';

/** Newest first. The lists are already filtered, so this only decides their order. */
function newestFirst(a: { date: string }, b: { date: string }): number {
  if (a.date === b.date) return 0;
  return a.date < b.date ? 1 : -1;
}

export function Loans({ store }: { store: Store }) {
  const { data, update } = store;
  const cur = data.settings.currency;
  const today = todayISO();
  const [tab, setTab] = useState<Tab>('borrowed');
  const [addingLoan, setAddingLoan] = useState(false);
  const [addingFavor, setAddingFavor] = useState(false);
  const [repaying, setRepaying] = useState<Loan | null>(null);
  const [editing, setEditing] = useState<Loan | null>(null);
  const [editingFavor, setEditingFavor] = useState<Favor | null>(null);

  const totals = loanTotals(data.loans);
  const isFavors = tab === 'favors';

  // Settled loans keep their history but leave the working list, so what is still owed reads first.
  const loansHere = isFavors ? [] : data.loans.filter((l) => l.direction === tab);
  const openLoans = loansHere.filter((l) => remainingAmount(l) > 0).sort(newestFirst);
  const settledLoans = loansHere.filter((l) => remainingAmount(l) === 0).sort(newestFirst);

  const openFavors = data.favors.filter((f) => !f.settled).sort(newestFirst);
  const settledFavors = data.favors.filter((f) => f.settled).sort(newestFirst);
  const favors = favorTotals(data.favors);

  async function remove(id: string) {
    const ok = await confirmDialog({
      title: 'Delete this loan?',
      message: 'Its repayment history is deleted too. This cannot be undone.',
      confirmLabel: 'Delete',
      tone: 'danger',
    });
    if (!ok) return;
    update((prev) => ({ ...prev, loans: prev.loans.filter((l) => l.id !== id) }));
  }

  async function removeRepayment(loanId: string, repaymentId: string) {
    const ok = await confirmDialog({
      title: 'Delete this repayment?',
      message: 'The amount is added back to the outstanding balance.',
      confirmLabel: 'Delete',
      tone: 'danger',
    });
    if (!ok) return;
    update((prev) => ({
      ...prev,
      loans: prev.loans.map((l) =>
        l.id === loanId ? { ...l, repayments: l.repayments.filter((r) => r.id !== repaymentId) } : l,
      ),
    }));
  }

  function toggleFavor(favor: Favor) {
    update((prev) => ({
      ...prev,
      favors: prev.favors.map((f) => (f.id === favor.id ? { ...f, settled: !f.settled } : f)),
    }));
  }

  async function removeFavor(id: string) {
    const ok = await confirmDialog({
      title: 'Delete this favor?',
      message: 'It is removed from your history. This cannot be undone.',
      confirmLabel: 'Delete',
      tone: 'danger',
    });
    if (!ok) return;
    update((prev) => ({ ...prev, favors: prev.favors.filter((f) => f.id !== id) }));
  }

  /** One card for a loan, whether it is still open or already settled. */
  function loanCard(l: Loan) {
    const st = loanStatus(l, today);
    const repaid = repaidAmount(l);
    const pct = l.principal ? Math.min(100, (repaid / l.principal) * 100) : 0;
    const settled = remainingAmount(l) === 0;
    return (
      <section className="card col-6" key={l.id}>
        <div className="card-head">
          <div>
            <h2>{l.counterparty}</h2>
            <p>Started {formatDate(l.date)}{l.dueDate ? ` · Due ${formatDate(l.dueDate)}` : ''}</p>
          </div>
          <span className={`badge ${STATUS_CLASS[st]}`}>{STATUS_LABEL[st]}</span>
        </div>
        {l.note && <p className="muted" style={{ marginTop: 0 }}>{l.note}</p>}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
          <span>Remaining <strong>{formatMoney(remainingAmount(l), cur)}</strong></span>
          <span className="muted">of {formatMoney(l.principal, cur)}</span>
        </div>
        <div className="progress"><span style={{ width: `${pct}%` }} /></div>

        {l.repayments.length > 0 && (
          <div className="table-wrap" style={{ marginTop: 12 }}>
          <table>
            <tbody>
              {l.repayments.map((r) => (
                <tr key={r.id}>
                  <td>{formatDate(r.date)}</td>
                  <td className="muted">{r.note}</td>
                  <td className="num">{formatMoney(r.amount, cur)}</td>
                  <td style={{ textAlign: 'right' }}>
                    <button
                      className="icon-btn danger"
                      aria-label="Delete repayment"
                      onClick={() => removeRepayment(l.id, r.id)}
                    >
                      <Icon name="trash" size={15} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
          {!settled && (
            <button className="btn primary small" onClick={() => setRepaying(l)}>
              {l.direction === 'borrowed' ? 'Record repayment' : 'Record received payment'}
            </button>
          )}
          <button className="btn small" onClick={() => setEditing(l)}>
            <Icon name="pencil" size={14} /> Edit
          </button>
          <button className="btn small danger" onClick={() => remove(l.id)}>Delete</button>
        </div>
      </section>
    );
  }

  /** One card for a favor, whether it is open or settled. */
  function favorCard(f: Favor) {
    const theyCovered = f.direction === 'theyCovered';
    return (
      <section className="card col-6" key={f.id}>
        <div className="card-head">
          <div>
            <h2>{f.person}</h2>
            <p>{formatDate(f.date)}</p>
          </div>
          <span className={`badge ${f.settled ? 'up' : 'warn'}`}>{f.settled ? 'Settled' : 'Open'}</span>
        </div>
        {f.note && <p className="muted" style={{ marginTop: 0 }}>{f.note}</p>}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
          <span className="muted">{theyCovered ? 'They covered for you' : 'You covered for them'}</span>
          <strong className={theyCovered ? 'neg' : 'pos'}>{formatMoney(f.amount, cur)}</strong>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
          <button className="btn small" onClick={() => toggleFavor(f)}>
            {f.settled ? 'Reopen' : 'Mark settled'}
          </button>
          <button className="btn small" onClick={() => setEditingFavor(f)}>
            <Icon name="pencil" size={14} /> Edit
          </button>
          <button className="btn small danger" onClick={() => removeFavor(f.id)}>Delete</button>
        </div>
      </section>
    );
  }

  return (
    <>
      <div className="topbar">
        <div className="page-head">
          <span className="eyebrow">Borrowed &amp; lent</span>
          <h1>Loans<span className="accent">.</span></h1>
        </div>
        <div className="topbar-actions">
          {isFavors ? (
            <button className="btn primary" onClick={() => setAddingFavor(true)}>
              <Icon name="plus" size={17} /> New favor
            </button>
          ) : (
            <button className="btn primary" onClick={() => setAddingLoan(true)}>
              <Icon name="plus" size={17} /> New loan
            </button>
          )}
        </div>
      </div>

      {isFavors ? (
        <div className="grid" style={{ marginBottom: 20 }}>
          <section className="card col-6">
            <div className="muted" style={{ fontSize: 13 }}>Friends covered for you</div>
            <div className="stat neg">{formatMoney(favors.theyCovered, cur)}</div>
            <p className="muted small" style={{ margin: '4px 0 0' }}>Open favors only</p>
          </section>
          <section className="card col-6">
            <div className="muted" style={{ fontSize: 13 }}>You covered for friends</div>
            <div className="stat pos">{formatMoney(favors.iCovered, cur)}</div>
            <p className="muted small" style={{ margin: '4px 0 0' }}>Open favors only</p>
          </section>
        </div>
      ) : (
        <div className="grid" style={{ marginBottom: 20 }}>
          <section className="card col-4">
            <div className="muted" style={{ fontSize: 13 }}>You owe</div>
            <div className="stat neg">{formatMoney(totals.owe, cur)}</div>
          </section>
          <section className="card col-4">
            <div className="muted" style={{ fontSize: 13 }}>Owed to you</div>
            <div className="stat pos">{formatMoney(totals.owed, cur)}</div>
          </section>
          <section className="card col-4">
            <div className="muted" style={{ fontSize: 13 }}>Net position</div>
            <div className={`stat ${totals.net >= 0 ? 'pos' : 'neg'}`}>{formatMoney(totals.net, cur)}</div>
          </section>
        </div>
      )}

      <div className="tabs" style={{ marginBottom: 16 }}>
        <button className={`tab${tab === 'borrowed' ? ' active' : ''}`} onClick={() => setTab('borrowed')}>I Owe</button>
        <button className={`tab${tab === 'lent' ? ' active' : ''}`} onClick={() => setTab('lent')}>Owed to Me</button>
        <button className={`tab${tab === 'favors' ? ' active' : ''}`} onClick={() => setTab('favors')}>Favors</button>
      </div>

      {isFavors ? (
        <>
          {openFavors.length === 0 && settledFavors.length === 0 && (
            <div className="card empty">
              No favors yet. Add one when a friend covers a bill, so neither of you has to remember it.
            </div>
          )}
          {openFavors.length > 0 && <div className="grid">{openFavors.map(favorCard)}</div>}
          {settledFavors.length > 0 && (
            <details className="settled-block">
              <summary>Settled favors · {settledFavors.length}</summary>
              <div className="grid">{settledFavors.map(favorCard)}</div>
            </details>
          )}
        </>
      ) : (
        <>
          {openLoans.length === 0 && settledLoans.length === 0 && (
            <div className="card empty">No loans here yet.</div>
          )}
          {openLoans.length === 0 && settledLoans.length > 0 && (
            <div className="card empty">Nothing outstanding here. Settled loans are below.</div>
          )}
          {openLoans.length > 0 && <div className="grid">{openLoans.map(loanCard)}</div>}
          {settledLoans.length > 0 && (
            <details className="settled-block">
              <summary>Settled loans · {settledLoans.length}</summary>
              <div className="grid">{settledLoans.map(loanCard)}</div>
            </details>
          )}
        </>
      )}

      {addingLoan && (
        <LoanForm
          store={store}
          direction={tab === 'lent' ? 'lent' : 'borrowed'}
          onClose={() => setAddingLoan(false)}
        />
      )}
      {editing && (
        <LoanForm
          store={store}
          direction={editing.direction}
          existing={editing}
          onClose={() => setEditing(null)}
        />
      )}
      {repaying && <RepaymentForm store={store} loan={repaying} onClose={() => setRepaying(null)} />}
      {addingFavor && <FavorForm store={store} onClose={() => setAddingFavor(false)} />}
      {editingFavor && (
        <FavorForm store={store} existing={editingFavor} onClose={() => setEditingFavor(null)} />
      )}
    </>
  );
}
