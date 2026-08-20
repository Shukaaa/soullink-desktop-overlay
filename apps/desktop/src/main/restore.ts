import type { LobbyState, PlayerSnapshot, RestoreLobbyStateMessage } from '@soullink/shared';
import type { SaveFile, SavedPlayer } from './saveState/schema';

/**
 * Builds the RESTORE_LOBBY_STATE message to send right after connecting, if
 * the given save has enough information to attempt a restore. Returns null
 * when there is nothing to restore (e.g. a brand new save that never joined
 * a lobby). The `snapshot` field is only attached when we know the full
 * roster, so the server can rebuild the lobby if it lost its state; if the
 * server still remembers the lobby/player/token, the snapshot is ignored and
 * this behaves like a plain reconnect.
 */
export function buildRestoreMessage(save: SaveFile): RestoreLobbyStateMessage | null {
  if (!save.lobbyId || !save.selfPlayerId || !save.selfToken) return null;

  const snapshot =
    save.hostId && save.players.length > 0
      ? { hostId: save.hostId, players: save.players.map(toPlayerSnapshot) }
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
 * Decides what (if anything) to send immediately after the WebSocket
 * connection opens. An explicit pending restore -- queued by the user
 * picking a save from the manual save dropdown -- always wins. Otherwise,
 * if there's a live in-memory session (a lobby joined earlier this run), a
 * plain reconnect is sent. A cold start with no in-memory session sends
 * nothing: lobbies are temporary, so a fresh app launch must never rejoin
 * one just because an autosave file happens to remember it.
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
}

/** Derives the save-file fields to persist from a fresh authoritative LobbyState. */
export function deriveSaveLobbyFields(state: LobbyState, selfPlayerId: string): SaveLobbyFields {
  return {
    lobbyId: state.id,
    hostId: state.hostId,
    selfPlayerId,
    players: state.players.map((p) => ({ id: p.id, name: p.name, isHost: p.isHost, slots: p.slots })),
  };
}
