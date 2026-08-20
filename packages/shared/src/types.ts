/**
 * Core domain types shared between the server and the desktop client.
 */

export type PlayerId = string;
export type LobbyId = string;

/** Fixed number of team slots every player has. SoulLinks are derived purely
 * by matching slot index across players -- there is no separate link entity. */
export const SLOT_COUNT = 6;

/** A single team slot. `pokemonId: null` means the slot is empty. */
export interface PokemonSlot {
  pokemonId: number | null;
}

/** Info about a connected (or recently disconnected) player and their team. */
export interface PlayerInfo {
  id: PlayerId;
  name: string;
  isHost: boolean;
  connected: boolean;
  /** Always exactly SLOT_COUNT entries. */
  slots: PokemonSlot[];
}

export interface LobbyState {
  id: LobbyId;
  hostId: PlayerId;
  players: PlayerInfo[];
  createdAt: number;
}

export const MAX_NAME_LENGTH = 24;
export const DEFAULT_MAX_PLAYERS_PER_LOBBY = 4;
export const RECONNECT_GRACE_MS = 60_000;
export const EMPTY_LOBBY_TTL_MS = 5 * 60_000;

/** Builds a fresh set of SLOT_COUNT empty slots. */
export function emptySlots(): PokemonSlot[] {
  return Array.from({ length: SLOT_COUNT }, () => ({ pokemonId: null }));
}
