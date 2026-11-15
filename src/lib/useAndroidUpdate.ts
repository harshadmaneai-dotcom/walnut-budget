import { useCallback, useRef, useState } from 'react';
import { ApkUpdater, apkUpdaterAvailable } from './native-updater';
import { checkForAndroidUpdate, UpdateCheckError, type AvailableUpdate } from './updates';

export type AndroidUpdateStage = 'idle' | 'checking' | 'downloading' | 'installing' | 'error';

export interface AndroidUpdater {
  stage: AndroidUpdateStage;
  update: AvailableUpdate | null;
  percent: number;
  /** Bytes transferred and the published size, so a slow download still looks alive. */
  progressBytes: number;
  progressTotal: number;
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
 *
 * The native side owns the transfer, so "install" is safe to press twice: an in-flight
 * download is picked up and an already finished file goes straight to the installer.
 */
export function useAndroidUpdate(): AndroidUpdater {
  const [stage, setStage] = useState<AndroidUpdateStage>('idle');
  const [update, setUpdate] = useState<AvailableUpdate | null>(null);
  const [percent, setPercent] = useState(0);
  const [progressBytes, setBytes] = useState(0);
  const [progressTotal, setTotal] = useState(0);
  const [message, setMessage] = useState('');
  const [dismissed, setDismissed] = useState(false);
  const busy = useRef(false);
  const starting = useRef(false);

  const check = useCallback(async (force = false) => {
    if (busy.current) return;
    busy.current = true;
    setStage('checking');
    setMessage('');
    try {
      const found = await checkForAndroidUpdate({ force });
      setUpdate(found);
      setDismissed(false);
      setStage('idle');
      if (!found && force) setMessage("You're on the latest version.");
    } catch (error) {
      setStage('error');
      const detail = error instanceof UpdateCheckError ? error.message : 'unknown error';
      setMessage(`Couldn't check for updates (${detail}).`);
    } finally {
      busy.current = false;
    }
  }, []);

  const install = useCallback(async () => {
    if (!update || starting.current) return;

    // Builds without the plugin can still update, just through the browser.
    if (!apkUpdaterAvailable()) {
      window.location.href = update.apkUrl;
      return;
    }

    starting.current = true;
    try {
      const { allowed } = await ApkUpdater.canInstall();
      if (!allowed) {
        await ApkUpdater.openInstallSettings();
        setStage('error');
        setMessage('Allow Walnut to install apps, then press Install again.');
        return;
      }

      const openInstaller = () => {
        setStage('installing');
        void ApkUpdater.install().catch(() => {
          setStage('error');
          setMessage("Couldn't open the installer. Try again.");
        });
      };

      setStage('downloading');
      setPercent(0);
      setBytes(0);
      setTotal(update.bytes);
      setMessage('');

      // The listener exists before the download starts, so no early progress is missed.
      let handle: { remove: () => Promise<void> } | null = null;
      handle = await ApkUpdater.addListener('progress', (progress) => {
        if (progress.error) {
          setStage('error');
          setMessage(`The download failed: ${progress.error}. Try again.`);
          void handle?.remove();
          return;
        }
        if (typeof progress.bytes === 'number') setBytes(progress.bytes);
        if (typeof progress.total === 'number' && progress.total > 0) setTotal(progress.total);
        setPercent(progress.percent ?? 0);
        setMessage(progress.done ? '' : (progress.message ?? ''));
        if (progress.done) {
          void handle?.remove();
          setPercent(100);
          openInstaller();
        }
      });

      const result = await ApkUpdater.download({ url: update.apkUrl, bytes: update.bytes });
      if (result?.completed) {
        // An earlier attempt already fetched the whole file; there is nothing to wait for.
        void handle?.remove();
        setPercent(100);
        setBytes(update.bytes);
        setTotal(update.bytes);
        openInstaller();
      }
    } catch {
      setStage('error');
      setMessage("Couldn't start the update. Try again.");
    } finally {
      // The transfer keeps running natively; this only releases the setup guard.
      starting.current = false;
    }
  }, [update]);

  return {
    stage,
    update,
    percent,
    progressBytes,
    progressTotal,
    message,
    check,
    install,
    dismissed,
    dismiss: () => setDismissed(true),
  };
}
