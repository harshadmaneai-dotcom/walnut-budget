import { ANDROID_DOWNLOAD_URL, REPO, WEB_ORIGIN } from './downloads';
import { APP_VERSION, compareVersions } from './version';

/**
 * The Android updater reads a small manifest published beside the website:
 *
 *   https://walnut-budget.vercel.app/updates/latest.json
 *
 * That host is the same one users already reach from the app, and it answers a static file,
 * so discovery does not depend on GitHub. That matters because GitHub's release API allows
 * only 60 unauthenticated requests per hour per IP: on mobile carrier NAT thousands of people
 * share one address, so a check regularly comes back 403 and the app used to show nothing.
 *
 * GitHub's latest release stays as the fallback and is still the publisher of record, so a
 * missing or lagging manifest can never invent a version or block an update.
 */
const LATEST_RELEASE_URL = `https://api.github.com/repos/${REPO}/releases/latest`;
const MANIFEST_URL = `${WEB_ORIGIN}/updates/latest.json`;

/** Automatic checks reuse a recent answer; a manual check always asks the feed. */
const CACHE_KEY = 'walnut:update-check';
const CACHE_MS = 60 * 60 * 1000;
/**
 * Both feeds are asked in parallel and each is aborted after this long. GitHub used to be
 * requested with no timeout at all, so a network that blackholes api.github.com left the app
 * on "Checking…" indefinitely even when the website feed had already answered.
 */
const FEED_TIMEOUT_MS = 6_000;
const SHA256_PATTERN = /^[0-9a-f]{64}$/i;

export interface AvailableUpdate {
  version: string;
  /** Download sources, best first: website mirror, then the release asset, then GitHub's stable link. */
  urls: string[];
  /** Published size in bytes, used to skip a download that already finished. 0 when unknown. */
  bytes: number;
  /** SHA-256 of the published APK, so a corrupted download is rejected instead of installed. */
  sha256: string;
  notes: string;
}

/** Thrown when the release feed cannot be read, so the UI can say why. */
export class UpdateCheckError extends Error {}

/** The static file the release workflow publishes next to the APK mirror. */
export interface UpdateManifest {
  version: string;
  apk: string;
  bytes: number;
  /** Empty when the manifest predates checksums; the native side then falls back to the size. */
  sha256: string;
  notes: string;
}

interface Cache {
  checkedAt: number;
  version: string;
  apkUrl?: string;
  bytes?: number;
  sha256?: string;
  notes?: string;
}

interface ReleaseAsset {
  name?: unknown;
  size?: unknown;
  browser_download_url?: unknown;
}

interface ReleaseFeed {
  version: string;
  asset: { url: string; bytes: number } | null;
  notes: string;
}

/** One resolved answer for "what is the newest build", from either feed. */
interface Feed {
  version: string;
  bytes: number;
  sha256: string;
  notes: string;
  mirrorApk?: string;
  assetUrl?: string;
}

export function manifestUrl(): string {
  return MANIFEST_URL;
}

/** Where the APK is mirrored beside the website. The version in the path keeps it honest. */
export function mirrorApkUrl(version: string): string {
  return `${WEB_ORIGIN}/updates/Walnut-${version}.apk`;
}

/**
 * Validates the published manifest before any of it is trusted. A malformed file, a version
 * that is not a release number, or an APK name that escapes the updates directory is treated
 * as "no manifest" and the GitHub feed is used instead.
 */
export function parseUpdateManifest(value: unknown): UpdateManifest | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;

  const version = typeof raw.version === 'string' ? raw.version.trim() : '';
  if (!/^\d+\.\d+\.\d+$/.test(version)) return null;

  const apk = typeof raw.apk === 'string' ? raw.apk.trim() : '';
  if (!/^Walnut-[0-9A-Za-z._-]+\.apk$/.test(apk) || apk.includes('..')) return null;

  const bytes = typeof raw.bytes === 'number' ? raw.bytes : Number.NaN;
  if (!Number.isFinite(bytes) || bytes <= 0 || Math.floor(bytes) !== bytes) return null;

  const sha256 = typeof raw.sha256 === 'string' ? raw.sha256.trim() : '';
  if (sha256 && !SHA256_PATTERN.test(sha256)) return null;

  return {
    version,
    apk,
    bytes,
    sha256: sha256.toLowerCase(),
    notes: typeof raw.notes === 'string' ? raw.notes : '',
  };
}

/**
 * The APK inside a release feed. Each release publishes it twice (Walnut.apk and
 * Walnut-<version>.apk), so the stable name wins.
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

/**
 * Every place this version can be fetched from, best first. The mirror is a known path for a
 * specific version, so it can never serve the wrong build; if it is not deployed the download
 * fails over to the release asset and then GitHub's stable link.
 */
export function apkCandidateUrls(
  version: string,
  asset: { url: string; bytes: number } | null,
  mirrorApk?: string,
): string[] {
  const urls = [mirrorApk ? `${WEB_ORIGIN}/updates/${mirrorApk}` : mirrorApkUrl(version)];
  if (asset?.url) urls.push(asset.url);
  urls.push(ANDROID_DOWNLOAD_URL);
  return Array.from(new Set(urls));
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
      sha256: typeof parsed.sha256 === 'string' ? parsed.sha256 : undefined,
      notes: typeof parsed.notes === 'string' ? parsed.notes : undefined,
    };
  } catch {
    return null;
  }
}

