import type { PokemonSlot } from '@soullink/shared';

/**
 * Plain-data (no WebSocket, no timers) representation of a persisted player,
 * used to move state between `LobbyManager` and a `LobbyRepository`.
 */
export interface PersistedPlayer {
  id: string;
  name: string;
  token: string;
  isHost: boolean;
  /** Whether the player's socket was open the moment this record was saved. */
  connected: boolean;
  joinedAt: number;
  /** Epoch ms the player was last seen disconnecting, or null if connected/never. */
  disconnectedAt: number | null;
  /** True for a player recreated from someone else's RESTORE_LOBBY_STATE
   * snapshot that hasn't been claimed (reconnected to) by its real device yet. */
  restoredPlaceholder: boolean;
  /** Always exactly SLOT_COUNT entries. */
  slots: PokemonSlot[];
}

/** Plain-data representation of a persisted lobby (no WebSocket, no timers). */
export interface PersistedLobby {
  id: string;
  hostId: string;
  createdAt: number;
  players: PersistedPlayer[];
}

/**
 * Storage abstraction consumed by `LobbyManager`. Keeping this as an
 * interface (rather than hard-wiring SQLite) means unit tests can run with a
 * no-op implementation, and the on-disk format can change without touching
 * lobby business logic.
 *
 * All methods are synchronous: `better-sqlite3` is synchronous by design,
 * and `LobbyManager`'s own state transitions are synchronous, so persistence
 * can be interleaved transactionally with in-memory mutations without
 * introducing async races between concurrent socket events.
 */
export interface LobbyRepository {
  /** Upserts the full lobby aggregate (lobby row + all players + all slots). */
  saveLobby(lobby: PersistedLobby): void;
  /** Removes a lobby and everything under it. Safe to call if already gone. */
  deleteLobby(lobbyId: string): void;
  /** Loads every persisted lobby, e.g. on server startup. */
  loadAll(): PersistedLobby[];
  /** Releases any underlying resources (file handles, connections, ...). */
  close(): void;
}

/**
 * Default no-op repository. Used when no persistence is configured (e.g. in
 * unit tests that construct `new LobbyManager()` directly) so behavior is
 * unchanged from the pre-persistence implementation: everything lives only
 * in memory and nothing touches disk.
 */
export class NullLobbyRepository implements LobbyRepository {
  saveLobby(): void {
    // no-op
  }

  deleteLobby(): void {
    // no-op
  }

  loadAll(): PersistedLobby[] {
    return [];
  }

  close(): void {
    // no-op
  }
}
