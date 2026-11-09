import { useState } from 'react';
import type { Store } from '../store';
import type { Category, CategoryGroup, TxType } from '../lib/types';
import { newId } from '../lib/storage';
import { currencySymbol, formatMoney, parseAmount } from '../lib/format';
import { GROUPS, categoryGroup } from '../lib/groups';
import { Select } from './Select';
import { alertDialog, confirmDialog } from './confirm';

interface Section {
  key: string;
  label: string;
  hint: string;
  items: Category[];
  budget: boolean;
  fixed: boolean;
}

export function CategoriesPanel({ store }: { store: Store }) {
  const { data, update } = store;
  const cur = data.settings.currency;
  const [name, setName] = useState('');
  const [type, setType] = useState<TxType>('expense');
  const [group, setGroup] = useState<CategoryGroup>('need');
  const [error, setError] = useState('');

  const expenses = data.categories.filter((c) => c.type === 'expense');
  const income = data.categories.filter((c) => c.type === 'income');
  const addingInvestment = type === 'expense' && group === 'investment';

  function add() {
    setError('');
    if (type === 'income') {
      if (!name.trim()) return setError('Enter a category name.');
      update((p) => ({
        ...p,
        categories: [...p.categories, { id: newId(), name: name.trim(), type: 'income', monthlyBudget: null }],
      }));
      setName('');
      return;
    }
    if (addingInvestment) return setError('Investments are a single bucket, so there is nothing to add.');
    if (!name.trim()) return setError('Enter a category name.');
    update((p) => ({
      ...p,
      categories: [...p.categories, { id: newId(), name: name.trim(), type: 'expense', group, monthlyBudget: null }],
    }));
    setName('');
  }

  function rename(id: string, value: string) {
    if (!value.trim()) return;
    update((p) => ({ ...p, categories: p.categories.map((c) => (c.id === id ? { ...c, name: value.trim() } : c)) }));
  }

  function setBudget(id: string, value: string) {
    const trimmed = value.trim();
    const cents = trimmed === '' ? null : parseAmount(trimmed);
    if (cents !== null && Number.isNaN(cents)) return;
    update((p) => ({ ...p, categories: p.categories.map((c) => (c.id === id ? { ...c, monthlyBudget: cents } : c)) }));
  }

  async function remove(id: string) {
    const used = data.transactions.some((t) => t.categoryId === id);
    if (used) {
      await alertDialog(
        'This category is used by transactions. Reassign or delete those transactions first.',
        'Category in use',
      );
      return;
    }
    const ok = await confirmDialog({
      title: 'Delete this category?',
      message: 'It is removed from the category list. This cannot be undone.',
      confirmLabel: 'Delete',
      tone: 'danger',
    });
    if (!ok) return;
    update((p) => ({ ...p, categories: p.categories.filter((c) => c.id !== id) }));
  }

  const sections: Section[] = [
    ...GROUPS.map((g) => ({
      key: g.id,
      label: g.label,
      hint: g.hint,
      items: expenses.filter((c) => categoryGroup(c) === g.id),
      budget: g.id !== 'investment',
      fixed: g.id === 'investment',
    })),
    { key: 'income', label: 'Income', hint: 'Money coming in', items: income, budget: false, fixed: false },
  ];

  return (
    <>
      <div className="card-head">
        <div><h2>Categories</h2><p>Needs and expenses carry their own budget; investments stay in one bucket</p></div>
      </div>

      {sections.map((s) => (
        <div key={s.key} style={{ marginBottom: 18 }}>
          <h3 style={{ fontSize: 14, color: 'var(--muted)', margin: '0 0 6px' }}>{s.label}</h3>
          {s.fixed && <p className="muted" style={{ margin: '0 0 6px', fontSize: 12 }}>No subcategories — every investment transaction uses this bucket.</p>}
          {s.items.length === 0 && !s.fixed && <div className="empty" style={{ padding: '10px 0' }}>Nothing here yet.</div>}
          {s.items.length > 0 && (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    {s.budget && <th className="num">Monthly budget ({currencySymbol(cur)})</th>}
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {s.items.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <input
                          defaultValue={c.name}
                          onBlur={(e) => rename(c.id, e.target.value)}
                          style={{ maxWidth: 260 }}
                        />
                      </td>
                      {s.budget && (
                        <td className="num">
                          <input
                            style={{ maxWidth: 140, textAlign: 'right' }}
                            defaultValue={c.monthlyBudget === null ? '' : (c.monthlyBudget / 100).toFixed(2)}
                            placeholder="No budget"
                            inputMode="decimal"
                            onBlur={(e) => setBudget(c.id, e.target.value)}
                            title={c.monthlyBudget === null ? '' : formatMoney(c.monthlyBudget, cur)}
                          />
                        </td>
                      )}
                      <td style={{ textAlign: 'right' }}>
                        {!s.fixed && (
                          <button className="btn small danger" onClick={() => remove(c.id)}>Delete</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ))}

      <div className="form-grid" style={{ marginTop: 8 }}>
        <label>
          Type
          <Select
            value={type}
            ariaLabel="Category type"
            options={[
              { value: 'expense', label: 'Expense' },
              { value: 'income', label: 'Income' },
            ]}
            onChange={(v) => setType(v as TxType)}
          />
        </label>
        {type === 'expense' && (
          <label>
            Group
            <Select
              value={group}
              ariaLabel="Category group"
              options={GROUPS.map((g) => ({ value: g.id, label: g.label }))}
              onChange={(v) => setGroup(v as CategoryGroup)}
            />
          </label>
        )}
        {addingInvestment ? (
          <div className="full group-note">
            <span className="badge up">Investments</span>
            <span className="muted">One bucket, no subcategories — nothing to add here.</span>
          </div>
        ) : (
          <label>
            New category
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Groceries" />
          </label>
        )}
      </div>
      <div style={{ marginTop: 12 }}>
        <button className="btn primary" onClick={add}>Add category</button>
      </div>
      {error && <p className="error">{error}</p>}
    </>
  );
}
