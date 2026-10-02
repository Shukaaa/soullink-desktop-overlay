import type { LobbyState, PlayerSnapshot, RestoreLobbyStateMessage } from '@soullink/shared';
import type { SaveFile, SavedPlayer } from './saveState/schema';

/**
 * Legacy snapshot builder retained for existing save-file compatibility.
 * Current authenticated clients rejoin by lobby code; the server never
 * accepts a client snapshot as authoritative lobby data.
 */
export function buildRestoreMessage(save: SaveFile): RestoreLobbyStateMessage | null {
  if (!save.lobbyId || !save.selfPlayerId || !save.selfToken) return null;

  const snapshot =
    save.hostId && save.players.length > 0
      ? {
          hostId: save.hostId,
          players: save.players.map(toPlayerSnapshot),
          gameVersionId: save.gameVersionId,
          ordenes: save.ordenes,
        }
      : undefined;

  return {
    type: 'RESTORE_LOBBY_STATE',
    lobbyId: save.lobbyId,
    playerId: save.selfPlayerId,
    token: save.selfToken,
    snapshot,
  };
}

function toPlayerSnapshot(p: SavedPlayer): PlayerSnapshot {
  return { id: p.id, name: p.name, isHost: p.isHost, slots: p.slots };
}

export interface SessionIdentity {
  lobbyId: string | null;
  playerId: string | null;
  token: string | null;
}

/**
 * Legacy reconnect-message selector retained for older local save files.
 * Current clients authenticate with Discord and rejoin saved server lobbies
 * using JOIN_LOBBY after the server confirms the account.
 */
export function decideOpenMessage(
  pendingRestore: RestoreLobbyStateMessage | null,
  session: SessionIdentity
): RestoreLobbyStateMessage | null {
  if (pendingRestore) return pendingRestore;
  if (session.lobbyId && session.playerId && session.token) {
    return {
      type: 'RESTORE_LOBBY_STATE',
      lobbyId: session.lobbyId,
      playerId: session.playerId,
      token: session.token,
    };
  }
  return null;
}

export interface SaveLobbyFields {
  lobbyId: string;
  hostId: string;
  selfPlayerId: string;
  players: SavedPlayer[];
  gameVersionId: LobbyState['gameVersionId'];
  ordenes: boolean[];
}

/** Derives the save-file fields to persist from a fresh authoritative LobbyState. */
export function deriveSaveLobbyFields(state: LobbyState, selfPlayerId: string): SaveLobbyFields {
  return {
    lobbyId: state.id,
    hostId: state.hostId,
    selfPlayerId,
    players: state.players.map((p) => ({ id: p.id, name: p.name, isHost: p.isHost, slots: p.slots })),
    gameVersionId: state.gameVersionId,
    ordenes: state.ordenes,
  };
}
