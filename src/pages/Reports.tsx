import { useMemo, useState } from 'react';
import type { Store } from '../store';
import { formatMoney, todayISO } from '../lib/format';
import { transactionsToCsv, downloadFile } from '../lib/csv';
import { DatePicker } from '../components/DatePicker';
import { GROUPS, groupSpend, groupTotal } from '../lib/groups';

export function Reports({ store }: { store: Store }) {
  const { data } = store;
  const cur = data.settings.currency;
  const today = todayISO();
  const [from, setFrom] = useState(`${today.slice(0, 8)}01`);
  const [to, setTo] = useState(today);

  const inRange = useMemo(
    () => data.transactions.filter((t) => t.date >= from && t.date <= to),
    [data.transactions, from, to],
  );

  const income = inRange.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const expense = inRange.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0);

  const byCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of inRange) {
      if (t.type !== 'expense') continue;
      map.set(t.categoryId, (map.get(t.categoryId) ?? 0) + t.amount);
    }
    return [...map.entries()]
      .map(([id, amt]) => ({ name: data.categories.find((c) => c.id === id)?.name ?? 'Unknown', amt }))
      .sort((a, b) => b.amt - a.amt);
  }, [inRange, data.categories]);

  const maxCat = Math.max(1, ...byCategory.map((c) => c.amt));
  const groupTotals = groupSpend(inRange, data.categories);
  const groupTotalValue = groupTotal(groupTotals);

  return (
    <>
      <div className="topbar">
        <div className="page-head">
          <span className="eyebrow">Insights</span>
          <h1>Reports<span className="accent">.</span></h1>
        </div>
        <div className="topbar-actions">
          <button className="btn" onClick={() => downloadFile('transactions.csv', transactionsToCsv(data), 'text/csv')}>
            Export CSV
          </button>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="toolbar" style={{ marginBottom: 0 }}>
          <label>From <DatePicker value={from} onChange={setFrom} clearable={false} /></label>
          <label>To <DatePicker value={to} onChange={setTo} clearable={false} /></label>
        </div>
      </div>

      <div className="grid" style={{ marginBottom: 20 }}>
        <section className="card col-4">
          <div className="muted" style={{ fontSize: 13 }}>Income</div>
          <div className="stat pos">{formatMoney(income, cur)}</div>
        </section>
        <section className="card col-4">
          <div className="muted" style={{ fontSize: 13 }}>Expenses</div>
          <div className="stat neg">{formatMoney(expense, cur)}</div>
        </section>
        <section className="card col-4">
          <div className="muted" style={{ fontSize: 13 }}>Net</div>
          <div className={`stat ${income - expense >= 0 ? 'pos' : 'neg'}`}>{formatMoney(income - expense, cur)}</div>
        </section>
      </div>

      <section className="card" style={{ marginBottom: 20 }}>
        <div className="card-head"><div><h2>Spending by group</h2><p>Needs, expenses and investments in the selected range</p></div></div>
        {groupTotalValue === 0 && <div className="empty">No expenses in this range.</div>}
        {GROUPS.map((g) => {
          const value = groupTotals[g.id];
          const pct = groupTotalValue ? (value / groupTotalValue) * 100 : 0;
          return (
            <div key={g.id} style={{ marginBottom: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
                <span><span className="mix-dot" style={{ background: g.color }} />{g.label}</span>
                <span className="muted">{formatMoney(value, cur)} · {Math.round(pct)}%</span>
              </div>
              <div className="progress"><span style={{ width: `${pct}%`, background: g.color }} /></div>
            </div>
          );
        })}
      </section>

      <section className="card">
        <div className="card-head"><div><h2>Spending by category</h2><p>Expenses in the selected range</p></div></div>
        {byCategory.length === 0 && <div className="empty">No expenses in this range.</div>}
        {byCategory.map((c) => (
          <div key={c.name} style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
              <span>{c.name}</span>
              <span className="muted">{formatMoney(c.amt, cur)}</span>
            </div>
            <div className="progress"><span style={{ width: `${(c.amt / maxCat) * 100}%` }} /></div>
          </div>
        ))}
      </section>
    </>
  );
}
