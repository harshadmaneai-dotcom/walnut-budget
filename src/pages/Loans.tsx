import { useState } from 'react';
import type { Store } from '../store';
import type { Favor, FavorDirection, Loan, LoanDirection, Person } from '../lib/types';
import {
  favorBalance,
  favorSummary,
  loanStatus,
  loanTotals,
  remainingAmount,
  repaidAmount,
} from '../lib/calc';
import { formatDate, formatMoney, todayISO } from '../lib/format';
import { LoanForm } from '../components/LoanForm';
import { RepaymentForm } from '../components/RepaymentForm';
import { FavorForm } from '../components/FavorForm';
import { PersonForm } from '../components/PersonForm';
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
  const [addingPerson, setAddingPerson] = useState(false);
  const [renaming, setRenaming] = useState<Person | null>(null);
  const [repaying, setRepaying] = useState<Loan | null>(null);
  const [editing, setEditing] = useState<Loan | null>(null);
  const [logging, setLogging] = useState<{ person?: Person; direction?: FavorDirection } | null>(null);
  const [editingFavor, setEditingFavor] = useState<Favor | null>(null);

  const totals = loanTotals(data.loans);
  const isFavors = tab === 'favors';

  // Settled loans keep their history but leave the working list, so what is still owed reads first.
  const loansHere = isFavors ? [] : data.loans.filter((l) => l.direction === tab);
  const openLoans = loansHere.filter((l) => remainingAmount(l) > 0).sort(newestFirst);
  const settledLoans = loansHere.filter((l) => remainingAmount(l) === 0).sort(newestFirst);

  const summary = favorSummary(data.favors, data.favorPeople);
  const balances = new Map(
    data.favorPeople.map((person) => [
      person.id,
      favorBalance(data.favors.filter((favor) => favor.personId === person.id)),
    ]),
  );
  // People who still owe or are owed come first; settled ones keep their full history after them.
  const people = [...data.favorPeople].sort((a, b) => {
    const openA = (balances.get(a.id)?.net ?? 0) === 0 ? 1 : 0;
    const openB = (balances.get(b.id)?.net ?? 0) === 0 ? 1 : 0;
    if (openA !== openB) return openA - openB;
    return a.name.localeCompare(b.name);
  });

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

  async function removePerson(person: Person) {
    const ok = await confirmDialog({
      title: `Delete ${person.name}?`,
      message: 'Every favor recorded with them is deleted too. This cannot be undone.',
      confirmLabel: 'Delete',
      tone: 'danger',
    });
    if (!ok) return;
    update((prev) => ({
      ...prev,
      favorPeople: prev.favorPeople.filter((p) => p.id !== person.id),
      favors: prev.favors.filter((f) => f.personId !== person.id),
    }));
  }

  async function removeFavor(favor: Favor) {
    const ok = await confirmDialog({
      title: 'Delete this favor entry?',
      message: 'The balance for this person is recalculated without it.',
      confirmLabel: 'Delete',
      tone: 'danger',
    });
    if (!ok) return;
    update((prev) => ({ ...prev, favors: prev.favors.filter((f) => f.id !== favor.id) }));
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

  /** One card per person: their entries stack here, and the balance comes out of the amounts. */
  function personCard(person: Person) {
    const entries = data.favors.filter((f) => f.personId === person.id).sort(newestFirst);
    const balance = favorBalance(entries);
    const tone = balance.net > 0 ? 'down' : balance.net < 0 ? 'warn' : 'up';
    const label = balance.net > 0
      ? `You owe ${formatMoney(balance.net, cur)}`
      : balance.net < 0
        ? `Owes you ${formatMoney(-balance.net, cur)}`
        : 'Settled';

    return (
      <section className="card col-6" key={person.id}>
        <div className="card-head">
          <div>
            <h2>{person.name}</h2>
            <p>
              {entries.length === 0
                ? 'No favors recorded yet'
                : `${entries.length} ${entries.length === 1 ? 'entry' : 'entries'}`}
            </p>
          </div>
          <span className={`badge ${tone}`}>{label}</span>
        </div>

        {/* Same pill, same height for every action, so the row reads as one control strip. */}
        <div className="favor-toolbar">
          <button
            className="btn small primary"
            onClick={() => setLogging({ person, direction: 'theyCovered' })}
          >
            <Icon name="plus" size={14} /> They paid
          </button>
          <button
            className="btn small"
            onClick={() => setLogging({ person, direction: 'iCovered' })}
          >
            <Icon name="plus" size={14} /> I paid
          </button>
          <button className="btn small" onClick={() => setRenaming(person)}>
            <Icon name="pencil" size={14} /> Rename
          </button>
          <button
            className="btn small danger"
            aria-label={`Delete ${person.name}`}
            onClick={() => removePerson(person)}
          >
            <Icon name="trash" size={14} /> Delete
          </button>
        </div>

        {entries.length > 0 && (
          <div className="table-wrap favor-table" style={{ marginTop: 12 }}>
            <table>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.id}>
                    <td className="favor-date">{formatDate(entry.date)}</td>
                    <td className="favor-note muted">
                      {entry.note || (entry.direction === 'theyCovered' ? 'They paid for me' : 'I paid for them')}
                    </td>
                    <td className={`num favor-amount ${entry.direction === 'theyCovered' ? 'neg' : 'pos'}`}>
                      {entry.direction === 'theyCovered' ? '+' : '−'}{formatMoney(entry.amount, cur)}
                    </td>
                    {/* Icon buttons are inline-flex: as grid blocks they stacked into two rows. */}
                    <td className="favor-actions">
                      <div className="favor-row-actions">
                        <button
                          className="icon-btn"
                          aria-label="Edit entry"
                          title="Edit entry"
                          onClick={() => setEditingFavor(entry)}
                        >
                          <Icon name="pencil" size={15} />
                        </button>
                        <button
                          className="icon-btn danger"
                          aria-label="Delete entry"
                          title="Delete entry"
                          onClick={() => void removeFavor(entry)}
                        >
                          <Icon name="trash" size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="muted small favor-foot">
          They covered {formatMoney(balance.theyCovered, cur)} · You covered {formatMoney(balance.iCovered, cur)}
        </p>
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
            <>
              <button className="btn" onClick={() => setAddingPerson(true)}>
                <Icon name="users" size={17} /> Add person
              </button>
              <button className="btn primary" onClick={() => setLogging({})}>
                <Icon name="plus" size={17} /> New favor
              </button>
            </>
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
            <div className="muted" style={{ fontSize: 13 }}>You owe friends</div>
            <div className="stat neg">{formatMoney(summary.owe, cur)}</div>
            <p className="muted small" style={{ margin: '4px 0 0' }}>Where they covered more than you</p>
          </section>
          <section className="card col-6">
            <div className="muted" style={{ fontSize: 13 }}>Friends owe you</div>
            <div className="stat pos">{formatMoney(summary.owed, cur)}</div>
            <p className="muted small" style={{ margin: '4px 0 0' }}>Where you covered more than them</p>
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
          {people.length === 0 && (
            <div className="card empty">
              No people yet. Add a person, then record when they cover you or you cover them.
            </div>
          )}
          {people.length > 0 && <div className="grid">{people.map(personCard)}</div>}
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
      {addingPerson && <PersonForm store={store} onClose={() => setAddingPerson(false)} />}
      {renaming && <PersonForm store={store} existing={renaming} onClose={() => setRenaming(null)} />}
      {logging && (
        <FavorForm
          store={store}
          person={logging.person}
          direction={logging.direction}
          onClose={() => setLogging(null)}
        />
      )}
      {editingFavor && (
        <FavorForm store={store} existing={editingFavor} onClose={() => setEditingFavor(null)} />
      )}
    </>
  );
}
