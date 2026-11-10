import { useState } from 'react';
import type { Store } from '../store';
import { accountBalance, lastMonths, loanStatus, loanTotals, monthTotals, totalBalance, remainingAmount } from '../lib/calc';
import { formatDate, formatMoney, monthLabel, todayISO } from '../lib/format';
import { TransactionForm } from '../components/TransactionForm';
import { GroupDonut } from '../components/GroupDonut';
import { Icon } from '../components/Icon';
import { GROUPS, categoryGroup, groupSpend, groupTotal } from '../lib/groups';

export function Dashboard({ store }: { store: Store }) {
  const { data } = store;
  const cur = data.settings.currency;
  const today = todayISO();
  const thisMonth = today.slice(0, 7);
  const [adding, setAdding] = useState(false);

  const totals = monthTotals(data.transactions, thisMonth);
  const months = lastMonths(today, 6);
  const series = months.map((m) => ({ m, ...monthTotals(data.transactions, m) }));
  const maxVal = Math.max(1, ...series.flatMap((s) => [s.income, s.expense]));

  const groupTotals = groupSpend(data.transactions, data.categories, thisMonth);
  const totalSpend = groupTotal(groupTotals);
  const groupSlices = GROUPS.map((g) => ({
    id: g.id,
    label: g.label,
    color: g.color,
    value: groupTotals[g.id],
  }));

  const loans = loanTotals(data.loans);
  const upcoming = data.loans
    .filter((l) => remainingAmount(l) > 0 && l.dueDate)
    .sort((a, b) => (a.dueDate! < b.dueDate! ? -1 : 1))
    .slice(0, 4);

  const budgets = data.categories.filter((c) => c.type === 'expense' && c.monthlyBudget);
  const spentFor = (catId: string) =>
    data.transactions
      .filter((t) => t.type === 'expense' && t.categoryId === catId && t.date.startsWith(thisMonth))
      .reduce((s, t) => s + t.amount, 0);

  const recent = [...data.transactions].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 6);
  const cat = (id: string) => data.categories.find((c) => c.id === id);

  const net = totals.income - totals.expense;
  const spentShare = totals.income > 0 ? Math.min(100, (totals.expense / totals.income) * 100) : 0;
  const netLabel = net < 0 ? 'Over' : net > 0 ? 'Saving' : 'Even';

  return (
    <>
      <div className="topbar">
        <div className="page-head">
          <span className="eyebrow">Overview · {monthLabel(thisMonth)}</span>
          <h1>Money, sorted<span className="accent">.</span></h1>
        </div>
        <div className="topbar-actions">
          <button className="btn primary" onClick={() => setAdding(true)}>
            <Icon name="plus" size={17} /> Add transaction
          </button>
        </div>
      </div>

      <div className="grid">
        <section className="card balance-card col-7">
          <div className="balance-top">
            <span className="eyebrow">Total balance</span>
            <span className="badge glass">
              <Icon name="wallet" size={13} />
              {data.accounts.length} account{data.accounts.length === 1 ? '' : 's'}
            </span>
          </div>
          <div className="balance-amount">{formatMoney(totalBalance(data), cur)}</div>
          <div className="acct-row">
            {data.accounts.map((a) => (
              <div className="acct-chip" key={a.id}>
                <span className="name">{a.name}</span>
                <strong>{formatMoney(accountBalance(data, a.id), cur)}</strong>
              </div>
            ))}
          </div>
        </section>

        <section className="card month-card col-5">
          <div className="card-head">
            <div><h2>This month</h2><p>{monthLabel(thisMonth)}</p></div>
            <span className={`chip${net < 0 ? ' warn' : ''}`}>{netLabel}</span>
          </div>
          <div className="metric-row">
            <div className="metric">
              <span className="metric-icon in"><Icon name="arrowDown" size={17} /></span>
              <div>
                <span className="metric-label">In</span>
                <strong className="pos">{formatMoney(totals.income, cur)}</strong>
              </div>
            </div>
            <div className="metric">
              <span className="metric-icon out"><Icon name="arrowUp" size={17} /></span>
              <div>
                <span className="metric-label">Out</span>
                <strong className="neg">{formatMoney(totals.expense, cur)}</strong>
              </div>
            </div>
          </div>
          <div className="month-foot">
            <div className="month-bar"><span style={{ width: `${spentShare}%` }} /></div>
            <p className="muted small" style={{ margin: 0 }}>
              {totals.income === 0
                ? 'No income recorded yet this month.'
                : net >= 0
                  ? `${Math.round(100 - spentShare)}% of income left over`
                  : `${Math.round(spentShare)}% of income spent — you're ${formatMoney(-net, cur)} over`}
            </p>
          </div>
        </section>

        <section className="card col-8" data-tour="groups">
          <div className="card-head">
            <div><h2>Where your money goes</h2><p>This month, split into needs, expenses and investments</p></div>
            <span className="chip">{formatMoney(totalSpend, cur)} out</span>
          </div>
          <div className="mix-body">
            <GroupDonut slices={groupSlices} currency={cur} />
            <div className="mix-legend">
              {groupSlices.map((s) => {
                const share = totalSpend ? (s.value / totalSpend) * 100 : 0;
                return (
                  <div className="mix-row" key={s.id}>
                    <span className="mix-dot" style={{ background: s.color }} />
                    <div className="mix-main">
                      <div className="mix-top">
                        <span>{s.label}</span>
                        <span>{formatMoney(s.value, cur)}</span>
                      </div>
                      <div className="progress"><span style={{ width: `${share}%`, background: s.color }} /></div>
                    </div>
                    <span className="mix-pct">{Math.round(share)}%</span>
                  </div>
                );
              })}
              {totalSpend === 0 && (
                <p className="muted" style={{ margin: 0, fontSize: 13 }}>No spending recorded this month yet.</p>
              )}
            </div>
          </div>
        </section>

        <section className="card col-4">
          <div className="card-head"><div><h2>Loans</h2><p>Left to settle</p></div></div>
          <div className="mini-stack">
            <div className="mini-row">
              <span className="muted">You owe</span>
              <strong className="neg">{formatMoney(loans.owe, cur)}</strong>
            </div>
            <div className="mini-row">
              <span className="muted">Owed to you</span>
              <strong className="pos">{formatMoney(loans.owed, cur)}</strong>
            </div>
            <div className="mini-row">
              <span className="muted">Net position</span>
              <strong className={loans.net >= 0 ? 'pos' : 'neg'}>{formatMoney(loans.net, cur)}</strong>
            </div>
          </div>
        </section>

        <section className="card col-8">
          <div className="card-head"><div><h2>Monthly flow</h2><p>Income vs. expenses, last 6 months</p></div></div>
          <div className="bars">
            {series.map((s) => (
              <div className="bar-group" key={s.m}>
                <div className="bar-pair">
                  <div className="bar" title={`Income ${formatMoney(s.income, cur)}`} style={{ height: `${(s.income / maxVal) * 100}%` }} />
                  <div className="bar exp" title={`Expenses ${formatMoney(s.expense, cur)}`} style={{ height: `${(s.expense / maxVal) * 100}%` }} />
                </div>
                <span className="bar-label">{monthLabel(s.m)}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="card col-4">
          <div className="card-head"><div><h2>Upcoming dues</h2><p>Open loans with a date</p></div></div>
          {upcoming.length === 0 && <div className="empty">No upcoming due dates.</div>}
          {upcoming.map((l) => {
            const st = loanStatus(l, today);
            return (
              <div className="list-row" key={l.id}>
                <div className="row-text">
                  <div>{l.counterparty}</div>
                  <div className="meta">Due {formatDate(l.dueDate!)}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div>{formatMoney(remainingAmount(l), cur)}</div>
                  <span className={`badge ${st === 'overdue' ? 'down' : 'warn'}`}>{st === 'overdue' ? 'Overdue' : 'Due soon'}</span>
                </div>
              </div>
            );
          })}
        </section>

        <section className="card col-6">
          <div className="card-head"><div><h2>Budgets</h2><p>This month's category spending</p></div></div>
          {budgets.length === 0 && <div className="empty">No budgets set. Add one in Settings.</div>}
          {budgets.map((c) => {
            const spent = spentFor(c.id);
            const pct = Math.min(100, (spent / c.monthlyBudget!) * 100);
            const over = spent > c.monthlyBudget!;
            return (
              <div key={c.id} style={{ marginBottom: 15 }}>
                <div className="budget-row">
                  <span className="budget-name">{c.name}</span>
                  <span className={`budget-amount ${over ? 'neg' : 'muted'}`}>{formatMoney(spent, cur)} / {formatMoney(c.monthlyBudget!, cur)}</span>
                </div>
                <div className="progress"><span className={over ? 'over' : ''} style={{ width: `${pct}%` }} /></div>
              </div>
            );
          })}
        </section>

        <section className="card col-6">
          <div className="card-head"><div><h2>Recent activity</h2><p>Latest transactions</p></div></div>
          {recent.length === 0 && <div className="empty">No transactions yet. Add your first one above.</div>}
          {recent.map((t) => {
            const c = cat(t.categoryId);
            const grp = c && c.type === 'expense' ? categoryGroup(c) : null;
            return (
              <div className="list-row" key={t.id}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <div className={`dot-icon ${grp ? `g-${grp}` : 'g-income'}`}>
                    <Icon name={t.type === 'income' ? 'arrowDown' : 'arrowUp'} size={17} />
                  </div>
                  <div className="row-text">
                    <div>{c?.name ?? 'Other'}{t.note ? ` · ${t.note}` : ''}</div>
                    <div className="meta">{formatDate(t.date)}</div>
                  </div>
                </div>
                <div className={t.type === 'income' ? 'pos' : 'neg'}>
                  {t.type === 'income' ? '+' : '−'}{formatMoney(t.amount, cur)}
                </div>
              </div>
            );
          })}
        </section>
      </div>

      {adding && <TransactionForm store={store} onClose={() => setAdding(false)} />}
    </>
  );
}
