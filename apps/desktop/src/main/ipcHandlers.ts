import { clipboard, ipcMain, shell, type BrowserWindow } from 'electron';
import type { OverlaySettings } from '@soullink/shared';
import { safeParseClientMessage } from '@soullink/shared';
import {
  IpcChannel,
  type ConnectPayload,
  type ClientPreferences,
  type OverlayResizePayload,
} from '../common/ipc';
import { resizeOverlayAnchored } from './windows';
import type { WsClient } from './wsClient';
import type { ClientStateService } from './clientState/ClientStateService';
import type { ConnectionHistoryEntry } from './clientState/connectionHistory';
import type { UpdaterController } from './updater';
import { DiscordSessionStore } from './discordSessionStore';
import { loginWithDiscord } from './discordLogin';
import { normalizeServerUrlForConnection } from '../common/serverUrl';

export interface SessionState {
  playerId: string | null;
  lobbyId: string | null;
  token: string | null;
  playerName: string | null;
  serverUrl: string | null;
  discordToken: string | null;
  discordUserId: string | null;
}

export interface IpcContext {
  wsClient: WsClient;
  clientStateService: ClientStateService;
  session: SessionState;
  getOverlayWindow: () => BrowserWindow | null;
  setOverlayClickThrough: (ignore: boolean) => void;
  discordSessionStore: DiscordSessionStore;
  getOverlaySettings: () => OverlaySettings;
  /** Merges `partial` onto the current overlay settings, applies it (window
   * position/broadcast), persists it, and returns the resulting settings. */
  setOverlaySettings: (partial: Partial<OverlaySettings>) => OverlaySettings;
  getAppVersion: () => string;
  updater: UpdaterController;
}

const MIN_OVERLAY_SIZE = 40;
const MAX_OVERLAY_SIZE = 4000;

export function registerIpcHandlers(ctx: IpcContext): void {
  let loginAbortController: AbortController | null = null;
  async function connect(payload: ConnectPayload): Promise<void> {
    loginAbortController?.abort();
    loginAbortController = new AbortController();
    const controller = loginAbortController;
    try {
      const serverUrl = normalizeServerUrlForConnection(payload.serverUrl);
      const existing = payload.forceDiscordLogin ? null : ctx.discordSessionStore.get(serverUrl);
      const login = existing
        ? { token: existing.token, username: existing.username }
        : await beginDiscordLogin(serverUrl, controller.signal);
      if (!existing) ctx.discordSessionStore.set(serverUrl, login);
      if (ctx.session.serverUrl && ctx.session.serverUrl !== serverUrl) {
        ctx.session.lobbyId = null;
        ctx.session.playerId = null;
        ctx.session.token = null;
        ctx.session.discordUserId = null;
      }
      if (payload.forceDiscordLogin) {
        ctx.session.lobbyId = null;
        ctx.session.playerId = null;
        ctx.session.token = null;
        ctx.session.discordUserId = null;
      }
      ctx.session.playerName = login.username;
      ctx.session.serverUrl = serverUrl;
      ctx.session.discordToken = login.token;
      ctx.clientStateService.saveClientPreferences({
        playerName: login.username,
        serverUrl,
        overlaySettings: ctx.getOverlaySettings(),
      });
      ctx.clientStateService.recordConnection({ serverUrl, playerName: login.username });
      ctx.wsClient.connect(serverUrl);
    } finally {
      if (loginAbortController === controller) loginAbortController = null;
    }
  }
  ipcMain.handle(IpcChannel.Connect, (_event, payload: ConnectPayload) => connect(payload));

  ipcMain.handle(IpcChannel.Disconnect, () => {
    loginAbortController?.abort();
    loginAbortController = null;
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

  ipcMain.handle(
    IpcChannel.ClientPreferencesLoad,
    (): ClientPreferences => ctx.clientStateService.loadClientPreferences()
  );
  ipcMain.handle(
    IpcChannel.ConnectionHistoryList,
    (): ConnectionHistoryEntry[] => ctx.clientStateService.listConnectionHistory()
  );
  ipcMain.handle(
    IpcChannel.ConnectionHistoryDelete,
    (_event, entry: Pick<ConnectionHistoryEntry, 'serverUrl' | 'playerName'>): ConnectionHistoryEntry[] =>
      ctx.clientStateService.removeConnectionHistoryEntry(entry)
  );

  ipcMain.handle(IpcChannel.ClipboardWrite, (_event, text: string): void => {
    if (typeof text !== 'string' || text.length === 0) {
      throw new Error('Clipboard text must not be empty.');
    }
    clipboard.writeText(text);
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

async function beginDiscordLogin(
  serverUrl: string,
  signal: AbortSignal
): Promise<{ token: string; username: string }> {
  const result = await loginWithDiscord(serverUrl, (url) => shell.openExternal(url), signal);
  return { token: result.token, username: result.username };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
