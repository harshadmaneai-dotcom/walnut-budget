import { app, BrowserWindow, ipcMain, shell } from 'electron';
import path from 'node:path';
import { autoUpdater } from 'electron-updater';

// The renderer is the built web app in dist/, served from the app bundle.
// Sign-up email links must come back to the hosted web origin (see src/lib/downloads.ts),
// so the desktop window never handles those redirects itself.
const isDev = !app.isPackaged;

/** Update status pushed to the renderer; src/components/UpdateBanner.tsx renders it. */
type UpdateState =
  | { status: 'available'; version: string }
  | { status: 'none' }
  | { status: 'downloading'; percent: number }
  | { status: 'downloaded'; version: string }
  | { status: 'error'; message: string };

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 360,
    minHeight: 560,
    backgroundColor: '#f2f3ec',
    title: 'Walnut',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // Open on an app route, not the marketing landing page: signed-out users are sent
  // to sign-in by Gate, signed-in users go straight to the dashboard.
  win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'), { hash: 'dashboard' });

  // External links (for example the hosted site) open in the user's browser, not inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('file:')) {
      event.preventDefault();
      if (/^https?:\/\//.test(url)) void shell.openExternal(url);
    }
  });

  if (isDev) win.webContents.openDevTools({ mode: 'detach' });
}

function broadcast(state: UpdateState) {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('walnut:update', state);
  }
}

/**
 * Checks GitHub Releases for a newer build. Nothing is installed until the user
 * clicks the banner: the download and the restart are both explicit actions.
 */
function setupUpdates() {
  ipcMain.handle('walnut:version', () => app.getVersion());

  ipcMain.handle('walnut:check', async () => {
    if (isDev) return;
    try {
      await autoUpdater.checkForUpdates();
    } catch (error) {
      broadcast({ status: 'error', message: error instanceof Error ? error.message : String(error) });
    }
  });

  ipcMain.handle('walnut:download', async () => {
    if (isDev) return;
    try {
      await autoUpdater.downloadUpdate();
    } catch (error) {
      broadcast({ status: 'error', message: error instanceof Error ? error.message : String(error) });
    }
  });

  ipcMain.handle('walnut:install', () => {
    setImmediate(() => autoUpdater.quitAndInstall());
  });

  if (isDev) return;

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-available', (info) => broadcast({ status: 'available', version: info.version }));
  autoUpdater.on('update-not-available', () => broadcast({ status: 'none' }));
  autoUpdater.on('download-progress', (progress) =>
    broadcast({ status: 'downloading', percent: Math.round(progress.percent) }),
  );
  autoUpdater.on('update-downloaded', (info) => broadcast({ status: 'downloaded', version: info.version }));
  autoUpdater.on('error', (error) =>
    broadcast({ status: 'error', message: error?.message ?? 'Update check failed' }),
  );

  // Late enough that the first paint never waits on the network.
  setTimeout(() => {
    void autoUpdater.checkForUpdates().catch(() => {});
  }, 4000);

  // A window can stay open for days, so ask again periodically instead of only at launch.
  setInterval(() => {
    void autoUpdater.checkForUpdates().catch(() => {});
  }, 6 * 60 * 60 * 1000);
}

app.whenReady().then(() => {
  setupUpdates();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
