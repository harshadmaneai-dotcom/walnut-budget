/**
 * Download targets for the landing page and the Apps section.
 *
 * Both are stable names, so they never go stale: the Windows installer comes from the
 * repository's *latest* release under a fixed filename, and the APK is a fixed file in
 * public/ that every Android release replaces.
 */
export const DESKTOP_DOWNLOAD_URL =
  'https://github.com/harshadmaneai-dotcom/walnut-budget/releases/latest/download/Walnut-Setup.exe';

/** Android APK, served from this site (public/) so the browser downloads it in place. */
export const ANDROID_DOWNLOAD_URL = '/Walnut.apk';

/** Shown in the Apps section. Bump on release; the links themselves never change. */
export const DESKTOP_VERSION = '2.0.10';
export const ANDROID_VERSION = '2.0.11';

/**
 * Hosted web origin used for auth redirects. The desktop app runs from file://,
 * where window.location.origin is not a usable redirect target.
 */
export const WEB_ORIGIN = 'https://walnut-budget.vercel.app';
