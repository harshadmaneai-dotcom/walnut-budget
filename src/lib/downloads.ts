/**
 * Download targets for the landing page and both updaters.
 *
 * Every release publishes one GitHub Release tagged v<version> that carries the Windows
 * installer, latest.yml and the APK, so these stable "latest" URLs always resolve to the
 * newest build without anything to bump.
 */
export const REPO = 'harshadmaneai-dotcom/walnut-budget';

export const DESKTOP_DOWNLOAD_URL = `https://github.com/${REPO}/releases/latest/download/Walnut-Setup.exe`;

/**
 * Hosted web origin used for auth redirects. The desktop app runs from file://,
 * where window.location.origin is not a usable redirect target.
 */
export const WEB_ORIGIN = 'https://walnut-budget.vercel.app';

/** Android APK, published beside the installer in the same release. */
export const ANDROID_DOWNLOAD_URL = `https://github.com/${REPO}/releases/latest/download/Walnut.apk`;

/**
 * The same APK with a stable name on the website host, refreshed by every release. This is
 * the manual install path for phones where GitHub is blocked or crawling, so it lives on the
 * host that also serves the update feed instead of behind the release API.
 */
export const ANDROID_MIRROR_URL = `${WEB_ORIGIN}/updates/Walnut.apk`;

/**
 * The site's download page, opened in the real browser. It always answers even when a direct
 * APK request is still catching up with a fresh deployment, so it is the safe recovery target.
 */
export const DOWNLOAD_PAGE_URL = WEB_ORIGIN;
