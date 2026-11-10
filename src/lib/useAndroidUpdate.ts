import { useCallback, useRef, useState } from 'react';
import { ApkUpdater, apkUpdaterAvailable } from './native-updater';
import { checkForAndroidUpdate, UpdateCheckError, type AvailableUpdate } from './updates';

export type AndroidUpdateStage = 'idle' | 'checking' | 'downloading' | 'installing' | 'error';

export interface AndroidUpdater {
  stage: AndroidUpdateStage;
  update: AvailableUpdate | null;
  percent: number;
  message: string;
  check: (force?: boolean) => Promise<void>;
  install: () => Promise<void>;
  dismissed: boolean;
  dismiss: () => void;
}

/**
 * The whole Android update flow: check the published release, download the APK in the
 * background, then hand it to the system installer. Shared by the Settings card and the
 * launch banner so both behave identically.
 */
export function useAndroidUpdate(): AndroidUpdater {
  const [stage, setStage] = useState<AndroidUpdateStage>('idle');
  const [update, setUpdate] = useState<AvailableUpdate | null>(null);
  const [percent, setPercent] = useState(0);
  const [message, setMessage] = useState('');
  const [dismissed, setDismissed] = useState(false);
  const busy = useRef(false);

  const check = useCallback(async (force = false) => {
    if (busy.current) return;
    busy.current = true;
    setStage('checking');
    setMessage('');
    try {
      const found = await checkForAndroidUpdate({ force });
      setUpdate(found);
      setDismissed(false);
      if (found) {
        setStage('idle');
      } else {
        setStage('idle');
        if (force) setMessage("You're on the latest version.");
      }
    } catch (error) {
      setStage('error');
      const detail = error instanceof UpdateCheckError ? error.message : 'unknown error';
      setMessage(`Couldn't check for updates (${detail}).`);
    } finally {
      busy.current = false;
    }
  }, []);

  const install = useCallback(async () => {
    if (!update) return;

    // Builds without the plugin can still update, just through the browser.
    if (!apkUpdaterAvailable()) {
      window.location.href = update.apkUrl;
      return;
    }

    try {
      const { allowed } = await ApkUpdater.canInstall();
      if (!allowed) {
        await ApkUpdater.openInstallSettings();
        setStage('error');
        setMessage('Allow Walnut to install apps, then press Install again.');
        return;
      }

      setStage('downloading');
      setPercent(0);
      setMessage('');

      let handle: { remove: () => Promise<void> } | null = null;
      handle = await ApkUpdater.addListener('progress', (progress) => {
        if (progress.error) {
          setStage('error');
          setMessage('The download failed. Try again.');
          void handle?.remove();
          return;
        }
        setPercent(progress.percent ?? 0);
        if (progress.done) {
          void handle?.remove();
          setStage('installing');
          void ApkUpdater.install().catch(() => {
            setStage('error');
            setMessage("Couldn't open the installer. Try again.");
          });
        }
      });

      await ApkUpdater.download({ url: update.apkUrl });
    } catch {
      setStage('error');
      setMessage("Couldn't start the update. Try again.");
    }
  }, [update]);

  return { stage, update, percent, message, check, install, dismissed, dismiss: () => setDismissed(true) };
}
