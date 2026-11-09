import { useEffect, useState } from 'react';
import { Icon } from './Icon';

/**
 * Desktop only: the permanent way to look for a newer build, sitting at the foot of
 * the rail under the navigation. A dot shows while a newer build is waiting; the
 * banner then handles downloading it and restarting. Renders nothing in a browser.
 */
export function UpdateRailButton() {
  const [state, setState] = useState<WalnutUpdateState | null>(null);

  useEffect(() => {
    const bridge = window.walnut;
    if (!bridge) return;
    return bridge.onUpdate(setState);
  }, []);

  if (!window.walnut) return null;

  const waiting = state?.status === 'available' || state?.status === 'downloaded';

  return (
    <button
      type="button"
      className="rail-link rail-update"
      title="Check for updates"
      aria-label="Check for updates"
      onClick={() => void window.walnut?.checkForUpdates()}
    >
      <Icon name="download" size={21} />
      {waiting && <span className="rail-dot" aria-hidden="true" />}
    </button>
  );
}
