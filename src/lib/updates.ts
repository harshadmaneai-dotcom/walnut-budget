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
  /** Published size in bytes, used to skip a download that already finished. 0 when unknown. */
  bytes: number;
  notes: string;
}

/** Thrown when the release feed cannot be read, so the UI can say why. */
export class UpdateCheckError extends Error {}

interface Cache {
  checkedAt: number;
  version: string;
  apkUrl?: string;
  bytes?: number;
}

interface ReleaseAsset {
  name?: unknown;
  size?: unknown;
  browser_download_url?: unknown;
}

/**
 * The APK inside a release feed. Each release publishes it twice (Walnut.apk and
 * Walnut-<version>.apk), so the stable name wins. The direct asset URL is used instead of the
 * releases/latest/download redirect: one hop fewer on a connection where every hop hurts.
 */
export function pickApkAsset(assets: unknown): { url: string; bytes: number } | null {
  if (!Array.isArray(assets)) return null;
  const entries = assets.filter(
    (entry): entry is ReleaseAsset => Boolean(entry) && typeof entry === 'object',
  );
  const chosen =
    entries.find((entry) => entry.name === 'Walnut.apk') ??
    entries.find((entry) => typeof entry.name === 'string' && entry.name.toLowerCase().endsWith('.apk'));
  if (!chosen || typeof chosen.browser_download_url !== 'string' || !chosen.browser_download_url) return null;
  const bytes =
    typeof chosen.size === 'number' && Number.isFinite(chosen.size) && chosen.size > 0 ? chosen.size : 0;
  return { url: chosen.browser_download_url, bytes };
}

function readCache(): Cache | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Cache>;
    if (typeof parsed.checkedAt !== 'number' || typeof parsed.version !== 'string') return null;
    return {
      checkedAt: parsed.checkedAt,
      version: parsed.version,
      apkUrl: typeof parsed.apkUrl === 'string' ? parsed.apkUrl : undefined,
      bytes: typeof parsed.bytes === 'number' ? parsed.bytes : undefined,
    };
  } catch {
    return null;
  }
}

function writeCache(version: string, asset: { url: string; bytes: number } | null) {
  try {
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({
        checkedAt: Date.now(),
        version,
        ...(asset ? { apkUrl: asset.url, bytes: asset.bytes } : {}),
      } satisfies Cache),
    );
  } catch {
    // Storage can be blocked; the check still works, it just is not cached.
  }
}

function toUpdate(
  version: string,
  notes = '',
  asset: { url: string; bytes: number } | null = null,
): AvailableUpdate | null {
  if (compareVersions(version, APP_VERSION) <= 0) return null;
  return {
    version,
    apkUrl: asset?.url ?? ANDROID_DOWNLOAD_URL,
    bytes: asset?.bytes ?? 0,
    notes,
  };
}

/** Returns the published Android build when it is newer than the installed one. */
export async function checkForAndroidUpdate(options: { force?: boolean } = {}): Promise<AvailableUpdate | null> {
  if (!options.force) {
    const cached = readCache();
    if (cached && Date.now() - cached.checkedAt < CACHE_MS) {
      return toUpdate(cached.version, '', cached.apkUrl ? { url: cached.apkUrl, bytes: cached.bytes ?? 0 } : null);
    }
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
    assets?: unknown;
  };
  if (typeof json.tag_name !== 'string') throw new UpdateCheckError('the release feed had no version');
  if (json.draft === true || json.prerelease === true) return null;

  const version = json.tag_name.replace(/^v/, '');
  const asset = pickApkAsset(json.assets);
  writeCache(version, asset);
  return toUpdate(version, typeof json.body === 'string' ? json.body : '', asset);
}
