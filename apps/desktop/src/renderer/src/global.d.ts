/// <reference types="vite/client" />
import type { ClientMessage, OverlaySettings } from '@soullink/shared';
import type { ConnectionHistoryEntry, ConnectPayload, OverlayResizePayload, PublicSaveFile, WsEvent } from '../../../common/ipc';
import type { SaveFileMeta } from '../../../common/saveTypes';

export interface SoulLinkApi {
  connect(payload: ConnectPayload): Promise<void>;
  disconnect(): Promise<void>;
  send(message: ClientMessage): Promise<{ ok: boolean; error?: string }>;
  listSaves(): Promise<SaveFileMeta[]>;
  loadSave(id: string): Promise<PublicSaveFile>;
  createSave(name: string): Promise<PublicSaveFile>;
  updateSave(id: string, name: string): Promise<PublicSaveFile>;
  deleteSave(id: string): Promise<void>;
  loadAutosave(): Promise<PublicSaveFile>;
  restoreSave(id: string): Promise<PublicSaveFile>;
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
}

declare global {
  interface Window {
    api: SoulLinkApi;
  }
}
