import { useEffect, useState } from 'react';
import { isNativeShell } from '../lib/platform';
import { APP_VERSION } from '../lib/version';
import { formatMegabytes } from '../lib/format';
import { useAndroidUpdate } from '../lib/useAndroidUpdate';

/**
 * The Settings update card, in two modes:
 *  - the Electron build has a bridge, so it can check, download and install in place;
 *  - the Android shell downloads the APK itself and hands it to the system installer;
 *  - the plain website renders nothing.
 *
 * Each mode has one primary button. It checks only when nothing is known yet, then downloads,
 * then installs, so the user never has to find a second button to finish an update.
 */
export function UpdatePanel() {
  if (window.walnut) return <DesktopUpdate />;
  if (isNativeShell()) return <AndroidUpdate />;
  return null;
}

/** Desktop only: one button checks, downloads and installs. */
function DesktopUpdate() {
  const [current, setCurrent] = useState('');
  const [state, setState] = useState<WalnutUpdateState | null>(null);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    const bridge = window.walnut;
    if (!bridge) return;
    void bridge.version().then(setCurrent).catch(() => {});
    return bridge.onUpdate(setState);
  }, []);

  const downloading = state?.status === 'downloading';
  const downloaded = state?.status === 'downloaded';
  const available = state?.status === 'available' ? state.version : '';
  const percent = state?.status === 'downloading' ? state.percent : 0;
  const busy = working || downloading;

  async function run() {
    const bridge = window.walnut;
    if (!bridge || busy) return;
    if (downloaded) {
      await bridge.installUpdate();
      return;
    }
    setWorking(true);
    try {
      await bridge.updateNow();
    } finally {
      setWorking(false);
    }
  }

  const label = downloaded
    ? 'Restart & install'
    : downloading
      ? `Downloading… ${percent}%`
      : working
        ? 'Checking…'
        : available
          ? `Update to v${available}`
          : 'Update now';

  const status =
    state?.status === 'none'
      ? "You're on the latest version."
      : state?.status === 'available'
        ? `Walnut ${state.version} is available.`
        : state?.status === 'downloaded'
          ? `Walnut ${state.version} is downloaded. It installs when Walnut restarts.`
          : state?.status === 'downloading'
            ? `Downloading… ${percent}%`
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
        {(available || downloaded) && <span className="chip">Update ready</span>}
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button className="btn primary" onClick={() => void run()} disabled={busy}>
          {label}
        </button>
      </div>
      {downloading && (
        <div className="update-progress" aria-hidden="true" style={{ marginTop: 12 }}>
          <span style={{ width: `${percent}%` }} />
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

/** Android only: the same single action, finished by Android's own install confirmation. */
function AndroidUpdate() {
  const {
    stage,
    update,
    percent,
    progressBytes,
    progressTotal,
    message,
    updateNow,
    openDownloadPage,
  } = useAndroidUpdate();
  const busy = stage === 'downloading' || stage === 'installing';

  // Real numbers, so a slow release host reads as a slow download rather than a stuck one.
  const transfer =
    progressTotal > 0 ? `${formatMegabytes(progressBytes)} of ${formatMegabytes(progressTotal)}` : '';

  const label =
    stage === 'checking'
      ? 'Checking…'
      : stage === 'installing'
        ? 'Opening installer…'
        : stage === 'downloading'
          ? `Downloading… ${percent}%`
          : update
            ? `Update to v${update.version}`
            : 'Update now';

  const status =
    message ||
    (stage === 'downloading' && transfer ? transfer : '') ||
    (update ? 'Android shows its own Install confirmation once the download finishes.' : '');

  return (
    <section className="card col-6">
      <div className="card-head">
        <div>
          <h2>Android app</h2>
          <p>Installed build v{APP_VERSION}</p>
        </div>
        {update && <span className="chip">Update ready</span>}
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button className="btn primary" onClick={() => void updateNow()} disabled={busy}>
          {label}
        </button>
        {/* The escape hatch when the in-app check or download cannot finish on this network. */}
        <button className="btn" onClick={() => void openDownloadPage()} disabled={busy}>
          Download in browser
        </button>
      </div>
      {stage === 'downloading' && (
        <div className="update-progress" aria-hidden="true" style={{ marginTop: 12 }}>
          <span style={{ width: `${percent}%` }} />
        </div>
      )}
      {status && (
        <p className={stage === 'error' ? 'error' : 'muted'} style={{ marginTop: 12 }}>
          {status}
        </p>
      )}
      <p className="muted small" style={{ marginTop: 8 }}>
        {update
          ? 'Android asks once to allow installs from Walnut; after that the update installs over this build.'
          : 'If checking or downloading here fails, Download in browser opens the APK page on the website instead.'}
      </p>
    </section>
  );
}
