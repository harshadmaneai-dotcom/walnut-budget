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
import { fetchRemote, fetchRemoteTimestamp, remoteEnabled, saveRemote } from './lib/remote';
import { REMOTE_POLL_MS, remoteIsNewer } from './lib/sync';

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
  /** True when the local copy must be written after load (new row or unsynced edits). */
  const needsInitialPush = useRef(false);

  /** Timestamp of the last remote version this device applied or wrote. */
  const lastRemoteAt = useRef<string | null>(null);
  /** The exact object received from a poll, so the data effect does not echo it back. */
  const remoteApplied = useRef<AppData | null>(null);
  const refreshingRemote = useRef(false);

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
        const dirty = isDirty(userId);
        needsInitialPush.current = remote === null || dirty;
        if (remote) {
          lastRemoteAt.current = remote.updatedAt;
          // A cache holding unsynced edits wins over the cloud copy; otherwise the cloud is
          // authoritative. This is what stops a reload mid-write from losing an edit.
          if (!dirty) {
            setData(withDueRecurring(normalizeData(remote.data)));
          }
        } else if (initial.legacy && isBlankData(initial.data)) {
          // First sign-in on this device: the old single-user budget becomes this account's.
          setData(withDueRecurring(initial.legacy));
          markLegacyClaimed();
        }
        setSyncStatus('synced');
        setSyncError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        // If the initial read failed while there are unsynced local edits, still try to
        // push them once the app is ready instead of leaving them stranded in the cache.
        needsInitialPush.current = isDirty(userId);
        reportError(err);
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

    // A document that came from the cloud is already the server's copy. Save it locally,
    // but never send it straight back as a new edit.
    if (remoteApplied.current === data) {
      remoteApplied.current = null;
      return;
    }
    remoteApplied.current = null;

    // The first run after loading is not an edit: the cloud either already holds this
    // document or the read failed. Writing on that run is what would let an offline launch
    // overwrite a newer cloud copy later, so only a genuine change is persisted remotely.
    if (settled.current === null) {
      settled.current = data;
      if (!needsInitialPush.current) return;
      needsInitialPush.current = false;
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
        .then((updatedAt) => {
          if (updatedAt) lastRemoteAt.current = updatedAt;
          // Keep the unsynced marker until the newest document has reached the cloud.
          if (latestData.current === snapshot) clearDirty(userId);
          setSyncStatus('synced');
          setSyncError(null);
        })
        .catch(reportError);
    }, REMOTE_SAVE_DELAY_MS);
  }, [data, ready, userId, reportError]);

  /**
   * Cheap push check for open devices. Only updated_at is fetched; the document itself is
   * requested when that timestamp moves. A dirty local copy always wins, and the next local
   * save updates the timestamp for every other device.
   */
  const refreshRemote = useCallback(async () => {
    if (!remoteEnabled || !ready) return;
    if (document.visibilityState !== 'visible') return;
    if (refreshingRemote.current) return;

    refreshingRemote.current = true;
    try {
      const remoteAt = await fetchRemoteTimestamp(userId);
      if (!remoteAt || !remoteIsNewer(remoteAt, lastRemoteAt.current)) return;
      if (isDirty(userId) || pendingTimer.current !== null) return;

      const remote = await fetchRemote(userId);
      if (!remote || !remoteIsNewer(remote.updatedAt, lastRemoteAt.current)) return;
      // An edit can land while the document is in flight; that edit is newer than this copy.
      if (isDirty(userId) || pendingTimer.current !== null) return;

      lastRemoteAt.current = remote.updatedAt;
      const next = withDueRecurring(normalizeData(remote.data));
      if (JSON.stringify(next) === JSON.stringify(dataRef.current)) return;

      remoteApplied.current = next;
      setData(next);
    } catch {
      // Polling is opportunistic. The save path still reports real sync errors.
    } finally {
      refreshingRemote.current = false;
    }
  }, [ready, userId]);

  useEffect(() => {
    if (!remoteEnabled || !ready) return;
    const check = () => {
      if (document.visibilityState === 'visible') void refreshRemote();
    };

    void check();
    const timer = window.setInterval(check, REMOTE_POLL_MS);
    document.addEventListener('visibilitychange', check);
    window.addEventListener('focus', check);
    window.addEventListener('online', check);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', check);
      window.removeEventListener('focus', check);
      window.removeEventListener('online', check);
    };
  }, [ready, refreshRemote]);

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
      .then((updatedAt) => {
        if (updatedAt) lastRemoteAt.current = updatedAt;
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
