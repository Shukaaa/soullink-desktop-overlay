import { app, BrowserWindow, globalShortcut } from 'electron';
import { join } from 'node:path';
import type { LobbyState, OverlaySettings, RestoreLobbyStateMessage, ServerMessage } from '@soullink/shared';
import { DEFAULT_OVERLAY_SETTINGS, normalizeOverlaySettings } from '@soullink/shared';
import { createControlWindow, createOverlayWindow, repositionOverlay } from './windows';
import { WsClient } from './wsClient';
import { SaveStateService } from './saveState/SaveStateService';
import { registerIpcHandlers, type SessionState } from './ipcHandlers';
import { decideOpenMessage, deriveSaveLobbyFields } from './restore';
import { IpcChannel, type WsEvent } from '../common/ipc';

const CLICK_THROUGH_SHORTCUT = 'CommandOrControl+Shift+O';

const preloadPath = join(__dirname, '../preload/index.js');

let controlWindow: BrowserWindow | null = null;
let overlayWindow: BrowserWindow | null = null;
let lastLobbyState: LobbyState | null = null;
let overlayClickThrough = true;
let pendingRestore: RestoreLobbyStateMessage | null = null;
let overlaySettings: OverlaySettings = DEFAULT_OVERLAY_SETTINGS;

const wsClient = new WsClient();
const saveStateService = new SaveStateService(app.getPath('userData'));
const session: SessionState = {
  playerId: null,
  lobbyId: null,
  token: null,
  playerName: null,
  serverUrl: null,
};

function broadcast(event: WsEvent): void {
  for (const win of [controlWindow, overlayWindow]) {
    if (win && !win.isDestroyed()) {
      win.webContents.send(IpcChannel.Event, event);
    }
  }
}

function setOverlayClickThrough(ignore: boolean): void {
  overlayClickThrough = ignore;
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.setIgnoreMouseEvents(ignore, { forward: true });
  }
  for (const win of [controlWindow, overlayWindow]) {
    if (win && !win.isDestroyed()) {
      win.webContents.send(IpcChannel.OverlayClickThroughEvent, overlayClickThrough);
    }
  }
}

/**
 * Merges `partial` onto the in-memory overlay settings, applies any window
 * side effect (repositioning to the newly selected corner), persists the
 * result to the debounced autosave slot, and broadcasts it to every window
 * so the overlay renderer -- which never touches the filesystem itself --
 * picks up the change immediately.
 */
function setOverlaySettings(partial: Partial<OverlaySettings>): OverlaySettings {
  const previousPosition = overlaySettings.position;
  overlaySettings = normalizeOverlaySettings({ ...overlaySettings, ...partial });
  if (overlayWindow && !overlayWindow.isDestroyed() && overlaySettings.position !== previousPosition) {
    repositionOverlay(overlayWindow, overlaySettings.position);
  }
  saveStateService.scheduleAutosave({
    playerName: session.playerName,
    serverUrl: session.serverUrl,
    overlaySettings,
  });
  broadcast({ kind: 'overlay-settings', settings: overlaySettings });
  return overlaySettings;
}

function wireWsClient(): void {
  wsClient.on('open', () => {
    broadcast({ kind: 'open' });
    // Explicit pending restores (manual save "Load") always win; otherwise a
    // live in-memory session gets a plain reconnect. Cold starts intentionally
    // send nothing -- lobbies are temporary and are never auto-rejoined just
    // because an autosave file exists (see decideOpenMessage).
    const message = decideOpenMessage(pendingRestore, session);
    pendingRestore = null;
    if (message) {
      wsClient.send(message);
    }
  });

  wsClient.on('reconnecting', (attempt, delayMs) => {
    broadcast({ kind: 'reconnecting', attempt, delayMs });
  });

  wsClient.on('close', () => {
    broadcast({ kind: 'close' });
  });

  wsClient.on('error', (err) => {
    broadcast({ kind: 'client-error', message: err.message });
  });

  wsClient.on('message', (message: ServerMessage) => {
    if (message.type === 'STATE') {
      lastLobbyState = message.state;
      if (message.self) {
        session.playerId = message.self.playerId;
        session.lobbyId = message.state.id;
        session.token = message.self.token;
      }
      if (session.playerId) {
        const fields = deriveSaveLobbyFields(message.state, session.playerId);
        saveStateService.scheduleAutosave({
          playerName: session.playerName,
          serverUrl: session.serverUrl,
          selfToken: session.token,
          overlaySettings,
          ...fields,
        });
      }
    } else if (message.type === 'LEFT_LOBBY') {
      // We voluntarily left: drop the lobby identity but keep the
      // connection (and player name/server URL) so the renderer's status
      // tag and future CREATE_LOBBY/JOIN_LOBBY calls are unaffected.
      lastLobbyState = null;
      session.lobbyId = null;
      session.playerId = null;
      session.token = null;
      saveStateService.saveAutosaveNow({
        playerName: session.playerName,
        serverUrl: session.serverUrl,
        selfToken: null,
        lobbyId: null,
        hostId: null,
        selfPlayerId: null,
        players: [],
        overlaySettings,
      });
    }
    broadcast({ kind: 'server-message', message });
  });
}

function createWindows(): void {
  controlWindow = createControlWindow(preloadPath);
  overlayWindow = createOverlayWindow(preloadPath, overlaySettings.position);
  overlayWindow.setIgnoreMouseEvents(overlayClickThrough, { forward: true });
  controlWindow.on('closed', () => {
    controlWindow = null;
  });
  overlayWindow.on('closed', () => {
    overlayWindow = null;
  });
}

app.whenReady().then(() => {
  const autosave = saveStateService.loadAutosave();
  overlaySettings = autosave.data.overlaySettings;
  wireWsClient();
  registerIpcHandlers({
    wsClient,
    saveStateService,
    session,
    getOverlayWindow: () => overlayWindow,
    getLastState: () => lastLobbyState,
    setOverlayClickThrough,
    setPendingRestore: (message) => {
      pendingRestore = message;
    },
    getOverlaySettings: () => overlaySettings,
    setOverlaySettings,
  });
  createWindows();

  globalShortcut.register(CLICK_THROUGH_SHORTCUT, () => {
    setOverlayClickThrough(!overlayClickThrough);
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindows();
  });
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  saveStateService.dispose();
  wsClient.dispose();
  if (process.platform !== 'darwin') app.quit();
});

