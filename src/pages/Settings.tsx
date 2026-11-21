import { useEffect, useRef, useState } from 'react';
import type { Store } from '../store';
import {
  SNAPSHOT_LIMIT,
  defaultData,
  listSnapshots,
  loadSnapshot,
  parseData,
  saveSnapshot,
  type SnapshotInfo,
} from '../lib/storage';
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
import { Icon } from '../components/Icon';
import { getThemeChoice, setThemeChoice, type ThemeChoice } from '../lib/theme';
import { UpiTracker, upiTrackAvailable, type UpiTrackerStatus } from '../lib/upi-native';

/** Date and time are printed separately so the date stays the strongest line on the card. */
function snapshotDay(at: string): string {
  return new Date(at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function snapshotTime(at: string): string {
  return new Date(at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function countLabel(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

/**
 * Android-only: reads payment notifications. The toggle is device-local (a permission belongs
 * to this phone, not the account), so it lives in native prefs rather than the synced document.
 * The account choice does sync, because it changes where entries are recorded.
 */
function UpiAutoTrackCard({ store }: { store: Store }) {
  const { data, update } = store;
  const available = upiTrackAvailable();
  const [status, setStatus] = useState<UpiTrackerStatus | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!available) return;
    let cancelled = false;
    const read = () => {
      UpiTracker.status()
        .then((next) => {
          if (!cancelled) setStatus(next);
        })
        .catch(() => {});
    };
    read();
    // The system permission is granted outside the app, so re-read when the user comes back.
    const onVisible = () => {
      if (document.visibilityState === 'visible') read();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [available]);

  if (!available) return null;

  async function toggle() {
    if (!status) return;
    setBusy(true);
    try {
      setStatus(await UpiTracker.setEnabled({ enabled: !status.enabled }));
    } catch {
      // Keep showing the last known state; nothing here may block manual entry.
    } finally {
      setBusy(false);
    }
  }

  const enabled = status?.enabled ?? false;
  const access = status?.notificationAccess ?? false;
  const lastDetected = status?.lastDetectedAt
    ? new Date(status.lastDetectedAt).toLocaleString()
    : null;

  return (
    <section className="card col-12">
      <div className="card-head">
        <div>
          <h2>Auto-track UPI payments</h2>
          <p>Android only · Google Pay, PhonePe, Paytm, BHIM and Amazon Pay</p>
        </div>
        <span className={`chip${enabled ? '' : ' warn'}`}>{enabled ? 'On' : 'Off'}</span>
      </div>
      <p className="muted small" style={{ marginTop: 0 }}>
        Walnut reads the payment confirmation your UPI app shows and adds the expense for you.
        Android grants notification access to an app rather than to one kind of notification, so
        Walnut checks the source app first and reads nothing from any other app. Only a payment's
        amount, merchant, time and app are kept — never the notification text — nothing is uploaded
        directly, and it does not run in the background: Android wakes Walnut for a moment only
        when you pay.
      </p>
      <div className="form-grid">
        <label>
          Notification access
          <div className="upi-row">
            <span className={`badge ${access ? 'up' : 'warn'}`}>
              {access ? 'Allowed' : 'Not allowed'}
            </span>
            <button
              className="btn small"
              onClick={() => void UpiTracker.openNotificationAccessSettings().catch(() => {})}
            >
              Open settings
            </button>
          </div>
        </label>
        <label>
          Auto-track
          <div className="upi-row">
            <span className={`badge ${enabled ? 'up' : 'warn'}`}>{enabled ? 'On' : 'Off'}</span>
            <button className="btn small" onClick={toggle} disabled={busy || !status}>
              {enabled ? 'Turn off' : 'Turn on'}
            </button>
          </div>
        </label>
        <label>
          Add detected payments to
          <Select
            value={data.settings.upiAccountId ?? data.accounts[0]?.id ?? ''}
            ariaLabel="Account for detected payments"
            options={data.accounts.map((a) => ({ value: a.id, label: a.name }))}
            onChange={(v) =>
              update((p) => ({ ...p, settings: { ...p.settings, upiAccountId: v } }))
            }
          />
        </label>
        <label>
          Last payment detected
          <div className="upi-row">
            <span className="muted small">{lastDetected ?? 'Nothing detected yet'}</span>
          </div>
        </label>
      </div>
      <p className="muted small" style={{ marginBottom: 0 }}>
        If a payment is missed, notifications for that UPI app are probably off, or Android has
        put Walnut to sleep in battery settings. Add it manually — manual entry always works.
      </p>
    </section>
  );
}

export function Settings({ store }: { store: Store }) {
  const { data, update, replaceAll } = store;
  const { user, signOut } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [importError, setImportError] = useState('');
  const [signOutError, setSignOutError] = useState('');
  const [signingOut, setSigningOut] = useState(false);
  const [theme, setTheme] = useState<ThemeChoice>(getThemeChoice);
  const [snapshots, setSnapshots] = useState<SnapshotInfo[]>([]);

  const email = user?.email ?? '';
  const initial = email ? email[0].toUpperCase() : 'W';
  const joined = user?.created_at
    ? new Date(user.created_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
    : null;

  useEffect(() => {
    setSnapshots(listSnapshots(user?.id ?? ''));
  }, [user?.id]);

  function exportBackup() {
    downloadFile(`walnut-backup-${todayISO()}.json`, JSON.stringify(data, null, 2), 'application/json');
  }

  async function restoreSnapshot(snapshot: SnapshotInfo) {
    const restored = loadSnapshot(user?.id ?? '', snapshot.id);
    if (!restored) return;
    const ok = await confirmDialog({
      title: 'Restore this local copy?',
      message: `This replaces the current budget with the copy from ${new Date(snapshot.at).toLocaleString()}. A backup of the current copy is kept first.`,
      confirmLabel: 'Restore',
      tone: 'danger',
    });
    if (!ok) return;
    // Keep the copy being replaced too, so restoring is itself reversible. The selected
    // snapshot was already read into memory, so pruning the oldest one is safe here.
    if (user?.id) saveSnapshot(user.id, data);
    replaceAll(restored);
    setSnapshots(listSnapshots(user?.id ?? ''));
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

        <section className="card col-6 recovery-card">
          <div className="card-head">
            <div><h2>Recovery</h2><p>Local copies kept before a cloud update</p></div>
            {snapshots.length > 0 && (
              <span className="chip">{snapshots.length} of {SNAPSHOT_LIMIT} kept</span>
            )}
          </div>
          {snapshots.length === 0 ? (
            <div className="recovery-empty">
              <Icon name="check" size={17} />
              <span>
                Nothing to recover yet. Walnut keeps the last {SNAPSHOT_LIMIT} copies on this device
                automatically, right before a cloud copy replaces its data.
              </span>
            </div>
          ) : (
            <ul className="snapshot-list">
              {snapshots.map((snapshot, index) => (
                <li className="snapshot-row" key={snapshot.id}>
                  <div className="snapshot-text">
                    <div className="snapshot-when">
                      <strong>{snapshotDay(snapshot.at)}</strong>
                      <span>{snapshotTime(snapshot.at)}</span>
                      {index === 0 && <span className="badge up">Newest</span>}
                    </div>
                    <div className="snapshot-meta">
                      <span>{countLabel(snapshot.transactions, 'transaction')}</span>
                      <span>{countLabel(snapshot.transfers, 'transfer')}</span>
                      <span>{countLabel(snapshot.loans, 'loan')}</span>
                      {snapshot.recurring > 0 && (
                        <span>{countLabel(snapshot.recurring, 'recurring entry')}</span>
                      )}
                    </div>
                  </div>
                  <button
                    className="btn small snapshot-restore"
                    onClick={() => void restoreSnapshot(snapshot)}
                  >
                    Restore
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <UpdatePanel />

        <UpiAutoTrackCard store={store} />

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
