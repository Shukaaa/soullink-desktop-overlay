import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UpdaterEvent } from '../common/updaterTypes';

const isPackaged = { value: true };

vi.mock('electron', () => ({
  app: {
    get isPackaged() {
      return isPackaged.value;
    },
  },
}));

class FakeAutoUpdater extends EventEmitter {
  autoDownload = true;
  autoInstallOnAppQuit = true;
  checkForUpdates = vi.fn().mockResolvedValue(undefined);
  downloadUpdate = vi.fn().mockResolvedValue(undefined);
  quitAndInstall = vi.fn();
}

const fakeAutoUpdater = new FakeAutoUpdater();

vi.mock('electron-updater', () => ({
  get autoUpdater() {
    return fakeAutoUpdater;
  },
}));

describe('initUpdater', () => {
  beforeEach(() => {
    isPackaged.value = true;
    fakeAutoUpdater.removeAllListeners();
    fakeAutoUpdater.checkForUpdates.mockClear();
    fakeAutoUpdater.downloadUpdate.mockClear();
    fakeAutoUpdater.quitAndInstall.mockClear();
  });

  it('disables auto-download and auto-install so the renderer stays in control', async () => {
    const { initUpdater } = await import('./updater');
    initUpdater(() => {});
    expect(fakeAutoUpdater.autoDownload).toBe(false);
    expect(fakeAutoUpdater.autoInstallOnAppQuit).toBe(false);
  });

  it('maps every autoUpdater event to the matching UpdaterEvent', async () => {
    const { initUpdater } = await import('./updater');
    const events: UpdaterEvent[] = [];
    initUpdater((event) => events.push(event));

    fakeAutoUpdater.emit('checking-for-update');
    fakeAutoUpdater.emit('update-available', { version: '1.2.3' });
    fakeAutoUpdater.emit('update-not-available', { version: '1.0.0' });
    fakeAutoUpdater.emit('download-progress', { percent: 42, bytesPerSecond: 1000, transferred: 42, total: 100 });
    fakeAutoUpdater.emit('update-downloaded', { version: '1.2.3' });
    fakeAutoUpdater.emit('error', new Error('boom'));

    expect(events).toEqual([
      { kind: 'checking' },
      { kind: 'available', version: '1.2.3' },
      { kind: 'not-available', version: '1.0.0' },
      { kind: 'download-progress', progress: { percent: 42, bytesPerSecond: 1000, transferred: 42, total: 100 } },
      { kind: 'downloaded', version: '1.2.3' },
      { kind: 'error', message: 'boom' },
    ]);
  });

  it('reports an error instead of checking when the app is not packaged (dev mode)', async () => {
    isPackaged.value = false;
    const { initUpdater } = await import('./updater');
    const events: UpdaterEvent[] = [];
    const controller = initUpdater((event) => events.push(event));

    controller.checkForUpdates();

    expect(fakeAutoUpdater.checkForUpdates).not.toHaveBeenCalled();
    expect(events).toEqual([
      { kind: 'error', message: 'Updates sind nur in der installierten Version verfügbar.' },
    ]);
  });

  it('delegates checkForUpdates/downloadUpdate/quitAndInstall to autoUpdater when packaged', async () => {
    const { initUpdater } = await import('./updater');
    const controller = initUpdater(() => {});

    controller.checkForUpdates();
    controller.downloadUpdate();
    controller.quitAndInstall();

    expect(fakeAutoUpdater.checkForUpdates).toHaveBeenCalledTimes(1);
    expect(fakeAutoUpdater.downloadUpdate).toHaveBeenCalledTimes(1);
    expect(fakeAutoUpdater.quitAndInstall).toHaveBeenCalledTimes(1);
  });
});
