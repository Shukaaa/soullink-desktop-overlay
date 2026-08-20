# SoulLink Overlay

A local, self-hosted multiplayer companion app for **SoulLink Nuzlocke** challenges. Run
a small authoritative server, connect an Electron desktop client per player, and get a
transparent, click-through overlay showing every player's current team as six sprite
slots -- perfect for streaming or just keeping track during co-op play.

Every player has exactly **six `PokemonSlot`s** (one per team slot). There is no separate
route/Encounter/SoulLink entity: a "SoulLink" is simply the same slot index lined up
across every player, computed purely by position wherever it's displayed.

## Monorepo layout

```
packages/shared     Shared protocol types, zod validation, error codes, and a static
                     Gen I-IV pokedex (species names + PokeAPI sprite URLs).
apps/server          Authoritative WebSocket server: LobbyManager owns all lobby state
                     (players + their six PokemonSlots), enforces host-only permissions
                     (kicking), a configurable max-players-per-lobby cap, and reconnect
                     grace periods. Lobby state is persisted to a local SQLite database
                     (via better-sqlite3) behind a repository abstraction, so a server
                     restart/redeploy doesn't lose active lobbies.
apps/desktop         Electron + Vite + React desktop client:
                       - a single WebSocket connection lives in the Electron main process
                       - a secure preload bridge (contextIsolation + sandbox, no direct
                         Node/Electron access from renderer code)
                       - a "Control Panel" window for connecting, managing the lobby, and
                         setting your own six Pokemon slots
                       - a transparent, click-through "Overlay" window docked to the
                         bottom-right of the screen's work area that grows upward as more
                         players join, showing only sprites/empty cells (no text at all)
                       - Ctrl+Shift+O is a global shortcut that toggles the overlay's
                         click-through state from anywhere, even while a game has focus
                       - a local SaveStateService that persists full lobby snapshots
                         (every player's six slots) under app.getPath('userData')/saves,
                         with atomic writes, a debounced autosave.json distinct from
                         user-created manual save files, and manual save list/restore/
                         delete support
```

## Requirements

- Node.js >= 18.18 (tested with Node 24)
- npm >= 10 (npm workspaces)

## Getting started

```bash
npm install
npm run build       # builds packages/shared, apps/server, apps/desktop (in that order)
npm run typecheck    # tsc --noEmit across every workspace
npm test             # vitest across shared, server, and desktop
```

### Run the server

```bash
npm run dev:server          # tsx watch, listens on PORT (default 8787)
# or, after `npm run build`:
node apps/server/dist/index.js
```

The server exposes a plain WebSocket endpoint and a `GET /health` check. The maximum
number of players per lobby is configurable via the `MAX_PLAYERS_PER_LOBBY` environment
variable (default 4).

