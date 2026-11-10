import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The installed app reports this version in Settings, so it has to be the same number
// the release bumps rather than a second constant that can fall behind.
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  version: string;
};

export default defineConfig({
  plugins: [react()],
  // Relative asset paths so the desktop app can load dist/index.html from disk.
  base: './',
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
});
