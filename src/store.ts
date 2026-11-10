import { useCallback, useEffect, useRef, useState } from 'react';
import { applyRecurring } from './lib/calc';
import {
  clearDirty,
  isBlankData,
  isDirty,
  loadCached,
  markDirty,
  markLegacyClaimed,
  newId,
  normalizeData,
  saveData,
} from './lib/storage';
import type { AppData } from './lib/types';
import { todayISO } from './lib/format';
import { fetchRemote, remoteEnabled, saveRemote } from './lib/remote';

function withDueRecurring(d: AppData): AppData {
  const { created, rules } = applyRecurring(d.recurring, todayISO(), newId);
  return created.length
    ? { ...d, recurring: rules, transactions: [...d.transactions, ...created] }
    : d;
}

function messageOf(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  const maybe = err as { message?: unknown } | null;
  if (maybe && typeof maybe.message === 'string' && maybe.message) return maybe.message;
  return String(err);
}

/**
 * App-wide state for one signed-in account. The local cache is namespaced by user id;
 * Supabase is the durable store. On load we show the cache, then replace it with the
 * account's remote copy if one exists. Remote writes start only after that initial load,
 * so a default document can't overwrite data. A failed write stays in the cache and is
 * reported, with a retry available.
 */
/** Writes are coalesced: a burst of edits becomes one upsert, never one per keystroke. */
const REMOTE_SAVE_DELAY_MS = 600;

export function useStore(userId: string) {
  const [initial] = useState(() => loadCached(userId));
  const [data, setData] = useState<AppData>(() => withDueRecurring(initial.data));
  const [syncStatus, setSyncStatus] = useState<'local' | 'syncing' | 'synced' | 'error'>(
    remoteEnabled ? 'syncing' : 'local',
  );
  const [syncError, setSyncError] = useState<string | null>(null);
  const [ready, setReady] = useState(!remoteEnabled);
  const lastError = useRef<string | null>(null);
  const dataRef = useRef(data);
  dataRef.current = data;

  /** Serialises cloud writes, so an older document can never land after a newer one. */
  const writeChain = useRef<Promise<unknown>>(Promise.resolve());
  const pendingTimer = useRef<number | null>(null);
  const latestData = useRef(data);
  latestData.current = data;

  /** The document as it stood when loading finished; anything after it is a real edit. */
  const settled = useRef<AppData | null>(null);
  /** True when this account has no cloud document yet, so the first save must create it. */
  const remoteMissing = useRef(false);

  const reportError = useCallback((err: unknown) => {
    const message = messageOf(err);
    lastError.current = message;
    setSyncError(message);
    setSyncStatus('error');
  }, []);

  useEffect(() => {
    if (!remoteEnabled) return;
    let cancelled = false;
    fetchRemote(userId)
      .then((remote) => {
        if (cancelled) return;
        remoteMissing.current = remote === null;
        // A cache holding unsynced edits wins over the cloud copy; otherwise the cloud is
        // authoritative. This is what stops a reload mid-write from losing an edit.
        if (remote && !isDirty(userId)) {
          setData(withDueRecurring(normalizeData(remote)));
        } else if (initial.legacy && isBlankData(initial.data)) {
          // First sign-in on this device: the old single-user budget becomes this account's.
          setData(withDueRecurring(initial.legacy));
          markLegacyClaimed();
        }
        setSyncStatus('synced');
        setSyncError(null);
      })
      .catch((err: unknown) => {
        if (!cancelled) reportError(err);
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, initial.legacy, initial.data, reportError]);

  useEffect(() => {
    // The local cache is written immediately, so nothing is lost if the app closes now.
    saveData(userId, data);
    if (!ready || !remoteEnabled) return;

    // The first run after loading is not an edit: the cloud either already holds this
    // document or the read failed. Writing on that run is what would let an offline launch
    // overwrite a newer cloud copy later, so only a genuine change is persisted remotely.
    if (settled.current === null) {
      settled.current = data;
      if (!remoteMissing.current) return;
    }

    markDirty(userId);
    setSyncStatus('syncing');

    latestData.current = data;
    if (pendingTimer.current !== null) window.clearTimeout(pendingTimer.current);
    pendingTimer.current = window.setTimeout(() => {
      pendingTimer.current = null;
      const snapshot = latestData.current;
      writeChain.current = writeChain.current
        .then(() => saveRemote(userId, snapshot))
        .then(() => {
          // Keep the unsynced marker until the newest document has reached the cloud.
          if (latestData.current === snapshot) clearDirty(userId);
          setSyncStatus('synced');
          setSyncError(null);
        })
        .catch(reportError);
    }, REMOTE_SAVE_DELAY_MS);
  }, [data, ready, userId, reportError]);

  // Drop a queued write when this account stops being the one on screen.
  useEffect(
    () => () => {
      if (pendingTimer.current !== null) {
        window.clearTimeout(pendingTimer.current);
        pendingTimer.current = null;
      }
    },
    [],
  );

  const retrySync = useCallback(() => {
    if (!remoteEnabled) return;
    setSyncStatus('syncing');
    const snapshot = dataRef.current;
    markDirty(userId);
    writeChain.current = writeChain.current
      .then(() => saveRemote(userId, snapshot))
      .then(() => {
        clearDirty(userId);
        setSyncStatus('synced');
        setSyncError(null);
      })
      .catch(reportError);
  }, [userId, reportError]);

  const update = useCallback((fn: (prev: AppData) => AppData) => setData((prev) => fn(prev)), []);
  const replaceAll = useCallback((next: AppData) => setData(next), []);

  return { data, update, replaceAll, syncStatus, syncError, retrySync };
}

export type Store = ReturnType<typeof useStore>;
