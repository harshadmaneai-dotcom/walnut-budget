import { Capacitor, registerPlugin } from '@capacitor/core';

export interface ApkDownloadProgress {
  percent: number;
  done?: boolean;
  error?: string;
  /** Bytes transferred so far, so a slow link shows real numbers instead of a frozen bar. */
  bytes?: number;
  /** Published size of the APK, or 0 when the server did not say. */
  total?: number;
  /** "Waiting for a connection…", "Slow connection…" and similar non-progress states. */
  message?: string;
}

export interface ApkDownloadResult {
  /** True when the APK was already downloaded in full, so there is nothing left to fetch. */
  completed?: boolean;
  /** True when an in-flight download was picked up instead of starting a second one. */
  resumed?: boolean;
}

interface ApkUpdaterPlugin {
  /** False until the user allows Walnut to install apps (one-time, per device). */
  canInstall(): Promise<{ allowed: boolean }>;
  /** Opens the system "install unknown apps" screen for Walnut. */
  openInstallSettings(): Promise<void>;
  /** Sources in order of preference; the plugin moves to the next one if a source fails. */
  download(options: { urls?: string[]; url?: string; bytes?: number }): Promise<ApkDownloadResult>;
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
