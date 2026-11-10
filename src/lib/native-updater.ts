import { Capacitor, registerPlugin } from '@capacitor/core';

export interface ApkDownloadProgress {
  percent: number;
  done?: boolean;
  error?: string;
}

interface ApkUpdaterPlugin {
  /** False until the user allows Walnut to install apps (one-time, per device). */
  canInstall(): Promise<{ allowed: boolean }>;
  /** Opens the system "install unknown apps" screen for Walnut. */
  openInstallSettings(): Promise<void>;
  download(options: { url: string }): Promise<void>;
  install(): Promise<void>;
  addListener(
    eventName: 'progress',
    listener: (progress: ApkDownloadProgress) => void,
  ): Promise<{ remove: () => Promise<void> }>;
}

/** Implemented in android/app/src/main/java/app/walnut/mobile/ApkUpdaterPlugin.java. */
const ApkUpdater = registerPlugin<ApkUpdaterPlugin>('ApkUpdater');

/**
 * Builds before 2.0.12 shipped without the native plugin, so the UI falls back to opening
 * the APK in the browser instead of failing.
 */
export function apkUpdaterAvailable(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('ApkUpdater');
}

export { ApkUpdater };