function writeCache(feed: Feed) {
  try {
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({
        checkedAt: Date.now(),
        version: feed.version,
        ...(feed.assetUrl ? { apkUrl: feed.assetUrl } : {}),
        bytes: feed.bytes,
        sha256: feed.sha256,
        notes: feed.notes,
      } satisfies Cache),
    );
  } catch {
    // Storage can be blocked; the check still works, it just is not cached.
  }
}

function toUpdate(feed: Feed): AvailableUpdate | null {
  if (compareVersions(feed.version, APP_VERSION) <= 0) return null;
  return {
    version: feed.version,
    urls: apkCandidateUrls(
      feed.version,
      feed.assetUrl ? { url: feed.assetUrl, bytes: feed.bytes } : null,
      feed.mirrorApk,
    ),
    bytes: feed.bytes,
    sha256: feed.sha256,
    notes: feed.notes,
  };
}

/** Reads the website manifest. Any failure is "no manifest", never a hard error. */
async function fetchManifest(): Promise<UpdateManifest | null> {
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), FEED_TIMEOUT_MS) : null;
  try {
    const response = await fetch(`${MANIFEST_URL}?t=${Date.now()}`, {
      cache: 'no-store',
      ...(controller ? { signal: controller.signal } : {}),
    });
    if (!response.ok) return null;
    return parseUpdateManifest(await response.json());
  } catch {
    return null;
  } finally {
    if (timer !== null) clearTimeout(timer);
  }
}

async function fetchLatestRelease(): Promise<ReleaseFeed> {
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), FEED_TIMEOUT_MS) : null;
  let response: Response;
  try {
    response = await fetch(`${LATEST_RELEASE_URL}?t=${Date.now()}`, {
      cache: 'no-store',
      headers: { Accept: 'application/vnd.github+json' },
      ...(controller ? { signal: controller.signal } : {}),
    });
  } catch {
    throw new UpdateCheckError('GitHub did not answer');
  } finally {
    if (timer !== null) clearTimeout(timer);
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
  if (json.draft === true || json.prerelease === true) {
    throw new UpdateCheckError('the latest release is a draft');
  }

  const version = json.tag_name.replace(/^v/, '');
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new UpdateCheckError('the release feed had no version');
  return {
    version,
    asset: pickApkAsset(json.assets),
    notes: typeof json.body === 'string' ? json.body : '',
  };
}

/**
 * Both feeds describe the same release, but one may be deployed a minute before the other.
 * The higher version wins, and the manifest's size and checksum are only attached when it is
 * describing that exact build.
 */
function chooseFeed(manifest: UpdateManifest | null, release: ReleaseFeed | null): Feed | null {
  const candidates: Feed[] = [];
  if (manifest) {
    candidates.push({
      version: manifest.version,
      bytes: manifest.bytes,
      sha256: manifest.sha256,
      notes: manifest.notes,
      mirrorApk: manifest.apk,
    });
  }
  if (release) {
    candidates.push({
      version: release.version,
      bytes: release.asset?.bytes ?? 0,
      sha256: '',
      notes: release.notes,
      assetUrl: release.asset?.url,
    });
  }
  if (candidates.length === 0) return null;

  let feed = candidates[0];
  for (const candidate of candidates.slice(1)) {
    if (compareVersions(candidate.version, feed.version) > 0) feed = candidate;
  }

  const matchingManifest = manifest && manifest.version === feed.version ? manifest : null;
  if (matchingManifest) {
    return {
      ...feed,
      bytes: feed.bytes || matchingManifest.bytes,
      sha256: matchingManifest.sha256,
      mirrorApk: matchingManifest.apk,
    };
  }
  return feed;
}

/** Returns the published Android build when it is newer than the installed one. */
export async function checkForAndroidUpdate(options: { force?: boolean } = {}): Promise<AvailableUpdate | null> {
  if (!options.force) {
    const cached = readCache();
    if (cached && Date.now() - cached.checkedAt < CACHE_MS) {
      return toUpdate({
        version: cached.version,
        bytes: cached.bytes ?? 0,
        sha256: cached.sha256 ?? '',
        notes: cached.notes ?? '',
        assetUrl: cached.apkUrl,
      });
    }
  }

  // Parallel, so a blocked GitHub cannot delay an answer the website feed already gave.
  const [manifestResult, releaseResult] = await Promise.allSettled([fetchManifest(), fetchLatestRelease()]);
  const manifest = manifestResult.status === 'fulfilled' ? manifestResult.value : null;
  const release = releaseResult.status === 'fulfilled' ? releaseResult.value : null;
  const releaseError =
    releaseResult.status === 'rejected'
      ? releaseResult.reason instanceof UpdateCheckError
        ? releaseResult.reason.message
        : 'unknown error'
      : null;

  const feed = chooseFeed(manifest, release);
  if (!feed) {
    // Neither feed answered. Say why instead of pretending the app is current.
    throw new UpdateCheckError(releaseError ?? 'the update feed could not be reached');
  }

  writeCache(feed);
  return toUpdate(feed);
}
