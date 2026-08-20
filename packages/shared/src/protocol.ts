import { z } from 'zod';
import { MAX_NAME_LENGTH, SLOT_COUNT } from './types';

/**
 * Sanity upper bound on how many players a RESTORE_LOBBY_STATE snapshot may
 * contain. This is intentionally decoupled from the server's configurable
 * `maxPlayersPerLobby` (see LobbyManagerOptions) -- it only exists to reject
 * absurdly oversized payloads at parse time. The actual, configurable player
 * cap is enforced by LobbyManager once the message is parsed.
 */
const MAX_SNAPSHOT_PLAYERS = 64;

/**
 * Wire protocol between the desktop client and the authoritative WebSocket
 * server. All messages are JSON objects with a `type` discriminant. Schemas
 * are validated with zod on both ends so malformed input is rejected early.
 *
 * SoulLinks are never sent as their own entity: a player's team is exactly
 * SLOT_COUNT `PokemonSlot`s, and a "link" is simply the same slot index
 * across every player in the lobby -- derived purely by position.
 */

const trimmedName = z.string().trim().min(1).max(MAX_NAME_LENGTH);
const idString = z.string().trim().min(1).max(64);
const slotIndex = z.number().int().min(0).max(SLOT_COUNT - 1);
const pokemonId = z.number().int().positive();

export const pokemonSlotSchema = z.object({
  pokemonId: pokemonId.nullable(),
});
export type PokemonSlotInput = z.infer<typeof pokemonSlotSchema>;

/** A snapshot of one player used to restore a whole lobby (see RESTORE_LOBBY_STATE). */
export const playerSnapshotSchema = z.object({
  id: idString,
  name: trimmedName,
  isHost: z.boolean(),
  slots: z.array(pokemonSlotSchema).length(SLOT_COUNT),
});
export type PlayerSnapshot = z.infer<typeof playerSnapshotSchema>;

// ---------------------------------------------------------------------------
// Client -> Server
// ---------------------------------------------------------------------------

export const CreateLobbyMessage = z.object({
  type: z.literal('CREATE_LOBBY'),
  name: trimmedName,
});
export type CreateLobbyMessage = z.infer<typeof CreateLobbyMessage>;

export const JoinLobbyMessage = z.object({
  type: z.literal('JOIN_LOBBY'),
  lobbyId: idString.max(64),
  name: trimmedName,
});
export type JoinLobbyMessage = z.infer<typeof JoinLobbyMessage>;

export const SetPokemonMessage = z.object({
  type: z.literal('SET_POKEMON'),
  slotIndex,
  pokemonId,
});
export type SetPokemonMessage = z.infer<typeof SetPokemonMessage>;

export const RemovePokemonMessage = z.object({
  type: z.literal('REMOVE_POKEMON'),
  slotIndex,
});
export type RemovePokemonMessage = z.infer<typeof RemovePokemonMessage>;

export const KickPlayerMessage = z.object({
  type: z.literal('KICK_PLAYER'),
  playerId: idString,
});
export type KickPlayerMessage = z.infer<typeof KickPlayerMessage>;

export const LeaveLobbyMessage = z.object({
  type: z.literal('LEAVE_LOBBY'),
});
export type LeaveLobbyMessage = z.infer<typeof LeaveLobbyMessage>;

/**
 * Restores a session. If `lobbyId`/`playerId`/`token` still match a live
 * lobby on the server this behaves like a plain reconnect. Otherwise (e.g.
 * the server restarted and lost its in-memory state) the optional
 * `snapshot` is used to recreate the lobby from the client's last known
 * state, subject to server-side player-count/slot validation.
 */
export const RestoreLobbyStateMessage = z.object({
  type: z.literal('RESTORE_LOBBY_STATE'),
  lobbyId: idString,
  playerId: idString,
  token: idString.max(128),
  snapshot: z
    .object({
      hostId: idString,
      players: z.array(playerSnapshotSchema).min(1).max(MAX_SNAPSHOT_PLAYERS),
    })
    .optional(),
});
export type RestoreLobbyStateMessage = z.infer<typeof RestoreLobbyStateMessage>;

export const ClientMessage = z.discriminatedUnion('type', [
  CreateLobbyMessage,
  JoinLobbyMessage,
  SetPokemonMessage,
  RemovePokemonMessage,
  KickPlayerMessage,
  LeaveLobbyMessage,
  RestoreLobbyStateMessage,
]);
export type ClientMessage = z.infer<typeof ClientMessage>;

export function parseClientMessage(raw: unknown): ClientMessage {
  return ClientMessage.parse(raw);
}

export function safeParseClientMessage(raw: unknown) {
  return ClientMessage.safeParse(raw);
}

// ---------------------------------------------------------------------------
// Server -> Client
// ---------------------------------------------------------------------------

export interface StateMessage {
  type: 'STATE';
  state: import('./types').LobbyState;
  /** Present only on the response to CREATE_LOBBY/JOIN_LOBBY/RESTORE_LOBBY_STATE. */
  self?: { playerId: string; token: string };
}

export interface ErrorMessage {
  type: 'ERROR';
  code: string;
  message: string;
}

/**
 * Sent only to the socket that just issued LEAVE_LOBBY, since the regular
 * STATE broadcast never reaches a player after they've been removed from a
 * lobby's player list. This lets the client explicitly clear its local lobby
 * state instead of silently holding on to a stale snapshot.
 */
export interface LeftLobbyMessage {
  type: 'LEFT_LOBBY';
}

export type ServerMessage = StateMessage | ErrorMessage | LeftLobbyMessage;
