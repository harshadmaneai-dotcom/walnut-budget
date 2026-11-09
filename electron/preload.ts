import { contextBridge, ipcRenderer } from 'electron';

/** Mirrors UpdateState in electron/main.ts and src/components/UpdateBanner.tsx. */
type UpdateState =
  | { status: 'available'; version: string }
  | { status: 'none' }
  | { status: 'downloading'; percent: number }
  | { status: 'downloaded'; version: string }
  | { status: 'error'; message: string };

/**
 * The only bridge the web app gets: version info and the update flow.
 * Nothing here can read files or run commands.
 */
contextBridge.exposeInMainWorld('walnut', {
  version: () => ipcRenderer.invoke('walnut:version') as Promise<string>,
  checkForUpdates: () => ipcRenderer.invoke('walnut:check') as Promise<void>,
  downloadUpdate: () => ipcRenderer.invoke('walnut:download') as Promise<void>,
  installUpdate: () => ipcRenderer.invoke('walnut:install') as Promise<void>,
  onUpdate: (callback: (state: UpdateState) => void) => {
    const handler = (_event: unknown, state: UpdateState) => callback(state);
    ipcRenderer.on('walnut:update', handler);
    return () => {
      ipcRenderer.removeListener('walnut:update', handler);
    };
  },
});
