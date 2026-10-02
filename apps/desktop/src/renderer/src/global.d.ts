/// <reference types="vite/client" />
import type { ClientMessage, OverlaySettings } from '@soullink/shared';
import type {
  ClientPreferences,
  ConnectionHistoryEntry,
  ConnectPayload,
  OverlayResizePayload,
  WsEvent,
} from '../../../common/ipc';
import type { UpdaterEvent } from '../../../common/updaterTypes';

export interface SoulLinkApi {
  connect(payload: ConnectPayload): Promise<void>;
  disconnect(): Promise<void>;
  send(message: ClientMessage): Promise<{ ok: boolean; error?: string }>;
  loadClientPreferences(): Promise<ClientPreferences>;
  listConnectionHistory(): Promise<ConnectionHistoryEntry[]>;
  deleteConnectionHistoryEntry(
    entry: Pick<ConnectionHistoryEntry, 'serverUrl' | 'playerName'>
  ): Promise<ConnectionHistoryEntry[]>;
  copyToClipboard(text: string): Promise<void>;
  resizeOverlay(payload: OverlayResizePayload): Promise<void>;
  setOverlayIgnoreMouse(ignore: boolean): Promise<void>;
  getOverlaySettings(): Promise<OverlaySettings>;
  updateOverlaySettings(partial: Partial<OverlaySettings>): Promise<OverlaySettings>;
  onEvent(callback: (event: WsEvent) => void): () => void;
  onOverlayClickThroughChange(callback: (ignore: boolean) => void): () => void;
  getAppVersion(): Promise<string>;
  checkForUpdates(): Promise<void>;
  downloadUpdate(): Promise<void>;
  installUpdate(): Promise<void>;
  onUpdaterEvent(callback: (event: UpdaterEvent) => void): () => void;
}

declare global {
  interface Window {
    api: SoulLinkApi;
  }
}
