import type Database from 'better-sqlite3';

/**
 * Bump this whenever the schema shape changes and add a corresponding
 * migration branch in `initSchema` below, gated on the previous version.
 * `PRAGMA user_version` is SQLite's built-in place to store this -- it's
 * durable, requires no extra table, and is read/written atomically with the
 * rest of the file.
 */
export const SCHEMA_VERSION = 4;

/**
 * Initializes (or safely reuses) the on-disk schema. Always uses
 * `CREATE TABLE IF NOT EXISTS`, so pointing this at an existing database
 * file is a no-op beyond the version check -- it never drops or recreates
 * data. Call once per process right after opening the database.
 */
export function initSchema(db: Database.Database): void {
  // WAL keeps readers from blocking writes; FULL syncs each committed lobby
  // update to durable storage before the server acknowledges a mutation.
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = FULL');
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

    CREATE TABLE IF NOT EXISTS discord_users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS discord_sessions (
      token_hash TEXT PRIMARY KEY,
      discord_user_id TEXT NOT NULL REFERENCES discord_users(id) ON DELETE CASCADE,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_discord_sessions_user_id ON discord_sessions(discord_user_id);
  `);

  const currentVersion = db.pragma('user_version', { simple: true }) as number;
  if (currentVersion < SCHEMA_VERSION) {
    if (currentVersion < 2) {
      db.exec("ALTER TABLE lobbies ADD COLUMN ordenes_json TEXT NOT NULL DEFAULT '[]'");
    }
    if (currentVersion < 3) {
      db.exec('ALTER TABLE lobbies ADD COLUMN game_version_id TEXT');
    }
    if (currentVersion < 4) {
      db.exec(`
        ALTER TABLE lobbies ADD COLUMN owner_user_id TEXT;
        ALTER TABLE lobbies ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE players ADD COLUMN user_id TEXT;
        ALTER TABLE players ADD COLUMN kicked INTEGER NOT NULL DEFAULT 0;
        UPDATE lobbies SET updated_at = created_at WHERE updated_at = 0;
        CREATE INDEX IF NOT EXISTS idx_lobbies_owner_user_id ON lobbies(owner_user_id);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_players_lobby_user_id
          ON players(lobby_id, user_id) WHERE user_id IS NOT NULL;
      `);
    }
    db.pragma(`user_version = ${SCHEMA_VERSION}`);
  }
}
