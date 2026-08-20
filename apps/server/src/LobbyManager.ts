import { randomBytes, randomUUID } from 'node:crypto';
import type { WebSocket } from 'ws';
import {
  DEFAULT_MAX_PLAYERS_PER_LOBBY,
  EMPTY_LOBBY_TTL_MS,
  ErrorCode,
  LobbyState,
  MAX_NAME_LENGTH,
  PlayerInfo,
  PokemonSlot,
  ProtocolError,
  RECONNECT_GRACE_MS,
  RestoreLobbyStateMessage,
  SLOT_COUNT,
  emptySlots,
  isValidSpeciesId,
} from '@soullink/shared';
import { NullLobbyRepository } from './db/lobbyRepository';
import type { LobbyRepository, PersistedLobby, PersistedPlayer } from './db/lobbyRepository';

const LOBBY_ID_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I

interface PlayerRecord {
  id: string;
  name: string;
  token: string;
  isHost: boolean;
  connected: boolean;
  ws: WebSocket | null;
  disconnectTimer: NodeJS.Timeout | null;
  joinedAt: number;
  /** Epoch ms this player was last seen disconnecting, or null while connected. */
  disconnectedAt: number | null;
  slots: PokemonSlot[];
  /** True for a player entry recreated from a RESTORE_LOBBY_STATE snapshot
   * that hasn't been claimed (reconnected to) by its actual device yet. */
  restoredPlaceholder: boolean;
}

interface LobbyRecord {
  id: string;
  hostId: string;
  createdAt: number;
  players: Map<string, PlayerRecord>;
  emptyTimer: NodeJS.Timeout | null;
}

interface ConnectionMeta {
  lobbyId: string;
  playerId: string;
}

export interface JoinResult {
  lobbyId: string;
  playerId: string;
  token: string;
  state: LobbyState;
}

export interface LobbyManagerOptions {
  maxPlayersPerLobby?: number;
  /**
   * Persistence backend. Defaults to a no-op `NullLobbyRepository` so
   * existing in-memory-only usage (e.g. unit tests constructing
   * `new LobbyManager()`) is unaffected -- nothing is written to disk unless
   * a real repository (e.g. `SqliteLobbyRepository`) is supplied.
   */
  repository?: LobbyRepository;
}

/**
 * Authoritative in-memory lobby state machine. Every mutation goes through
 * this class so business rules (host permissions, reconnect grace periods,
 * validation) are enforced in exactly one place.
 *
 * There is no SoulLink/Encounter entity: every player has exactly SLOT_COUNT
 * `PokemonSlot`s, and a "SoulLink" is derived purely by matching slot index
 * across players -- the server never computes or transmits that grouping.
 *
 * Persistence: every mutation (create/join/mutation/leave/host change/
 * disconnect/reconnect) is mirrored to `repository` transactionally, right
 * after the in-memory state is updated. `WebSocket` objects, timers, and
 * other non-serializable state are never persisted -- only plain data
 * (`PersistedLobby`/`PersistedPlayer`) crosses that boundary.
 */
export class LobbyManager {
  private readonly lobbies = new Map<string, LobbyRecord>();
  private readonly connections = new WeakMap<WebSocket, ConnectionMeta>();
  private readonly maxPlayersPerLobby: number;
  private readonly repository: LobbyRepository;

  constructor(options: LobbyManagerOptions = {}) {
    this.maxPlayersPerLobby = options.maxPlayersPerLobby ?? DEFAULT_MAX_PLAYERS_PER_LOBBY;
    this.repository = options.repository ?? new NullLobbyRepository();
  }

  /** Number of currently tracked lobbies. Exposed for diagnostics/tests. */
  get lobbyCount(): number {
    return this.lobbies.size;
  }

