import { useEffect, useState } from 'react';
import { isNativeShell } from '../lib/platform';
import { APP_VERSION } from '../lib/version';
import { useAndroidUpdate } from '../lib/useAndroidUpdate';

/**
 * The Settings update card, in two modes:
 *  - the Electron build has a bridge, so it can check, download and install in place;
 *  - the Android shell downloads the APK itself and hands it to the system installer;
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
            Close &amp; install
          </button>
        )}
      </div>
      {state?.status === 'downloaded' && (
        <p className="muted small" style={{ marginTop: 12 }}>
          Walnut will close and reopen to finish installing.
        </p>
      )}
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

/** Android only: compares with the published release and installs it in place. */
function AndroidUpdate() {
  const { stage, update, percent, message, check, install } = useAndroidUpdate();
  const busy = stage === 'downloading' || stage === 'installing';

  return (
    <section className="card col-6">
      <div className="card-head">
        <div>
          <h2>Android app</h2>
          <p>Installed build v{APP_VERSION}</p>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button className="btn" onClick={() => void check(true)} disabled={stage === 'checking' || busy}>
          {stage === 'checking' ? 'Checking…' : 'Check for updates'}
        </button>
        {update && (
          <button className="btn primary" onClick={() => void install()} disabled={busy}>
            {stage === 'downloading'
              ? `Downloading… ${percent}%`
              : stage === 'installing'
                ? 'Opening installer…'
                : `Install v${update.version}`}
          </button>
        )}
      </div>
      {stage === 'downloading' && (
        <div className="update-progress" aria-hidden="true" style={{ marginTop: 12 }}>
          <span style={{ width: `${percent}%` }} />
        </div>
      )}
      {message && (
        <p className={stage === 'error' ? 'error' : 'muted'} style={{ marginTop: 12 }}>
          {message}
        </p>
      )}
      {update && (
        <p className="muted" style={{ marginTop: 12 }}>
          Walnut {update.version} is available. You are on v{APP_VERSION}.
        </p>
      )}
      {update && (
        <p className="muted small" style={{ marginTop: 8 }}>
          Android asks once to allow installs from Walnut; after that the update installs over
          this build.
        </p>
      )}
    </section>
  );
}
