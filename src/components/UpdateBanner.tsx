import { useEffect, useState } from 'react';

/** Mirrors UpdateState in electron/main.ts and electron/preload.ts. */
type UpdateState =
  | { status: 'available'; version: string }
  | { status: 'none' }
  | { status: 'downloading'; percent: number }
  | { status: 'downloaded'; version: string }
  | { status: 'error'; message: string };

/**
 * Desktop only: tells the user a newer build exists and installs it on click.
 * The web app has no bridge, so this renders nothing in the browser.
 */
export function UpdateBanner() {
  const [state, setState] = useState<UpdateState | null>(null);
  const [current, setCurrent] = useState<string>('');
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const bridge = window.walnut;
    if (!bridge) return;
    void bridge.version().then(setCurrent).catch(() => {});
    return bridge.onUpdate((next) => {
      setState(next);
      setDismissed(false);
    });
  }, []);

  useEffect(() => {
    if (state?.status !== 'none') return;
    const timer = setTimeout(() => setDismissed(true), 4000);
    return () => clearTimeout(timer);
  }, [state]);

  if (!state || dismissed) return null;

  // "Up to date" is a confirmation of a check the user asked for, so it fades out.
  if (state.status === 'none') {
    return (
      <div className="update-banner" role="status" aria-live="polite">
        <div className="update-text">
          <strong>You&apos;re up to date</strong>
          <span>{current ? `Walnut v${current} is the newest build.` : 'No newer build to install.'}</span>
        </div>
        <button className="update-dismiss" aria-label="Dismiss update notice" onClick={() => setDismissed(true)}>
          ×
        </button>
      </div>
    );
  }

  // A failed check used to disappear. Say so, so a blocked update is not silent.
  if (state.status === 'error') {
    return (
      <div className="update-banner" role="status" aria-live="polite">
        <div className="update-text">
          <strong>Couldn&apos;t check for updates</strong>
          <span>{state.message}</span>
        </div>
        <button className="btn small primary" onClick={() => void window.walnut?.checkForUpdates()}>
          Try again
        </button>
        <button className="update-dismiss" aria-label="Dismiss update notice" onClick={() => setDismissed(true)}>
          ×
        </button>
      </div>
    );
  }

  const busy = state.status === 'downloading';
  const available = state.status === 'available' ? state.version : '';

  return (
    <div className="update-banner" role="status" aria-live="polite">
      <div className="update-text">
        <strong>
          {state.status === 'downloaded'
            ? 'Update ready to install'
            : `Walnut ${available} is available`}
        </strong>
        <span>
          {state.status === 'downloading'
            ? `Downloading… ${state.percent}%`
            : state.status === 'downloaded'
              ? 'Restart Walnut to finish updating.'
              : `You are on ${current ? `v${current}` : 'an older version'}.`}
        </span>
      </div>
      {state.status === 'downloading' ? (
        <div className="update-progress" aria-hidden="true">
          <span style={{ width: `${state.percent}%` }} />
        </div>
      ) : state.status === 'downloaded' ? (
        <button className="btn small primary" onClick={() => void window.walnut?.installUpdate()}>
          Restart &amp; install
        </button>
      ) : (
        <button className="btn small primary" onClick={() => void window.walnut?.downloadUpdate()}>
          Install update
        </button>
      )}
      {!busy && (
        <button className="update-dismiss" aria-label="Dismiss update notice" onClick={() => setDismissed(true)}>
          ×
        </button>
      )}
    </div>
  );
}
