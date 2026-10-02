import { z } from 'zod';
import { isGameVersionId } from './gameVersions';
import type { GameVersionId } from './gameVersions';
import { MAX_NAME_LENGTH, MAX_ORDEN_COUNT, SLOT_COUNT } from './types';

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
const counterValue = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);

export const AuthenticateMessage = z.object({
  type: z.literal('AUTHENTICATE'),
  token: z.string().min(32).max(256),
});
export type AuthenticateMessage = z.infer<typeof AuthenticateMessage>;

export const ListOwnedLobbiesMessage = z.object({
  type: z.literal('LIST_OWNED_LOBBIES'),
});
export type ListOwnedLobbiesMessage = z.infer<typeof ListOwnedLobbiesMessage>;

export const RejoinOwnedLobbyMessage = z.object({
  type: z.literal('REJOIN_OWNED_LOBBY'),
  lobbyId: idString.max(64),
});
export type RejoinOwnedLobbyMessage = z.infer<typeof RejoinOwnedLobbyMessage>;

export const DeleteOwnedLobbyMessage = z.object({
  type: z.literal('DELETE_OWNED_LOBBY'),
  lobbyId: idString.max(64),
});
export type DeleteOwnedLobbyMessage = z.infer<typeof DeleteOwnedLobbyMessage>;

export const pokemonSlotSchema = z.object({
  pokemonId: pokemonId.nullable(),
});
export type PokemonSlotInput = z.infer<typeof pokemonSlotSchema>;

/** A snapshot of one player used to restore a whole lobby (see RESTORE_LOBBY_STATE). */
export const playerSnapshotSchema = z.object({
  id: idString,
  name: trimmedName,
  isHost: z.boolean(),
  deathCount: counterValue.optional(),
  slots: z.array(pokemonSlotSchema).length(SLOT_COUNT),
});
export type PlayerSnapshot = z.infer<typeof playerSnapshotSchema>;

// ---------------------------------------------------------------------------
// Client -> Server
// ---------------------------------------------------------------------------

export const CreateLobbyMessage = z.object({
  type: z.literal('CREATE_LOBBY'),
  name: trimmedName.optional(),
});
export type CreateLobbyMessage = z.infer<typeof CreateLobbyMessage>;

export const JoinLobbyMessage = z.object({
  type: z.literal('JOIN_LOBBY'),
  lobbyId: idString.max(64),
  name: trimmedName.optional(),
});
export type JoinLobbyMessage = z.infer<typeof JoinLobbyMessage>;

export const SetPokemonMessage = z.object({
  type: z.literal('SET_POKEMON'),
  slotIndex,
  pokemonId,
  /**
   * When omitted, the actor edits their own slots (unchanged legacy
   * behavior). When present and different from the actor's own id, the
   * server requires the actor to be the lobby host (see LobbyManager).
   */
  targetPlayerId: idString.optional(),
});
export type SetPokemonMessage = z.infer<typeof SetPokemonMessage>;

export const RemovePokemonMessage = z.object({
  type: z.literal('REMOVE_POKEMON'),
  slotIndex,
  /** See SetPokemonMessage.targetPlayerId. */
  targetPlayerId: idString.optional(),
});
export type RemovePokemonMessage = z.infer<typeof RemovePokemonMessage>;

export const ToggleOrdenMessage = z.object({
  type: z.literal('TOGGLE_ORDEN'),
  index: z.number().int().min(0).max(MAX_ORDEN_COUNT - 1),
});
export type ToggleOrdenMessage = z.infer<typeof ToggleOrdenMessage>;

export const SetGameVersionMessage = z.object({
  type: z.literal('SET_GAME_VERSION'),
  gameVersionId: z.string().refine((value): value is GameVersionId => isGameVersionId(value)),
});
export type SetGameVersionMessage = z.infer<typeof SetGameVersionMessage>;

export const KickPlayerMessage = z.object({
  type: z.literal('KICK_PLAYER'),
  playerId: idString,
});
export type KickPlayerMessage = z.infer<typeof KickPlayerMessage>;

export const LeaveLobbyMessage = z.object({
  type: z.literal('LEAVE_LOBBY'),
});
export type LeaveLobbyMessage = z.infer<typeof LeaveLobbyMessage>;

export const IncrementDeathCounterMessage = z.object({
  type: z.literal('INCREMENT_DEATH_COUNTER'),
  targetPlayerId: idString.optional(),
});
export type IncrementDeathCounterMessage = z.infer<typeof IncrementDeathCounterMessage>;

export const DecrementDeathCounterMessage = z.object({
  type: z.literal('DECREMENT_DEATH_COUNTER'),
  targetPlayerId: idString.optional(),
});
export type DecrementDeathCounterMessage = z.infer<typeof DecrementDeathCounterMessage>;

export const IncrementResetCounterMessage = z.object({
  type: z.literal('INCREMENT_RESET_COUNTER'),
});
export type IncrementResetCounterMessage = z.infer<typeof IncrementResetCounterMessage>;

export const DecrementResetCounterMessage = z.object({
  type: z.literal('DECREMENT_RESET_COUNTER'),
});
export type DecrementResetCounterMessage = z.infer<typeof DecrementResetCounterMessage>;

/**
 * Legacy local-save message shape. Authenticated Discord sessions only
 * reconnect to rows already persisted by the server; their client snapshots
 * are not accepted as lobby state.
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
      gameVersionId: z
        .string()
        .refine((value): value is GameVersionId => isGameVersionId(value))
        .nullable()
        .optional(),
      ordenes: z.array(z.boolean()).max(MAX_ORDEN_COUNT).optional(),
      resetCount: counterValue.optional(),
    })
    .optional(),
});
export type RestoreLobbyStateMessage = z.infer<typeof RestoreLobbyStateMessage>;

export const ClientMessage = z.discriminatedUnion('type', [
  AuthenticateMessage,
  ListOwnedLobbiesMessage,
  RejoinOwnedLobbyMessage,
  DeleteOwnedLobbyMessage,
  CreateLobbyMessage,
  JoinLobbyMessage,
  SetPokemonMessage,
  RemovePokemonMessage,
  ToggleOrdenMessage,
  SetGameVersionMessage,
  KickPlayerMessage,
  LeaveLobbyMessage,
  IncrementDeathCounterMessage,
  DecrementDeathCounterMessage,
  IncrementResetCounterMessage,
  DecrementResetCounterMessage,
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
 *
 */
export interface LeftLobbyMessage {
  type: 'LEFT_LOBBY';
  lobbyId?: string;
}

export interface AuthenticatedMessage {
  type: 'AUTHENTICATED';
  user: { id: string; username: string };
}

export interface OwnedLobbySummary {
  id: string;
  createdAt: number;
  updatedAt: number;
  gameVersionId: import('./types').LobbyState['gameVersionId'];
  playerCount: number;
  connectedPlayerCount: number;
  players: Array<{ id: string; name: string; connected: boolean }>;
}

export interface OwnedLobbiesMessage {
  type: 'OWNED_LOBBIES';
  lobbies: OwnedLobbySummary[];
}

/**
 * Coarse, non-identifying summary of one lobby: enough for a host to
 * recognize/manage a lobby they created without exposing player names or
 * chosen species to whoever asked for the list.
 */
export type ServerMessage =
  | StateMessage
  | ErrorMessage
  | LeftLobbyMessage
  | AuthenticatedMessage
  | OwnedLobbiesMessage;
