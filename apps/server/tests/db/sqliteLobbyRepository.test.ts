import { mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { SqliteLobbyRepository } from '../../src/db/sqliteLobbyRepository';
import { initSchema, SCHEMA_VERSION } from '../../src/db/schema';
import type { PersistedLobby } from '../../src/db/lobbyRepository';

/**
 * Uses a project-local scratch directory (gitignored via `.tmp-test/`)
 * rather than the OS temp dir, so every test file created here lives next
 * to the repo it belongs to and is trivially cleaned up afterward.
 */
const SCRATCH_ROOT = join(__dirname, '.tmp-test');

function makeTempDbPath(): { dir: string; dbPath: string } {
  mkdirSync(SCRATCH_ROOT, { recursive: true });
  const dir = mkdtempSync(join(SCRATCH_ROOT, 'db-'));
  return { dir, dbPath: join(dir, 'soullink.sqlite') };
}

function samplePlayer(overrides: Partial<PersistedLobby['players'][number]> = {}): PersistedLobby['players'][number] {
  return {
    id: 'player-1',
    name: 'Ash',
    token: 'token-1',
    isHost: true,
    connected: true,
    joinedAt: 1000,
    disconnectedAt: null,
    restoredPlaceholder: false,
    slots: Array.from({ length: 6 }, () => ({ pokemonId: null })),
    ...overrides,
  };
}

function sampleLobby(overrides: Partial<PersistedLobby> = {}): PersistedLobby {
  return {
    id: 'LOBBY1',
    hostId: 'player-1',
    createdAt: 1000,
    gameVersionId: null,
    ordenes: [],
    players: [samplePlayer()],
    ...overrides,
  };
}

describe('SqliteLobbyRepository', () => {
  let dir: string;
  let dbPath: string;
  let repo: SqliteLobbyRepository | undefined;

  afterEach(() => {
    repo?.close();
    repo = undefined;
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it('initializes a fresh schema with CREATE TABLE IF NOT EXISTS and sets the schema version', () => {
    ({ dir, dbPath } = makeTempDbPath());
    repo = new SqliteLobbyRepository(dbPath);

    const raw = new Database(dbPath);
    try {
      const version = raw.pragma('user_version', { simple: true });
      expect(version).toBe(SCHEMA_VERSION);
      const tables = raw
        .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
        .all()
        .map((r: any) => r.name);
      expect(tables).toEqual(expect.arrayContaining(['lobbies', 'players', 'slots', 'discord_users', 'discord_sessions']));
    } finally {
      raw.close();
    }
  });

  it('detects and safely reuses an existing database without dropping data', () => {
    ({ dir, dbPath } = makeTempDbPath());
    repo = new SqliteLobbyRepository(dbPath);
    repo.saveLobby(sampleLobby());
    repo.close();

    // Re-open against the same file, simulating a server restart.
    repo = new SqliteLobbyRepository(dbPath);
    const all = repo.loadAll();
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe('LOBBY1');
    expect(all[0].players).toHaveLength(1);
    expect(all[0].resetCount).toBe(0);
    expect(all[0].players[0].deathCount).toBe(0);
  });

  it('running initSchema twice on the same database is a safe no-op', () => {
    ({ dir, dbPath } = makeTempDbPath());
    const raw = new Database(dbPath);
    initSchema(raw);
    raw.prepare('INSERT INTO lobbies (id, host_id, created_at) VALUES (?, ?, ?)').run('L1', 'p1', 1);
    initSchema(raw);
    const row = raw.prepare('SELECT * FROM lobbies WHERE id = ?').get('L1');
    expect(row).toBeDefined();
    raw.close();
  });

  it('round-trips a full lobby including orden progress', () => {
    ({ dir, dbPath } = makeTempDbPath());
    repo = new SqliteLobbyRepository(dbPath);

    const lobby = sampleLobby({
      gameVersionId: 'red',
      ordenes: [true, false, true],
      resetCount: 2,
      ownerUserId: 'discord-owner',
      updatedAt: 2000,
      players: [
        samplePlayer({
          id: 'p1',
          userId: 'discord-owner',
          isHost: true,
          deathCount: 3,
          slots: [{ pokemonId: 25 }, ...Array.from({ length: 5 }, () => ({ pokemonId: null }))],
        }),
        samplePlayer({
          id: 'p2',
          userId: 'discord-member',
          name: 'Misty',
          token: 'token-2',
          isHost: false,
          connected: false,
          kicked: true,
          deathCount: 1,
          disconnectedAt: 2000,
        }),
      ],
    });
    repo.saveLobby(lobby);

    const [loaded] = repo.loadAll();
    expect(loaded.hostId).toBe('player-1');
    expect(loaded.gameVersionId).toBe('red');
    expect(loaded.ownerUserId).toBe('discord-owner');
    expect(loaded.updatedAt).toBe(2000);
    expect(loaded.ordenes).toEqual([true, false, true]);
    expect(loaded.resetCount).toBe(2);
    expect(loaded.players).toHaveLength(2);
    const p1 = loaded.players.find((p) => p.id === 'p1')!;
    expect(p1.slots).toHaveLength(6);
    expect(p1.slots[0]).toEqual({ pokemonId: 25 });
    expect(p1.token).toBe('token-1');
    expect(p1.deathCount).toBe(3);
    const p2 = loaded.players.find((p) => p.id === 'p2')!;
    expect(p2.connected).toBe(false);
    expect(p2.disconnectedAt).toBe(2000);
    expect(p2.token).toBe('token-2');
    expect(p2.userId).toBe('discord-member');
    expect(p2.kicked).toBe(true);
    expect(p2.deathCount).toBe(1);
  });

  it('persists Discord users with hashed sessions', () => {
    ({ dir, dbPath } = makeTempDbPath());
    repo = new SqliteLobbyRepository(dbPath);
    repo.saveDiscordSession({ id: 'discord-1', username: 'Ash' }, 'sha256-token-hash');

    expect(repo.findDiscordUserByTokenHash('sha256-token-hash')).toEqual({ id: 'discord-1', username: 'Ash' });
    expect(repo.findDiscordUserByTokenHash('raw-token')).toBeNull();
  });

  it('deleteLobby removes the lobby and cascades to its players and slots', () => {
    ({ dir, dbPath } = makeTempDbPath());
    repo = new SqliteLobbyRepository(dbPath);
    repo.saveLobby(sampleLobby());
    repo.deleteLobby('LOBBY1');

    expect(repo.loadAll()).toHaveLength(0);
    const raw = new Database(dbPath);
    try {
      const playerCount = raw.prepare('SELECT COUNT(*) as c FROM players').get() as { c: number };
      const slotCount = raw.prepare('SELECT COUNT(*) as c FROM slots').get() as { c: number };
      expect(playerCount.c).toBe(0);
      expect(slotCount.c).toBe(0);
    } finally {
      raw.close();
    }
  });

  it('saveLobby fully replaces a previous player set (no stale rows left behind)', () => {
    ({ dir, dbPath } = makeTempDbPath());
    repo = new SqliteLobbyRepository(dbPath);
    repo.saveLobby(sampleLobby({ players: [samplePlayer({ id: 'p1' }), samplePlayer({ id: 'p2', name: 'Misty', token: 't2' })] }));
    // Save again with only one of the two players (e.g. the other left).
    repo.saveLobby(sampleLobby({ players: [samplePlayer({ id: 'p1' })] }));

    const [loaded] = repo.loadAll();
    expect(loaded.players.map((p) => p.id)).toEqual(['p1']);
  });

  it('normalizes a missing/short slot row set back up to SLOT_COUNT empty slots', () => {
    ({ dir, dbPath } = makeTempDbPath());
    const raw = new Database(dbPath);
    initSchema(raw);
    raw.prepare('INSERT INTO lobbies (id, host_id, created_at) VALUES (?, ?, ?)').run('L1', 'p1', 1);
    raw
      .prepare(
        'INSERT INTO players (id, lobby_id, name, token, is_host, connected, joined_at, disconnected_at, restored_placeholder) VALUES (?, ?, ?, ?, 1, 1, 1, NULL, 0)'
      )
      .run('p1', 'L1', 'Ash', 'tok');
    // Deliberately insert zero slot rows to simulate an incomplete/invalid write.
    raw.close();

    repo = new SqliteLobbyRepository(dbPath);
    const [loaded] = repo.loadAll();
    expect(loaded.players[0].slots).toHaveLength(6);
    expect(loaded.players[0].slots.every((s) => s.pokemonId === null)).toBe(true);
  });

  it('migrates a version 1 database and defaults its orden progress to empty', () => {
    ({ dir, dbPath } = makeTempDbPath());
    const raw = new Database(dbPath);
    raw.exec(`
      CREATE TABLE lobbies (id TEXT PRIMARY KEY, host_id TEXT NOT NULL, created_at INTEGER NOT NULL);
      INSERT INTO lobbies (id, host_id, created_at) VALUES ('OLD1', 'p1', 1);
      PRAGMA user_version = 1;
    `);
    raw.close();

    repo = new SqliteLobbyRepository(dbPath);
    expect(repo.loadAll()[0]).toMatchObject({ id: 'OLD1', gameVersionId: null, ordenes: [], resetCount: 0 });
  });

  it('migrates a version 2 database by adding the game-version field', () => {
    ({ dir, dbPath } = makeTempDbPath());
    const raw = new Database(dbPath);
    raw.exec(`
      CREATE TABLE lobbies (
        id TEXT PRIMARY KEY,
        host_id TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        ordenes_json TEXT NOT NULL DEFAULT '[]'
      );
      INSERT INTO lobbies (id, host_id, created_at, ordenes_json) VALUES ('OLD2', 'p1', 1, '[true]');
      PRAGMA user_version = 2;
    `);
    raw.close();

    repo = new SqliteLobbyRepository(dbPath);
    expect(repo.loadAll()[0]).toMatchObject({ id: 'OLD2', gameVersionId: null, ordenes: [true], resetCount: 0 });
  });
});