  /**
   * Loads every persisted lobby from `repository` into memory. Intended to
   * be called once at process startup (after construction, before accepting
   * connections) so a server restart doesn't lose active lobbies.
   *
   * Since a restart always drops any live WebSocket, every persisted player
   * is treated as freshly disconnected: their remaining reconnect-grace
   * window is recomputed from `disconnectedAt` (or, if they looked
   * "connected" at save time, from now -- the process that held their
   * socket is gone). Players whose grace period has already elapsed are
   * dropped; lobbies left with zero players are deleted outright.
   */
  loadFromRepository(): void {
    const now = Date.now();
    for (const persisted of this.repository.loadAll()) {
      this.hydrateLobby(persisted, now);
    }
  }

  /** Test/shutdown helper: clears all pending timers so the process can exit cleanly. */
  shutdown(): void {
    for (const lobby of this.lobbies.values()) {
      if (lobby.emptyTimer) clearTimeout(lobby.emptyTimer);
      for (const player of lobby.players.values()) {
        if (player.disconnectTimer) clearTimeout(player.disconnectTimer);
      }
    }
    this.lobbies.clear();
    this.repository.close();
  }

  createLobby(ws: WebSocket, name: string): JoinResult {
    const lobbyId = this.generateLobbyId();
    const playerId = randomUUID();
    const token = randomUUID();
    const player: PlayerRecord = {
      id: playerId,
      name: sanitizeName(name),
      token,
      isHost: true,
      connected: true,
      ws,
      disconnectTimer: null,
      joinedAt: Date.now(),
      disconnectedAt: null,
      slots: emptySlots(),
      restoredPlaceholder: false,
    };
    const lobby: LobbyRecord = {
      id: lobbyId,
      hostId: playerId,
      createdAt: Date.now(),
      players: new Map([[playerId, player]]),
      emptyTimer: null,
    };
    this.lobbies.set(lobbyId, lobby);
    this.connections.set(ws, { lobbyId, playerId });
    this.persist(lobby);
    return { lobbyId, playerId, token, state: this.toState(lobby) };
  }

  joinLobby(ws: WebSocket, lobbyId: string, name: string): JoinResult {
    const lobby = this.requireLobby(lobbyId);
    this.cancelEmptyTimer(lobby);

    if (lobby.players.size >= this.maxPlayersPerLobby) {
      throw new ProtocolError(ErrorCode.LOBBY_FULL, 'This lobby is full.');
    }
    const cleanName = sanitizeName(name);
    const nameTaken = [...lobby.players.values()].some(
      (p) => p.name.toLowerCase() === cleanName.toLowerCase()
    );
    if (nameTaken) {
      throw new ProtocolError(ErrorCode.DUPLICATE_NAME, 'That name is already taken in this lobby.');
    }

    const playerId = randomUUID();
    const token = randomUUID();
    const player: PlayerRecord = {
      id: playerId,
      name: cleanName,
      token,
      isHost: false,
      connected: true,
      ws,
      disconnectTimer: null,
      joinedAt: Date.now(),
      disconnectedAt: null,
      slots: emptySlots(),
      restoredPlaceholder: false,
    };
    lobby.players.set(playerId, player);
    this.connections.set(ws, { lobbyId, playerId });
    // Existing members need to see the new player; the joining socket gets
    // its own STATE (with self identity) via the caller's response.
    this.broadcast(lobby, ws);
    this.persist(lobby);
    return { lobbyId, playerId, token, state: this.toState(lobby) };
  }

