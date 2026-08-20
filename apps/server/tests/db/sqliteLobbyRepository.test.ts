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
      expect(tables).toEqual(expect.arrayContaining(['lobbies', 'players', 'slots']));
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

  it('round-trips a full lobby: players, six slots, host, and tokens', () => {
    ({ dir, dbPath } = makeTempDbPath());
    repo = new SqliteLobbyRepository(dbPath);

    const lobby = sampleLobby({
      players: [
        samplePlayer({ id: 'p1', isHost: true, slots: [{ pokemonId: 25 }, ...Array.from({ length: 5 }, () => ({ pokemonId: null }))] }),
        samplePlayer({ id: 'p2', name: 'Misty', token: 'token-2', isHost: false, connected: false, disconnectedAt: 2000 }),
      ],
    });
    repo.saveLobby(lobby);

    const [loaded] = repo.loadAll();
    expect(loaded.hostId).toBe('player-1');
    expect(loaded.players).toHaveLength(2);
    const p1 = loaded.players.find((p) => p.id === 'p1')!;
    expect(p1.slots).toHaveLength(6);
    expect(p1.slots[0]).toEqual({ pokemonId: 25 });
    expect(p1.token).toBe('token-1');
    const p2 = loaded.players.find((p) => p.id === 'p2')!;
    expect(p2.connected).toBe(false);
    expect(p2.disconnectedAt).toBe(2000);
    expect(p2.token).toBe('token-2');
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
});
