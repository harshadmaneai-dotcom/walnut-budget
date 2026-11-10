/**
 * The build this bundle was compiled from. Vite replaces __APP_VERSION__ with the
 * package.json version at build time (see vite.config.ts), so it can never drift from
 * the release that shipped it. The typeof guard keeps unit tests, which do not run the
 * production transform, working.
 */
export const APP_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0';

function segments(version: string): number[] {
  return version
    .trim()
    .split('.')
    .map((part) => {
      const value = Number.parseInt(part, 10);
      return Number.isFinite(value) ? value : 0;
    });
}

/**
 * Compares dotted versions numerically, so 2.0.11 is newer than 2.0.9.
 * Returns > 0 when `a` is newer, < 0 when `b` is newer, 0 when they match.
 */
export function compareVersions(a: string, b: string): number {
  const left = segments(a);
  const right = segments(b);
  const length = Math.max(left.length, right.length);
  for (let i = 0; i < length; i += 1) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}