  /**
   * Restores a session. Three paths, in priority order:
   *  1. The lobby/player/token still match live server state -> plain reconnect.
   *  2. The lobby/player exist but were recreated from someone else's restore
   *     snapshot and not yet claimed -> claim that placeholder identity.
   *  3. Neither exists (e.g. the server restarted) -> rebuild the lobby from
   *     the provided snapshot, validated against the configured player cap
   *     and the fixed SLOT_COUNT per player.
   */
  restoreLobbyState(ws: WebSocket, msg: RestoreLobbyStateMessage): JoinResult {
    const existingLobby = this.lobbies.get(msg.lobbyId);
    if (existingLobby) {
      const player = existingLobby.players.get(msg.playerId);
      if (player) {
        if (player.restoredPlaceholder) {
          return this.claimPlaceholder(ws, existingLobby, player);
        }
        if (player.token !== msg.token) {
          throw new ProtocolError(ErrorCode.INVALID_TOKEN, 'Reconnect token is invalid.');
        }
        return this.reconnectExisting(ws, existingLobby, player);
      }
      if (!msg.snapshot) {
        throw new ProtocolError(ErrorCode.PLAYER_NOT_FOUND, 'Player no longer exists in this lobby.');
      }
      return this.createFromSnapshot(ws, msg, true);
    }
    if (!msg.snapshot) {
      throw new ProtocolError(ErrorCode.LOBBY_NOT_FOUND, `Lobby "${msg.lobbyId}" was not found.`);
    }
    return this.createFromSnapshot(ws, msg, false);
  }

  setPokemon(ws: WebSocket, slotIndex: number, pokemonId: number): void {
    const { lobby, player } = this.requireConnection(ws);
    this.requireValidSlotIndex(slotIndex);
    if (!isValidSpeciesId(pokemonId)) {
      throw new ProtocolError(ErrorCode.INVALID_MESSAGE, 'Unknown species id.');
    }
    player.slots[slotIndex] = { pokemonId };
    this.persist(lobby);
    this.broadcastState(lobby);
  }

  removePokemon(ws: WebSocket, slotIndex: number): void {
    const { lobby, player } = this.requireConnection(ws);
    this.requireValidSlotIndex(slotIndex);
    player.slots[slotIndex] = { pokemonId: null };
    this.persist(lobby);
    this.broadcastState(lobby);
  }

  kickPlayer(ws: WebSocket, targetPlayerId: string): void {
    const { lobby, player } = this.requireConnection(ws);
    this.requireHost(player);
    if (targetPlayerId === player.id) {
      throw new ProtocolError(ErrorCode.CANNOT_KICK_SELF, 'You cannot kick yourself.');
    }
    const target = lobby.players.get(targetPlayerId);
    if (!target) {
      throw new ProtocolError(ErrorCode.PLAYER_NOT_FOUND, 'Player not found in this lobby.');
    }
    if (target.ws) {
      this.send(target.ws, {
        type: 'ERROR',
        code: ErrorCode.PLAYER_NOT_FOUND,
        message: 'You were removed from the lobby by the host.',
      });
      target.ws.close();
    }
    this.removePlayerPermanently(lobby, targetPlayerId);
  }

  leaveLobby(ws: WebSocket): void {
    const meta = this.connections.get(ws);
    if (!meta) {
      throw new ProtocolError(ErrorCode.NOT_IN_LOBBY, 'You must join a lobby first.');
    }
    this.connections.delete(ws);
    // The regular STATE broadcast never reaches this socket once the player
    // is removed from the lobby, so tell it explicitly that it left.
    this.send(ws, { type: 'LEFT_LOBBY' });
    const lobby = this.lobbies.get(meta.lobbyId);
    if (!lobby) return;
    this.removePlayerPermanently(lobby, meta.playerId);
  }

  handleDisconnect(ws: WebSocket): void {
    const meta = this.connections.get(ws);
    if (!meta) return;
    const lobby = this.lobbies.get(meta.lobbyId);
    if (!lobby) return;
    const player = lobby.players.get(meta.playerId);
    if (!player) return;

    player.connected = false;
    player.ws = null;
    player.disconnectedAt = Date.now();
    this.armDisconnectTimer(lobby, player, RECONNECT_GRACE_MS);
    this.persist(lobby);
    this.broadcastState(lobby);
  }

  // -- internal helpers -----------------------------------------------------

  private reconnectExisting(ws: WebSocket, lobby: LobbyRecord, player: PlayerRecord): JoinResult {
    if (player.disconnectTimer) {
      clearTimeout(player.disconnectTimer);
      player.disconnectTimer = null;
    }
    player.connected = true;
    player.ws = ws;
    player.disconnectedAt = null;
    this.connections.set(ws, { lobbyId: lobby.id, playerId: player.id });
    this.broadcast(lobby, ws);
    this.persist(lobby);
    return { lobbyId: lobby.id, playerId: player.id, token: player.token, state: this.toState(lobby) };
  }

