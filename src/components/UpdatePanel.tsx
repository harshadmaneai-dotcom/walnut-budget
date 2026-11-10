import { useEffect, useState } from 'react';
import { WEB_ORIGIN } from '../lib/downloads';
import { isNativeShell } from '../lib/platform';
import { APP_VERSION, compareVersions } from '../lib/version';

/**
 * The Settings update card, in two modes:
 *  - the Electron build has a bridge, so it can check, download and install in place;
 *  - the Android shell has no bridge and cannot install silently, so it checks the build
 *    published on the site and hands the APK to the browser;
 *  - the plain website renders nothing.
 */
export function UpdatePanel() {
  if (window.walnut) return <DesktopUpdate />;
  if (isNativeShell()) return <AndroidUpdate />;
  return null;
}

/** Desktop only: shows the installed build and checks GitHub Releases on demand. */
function DesktopUpdate() {
  const [current, setCurrent] = useState('');
  const [state, setState] = useState<WalnutUpdateState | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    const bridge = window.walnut;
    if (!bridge) return;
    void bridge.version().then(setCurrent).catch(() => {});
    return bridge.onUpdate(setState);
  }, []);

  function check() {
    const bridge = window.walnut;
    if (!bridge || checking) return;
    setChecking(true);
    setState(null);
    void bridge.checkForUpdates().finally(() => setChecking(false));
  }

  const status =
    state?.status === 'none'
      ? "You're on the latest version."
      : state?.status === 'available'
        ? `Walnut ${state.version} is available.`
        : state?.status === 'downloaded'
          ? `Walnut ${state.version} is ready to install.`
          : state?.status === 'downloading'
            ? `Downloading… ${state.percent}%`
            : state?.status === 'error'
              ? state.message
              : '';

  return (
    <section className="card col-6">
      <div className="card-head">
        <div>
          <h2>Desktop app</h2>
          <p>{current ? `Installed build v${current}` : 'Reading the installed build'}</p>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button className="btn" onClick={check} disabled={checking || state?.status === 'downloading'}>
          {checking ? 'Checking…' : 'Check for updates'}
        </button>
        {state?.status === 'available' && (
          <button className="btn primary" onClick={() => void window.walnut?.downloadUpdate()}>
            Install v{state.version}
          </button>
        )}
        {state?.status === 'downloaded' && (
          <button className="btn primary" onClick={() => void window.walnut?.installUpdate()}>
            Restart &amp; install
          </button>
        )}
      </div>
      {state?.status === 'downloading' && (
        <div className="update-progress" aria-hidden="true" style={{ marginTop: 12 }}>
          <span style={{ width: `${state.percent}%` }} />
        </div>
      )}
      {status && (
        <p className={state?.status === 'error' ? 'error' : 'muted'} style={{ marginTop: 12 }}>
          {status}
        </p>
      )}
    </section>
  );
}

/** Where every Android release publishes the build the APKs should download. */
const FEED_URL = `${WEB_ORIGIN}/app-version.json`;

type Feed = { version: string; url: string };

/**
 * Android only: compares the installed build with the one the site publishes. The bundle
 * ships its own copy of app-version.json, so the deployed file is fetched fresh with the
 * cache bypassed instead of read from disk.
 */
function AndroidUpdate() {
  const [checking, setChecking] = useState(false);
  const [feed, setFeed] = useState<Feed | null>(null);
  const [error, setError] = useState('');

  async function check() {
    if (checking) return;
    setChecking(true);
    setError('');
    setFeed(null);
    try {
      const response = await fetch(`${FEED_URL}?t=${Date.now()}`, { cache: 'no-store' });
      if (!response.ok) throw new Error(`the update feed answered ${response.status}`);
      const json = (await response.json()) as { android?: Partial<Feed> };
      const version = json.android?.version;
      const url = json.android?.url;
      if (typeof version !== 'string' || typeof url !== 'string') {
        throw new Error('the update feed has no Android build');
      }
      setFeed({ version, url });
    } catch (e) {
      const detail = e instanceof Error ? e.message : '';
      setError(`Couldn't check for updates${detail ? ` (${detail})` : ''}. Try again.`);
    } finally {
      setChecking(false);
    }
  }

  const update = feed && compareVersions(feed.version, APP_VERSION) > 0 ? feed : null;
  const status = update
    ? `Walnut ${update.version} is available. You are on v${APP_VERSION}.`
    : feed
      ? "You're on the latest version."
      : '';

  return (
    <section className="card col-6">
      <div className="card-head">
        <div>
          <h2>Android app</h2>
          <p>Installed build v{APP_VERSION}</p>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button className="btn" onClick={check} disabled={checking}>
          {checking ? 'Checking…' : 'Check for updates'}
        </button>
        {update && (
          // Capacitor hands URLs on another host to the system browser, which downloads
          // the APK; installing it from there is the user's tap.
          <a className="btn primary" href={update.url} style={{ textDecoration: 'none' }}>
            Download v{update.version}
          </a>
        )}
      </div>
      {error && (
        <p className="error" style={{ marginTop: 12 }}>
          {error}
        </p>
      )}
      {status && (
        <p className="muted" style={{ marginTop: 12 }}>
          {status}
        </p>
      )}
      {update && (
        <p className="muted small" style={{ marginTop: 8 }}>
          The APK opens in your browser. Allow installs from the browser once, then tap the
          downloaded file to update.
        </p>
      )}
    </section>
  );
}
