/** Light/dark appearance. "system" follows the OS setting and is the default. */
export type ThemeChoice = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'walnut-theme';
const media = typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)') : null;

export function getThemeChoice(): ThemeChoice {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

/** Sets data-theme on <html> so the CSS variables switch. Call on load and on every change. */
export function applyTheme(choice: ThemeChoice = getThemeChoice()) {
  const dark = choice === 'dark' || (choice === 'system' && !!media?.matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
}

export function setThemeChoice(choice: ThemeChoice) {
  try {
    if (choice === 'system') localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, choice);
  } catch {
    // Storage can be blocked; the theme still applies for this session.
  }
  applyTheme(choice);
}

// When the choice is "system", follow OS changes while the app is open.
media?.addEventListener('change', () => {
  if (getThemeChoice() === 'system') applyTheme('system');
});
