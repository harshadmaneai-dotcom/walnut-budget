/**
 * Supabase returns timestamptz values with a `+00:00` offset, while JavaScript's
 * toISOString() uses `Z`. Compare parsed instants, never the raw strings.
 */
export function remoteIsNewer(
  remote: string | null | undefined,
  local: string | null | undefined,
): boolean {
  if (!remote) return false;
  const remoteTime = Date.parse(remote);
  if (Number.isNaN(remoteTime)) return false;
  if (!local) return true;
  const localTime = Date.parse(local);
  if (Number.isNaN(localTime)) return true;
  return remoteTime > localTime;
}

/**
 * Poll only the row's updated_at. The full document is fetched when that timestamp
 * changes, so an open device stays in sync without shipping the whole budget every tick.
 */
export const REMOTE_POLL_MS = 4_000;
