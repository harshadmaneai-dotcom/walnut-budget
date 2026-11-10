/**
 * Download targets for the landing page and both updaters.
 *
 * Every release publishes one GitHub Release tagged v<version> that carries the Windows
 * installer, latest.yml and the APK, so these stable "latest" URLs always resolve to the
 * newest build without anything to bump.
 */
export const REPO = 'harshadmaneai-dotcom/walnut-budget';

export const DESKTOP_DOWNLOAD_URL = `https://github.com/${REPO}/releases/latest/download/Walnut-Setup.exe`;

/** Android APK, published beside the installer in the same release. */
export const ANDROID_DOWNLOAD_URL = `https://github.com/${REPO}/releases/latest/download/Walnut.apk`;

/**
 * Hosted web origin used for auth redirects. The desktop app runs from file://,
 * where window.location.origin is not a usable redirect target.
 */
export const WEB_ORIGIN = 'https://walnut-budget.vercel.app';
