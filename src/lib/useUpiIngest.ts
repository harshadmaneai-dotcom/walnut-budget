import { useCallback, useEffect, useRef } from 'react';
import type { Store } from '../store';
import { detectedFromItem, mergeDetected, type DetectedUpiPayment } from './upi';
import { upiTrackAvailable, UpiTracker } from './upi-native';

/**
 * Bridges the native notification queue into the document.
 *
 * The native side never talks to Supabase: it only queues parsed payments. This hook merges
 * them through the same store every manual edit uses, so the existing save/poll path carries
 * them to the desktop with no desktop changes at all.
 *
 * It waits for the remote document before merging, otherwise the merge would be replaced by
 * the load that follows it, and every step is idempotent, so a missed event costs nothing.
 */
export function useUpiIngest(store: Store, userId: string): void {
  const { update, ready } = store;
  const readyRef = useRef(ready);
  readyRef.current = ready;

  /** Nothing is taken from the queue until the signed-in account is pinned on the native side. */
  const pinned = useRef(false);
  /**
   * One drain at a time. The native event, focus, visibility, coming online and the retry loop
   * can all fire together, and overlapping drains would let a later handover start before the
   * earlier merge has reached the document.
   */
  const draining = useRef(false);
  /** Set when a trigger arrives mid-drain, so that payment is not left for the next app open. */
  const drainAgain = useRef(false);

  const drain = useCallback(async () => {
    if (!readyRef.current || !pinned.current || !upiTrackAvailable()) return;
    if (draining.current) {
      drainAgain.current = true;
      return;
    }

    draining.current = true;
    try {
      do {
        drainAgain.current = false;
        const { items } = await UpiTracker.drain();
        const detected: DetectedUpiPayment[] = [];
        for (const item of items ?? []) {
          const payment = detectedFromItem(item);
          if (payment) detected.push(payment);
        }
        if (detected.length) update((prev) => mergeDetected(prev, detected).data);
      } while (drainAgain.current && readyRef.current);
    } catch {
      // Auto-tracking is an optional convenience. A failed drain must never disturb the
      // budget or surface an error the user cannot act on. The next wake-up drains again,
      // and a merge that already reached the document is not repeated, because transaction
      // ids are derived from the notification key.
    } finally {
      draining.current = false;
    }
  }, [update]);

  useEffect(() => {
    if (!upiTrackAvailable()) return;
    let disposed = false;
    pinned.current = false;

    const onWake = () => {
      if (document.visibilityState === 'visible') void drain();
    };

    const subscription = UpiTracker.addListener('detected', onWake).catch(() => null);
    document.addEventListener('visibilitychange', onWake);
    window.addEventListener('focus', onWake);
    window.addEventListener('online', onWake);

    // Order matters: pin the account first, then drain what was queued for it. The drain is
    // gated on the pin, so a `detected` event during start-up cannot hand over an item that
    // was captured for the previous account.
    UpiTracker.setAccount({ userId })
      .catch(() => {})
      .finally(() => {
        if (disposed) return;
        pinned.current = true;
        void drain();
      });

    return () => {
      disposed = true;
      pinned.current = false;
      document.removeEventListener('visibilitychange', onWake);
      window.removeEventListener('focus', onWake);
      window.removeEventListener('online', onWake);
      void subscription.then((handle) => handle?.remove()).catch(() => {});
      // The queue is deliberately left alone here: React remounts effects, the app can be
      // closed at any moment, and a captured payment must survive both. Sign-out clears it.
    };
  }, [drain, userId]);

  useEffect(() => {
    if (ready) void drain();
  }, [ready, drain]);
}
