import { Capacitor, registerPlugin } from '@capacitor/core';
import type { NativeUpiItem } from './upi';

/** What the phone reports about auto-tracking, always read fresh from the native prefs. */
export interface UpiTrackerStatus {
  /** The in-app toggle, which is independent of the system permission. */
  enabled: boolean;
  /** Whether Walnut currently has Notification access. */
  notificationAccess: boolean;
  /** Epoch milliseconds of the last payment captured, or 0. */
  lastDetectedAt: number;
  /** Detections waiting to be merged into the document. */
  pending: number;
}

interface UpiTrackerPlugin {
  status(): Promise<UpiTrackerStatus>;
  setEnabled(options: { enabled: boolean }): Promise<UpiTrackerStatus>;
  openNotificationAccessSettings(): Promise<void>;
  /** Returns everything queued and clears it; the merge is idempotent if this is retried. */
  drain(): Promise<{ items: NativeUpiItem[]; lastDetectedAt: number }>;
  /** Pins the signed-in account, so a queued payment cannot land in the next account. */
  setAccount(options: { userId: string }): Promise<void>;
  clearAccount(): Promise<void>;
  /** Debug builds only: feeds a sample notification through the parser. */
  debugSimulate(options: {
    title: string;
    text: string;
    sourceApp?: string;
    postTime?: number;
  }): Promise<{ parsed: boolean }>;
  addListener(
    eventName: 'detected',
    listener: (item: NativeUpiItem) => void,
  ): Promise<{ remove: () => Promise<void> }>;
}

/** Implemented in android/app/src/main/java/app/walnut/mobile/UpiTrackerPlugin.java. */
const UpiTracker = registerPlugin<UpiTrackerPlugin>('UpiTracker');

/**
 * Auto-tracking is Android-only by design: the desktop and the website are a viewer of the
 * same data, never a capture surface, and the plugin only exists in the Android shell.
 */
export function upiTrackAvailable(): boolean {
  return Capacitor.getPlatform() === 'android' && Capacitor.isPluginAvailable('UpiTracker');
}

export { UpiTracker };
