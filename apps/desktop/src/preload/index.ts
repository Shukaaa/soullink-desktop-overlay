import { contextBridge, ipcRenderer } from 'electron';
import type { ClientMessage, OverlaySettings } from '@soullink/shared';
import {
  IpcChannel,
  type ConnectionHistoryEntry,
  type ConnectPayload,
  type OverlayResizePayload,
  type PublicSaveFile,
  type WsEvent,
} from '../common/ipc';
import type { SaveFileMeta } from '../common/saveTypes';

/**
 * The only surface renderer code can use to reach the outside world.
 * contextIsolation + sandbox are both enabled, so this is the sole bridge;
 * nothing else from Node or Electron leaks into the renderer's global scope.
 */
const api = {
  connect: (payload: ConnectPayload): Promise<void> => ipcRenderer.invoke(IpcChannel.Connect, payload),
  disconnect: (): Promise<void> => ipcRenderer.invoke(IpcChannel.Disconnect),
  send: (message: ClientMessage): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke(IpcChannel.SendMessage, message),
  listSaves: (): Promise<SaveFileMeta[]> => ipcRenderer.invoke(IpcChannel.SaveListManual),
  loadSave: (id: string): Promise<PublicSaveFile> => ipcRenderer.invoke(IpcChannel.SaveLoadManual, id),
  createSave: (name: string): Promise<PublicSaveFile> => ipcRenderer.invoke(IpcChannel.SaveCreateManual, name),
  updateSave: (id: string, name: string): Promise<PublicSaveFile> =>
    ipcRenderer.invoke(IpcChannel.SaveUpdateManual, { id, name }),
  deleteSave: (id: string): Promise<void> => ipcRenderer.invoke(IpcChannel.SaveDeleteManual, id),
  loadAutosave: (): Promise<PublicSaveFile> => ipcRenderer.invoke(IpcChannel.SaveLoadAutosave),
  restoreSave: (id: string): Promise<PublicSaveFile> => ipcRenderer.invoke(IpcChannel.SaveRestore, id),
  listConnectionHistory: (): Promise<ConnectionHistoryEntry[]> =>
    ipcRenderer.invoke(IpcChannel.ConnectionHistoryList),
  deleteConnectionHistoryEntry: (
    entry: Pick<ConnectionHistoryEntry, 'serverUrl' | 'playerName'>
  ): Promise<ConnectionHistoryEntry[]> => ipcRenderer.invoke(IpcChannel.ConnectionHistoryDelete, entry),
  copyToClipboard: (text: string): Promise<void> => ipcRenderer.invoke(IpcChannel.ClipboardWrite, text),
  resizeOverlay: (payload: OverlayResizePayload): Promise<void> =>
    ipcRenderer.invoke(IpcChannel.OverlayResize, payload),
  setOverlayIgnoreMouse: (ignore: boolean): Promise<void> =>
    ipcRenderer.invoke(IpcChannel.OverlaySetIgnoreMouse, ignore),
  getOverlaySettings: (): Promise<OverlaySettings> => ipcRenderer.invoke(IpcChannel.SettingsGetOverlay),
  updateOverlaySettings: (partial: Partial<OverlaySettings>): Promise<OverlaySettings> =>
    ipcRenderer.invoke(IpcChannel.SettingsUpdateOverlay, partial),
  onEvent: (callback: (event: WsEvent) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: WsEvent) => callback(payload);
    ipcRenderer.on(IpcChannel.Event, listener);
    return () => ipcRenderer.removeListener(IpcChannel.Event, listener);
  },
  onOverlayClickThroughChange: (callback: (ignore: boolean) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, ignore: boolean) => callback(ignore);
    ipcRenderer.on(IpcChannel.OverlayClickThroughEvent, listener);
    return () => ipcRenderer.removeListener(IpcChannel.OverlayClickThroughEvent, listener);
  },
};

contextBridge.exposeInMainWorld('api', api);

export type SoulLinkApi = typeof api;
