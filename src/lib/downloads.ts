/**
 * Where the desktop installers are published (GitHub Releases).
 * Change this one constant when the repository or release location changes.
 */
export const DESKTOP_DOWNLOAD_URL =
  'https://github.com/harshadmaneai-dotcom/walnut-budget/releases/download/v2.0.2/Walnut-Setup-2.0.2.exe';

/**
 * Hosted web origin used for auth redirects. The desktop app runs from file://,
 * where window.location.origin is not a usable redirect target.
 */
export const WEB_ORIGIN = 'https://walnut-budget.vercel.app';
