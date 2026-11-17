import { useCallback, useEffect, useRef, useState } from 'react';
import { DOWNLOAD_PAGE_URL } from './downloads';
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
  check: (force?: boolean) => Promise<AvailableUpdate | null>;
  install: () => Promise<void>;
  /** One action for the whole flow: check if needed, then download and install. */
  updateNow: () => Promise<void>;
  /** Opens the download page in the system browser, the manual path around a blocked update. */
  openDownloadPage: () => Promise<void>;
  /** True when Android refused the APK because this install was signed with another key. */
  needsReinstall: boolean;
  dismissed: boolean;
  dismiss: () => void;
}

/** Reads the error code Capacitor attaches to a rejected plugin call. */
function rejectionCode(error: unknown): string {
  if (!error || typeof error !== 'object') return '';
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : '';
}

/** How long "Opening the installer…" may sit before control comes back with a hint. */
const INSTALLER_HANDOFF_MS = 6_000;

/**
 * The banner and the Settings card are separate hook instances, but both listen to the same
 * native plugin. Two siblings firing the installer for one finished download would open the
 * system installer twice, so a shared timestamp absorbs the duplicate.
 */
let lastInstallerAt = 0;
const INSTALLER_DEDUPE_MS = 3_000;

/**
 * The whole Android update flow: check the published feed, download the APK in the
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
  const [needsReinstall, setNeedsReinstall] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const busy = useRef(false);
  const starting = useRef(false);
  const stageRef = useRef<AndroidUpdateStage>('idle');
  const listenerRef = useRef<{ remove: () => Promise<void> } | null>(null);
  const resumeLock = useRef(false);

  useEffect(() => {
    stageRef.current = stage;
  }, [stage]);

  // The listener belongs to the native bridge, not to this component tree, so it must be
  // removed explicitly when either update card goes away.
  useEffect(
    () => () => {
      void listenerRef.current?.remove();
      listenerRef.current = null;
    },
    [],
  );

  const check = useCallback(async (force = false): Promise<AvailableUpdate | null> => {
    if (busy.current) return null;
    busy.current = true;
    setStage('checking');
    setMessage('');
    try {
      const found = await checkForAndroidUpdate({ force });
      setUpdate(found);
      setDismissed(false);
      setNeedsReinstall(false);
      setStage('idle');
      if (!found && force) setMessage("You're on the latest version.");
      return found;
    } catch (error) {
      setStage('error');
      const detail = error instanceof UpdateCheckError ? error.message : 'unknown error';
      setMessage(`Couldn't check for updates (${detail}).`);
      return null;
    } finally {
      busy.current = false;
    }
  }, []);

  const openDownloadPage = useCallback(async () => {
    if (!apkUpdaterAvailable()) {
      window.location.href = DOWNLOAD_PAGE_URL;
      return;
    }
    try {
      await ApkUpdater.openUrl({ url: DOWNLOAD_PAGE_URL });
    } catch {
      setStage('error');
      setMessage(`Open ${DOWNLOAD_PAGE_URL} in your browser to install the update.`);
    }
  }, []);

  const openInstaller = useCallback(() => {
    const now = Date.now();
    if (now - lastInstallerAt < INSTALLER_DEDUPE_MS) return;
    lastInstallerAt = now;
    setStage('installing');

    // startActivity resolves as soon as the intent is handed over. If the system installer
    // never appears, the card must not stay on "Opening the installer…" forever.
    const timer = window.setTimeout(() => {
      if (stageRef.current !== 'installing') return;
      setStage('idle');
      setMessage("If the installer didn't open, allow installs from Walnut, then press Install again.");
    }, INSTALLER_HANDOFF_MS);

    void ApkUpdater.install().catch((error: unknown) => {
      window.clearTimeout(timer);
      const code = rejectionCode(error);
      setStage('error');
      if (code === 'SIGNATURE_MISMATCH') {
        setNeedsReinstall(true);
        setMessage(
          'This phone has a Walnut build signed with a different key, so Android will not replace it in place. Install this version once from the download page; later updates work normally.',
        );
      } else if (code === 'INSTALL_PERMISSION_REQUIRED') {
        setMessage('Allow Walnut to install apps, then press Install again.');
      } else if (code === 'NO_DOWNLOAD') {
        setMessage('The update file is gone. Press Install again to download it.');
      } else if (code === 'CHECKSUM_MISMATCH') {
        setMessage('The downloaded update was damaged. Press Install again to fetch it once more.');
      } else if (code === 'INSTALLER_UNAVAILABLE') {
        setMessage('No app on this phone can open the installer. Check that package installation is enabled.');
      } else {
        setMessage("Couldn't open the installer. Try again.");
      }
    });
  }, []);

  /**
   * Attaches the progress listener and starts (or resumes) the native transfer. Calling it
   * again is safe and is exactly what happens when a download is picked up after the app was
   * in the background: DownloadManager still owns the task and simply continues.
   */
  const startDownload = useCallback(
    async (target: AvailableUpdate) => {
      if (stageRef.current === 'installing') return;

      setStage('downloading');
      setPercent(0);
      setBytes(0);
      setTotal(target.bytes);
      setMessage('');

      if (listenerRef.current) {
        void listenerRef.current.remove();
        listenerRef.current = null;
      }
      // Attach before starting, so no early progress is missed.
      const listener = await ApkUpdater.addListener('progress', (progress) => {
        if (progress.error) {
          setStage('error');
          setMessage(`The download failed: ${progress.error}. Try again.`);
          void listener.remove();
          listenerRef.current = null;
          return;
        }
        if (typeof progress.bytes === 'number') setBytes(progress.bytes);
        if (typeof progress.total === 'number' && progress.total > 0) setTotal(progress.total);
        setPercent(progress.percent ?? 0);
        setMessage(progress.done ? '' : (progress.message ?? ''));
        if (progress.done) {
          void listener.remove();
          listenerRef.current = null;
          setPercent(100);
          openInstaller();
        }
      });
      listenerRef.current = listener;

      const result = await ApkUpdater.download({
        urls: target.urls,
        bytes: target.bytes,
        sha256: target.sha256,
      });
      if (result?.completed) {
        // An earlier attempt already fetched the whole file; there is nothing to wait for.
        void listenerRef.current?.remove();
        listenerRef.current = null;
        setPercent(100);
        setBytes(target.bytes);
        setTotal(target.bytes);
        openInstaller();
      }
    },
    [openInstaller],
  );

  /** Downloads and installs one known build. Shared by the explicit, the one-tap and the
   *  reinstall paths so all three behave the same. */
  const installTarget = useCallback(
    async (target: AvailableUpdate, reinstall: boolean) => {
      if (starting.current) return;

      // Builds without the plugin can still update, just through the browser. The last candidate
      // is GitHub's stable link, which works without the mirror being deployed.
      if (!apkUpdaterAvailable()) {
        window.location.href = target.urls[target.urls.length - 1];
        return;
      }

      // Android will never replace an install signed with a different key. Sending the user to
      // the same installer again cannot work, so hand them the one-time manual path instead.
      if (reinstall) {
        setMessage('Opening the download page in your browser…');
        await openDownloadPage();
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

        await startDownload(target);
      } catch {
        setStage('error');
        setMessage("Couldn't start the update. Try again.");
      } finally {
        // The transfer keeps running natively; this only releases the setup guard.
        starting.current = false;
      }
    },
    [openDownloadPage, startDownload],
  );

  const install = useCallback(async () => {
    if (!update) return;
    await installTarget(update, needsReinstall);
  }, [update, needsReinstall, installTarget]);

  /**
   * The one button in Settings: ask the feed only when nothing is known yet, then download and
   * hand the APK to Android's installer. Pressing it during a transfer does nothing.
   */
  const updateNow = useCallback(async () => {
    if (stageRef.current === 'downloading' || stageRef.current === 'installing') return;
    const target = update ?? (await check(true));
    if (!target) return;
    await installTarget(target, needsReinstall);
  }, [update, needsReinstall, check, installTarget]);

  // Android may freeze or recreate the WebView while DownloadManager keeps working. When the
  // app comes back, re-attach and resume instead of leaving the bar frozen at the last value.
  useEffect(() => {
    if (stage !== 'downloading' || !update) return;
    const onVisible = () => {
      if (document.visibilityState !== 'visible' || resumeLock.current) return;
      resumeLock.current = true;
      void startDownload(update).finally(() => {
        resumeLock.current = false;
      });
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [stage, update, startDownload]);

  return {
    stage,
    update,
    percent,
    progressBytes,
    progressTotal,
    message,
    check,
    install,
    updateNow,
    openDownloadPage,
    needsReinstall,
    dismissed,
    dismiss: () => setDismissed(true),
  };
}
