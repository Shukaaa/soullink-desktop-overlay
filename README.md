> !!! Vibecoding Alert; Just wanted to make this overlay as fast as possible to use it with my friends :)!

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
packages/shared     Shared protocol types, zod validation, error codes, and a static Gen I-IV pokedex
apps/server          Authoritative WebSocket server
apps/desktop         Electron + Vite + React desktop client
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
