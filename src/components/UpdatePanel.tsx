import { useEffect, useState } from 'react';

/**
 * Desktop only: shows the installed build and checks GitHub Releases on demand.
 * Update errors are printed here, so a check that cannot reach the feed is visible
 * instead of silent. Renders nothing in the browser, where there is no bridge.
 */
export function UpdatePanel() {
  const [current, setCurrent] = useState('');
  const [state, setState] = useState<WalnutUpdateState | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    const bridge = window.walnut;
    if (!bridge) return;
    void bridge.version().then(setCurrent).catch(() => {});
    return bridge.onUpdate(setState);
  }, []);

  if (!window.walnut) return null;

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
