import { ANDROID_DOWNLOAD_URL, REPO } from './downloads';
import { APP_VERSION, compareVersions } from './version';

/**
 * The Android updater reads GitHub's latest release, which is the same release the desktop
 * updater reads. One publish therefore feeds both platforms, and no hand-maintained version
 * file can fall behind.
 */
const LATEST_RELEASE_URL = `https://api.github.com/repos/${REPO}/releases/latest`;

/** Automatic checks reuse a recent answer; a manual check always asks GitHub. */
const CACHE_KEY = 'walnut:update-check';
const CACHE_MS = 60 * 60 * 1000;

export interface AvailableUpdate {
  version: string;
  apkUrl: string;
  notes: string;
}

/** Thrown when the release feed cannot be read, so the UI can say why. */
export class UpdateCheckError extends Error {}

interface Cache {
  checkedAt: number;
  version: string;
}

function readCache(): Cache | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Cache>;
    if (typeof parsed.checkedAt !== 'number' || typeof parsed.version !== 'string') return null;
    return { checkedAt: parsed.checkedAt, version: parsed.version };
  } catch {
    return null;
  }
}

function writeCache(version: string) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ checkedAt: Date.now(), version } satisfies Cache));
  } catch {
    // Storage can be blocked; the check still works, it just is not cached.
  }
}

function toUpdate(version: string, notes = ''): AvailableUpdate | null {
  if (compareVersions(version, APP_VERSION) <= 0) return null;
  return { version, apkUrl: ANDROID_DOWNLOAD_URL, notes };
}

/** Returns the published Android build when it is newer than the installed one. */
export async function checkForAndroidUpdate(options: { force?: boolean } = {}): Promise<AvailableUpdate | null> {
  if (!options.force) {
    const cached = readCache();
    if (cached && Date.now() - cached.checkedAt < CACHE_MS) return toUpdate(cached.version);
  }

  let response: Response;
  try {
    response = await fetch(`${LATEST_RELEASE_URL}?t=${Date.now()}`, {
      cache: 'no-store',
      headers: { Accept: 'application/vnd.github+json' },
    });
  } catch {
    throw new UpdateCheckError('no connection');
  }

  if (response.status === 403 || response.status === 429) {
    throw new UpdateCheckError('GitHub is rate-limiting checks, try again in a few minutes');
  }
  if (!response.ok) throw new UpdateCheckError(`GitHub answered ${response.status}`);

  const json = (await response.json()) as {
    tag_name?: unknown;
    body?: unknown;
    draft?: unknown;
    prerelease?: unknown;
  };
  if (typeof json.tag_name !== 'string') throw new UpdateCheckError('the release feed had no version');
  if (json.draft === true || json.prerelease === true) return null;

  const version = json.tag_name.replace(/^v/, '');
  writeCache(version);
  return toUpdate(version, typeof json.body === 'string' ? json.body : '');
}
