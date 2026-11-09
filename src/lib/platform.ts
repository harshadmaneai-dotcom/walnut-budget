/**
 * True inside the Capacitor Android shell, which serves the built app from
 * https://localhost. The website runs on a real domain, and the Vite dev server
 * uses http, so neither is mistaken for the native app.
 */
export function isNativeShell(): boolean {
  return window.location.protocol === 'https:' && window.location.hostname === 'localhost';
}
