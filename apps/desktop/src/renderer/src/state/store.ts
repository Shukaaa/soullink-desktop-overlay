import { create } from 'zustand';
import type { LobbyState, OverlaySettings, ServerMessage } from '@soullink/shared';
import { DEFAULT_OVERLAY_SETTINGS } from '@soullink/shared';
import type { WsEvent } from '../../../common/ipc';

export type ConnectionStatus = 'idle' | 'connecting' | 'open' | 'reconnecting' | 'closed';

export interface AppState {
  connectionStatus: ConnectionStatus;
  error: string | null;
  lobby: LobbyState | null;
  selfPlayerId: string | null;
  reconnectInfo: { attempt: number; delayMs: number } | null;
  overlaySettings: OverlaySettings;
}

export interface AppActions {
  applyWsEvent: (event: WsEvent) => void;
  setConnecting: () => void;
  clearError: () => void;
  reset: () => void;
  setOverlaySettings: (settings: OverlaySettings) => void;
}

const initialState: AppState = {
  connectionStatus: 'idle',
  error: null,
  lobby: null,
  selfPlayerId: null,
  reconnectInfo: null,
  overlaySettings: DEFAULT_OVERLAY_SETTINGS,
};

export const useAppStore = create<AppState & AppActions>((set) => ({
  ...initialState,
  applyWsEvent: (event) => set((state) => reduceWsEvent(state, event)),
  setConnecting: () => set({ connectionStatus: 'connecting', error: null }),
  clearError: () => set({ error: null }),
  reset: () => set(initialState),
  setOverlaySettings: (settings) => set({ overlaySettings: settings }),
}));

/**
 * Pure reducer over incoming main-process events. Exported standalone so it
 * can be unit tested without mounting React or Electron.
 */
export function reduceWsEvent(state: AppState, event: WsEvent): Partial<AppState> {
  switch (event.kind) {
    case 'connecting':
      return { connectionStatus: 'connecting', error: null };
    case 'open':
      return { connectionStatus: 'open', reconnectInfo: null, error: null };
    case 'reconnecting':
      return {
        connectionStatus: 'reconnecting',
        reconnectInfo: { attempt: event.attempt, delayMs: event.delayMs },
      };
    case 'close':
      // Covers both an unexpected drop and a manual disconnect (which
      // cancels any pending retry) -- either way, stale reconnect info from
      // a previous attempt shouldn't linger around, and neither should a
      // stale hosted-lobbies list from before we lost the connection.
      return { connectionStatus: 'closed', reconnectInfo: null };
    case 'client-error':
      return { error: event.message };
    case 'server-message':
      return reduceServerMessage(state, event.message);
    case 'overlay-settings':
      return { overlaySettings: event.settings };
    default:
      return {};
  }
}

function reduceServerMessage(state: AppState, message: ServerMessage): Partial<AppState> {
  switch (message.type) {
    case 'STATE':
      return {
        lobby: message.state,
        error: null,
        ...(message.self ? { selfPlayerId: message.self.playerId } : {}),
      };
    case 'LEFT_LOBBY':
      // Voluntary leave: clear the lobby/identity but leave connectionStatus
      // untouched -- we're still connected to the server, just not in a
      // lobby. When `lobbyId` is present (a lobby-management action rather
      // than a plain LEAVE_LOBBY reply) only clear if it actually matches
      // the lobby currently shown, so deleting some *other* hosted lobby
      // doesn't wipe out an unrelated active session.
      if (message.lobbyId && state.lobby?.id !== message.lobbyId) {
        return {};
      }
      return { lobby: null, selfPlayerId: null, error: null };
    case 'ERROR':
      return { error: message.message };
    default:
      return {};
  }
}
