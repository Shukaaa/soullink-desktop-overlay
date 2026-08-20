import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';
import { SLOT_COUNT } from '@soullink/shared';
import { initSchema } from './schema';
import type { LobbyRepository, PersistedLobby, PersistedPlayer } from './lobbyRepository';

interface LobbyRow {
  id: string;
  host_id: string;
  created_at: number;
}

interface PlayerRow {
  id: string;
  lobby_id: string;
  name: string;
  token: string;
  is_host: number;
  connected: number;
  joined_at: number;
  disconnected_at: number | null;
  restored_placeholder: number;
}

interface SlotRow {
  player_id: string;
  slot_index: number;
  pokemon_id: number | null;
}

/**
 * SQLite-backed `LobbyRepository` using `better-sqlite3`. All writes are
 * wrapped in a single transaction so a crash mid-write can never leave a
 * lobby with some players saved and others missing.
 *
 * NOTE: `better-sqlite3` uses a local file handle with OS-level locking, so
 * this only supports exactly one server process/instance writing to a given
 * database file at a time (see README's Railway deployment section).
 */
export class SqliteLobbyRepository implements LobbyRepository {
  private readonly db: Database.Database;

  private readonly upsertLobbyStmt;
  private readonly deleteLobbyStmt;
  private readonly deletePlayersForLobbyStmt;
  private readonly insertPlayerStmt;
  private readonly insertSlotStmt;
  private readonly selectLobbiesStmt;
  private readonly selectPlayersStmt;
  private readonly selectSlotsStmt;

  constructor(dbPath: string) {
    ensureDirectoryFor(dbPath);
    this.db = new Database(dbPath);
    initSchema(this.db);

    this.upsertLobbyStmt = this.db.prepare(`
      INSERT INTO lobbies (id, host_id, created_at)
      VALUES (@id, @hostId, @createdAt)
      ON CONFLICT(id) DO UPDATE SET host_id = excluded.host_id, created_at = excluded.created_at
    `);
    this.deleteLobbyStmt = this.db.prepare('DELETE FROM lobbies WHERE id = ?');
    this.deletePlayersForLobbyStmt = this.db.prepare('DELETE FROM players WHERE lobby_id = ?');
    this.insertPlayerStmt = this.db.prepare(`
      INSERT INTO players (id, lobby_id, name, token, is_host, connected, joined_at, disconnected_at, restored_placeholder)
      VALUES (@id, @lobbyId, @name, @token, @isHost, @connected, @joinedAt, @disconnectedAt, @restoredPlaceholder)
    `);
    this.insertSlotStmt = this.db.prepare(`
      INSERT INTO slots (player_id, slot_index, pokemon_id) VALUES (@playerId, @slotIndex, @pokemonId)
    `);
    this.selectLobbiesStmt = this.db.prepare('SELECT id, host_id, created_at FROM lobbies');
    this.selectPlayersStmt = this.db.prepare(
      'SELECT id, lobby_id, name, token, is_host, connected, joined_at, disconnected_at, restored_placeholder FROM players WHERE lobby_id = ? ORDER BY joined_at ASC'
    );
    this.selectSlotsStmt = this.db.prepare(
      'SELECT player_id, slot_index, pokemon_id FROM slots WHERE player_id = ? ORDER BY slot_index ASC'
    );
  }

  saveLobby(lobby: PersistedLobby): void {
    const tx = this.db.transaction((l: PersistedLobby) => {
      this.upsertLobbyStmt.run({ id: l.id, hostId: l.hostId, createdAt: l.createdAt });
      // Full aggregate replace: simplest way to guarantee players/slots
      // exactly match in-memory state without diffing. Lobbies are small
      // (at most a handful of players), so this is cheap.
      this.deletePlayersForLobbyStmt.run(l.id);
      for (const player of l.players) {
        this.insertPlayerStmt.run({
          id: player.id,
          lobbyId: l.id,
          name: player.name,
          token: player.token,
          isHost: player.isHost ? 1 : 0,
          connected: player.connected ? 1 : 0,
          joinedAt: player.joinedAt,
          disconnectedAt: player.disconnectedAt,
          restoredPlaceholder: player.restoredPlaceholder ? 1 : 0,
        });
        for (let slotIndex = 0; slotIndex < player.slots.length; slotIndex++) {
          this.insertSlotStmt.run({
            playerId: player.id,
            slotIndex,
            pokemonId: player.slots[slotIndex].pokemonId,
          });
        }
      }
    });
    tx(lobby);
  }

  deleteLobby(lobbyId: string): void {
    this.deleteLobbyStmt.run(lobbyId);
  }

  loadAll(): PersistedLobby[] {
    const lobbyRows = this.selectLobbiesStmt.all() as LobbyRow[];
    return lobbyRows.map((lobbyRow) => this.loadLobby(lobbyRow));
  }

  close(): void {
    this.db.close();
  }

  private loadLobby(lobbyRow: LobbyRow): PersistedLobby {
    const playerRows = this.selectPlayersStmt.all(lobbyRow.id) as PlayerRow[];
    const players: PersistedPlayer[] = playerRows.map((playerRow) => {
      const slotRows = this.selectSlotsStmt.all(playerRow.id) as SlotRow[];
      const slots = normalizeSlots(slotRows);
      return {
        id: playerRow.id,
        name: playerRow.name,
        token: playerRow.token,
        isHost: playerRow.is_host === 1,
        connected: playerRow.connected === 1,
        joinedAt: playerRow.joined_at,
        disconnectedAt: playerRow.disconnected_at,
        restoredPlaceholder: playerRow.restored_placeholder === 1,
        slots,
      };
    });
    return {
      id: lobbyRow.id,
      hostId: lobbyRow.host_id,
      createdAt: lobbyRow.created_at,
      players,
    };
  }
}

function normalizeSlots(slotRows: SlotRow[]): { pokemonId: number | null }[] {
  const bySlotIndex = new Map(slotRows.map((row) => [row.slot_index, row.pokemon_id]));
  const slots: { pokemonId: number | null }[] = [];
  for (let i = 0; i < SLOT_COUNT; i++) {
    slots.push({ pokemonId: bySlotIndex.get(i) ?? null });
  }
  return slots;
}

function ensureDirectoryFor(dbPath: string): void {
  if (dbPath === ':memory:') return;
  const dir = dirname(dbPath);
  if (dir && !existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}