Lobby state is persisted to a local SQLite file so the server can restart/redeploy
without losing active lobbies. Configure the file path with `DB_PATH` (default
`./data/soullink.sqlite`, relative to the process's working directory); see
[`.env.example`](apps/server/.env.example) and "Deploying to Railway" below.

## Deploying to Railway

The server persists lobby state to a single SQLite file via
[`better-sqlite3`](https://github.com/WiseLibs/better-sqlite3). SQLite is a
single-writer, local-file database, so this deployment has two hard requirements:

1. **A Railway Volume is required.** Railway container filesystems are ephemeral --
   anything written outside a mounted Volume is lost on every redeploy/restart. Attach a
   Volume to the service (Railway dashboard -> service -> **Settings -> Volumes**), mount
   it at, e.g., `/data`, and set the `DB_PATH` environment variable to a path inside that
   mount, e.g. `DB_PATH=/data/soullink.sqlite`. Without a Volume, `DB_PATH` still works
   (it defaults to `./data/soullink.sqlite`), but the database -- and every active lobby
   -- will be wiped out on the next deploy or restart.
2. **Exactly one replica/instance is supported.** SQLite allows only one process to
   safely write to a given database file at a time. Do **not** scale this service beyond
   a single replica/instance -- multiple concurrent instances writing to the same
   `DB_PATH` file will corrupt lobby state or crash with database-locked errors. Railway's
   horizontal scaling / multiple-replica options must stay disabled for this service.
   (Vertical scaling -- more CPU/RAM on the one instance -- is fine.)

Minimal setup:

```bash
# Railway service environment variables:
PORT=8787                        # or let Railway inject its own $PORT
DB_PATH=/data/soullink.sqlite     # must be inside the mounted Volume
MAX_PLAYERS_PER_LOBBY=4           # optional, defaults to 4
```

Build/start commands (Railway auto-detects Node, or configure explicitly):

```bash
# build:
npm install && npm run build -w packages/shared && npm run build -w apps/server
# start:
node apps/server/dist/index.js
```

On boot the server logs how many lobbies it loaded from `DB_PATH` (`Loaded N lobbies
from ...`), which is a quick way to confirm the Volume is mounted and being reused
correctly across deploys instead of starting from an empty database every time.

### Run the desktop app

```bash
npm run dev:desktop         # electron-vite dev, hot reloads main/preload/renderer
# or, after `npm run build`:
npm run start -w apps/desktop   # electron-vite preview (runs the built app)
```

On launch you get two windows:

1. **Control Panel** -- enter the server URL and your name, connect, then create or join a
   lobby by its 6-character code. Click one of your own six slots to open the Pokemon
   picker and assign (or clear) that slot. If you're the host you can kick other players.
2. **Overlay** -- a frameless, transparent, always-on-top window docked to the
   bottom-right corner of the primary display's work area. It shows one row per player,
   each row being exactly six cells (a sprite, or empty) -- no names, nicknames, routes,
   or any other text. It grows upward as more players join (its bottom-right corner stays
   anchored). It's click-through by default; toggle that from the Control Panel checkbox
   or globally with **Ctrl+Shift+O**.

### Packaging a Windows build locally

```bash
npm run package:desktop   # builds packages/shared, apps/desktop, then packages a Windows EXE
```

This builds `packages/shared`, builds `apps/desktop` with `electron-vite`, then runs
[`electron-builder`](https://www.electron.build/) (configured in `apps/desktop/package.json`'s
`"build"` field) to produce a Windows NSIS installer and a portable EXE under
`apps/desktop/release/` (gitignored):

- `SoulLink Overlay-Setup-<version>.exe` -- NSIS installer (lets the user pick an install
  directory; not silent/one-click).
- `SoulLink Overlay-Portable-<version>.exe` -- a single portable EXE that runs without
  installing anything.

Only `apps/desktop` (and its `packages/shared` dependency, inlined at build time) is
packaged -- `apps/server` is never built or included in these artifacts.

## Automated releases (GitHub Actions)

Every push to `main` runs [`.github/workflows/release-desktop.yml`](.github/workflows/release-desktop.yml)
on a `windows-latest` runner, which:

1. Installs dependencies (`npm ci`), typechecks and tests `packages/shared` and
   `apps/desktop` (the server is not built/tested/packaged by this workflow).
2. Builds `apps/desktop` and packages it with `electron-builder` into the same
   NSIS installer + portable EXE described above.
3. Computes a unique tag `v<package-version>-build.<run_number>` (e.g.
   `v0.1.0-build.42`) so repeated pushes never collide with an existing release/tag.
4. Publishes a GitHub Release for that tag (auto-generated release notes) with both
   `.exe` files attached as downloadable assets.

To grab the latest desktop build, go to the repository's **Releases** page and download
the installer or portable EXE from the most recent release -- no local build required.
You can also trigger the workflow manually from the **Actions** tab
(`workflow_dispatch`).

## How the protocol works

- Every client message is validated with a zod discriminated union
  (`packages/shared/src/protocol.ts`) before the server acts on it:
  `CREATE_LOBBY`, `JOIN_LOBBY`, `SET_POKEMON`, `REMOVE_POKEMON`, `KICK_PLAYER`,
  `LEAVE_LOBBY`, and `RESTORE_LOBBY_STATE`. The server only ever replies with a `STATE`
  message (full lobby state, plus a `self` identity on create/join/restore) or an
  `ERROR` message.
- `LobbyManager` (`apps/server/src/LobbyManager.ts`) is the single source of truth: every
  player has exactly six `PokemonSlot`s; players can only ever edit their own slots via
  `SET_POKEMON`/`REMOVE_POKEMON`. Kicking is host-only and enforced entirely server-side;
  there is no other host-only action. Every create/join/mutation/leave/host-change is
  mirrored transactionally to a `LobbyRepository` (`apps/server/src/db/`) -- WebSocket
  objects and timers are never persisted, only plain lobby/player/slot data.
- If a player disconnects, they stay in the lobby (marked `connected: false`) for a 60
  second grace period so a flaky connection or app restart can reconnect and resume the
  same identity via `RESTORE_LOBBY_STATE` with their reconnect token. After the grace
  period they're removed permanently (and the host role is handed to another connected
  player if needed). A player can also leave voluntarily via `LEAVE_LOBBY`, which skips
  the grace period entirely. Lobbies with zero players are cleaned up after a few minutes.
- `RESTORE_LOBBY_STATE` also handles the case where the *server itself* lost its
  in-memory state (e.g. it restarted): the client can attach a `snapshot` (the full
  roster of players + their six slots, from its local save) which the server validates
  against the configured max-players-per-lobby and the fixed six-slot-per-player shape,
  then uses to rebuild the lobby. Other players' saved snapshots let their own devices
  later claim their placeholder identity in that rebuilt lobby.
- On startup the server loads every persisted lobby from SQLite (`LobbyManager.
  loadFromRepository()`), so a restart alone (no client snapshot needed) is usually
  enough to recover active lobbies: every player is treated as freshly disconnected
  (since their live socket is necessarily gone) and gets a recomputed remaining
  reconnect-grace window based on when they actually disconnected; anyone whose grace
  had already elapsed is dropped (with host reassignment if needed), and a lobby left
  with zero players is deleted from the database outright.

## Local save & restore

The desktop app persists JSON save files under
`app.getPath('userData')/saves/`. Every save (autosave or manual) is a **full lobby
snapshot**: every player's id/name/host flag and their six `PokemonSlot`s, plus the
server URL, lobby id, and your own reconnect token. Writes are atomic (write to a temp
file, then rename over the target) and validated with zod on every read; a corrupted or
unreadable file is quarantined and the app falls back gracefully instead of crashing.

- **`autosave.json`** is updated automatically (debounced ~2s after any change) and is
  never shown in -- or deletable from -- the manual save list.
- **Manual saves** (`<uuid>.json`) are created on demand via the "Save Now" button in the
  Control Panel, and can be listed, restored, or deleted independently of the autosave
  slot.
- Restoring a save (autosave on cold start, or a manual save from the list) reconnects to
  its server URL and sends `RESTORE_LOBBY_STATE`, including the saved roster snapshot so
  the server can rebuild the lobby if it lost its state -- validated against the
  server's configured player cap. The reconnect token itself never leaves the Electron
  main process; the renderer only ever sees a token-free view of each save file.

## Testing

- `packages/shared`: protocol/pokedex validation tests (vitest).
- `apps/server`: unit tests for `LobbyManager` (lifecycle, slots, configurable max
  players, host permissions/kicking, leave/disconnect/reconnect/host-reassignment with
  fake timers, snapshot-based restore after simulated state loss) plus a real end-to-end
  WebSocket integration test, plus SQLite persistence tests (`tests/db/`): schema
  init/reuse against a real file, full lobby round-trips (players/six slots/host/tokens),
  and `LobbyManager` + `SqliteLobbyRepository` restart scenarios (active lobbies/tokens
  surviving a simulated restart, grace-period reconciliation dropping stale players,
  empty/expired lobby cleanup).
- `apps/desktop`: `SaveStateService` (autosave + manual saves, atomic writes, corruption
  recovery, debounced autosave), `WsClient` (connect/reconnect-with-backoff against a
  real ephemeral ws server), pure restore-message-building logic, and the renderer's
  Zustand reducer.