  private claimPlaceholder(ws: WebSocket, lobby: LobbyRecord, player: PlayerRecord): JoinResult {
    if (player.disconnectTimer) {
      clearTimeout(player.disconnectTimer);
      player.disconnectTimer = null;
    }
    player.token = randomUUID();
    player.connected = true;
    player.ws = ws;
    player.disconnectedAt = null;
    player.restoredPlaceholder = false;
    this.connections.set(ws, { lobbyId: lobby.id, playerId: player.id });
    this.broadcast(lobby, ws);
    this.persist(lobby);
    return { lobbyId: lobby.id, playerId: player.id, token: player.token, state: this.toState(lobby) };
  }

  private createFromSnapshot(ws: WebSocket, msg: RestoreLobbyStateMessage, forceNewId: boolean): JoinResult {
    const snapshot = msg.snapshot!;
    if (snapshot.players.length > this.maxPlayersPerLobby) {
      throw new ProtocolError(ErrorCode.LOBBY_FULL, 'Saved lobby is too full for this server (too many players).');
    }
    const self = snapshot.players.find((p) => p.id === msg.playerId);
    if (!self) {
      throw new ProtocolError(
        ErrorCode.PLAYER_NOT_FOUND,
        'Your player id was not found in the saved lobby state.'
      );
    }
    for (const snap of snapshot.players) {
      for (const slot of snap.slots) {
        if (slot.pokemonId !== null && !isValidSpeciesId(slot.pokemonId)) {
          throw new ProtocolError(ErrorCode.INVALID_MESSAGE, 'Saved slot has an unknown species id.');
        }
      }
    }

    const lobbyId = forceNewId || this.lobbies.has(msg.lobbyId) ? this.generateLobbyId() : msg.lobbyId;
    const players = new Map<string, PlayerRecord>();
    let joinedAt = Date.now();
    for (const snap of snapshot.players) {
      const isSelf = snap.id === msg.playerId;
      players.set(snap.id, {
        id: snap.id,
        name: sanitizeName(snap.name),
        token: randomUUID(),
        isHost: snap.id === snapshot.hostId,
        connected: isSelf,
        ws: isSelf ? ws : null,
        disconnectTimer: null,
        joinedAt: joinedAt++,
        disconnectedAt: isSelf ? null : Date.now(),
        slots: normalizeSlotCount(snap.slots),
        restoredPlaceholder: !isSelf,
      });
    }
    const lobby: LobbyRecord = {
      id: lobbyId,
      hostId: players.has(snapshot.hostId) ? snapshot.hostId : msg.playerId,
      createdAt: Date.now(),
      players,
      emptyTimer: null,
    };
    this.lobbies.set(lobbyId, lobby);
    const selfRecord = players.get(msg.playerId)!;
    this.connections.set(ws, { lobbyId, playerId: msg.playerId });
    this.persist(lobby);
    return { lobbyId, playerId: msg.playerId, token: selfRecord.token, state: this.toState(lobby) };
  }

  private removePlayerPermanently(lobby: LobbyRecord, playerId: string): void {
    const player = lobby.players.get(playerId);
    if (!player) return;
    if (player.disconnectTimer) clearTimeout(player.disconnectTimer);
    lobby.players.delete(playerId);

    if (player.isHost) {
      const nextHost = [...lobby.players.values()]
        .filter((p) => p.connected)
        .sort((a, b) => a.joinedAt - b.joinedAt)[0];
      if (nextHost) {
        nextHost.isHost = true;
        lobby.hostId = nextHost.id;
      }
    }

    if (lobby.players.size === 0) {
      // No player rows remain to reconnect against, so there's nothing left
      // worth persisting -- clean the row up immediately rather than
      // waiting for scheduleEmptyLobbyCleanup's in-memory-map TTL.
      this.repository.deleteLobby(lobby.id);
      this.scheduleEmptyLobbyCleanup(lobby);
    } else {
      this.persist(lobby);
      this.broadcastState(lobby);
    }
  }

