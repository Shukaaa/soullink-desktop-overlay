/**
 * IPC channel names and payload shapes shared by the main process, preload
 * bridge, and renderer. Keeping this in one file avoids typos between the
 * three separate electron-vite build targets.
 */
import type { ClientMessage, OverlaySettings, ServerMessage } from '@soullink/shared';
import type { ConnectionHistoryEntry } from './connectionHistoryTypes';
import type { PublicSaveFile, SaveFile, SaveFileMeta } from './saveTypes';
import type { UpdaterEvent } from './updaterTypes';

export const IpcChannel = {
  Connect: 'connection:connect',
  Disconnect: 'connection:disconnect',
  SendMessage: 'ws:send',
  Event: 'ws:event',
  SaveListManual: 'save:list-manual',
  SaveLoadManual: 'save:load-manual',
  SaveCreateManual: 'save:create-manual',
  SaveUpdateManual: 'save:update-manual',
  SaveDeleteManual: 'save:delete-manual',
  SaveLoadAutosave: 'save:load-autosave',
  SaveRestore: 'save:restore',
  ConnectionHistoryList: 'connection:history-list',
  ConnectionHistoryDelete: 'connection:history-delete',
  OverlayResize: 'overlay:resize',
  OverlaySetIgnoreMouse: 'overlay:set-ignore-mouse',
  OverlayClickThroughEvent: 'overlay:click-through-event',
  SettingsGetOverlay: 'settings:get-overlay',
  SettingsUpdateOverlay: 'settings:update-overlay',
  ClipboardWrite: 'clipboard:write',
  UpdaterGetVersion: 'updater:get-version',
  UpdaterCheck: 'updater:check',
  UpdaterDownload: 'updater:download',
  UpdaterInstall: 'updater:install',
  UpdaterEvent: 'updater:event',
} as const;

export interface ConnectPayload {
  serverUrl: string;
  playerName: string;
}

/** Pushed from main -> every renderer window whenever the connection state changes. */
export type WsEvent =
  | { kind: 'connecting' }
  | { kind: 'open' }
  | { kind: 'reconnecting'; attempt: number; delayMs: number }
  | { kind: 'close' }
  | { kind: 'client-error'; message: string }
  | { kind: 'server-message'; message: ServerMessage }
  | { kind: 'overlay-settings'; settings: OverlaySettings };

export interface OverlayResizePayload {
  width: number;
  height: number;
}

export interface SaveUpdatePayload {
  id: string;
  name: string;
}

/** The renderer never needs (or should have) the reconnect token -- main
 * process keeps it and performs restores on the renderer's behalf. */
export type { PublicSaveFile };

export type { ClientMessage, ServerMessage, SaveFile, SaveFileMeta, OverlaySettings, ConnectionHistoryEntry };
export type { UpdaterEvent };
