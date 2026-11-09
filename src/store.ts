import { useCallback, useEffect, useRef, useState } from 'react';
import { applyRecurring } from './lib/calc';
import { isBlankData, loadCached, markLegacyClaimed, newId, normalizeData, saveData } from './lib/storage';
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
        if (remote) {
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
    saveData(userId, data);
    if (!ready) return;
    if (!remoteEnabled) return;
    setSyncStatus('syncing');
    saveRemote(userId, data)
      .then(() => {
        setSyncStatus('synced');
        setSyncError(null);
      })
      .catch(reportError);
  }, [data, ready, userId, reportError]);

  const retrySync = useCallback(() => {
    if (!remoteEnabled) return;
    setSyncStatus('syncing');
    saveRemote(userId, dataRef.current)
      .then(() => {
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
