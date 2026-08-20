import type Database from 'better-sqlite3';

/**
 * Bump this whenever the schema shape changes and add a corresponding
 * migration branch in `initSchema` below, gated on the previous version.
 * `PRAGMA user_version` is SQLite's built-in place to store this -- it's
 * durable, requires no extra table, and is read/written atomically with the
 * rest of the file.
 */
export const SCHEMA_VERSION = 1;

/**
 * Initializes (or safely reuses) the on-disk schema. Always uses
 * `CREATE TABLE IF NOT EXISTS`, so pointing this at an existing database
 * file is a no-op beyond the version check -- it never drops or recreates
 * data. Call once per process right after opening the database.
 */
export function initSchema(db: Database.Database): void {
  // WAL is the recommended journal mode for a single-writer server process:
  // readers don't block the writer and vice versa, and it survives crashes
  // better than the default rollback journal on a persistent volume.
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS lobbies (
      id TEXT PRIMARY KEY,
      host_id TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS players (
      id TEXT PRIMARY KEY,
      lobby_id TEXT NOT NULL REFERENCES lobbies(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      token TEXT NOT NULL,
      is_host INTEGER NOT NULL,
      connected INTEGER NOT NULL,
      joined_at INTEGER NOT NULL,
      disconnected_at INTEGER,
      restored_placeholder INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_players_lobby_id ON players(lobby_id);

    CREATE TABLE IF NOT EXISTS slots (
      player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      slot_index INTEGER NOT NULL,
      pokemon_id INTEGER,
      PRIMARY KEY (player_id, slot_index)
    );
  `);

  const currentVersion = db.pragma('user_version', { simple: true }) as number;
  if (currentVersion < SCHEMA_VERSION) {
    // No migrations exist yet beyond the initial CREATE TABLE IF NOT EXISTS
    // above; future schema changes should branch on `currentVersion` here
    // (e.g. `if (currentVersion < 2) { db.exec('ALTER TABLE ...'); }`) before
    // this final bump.
    db.pragma(`user_version = ${SCHEMA_VERSION}`);
  }
}
