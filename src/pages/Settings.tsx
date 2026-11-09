import { useRef, useState } from 'react';
import type { Store } from '../store';
import { defaultData, parseData } from '../lib/storage';
import { downloadFile } from '../lib/csv';
import { todayISO } from '../lib/format';
import { CategoriesPanel } from '../components/CategoriesPanel';
import { RecurringPanel } from '../components/RecurringPanel';
import { AccountsPanel } from '../components/AccountsPanel';
import { Select } from '../components/Select';
import { currencyOptionsWith } from '../lib/currencies';
import { confirmDialog } from '../components/confirm';
import { authErrorMessage, useAuth } from '../lib/auth';
import { Logo } from '../components/Logo';
import { replayTour } from '../components/Tour';
import { UpdatePanel } from '../components/UpdatePanel';
import { getThemeChoice, setThemeChoice, type ThemeChoice } from '../lib/theme';

export function Settings({ store }: { store: Store }) {
  const { data, update, replaceAll } = store;
  const { user, signOut } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [importError, setImportError] = useState('');
  const [signOutError, setSignOutError] = useState('');
  const [signingOut, setSigningOut] = useState(false);
  const [theme, setTheme] = useState<ThemeChoice>(getThemeChoice);

  const email = user?.email ?? '';
  const initial = email ? email[0].toUpperCase() : 'W';
  const joined = user?.created_at
    ? new Date(user.created_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
    : null;

  function exportBackup() {
    downloadFile(`walnut-backup-${todayISO()}.json`, JSON.stringify(data, null, 2), 'application/json');
  }

  async function importBackup(file: File) {
    setImportError('');
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!parsed || !Array.isArray(parsed.transactions) || !Array.isArray(parsed.accounts)) {
        throw new Error('This file is not a Walnut backup.');
      }
      const ok = await confirmDialog({
        title: 'Replace all data?',
        message: 'Your current transactions, loans and settings will be replaced by this backup.',
        confirmLabel: 'Replace',
        tone: 'danger',
      });
      if (!ok) return;
      replaceAll(parseData(text));
    } catch (e) {
      setImportError(e instanceof Error ? e.message : 'Could not read backup file.');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function resetAll() {
    const ok = await confirmDialog({
      title: 'Delete all data?',
      message: 'Every transaction, loan and setting in this account is removed. Export a backup first if you need one.',
      confirmLabel: 'Delete everything',
      tone: 'danger',
    });
    if (!ok) return;
    replaceAll(defaultData());
  }

  async function handleSignOut() {
    setSignOutError('');
    setSigningOut(true);
    try {
      await signOut();
    } catch (e) {
      setSignOutError(authErrorMessage(e));
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <>
      <div className="topbar">
        <div className="page-head">
          <span className="eyebrow">Setup</span>
          <h1>Settings<span className="accent">.</span></h1>
        </div>
      </div>

      <div className="grid">
        <section className="card col-12">
          <div className="card-head">
            <div><h2>Account</h2><p>Signed in to Walnut</p></div>
            <Logo size={26} />
          </div>
          <div className="account-row">
            <span className="account-avatar" aria-hidden="true">{initial}</span>
            <div>
              <div className="account-mail">{email || 'Signed in'}</div>
              <div className="account-meta">
                {joined ? `Member since ${joined} · synced to this account` : 'Synced to this account'}
              </div>
            </div>
            <button className="btn account-signout" onClick={handleSignOut} disabled={signingOut}>
              {signingOut ? 'Signing out…' : 'Sign out'}
            </button>
          </div>
          {signOutError && <p className="error" style={{ marginTop: 12 }}>{signOutError}</p>}
        </section>

        <section className="card col-6">
          <div className="card-head"><div><h2>General</h2><p>Display preferences</p></div></div>
          <div className="form-grid">
            <label>
              Currency
              <Select
                value={data.settings.currency}
                ariaLabel="Currency"
                options={currencyOptionsWith(data.settings.currency)}
                onChange={(v) => update((p) => ({ ...p, settings: { ...p.settings, currency: v } }))}
              />
            </label>
            <label>
              First day of week
              <Select
                value={String(data.settings.firstDayOfWeek)}
                ariaLabel="First day of week"
                options={[
                  { value: '1', label: 'Monday' },
                  { value: '0', label: 'Sunday' },
                ]}
                onChange={(v) =>
                  update((p) => ({ ...p, settings: { ...p.settings, firstDayOfWeek: Number(v) as 0 | 1 } }))
                }
              />
            </label>
            <label>
              Appearance
              <Select
                value={theme}
                ariaLabel="Appearance"
                options={[
                  { value: 'system', label: 'System default' },
                  { value: 'light', label: 'Light' },
                  { value: 'dark', label: 'Dark' },
                ]}
                onChange={(v) => {
                  const next = v as ThemeChoice;
                  setTheme(next);
                  setThemeChoice(next);
                }}
              />
            </label>
          </div>
        </section>

        <section className="card col-6">
          <div className="card-head"><div><h2>Backup</h2><p>Save or restore all your data as JSON</p></div></div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button className="btn primary" onClick={exportBackup}>Export backup</button>
            <button className="btn" onClick={() => fileRef.current?.click()}>Import backup</button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={(e) => e.target.files?.[0] && importBackup(e.target.files[0])}
            />
          </div>
          {importError && <p className="error" style={{ marginTop: 12 }}>{importError}</p>}
        </section>

        <UpdatePanel />

        <section className="card col-6" data-tour="walkthrough">
          <div className="card-head"><div><h2>Walkthrough</h2><p>A guided tour of where things are</p></div></div>
          <button className="btn" onClick={replayTour}>Replay walkthrough</button>
        </section>

        <section className="card col-12" data-tour="accounts">
          <AccountsPanel store={store} />
        </section>

        <section className="card col-12" data-tour="categories">
          <CategoriesPanel store={store} />
        </section>

        <section className="card col-12">
          <RecurringPanel store={store} />
        </section>

        <section className="card col-12">
          <div className="card-head"><div><h2>Danger zone</h2><p>Permanently delete every entry in this account</p></div></div>
          <button className="btn danger" onClick={resetAll}>Reset all data</button>
        </section>
      </div>
    </>
  );
}
