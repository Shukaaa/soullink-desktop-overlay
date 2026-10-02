/**
 * IPC channel names and payload shapes shared by the main process, preload
 * bridge, and renderer. Keeping this in one file avoids typos between the
 * three separate electron-vite build targets.
 */
import type { ClientMessage, OverlaySettings, ServerMessage } from '@soullink/shared';
import type { ConnectionHistoryEntry } from './connectionHistoryTypes';
import type { UpdaterEvent } from './updaterTypes';

export const IpcChannel = {
  Connect: 'connection:connect',
  Disconnect: 'connection:disconnect',
  SendMessage: 'ws:send',
  Event: 'ws:event',
  ClientPreferencesLoad: 'client-preferences:load',
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
  playerName?: string;
  forceDiscordLogin?: boolean;
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

export interface ClientPreferences {
  playerName: string | null;
  serverUrl: string | null;
  overlaySettings: OverlaySettings;
}

export type { ClientMessage, ServerMessage, OverlaySettings, ConnectionHistoryEntry };
export type { UpdaterEvent };
