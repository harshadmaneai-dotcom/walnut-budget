/// <reference types="vite/client" />

/** Replaced with the package.json version by vite.config.ts. */
declare const __APP_VERSION__: string;

/** Update status the desktop shell pushes to the renderer (see electron/main.ts). */
type WalnutUpdateState =
  | { status: 'available'; version: string }
  | { status: 'none' }
  | { status: 'downloading'; percent: number }
  | { status: 'downloaded'; version: string }
  | { status: 'error'; message: string };

/** Present only in the Electron build (see electron/preload.ts). */
interface WalnutBridge {
  version(): Promise<string>;
  checkForUpdates(): Promise<void>;
  downloadUpdate(): Promise<void>;
  installUpdate(): Promise<void>;
  onUpdate(callback: (state: WalnutUpdateState) => void): () => void;
}

interface Window {
  walnut?: WalnutBridge;
}