  private scheduleEmptyLobbyCleanup(lobby: LobbyRecord): void {
    if (lobby.emptyTimer) clearTimeout(lobby.emptyTimer);
    lobby.emptyTimer = setTimeout(() => {
      const current = this.lobbies.get(lobby.id);
      if (current && current.players.size === 0) {
        this.lobbies.delete(lobby.id);
      }
    }, EMPTY_LOBBY_TTL_MS);
    lobby.emptyTimer.unref?.();
  }

  private cancelEmptyTimer(lobby: LobbyRecord): void {
    if (lobby.emptyTimer) {
      clearTimeout(lobby.emptyTimer);
      lobby.emptyTimer = null;
    }
  }

  /** Arms (or re-arms) the reconnect-grace timer for a disconnected player. */
  private armDisconnectTimer(lobby: LobbyRecord, player: PlayerRecord, remainingMs: number): void {
    if (player.disconnectTimer) clearTimeout(player.disconnectTimer);
    player.disconnectTimer = setTimeout(() => {
      this.removePlayerPermanently(lobby, player.id);
    }, remainingMs);
    // Timer must not keep the Node.js process alive.
    player.disconnectTimer.unref?.();
  }

  private requireHost(player: PlayerRecord): void {
    if (!player.isHost) {
      throw new ProtocolError(ErrorCode.NOT_HOST, 'Only the lobby host can do that.');
    }
  }

