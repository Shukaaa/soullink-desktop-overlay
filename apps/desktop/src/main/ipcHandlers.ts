import { clipboard, ipcMain, type BrowserWindow } from 'electron';
import type { LobbyState, OverlaySettings, RestoreLobbyStateMessage } from '@soullink/shared';
import { safeParseClientMessage } from '@soullink/shared';
import {
  IpcChannel,
  type ConnectPayload,
  type OverlayResizePayload,
  type PublicSaveFile,
  type SaveUpdatePayload,
} from '../common/ipc';
import { resizeOverlayAnchored } from './windows';
import { buildRestoreMessage, deriveSaveLobbyFields } from './restore';
import type { WsClient } from './wsClient';
import type { SaveStateService } from './saveState/SaveStateService';
import type { SaveFile, SaveFileMeta } from './saveState/schema';
import type { ConnectionHistoryEntry } from './saveState/connectionHistory';
import type { UpdaterController } from './updater';

export interface SessionState {
  playerId: string | null;
  lobbyId: string | null;
  token: string | null;
  playerName: string | null;
  serverUrl: string | null;
}

export interface IpcContext {
  wsClient: WsClient;
  saveStateService: SaveStateService;
  session: SessionState;
  getOverlayWindow: () => BrowserWindow | null;
  getLastState: () => LobbyState | null;
  setOverlayClickThrough: (ignore: boolean) => void;
  /** Queues a restore message to be sent as soon as the next `open` event fires. */
  setPendingRestore: (message: RestoreLobbyStateMessage) => void;
  getOverlaySettings: () => OverlaySettings;
  /** Merges `partial` onto the current overlay settings, applies it (window
   * position/broadcast), persists it, and returns the resulting settings. */
  setOverlaySettings: (partial: Partial<OverlaySettings>) => OverlaySettings;
  getAppVersion: () => string;
  updater: UpdaterController;
}

const MIN_OVERLAY_SIZE = 40;
const MAX_OVERLAY_SIZE = 4000;

function toPublic(save: SaveFile): PublicSaveFile {
  const { selfToken: _selfToken, ...rest } = save;
  return rest;
}

/** Fields derived from the live session/lobby, shared by create and update. */
function currentSaveFields(ctx: IpcContext): Omit<SaveFile, 'version' | 'id' | 'name' | 'updatedAt'> {
  const state = ctx.getLastState();
  const fields = state && ctx.session.playerId ? deriveSaveLobbyFields(state, ctx.session.playerId) : null;
  return {
    playerName: ctx.session.playerName,
    serverUrl: ctx.session.serverUrl,
    lobbyId: fields?.lobbyId ?? ctx.session.lobbyId,
    hostId: fields?.hostId ?? null,
    selfPlayerId: fields?.selfPlayerId ?? ctx.session.playerId,
    selfToken: ctx.session.token,
    players: fields?.players ?? [],
    overlaySettings: ctx.getOverlaySettings(),
  };
}

