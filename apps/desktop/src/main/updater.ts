import { app } from 'electron';
import { autoUpdater } from 'electron-updater';
import type { UpdaterEvent } from '../common/updaterTypes';

/** Main-process control surface for the updater, exposed to IPC handlers. */
export interface UpdaterController {
  checkForUpdates: () => void;
  downloadUpdate: () => void;
  quitAndInstall: () => void;
}

/**
 * Wires electron-updater's autoUpdater singleton to emit plain `UpdaterEvent`s
 * via `onEvent` (which the caller broadcasts to every renderer window), and
 * returns a small controller the IPC handlers call into. Auto-download and
 * auto-install-on-quit are both disabled -- the renderer explicitly drives
 * checking, downloading, and installing so progress/state stay visible to
 * the user at every step.
 */
export function initUpdater(onEvent: (event: UpdaterEvent) => void): UpdaterController {
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;

  autoUpdater.on('checking-for-update', () => onEvent({ kind: 'checking' }));
  autoUpdater.on('update-available', (info) => onEvent({ kind: 'available', version: info.version }));
  autoUpdater.on('update-not-available', (info) => onEvent({ kind: 'not-available', version: info.version }));
  autoUpdater.on('download-progress', (progress) =>
    onEvent({
      kind: 'download-progress',
      progress: {
        percent: progress.percent,
        bytesPerSecond: progress.bytesPerSecond,
        transferred: progress.transferred,
        total: progress.total,
      },
    })
  );
  autoUpdater.on('update-downloaded', (info) => onEvent({ kind: 'downloaded', version: info.version }));
  autoUpdater.on('error', (err) => onEvent({ kind: 'error', message: err.message }));

  return {
    checkForUpdates: () => {
      // Unpackaged (dev) runs have no app-update.yml and no published
      // artifacts to compare against -- fail fast with a clear message
      // instead of letting electron-updater throw a confusing ENOENT.
      if (!app.isPackaged) {
        onEvent({ kind: 'error', message: 'Updates sind nur in der installierten Version verfügbar.' });
        return;
      }
      autoUpdater.checkForUpdates().catch((err: Error) => onEvent({ kind: 'error', message: err.message }));
    },
    downloadUpdate: () => {
      if (!app.isPackaged) return;
      autoUpdater.downloadUpdate().catch((err: Error) => onEvent({ kind: 'error', message: err.message }));
    },
    quitAndInstall: () => {
      if (!app.isPackaged) return;
      autoUpdater.quitAndInstall();
    },
  };
}