  private requireValidSlotIndex(slotIndex: number): void {
    if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= SLOT_COUNT) {
      throw new ProtocolError(ErrorCode.INVALID_SLOT, `Slot index must be between 0 and ${SLOT_COUNT - 1}.`);
    }
  }

  private requireLobby(lobbyId: string): LobbyRecord {
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby) {
      throw new ProtocolError(ErrorCode.LOBBY_NOT_FOUND, `Lobby "${lobbyId}" was not found.`);
    }
    return lobby;
  }

  private requireConnection(ws: WebSocket): { lobby: LobbyRecord; player: PlayerRecord } {
    const meta = this.connections.get(ws);
    if (!meta) {
      throw new ProtocolError(ErrorCode.NOT_IN_LOBBY, 'You must join a lobby first.');
    }
    const lobby = this.lobbies.get(meta.lobbyId);
    const player = lobby?.players.get(meta.playerId);
    if (!lobby || !player) {
      throw new ProtocolError(ErrorCode.NOT_IN_LOBBY, 'You must join a lobby first.');
    }
    return { lobby, player };
  }

  private generateLobbyId(): string {
    for (let attempt = 0; attempt < 20; attempt++) {
      const bytes = randomBytes(6);
      let id = '';
      for (const byte of bytes) {
        id += LOBBY_ID_ALPHABET[byte % LOBBY_ID_ALPHABET.length];
      }
      if (!this.lobbies.has(id)) return id;
    }
    throw new ProtocolError(ErrorCode.INTERNAL_ERROR, 'Could not allocate a lobby id.');
  }

  private toState(lobby: LobbyRecord): LobbyState {
    const players: PlayerInfo[] = [...lobby.players.values()]
      .sort((a, b) => a.joinedAt - b.joinedAt)
      .map((p) => ({
        id: p.id,
        name: p.name,
        isHost: p.isHost,
        connected: p.connected,
        slots: p.slots.map((slot) => ({ ...slot })),
      }));

    return { id: lobby.id, hostId: lobby.hostId, players, createdAt: lobby.createdAt };
  }

  /** Converts live in-memory state to the plain-data shape persisted by `repository`. */
  private toPersistedRecord(lobby: LobbyRecord): PersistedLobby {
    const players: PersistedPlayer[] = [...lobby.players.values()].map((p) => ({
      id: p.id,
      name: p.name,
      token: p.token,
      isHost: p.isHost,
      connected: p.connected,
      joinedAt: p.joinedAt,
      disconnectedAt: p.disconnectedAt,
      restoredPlaceholder: p.restoredPlaceholder,
      slots: p.slots.map((slot) => ({ ...slot })),
    }));
    return { id: lobby.id, hostId: lobby.hostId, createdAt: lobby.createdAt, players };
  }

  /** Persists the full current state of one lobby transactionally. */
  private persist(lobby: LobbyRecord): void {
    this.repository.saveLobby(this.toPersistedRecord(lobby));
  }

  /**
   * Rebuilds one in-memory `LobbyRecord` from a persisted snapshot loaded at
   * startup. See `loadFromRepository` for the grace-period reconciliation
   * rules applied here.
   */
  private hydrateLobby(persisted: PersistedLobby, now: number): void {
    const players = new Map<string, PlayerRecord>();
    for (const p of persisted.players) {
      const disconnectedAt = p.connected ? now : p.disconnectedAt ?? now;
      const remainingMs = RECONNECT_GRACE_MS - (now - disconnectedAt);
      if (remainingMs <= 0) {
        // Grace period already elapsed while the server was down/restarting;
        // treat exactly like a normal grace-period expiry (drop the player).
        continue;
      }
      const player: PlayerRecord = {
        id: p.id,
        name: p.name,
        token: p.token,
        isHost: p.id === persisted.hostId,
        connected: false,
        ws: null,
        disconnectTimer: null,
        joinedAt: p.joinedAt,
        disconnectedAt,
        slots: normalizeSlotCount(p.slots),
        restoredPlaceholder: p.restoredPlaceholder,
      };
      players.set(player.id, player);
    }

    if (players.size === 0) {
      // Nothing survived the grace-period check: clean up the stale row
      // rather than resurrecting an empty lobby nobody can reconnect to.
      this.repository.deleteLobby(persisted.id);
      return;
    }

    let hostId = persisted.hostId;
    if (!players.has(hostId)) {
      const nextHost = [...players.values()].sort((a, b) => a.joinedAt - b.joinedAt)[0];
      hostId = nextHost.id;
    }
    for (const player of players.values()) {
      player.isHost = player.id === hostId;
    }

    const lobby: LobbyRecord = {
      id: persisted.id,
      hostId,
      createdAt: persisted.createdAt,
      players,
      emptyTimer: null,
    };
    for (const player of players.values()) {
      this.armDisconnectTimer(lobby, player, remainingGraceMs(player.disconnectedAt, now));
    }
    this.lobbies.set(lobby.id, lobby);
    // Write back any reconciliation (dropped players, reassigned host) so
    // the on-disk state matches what's now in memory.
    this.persist(lobby);
  }

  private broadcastState(lobby: LobbyRecord): void {
    const state = this.toState(lobby);
    for (const player of lobby.players.values()) {
      if (player.ws) {
        this.send(player.ws, { type: 'STATE', state });
      }
    }
  }

  /** Broadcast to everyone in the lobby except the given socket (already sent its own reply). */
  private broadcast(lobby: LobbyRecord, except: WebSocket): void {
    const state = this.toState(lobby);
    for (const player of lobby.players.values()) {
      if (player.ws && player.ws !== except) {
        this.send(player.ws, { type: 'STATE', state });
      }
    }
  }

  private send(ws: WebSocket, message: unknown): void {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }
}

function sanitizeName(name: string): string {
  return name.trim().slice(0, MAX_NAME_LENGTH);
}

function normalizeSlotCount(slots: PokemonSlot[]): PokemonSlot[] {
  const result = slots.slice(0, SLOT_COUNT).map((s) => ({ pokemonId: s.pokemonId }));
  while (result.length < SLOT_COUNT) result.push({ pokemonId: null });
  return result;
}

function remainingGraceMs(disconnectedAt: number | null, now: number): number {
  if (disconnectedAt === null) return RECONNECT_GRACE_MS;
  return RECONNECT_GRACE_MS - (now - disconnectedAt);
}
