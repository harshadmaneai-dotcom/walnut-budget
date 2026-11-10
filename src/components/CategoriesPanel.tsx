import { useState } from 'react';
import type { Store } from '../store';
import type { Category, CategoryGroup, TxType } from '../lib/types';
import { newId } from '../lib/storage';
import { currencySymbol, formatMoney, parseAmount } from '../lib/format';
import { GROUPS, categoryGroup, groupLabel } from '../lib/groups';
import { categoryUsage, eligibleTargets, mergeCategory, type CategoryUsage } from '../lib/categories';
import { Select } from './Select';
import { Modal } from './Modal';
import { confirmDialog } from './confirm';

interface Section {
  key: string;
  label: string;
  hint: string;
  items: Category[];
  budget: boolean;
  fixed: boolean;
}

interface PendingDelete {
  category: Category;
  targets: Category[];
  usage: CategoryUsage;
}

function targetLabel(category: Category): string {
  return category.type === 'income'
    ? category.name
    : `${category.name} (${groupLabel(categoryGroup(category) ?? 'need')})`;
}

function usageSummary(usage: CategoryUsage): string {
  const parts: string[] = [];
  if (usage.transactions > 0) {
    parts.push(`${usage.transactions} transaction${usage.transactions === 1 ? '' : 's'}`);
  }
  if (usage.recurring > 0) {
    parts.push(`${usage.recurring} recurring entr${usage.recurring === 1 ? 'y' : 'ies'}`);
  }
  return parts.join(' and ');
}

export function CategoriesPanel({ store }: { store: Store }) {
  const { data, update } = store;
  const cur = data.settings.currency;
  const [name, setName] = useState('');
  const [type, setType] = useState<TxType>('expense');
  const [group, setGroup] = useState<CategoryGroup>('need');
  const [error, setError] = useState('');
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);

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

  async function remove(category: Category) {
    const usage = categoryUsage(data, category.id);

    // Nothing points at it, so the simple confirm is still the whole story.
    if (usage.transactions === 0 && usage.recurring === 0) {
      const ok = await confirmDialog({
        title: 'Delete this category?',
        message: 'It is removed from the category list. This cannot be undone.',
        confirmLabel: 'Delete',
        tone: 'danger',
      });
      if (!ok) return;
      update((p) => ({ ...p, categories: p.categories.filter((c) => c.id !== category.id) }));
      return;
    }

    // In use: offer to move every transaction and recurring rule before deleting it.
    setPendingDelete({
      category,
      targets: eligibleTargets(data.categories, category),
      usage,
    });
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
                          <button className="btn small danger" onClick={() => remove(c)}>Delete</button>
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

      {pendingDelete && (
        <DeleteCategoryDialog
          key={pendingDelete.category.id}
          category={pendingDelete.category}
          targets={pendingDelete.targets}
          usage={pendingDelete.usage}
          onMerge={(toId) =>
            update((p) => mergeCategory(p, pendingDelete.category.id, toId))
          }
          onClosed={() => setPendingDelete(null)}
        />
      )}
    </>
  );
}

function DeleteCategoryDialog({
  category,
  targets,
  usage,
  onMerge,
  onClosed,
}: {
  category: Category;
  targets: Category[];
  usage: CategoryUsage;
  onMerge: (toId: string) => void;
  onClosed: () => void;
}) {
  const [targetId, setTargetId] = useState(targets[0]?.id ?? '');
  const selected = targets.find((c) => c.id === targetId);

  return (
    <Modal title={`Delete ${category.name}?`} onClose={onClosed}>
      {(close) => (
        <>
          <p className="confirm-message">
            {usageSummary(usage)} {usage.transactions + usage.recurring === 1 ? 'uses' : 'use'} this
            category. Choose where they should go, then it is deleted.
          </p>

          {targets.length > 0 ? (
            <label style={{ marginTop: 16 }}>
              Move them to
              <Select
                value={targetId}
                ariaLabel="Category to move entries to"
                options={targets.map((c) => ({ value: c.id, label: targetLabel(c) }))}
                onChange={setTargetId}
              />
            </label>
          ) : (
            <div className="group-note" style={{ marginTop: 16 }}>
              <span className="badge warn">No target</span>
              <span className="muted">
                Add another {category.type === 'income' ? 'income' : 'expense'} category first — these entries
                need somewhere to go.
              </span>
            </div>
          )}

          {category.monthlyBudget !== null && (
            <p className="muted small" style={{ margin: '10px 0 0' }}>
              Its monthly budget is removed; {selected ? `${selected.name} keeps its own` : 'the target keeps its own'}.
            </p>
          )}

          <div className="modal-actions">
            <button className="btn" onClick={close}>Cancel</button>
            <button
              className="btn danger-solid"
              disabled={!targetId}
              onClick={() => {
                if (!targetId) return;
                onMerge(targetId);
                close();
              }}
            >
              Move &amp; delete
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
