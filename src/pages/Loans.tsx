import { useState } from 'react';
import type { Store } from '../store';
import type { Loan, LoanDirection } from '../lib/types';
import { loanStatus, loanTotals, remainingAmount, repaidAmount } from '../lib/calc';
import { formatDate, formatMoney, todayISO } from '../lib/format';
import { LoanForm } from '../components/LoanForm';
import { RepaymentForm } from '../components/RepaymentForm';
import { confirmDialog } from '../components/confirm';
import { Icon } from '../components/Icon';

const STATUS_LABEL = { open: 'Open', partial: 'Partially paid', settled: 'Settled', overdue: 'Overdue' } as const;
const STATUS_CLASS = { open: 'up', partial: 'warn', settled: 'up', overdue: 'down' } as const;

export function Loans({ store }: { store: Store }) {
  const { data, update } = store;
  const cur = data.settings.currency;
  const today = todayISO();
  const [tab, setTab] = useState<LoanDirection>('borrowed');
  const [adding, setAdding] = useState(false);
  const [repaying, setRepaying] = useState<Loan | null>(null);
  const [editing, setEditing] = useState<Loan | null>(null);

  const totals = loanTotals(data.loans);
  const list = data.loans.filter((l) => l.direction === tab).sort((a, b) => (a.date < b.date ? 1 : -1));

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

  return (
    <>
      <div className="topbar">
        <div className="page-head">
          <span className="eyebrow">Borrowed &amp; lent</span>
          <h1>Loans<span className="accent">.</span></h1>
        </div>
        <div className="topbar-actions">
          <button className="btn primary" onClick={() => setAdding(true)}>
            <Icon name="plus" size={17} /> New loan
          </button>
        </div>
      </div>

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

      <div className="tabs" style={{ marginBottom: 16 }}>
        <button className={`tab${tab === 'borrowed' ? ' active' : ''}`} onClick={() => setTab('borrowed')}>I Owe</button>
        <button className={`tab${tab === 'lent' ? ' active' : ''}`} onClick={() => setTab('lent')}>Owed to Me</button>
      </div>

      {list.length === 0 && <div className="card empty">No loans here yet.</div>}

      <div className="grid">
        {list.map((l) => {
          const st = loanStatus(l, today);
          const repaid = repaidAmount(l);
          const pct = l.principal ? Math.min(100, (repaid / l.principal) * 100) : 0;
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
                {remainingAmount(l) > 0 && (
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
        })}
      </div>

      {adding && <LoanForm store={store} direction={tab} onClose={() => setAdding(false)} />}
      {editing && (
        <LoanForm
          store={store}
          direction={editing.direction}
          existing={editing}
          onClose={() => setEditing(null)}
        />
      )}
      {repaying && <RepaymentForm store={store} loan={repaying} onClose={() => setRepaying(null)} />}
    </>
  );
}