export function registerIpcHandlers(ctx: IpcContext): void {
  ipcMain.handle(IpcChannel.Connect, (_event, payload: ConnectPayload) => {
    ctx.session.playerName = payload.playerName;
    ctx.session.serverUrl = payload.serverUrl;
    ctx.saveStateService.recordConnection({ serverUrl: payload.serverUrl, playerName: payload.playerName });
    ctx.wsClient.connect(payload.serverUrl);
  });

  ipcMain.handle(IpcChannel.Disconnect, () => {
    ctx.wsClient.disconnect();
    ctx.session.lobbyId = null;
    ctx.session.playerId = null;
    ctx.session.token = null;
  });

  ipcMain.handle(IpcChannel.SendMessage, (_event, message: unknown) => {
    const parsed = safeParseClientMessage(message);
    if (!parsed.success) {
      return { ok: false, error: 'Message failed local validation.' };
    }
    const sent = ctx.wsClient.send(parsed.data);
    return { ok: sent };
  });

  ipcMain.handle(IpcChannel.SaveListManual, (): SaveFileMeta[] => ctx.saveStateService.listSaves());

  ipcMain.handle(
    IpcChannel.SaveLoadManual,
    (_event, id: string): PublicSaveFile => toPublic(ctx.saveStateService.loadSave(id))
  );

  ipcMain.handle(IpcChannel.SaveCreateManual, (_event, name: string): PublicSaveFile => {
    const save = ctx.saveStateService.createSave(name, currentSaveFields(ctx));
    return toPublic(save);
  });

  ipcMain.handle(IpcChannel.SaveUpdateManual, (_event, { id, name }: SaveUpdatePayload): PublicSaveFile => {
    const save = ctx.saveStateService.updateSave(id, name, currentSaveFields(ctx));
    return toPublic(save);
  });

  ipcMain.handle(IpcChannel.SaveDeleteManual, (_event, id: string): void => ctx.saveStateService.deleteSave(id));

  ipcMain.handle(
    IpcChannel.ConnectionHistoryList,
    (): ConnectionHistoryEntry[] => ctx.saveStateService.listConnectionHistory()
  );
  ipcMain.handle(
    IpcChannel.ConnectionHistoryDelete,
    (_event, entry: Pick<ConnectionHistoryEntry, 'serverUrl' | 'playerName'>): ConnectionHistoryEntry[] =>
      ctx.saveStateService.removeConnectionHistoryEntry(entry)
  );

  ipcMain.handle(IpcChannel.ClipboardWrite, (_event, text: string): void => {
    if (typeof text !== 'string' || text.length === 0) {
      throw new Error('Clipboard text must not be empty.');
    }
    clipboard.writeText(text);
  });

  ipcMain.handle(
    IpcChannel.SaveLoadAutosave,
    (): PublicSaveFile => toPublic(ctx.saveStateService.loadAutosave().data)
  );

  ipcMain.handle(IpcChannel.SaveRestore, (_event, id: string): PublicSaveFile => {
    const save = id === 'autosave' ? ctx.saveStateService.loadAutosave().data : ctx.saveStateService.loadSave(id);
    if (!save.serverUrl) {
      throw new Error('This save has no server URL to reconnect to.');
    }
    const restoreMessage = buildRestoreMessage(save);
    if (!restoreMessage) {
      throw new Error('This save has no lobby to restore.');
    }
    ctx.session.playerName = save.playerName;
    ctx.session.serverUrl = save.serverUrl;
    ctx.setOverlaySettings(save.overlaySettings);
    ctx.setPendingRestore(restoreMessage);
    ctx.wsClient.connect(save.serverUrl);
    return toPublic(save);
  });

  ipcMain.handle(IpcChannel.OverlayResize, (_event, { width, height }: OverlayResizePayload) => {
    const win = ctx.getOverlayWindow();
    if (!win || win.isDestroyed()) return;
    const clampedWidth = Math.round(clamp(width, MIN_OVERLAY_SIZE, MAX_OVERLAY_SIZE));
    const clampedHeight = Math.round(clamp(height, MIN_OVERLAY_SIZE, MAX_OVERLAY_SIZE));
    resizeOverlayAnchored(win, clampedWidth, clampedHeight, ctx.getOverlaySettings().position);
  });

  ipcMain.handle(IpcChannel.OverlaySetIgnoreMouse, (_event, ignore: boolean) => {
    ctx.setOverlayClickThrough(ignore);
  });

  ipcMain.handle(IpcChannel.SettingsGetOverlay, (): OverlaySettings => ctx.getOverlaySettings());

  ipcMain.handle(IpcChannel.SettingsUpdateOverlay, (_event, partial: Partial<OverlaySettings>): OverlaySettings =>
    ctx.setOverlaySettings(partial)
  );

  ipcMain.handle(IpcChannel.UpdaterGetVersion, (): string => ctx.getAppVersion());
  ipcMain.handle(IpcChannel.UpdaterCheck, (): void => ctx.updater.checkForUpdates());
  ipcMain.handle(IpcChannel.UpdaterDownload, (): void => ctx.updater.downloadUpdate());
  ipcMain.handle(IpcChannel.UpdaterInstall, (): void => ctx.updater.quitAndInstall());
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
