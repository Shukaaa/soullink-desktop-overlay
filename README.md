> !!! Vibecoding Alert; Just wanted to make this overlay as fast as possible to use it with my friends :)!

# SoulLink Overlay

A local, self-hosted multiplayer companion app for **SoulLink Nuzlocke** challenges. Run
a small authoritative server, connect an Electron desktop client per player, and get a
transparent, click-through overlay showing every player's current team as six sprite
slots -- perfect for streaming or just keeping track during co-op play.

Every player has exactly **six `PokemonSlot`s** (one per team slot). There is no separate
route/Encounter/SoulLink entity: a "SoulLink" is simply the same slot index lined up
across every player, computed purely by position wherever it's displayed.

The permanent lobby admin selects the Pokémon game version. The matching shared progress
template (for example, eight Orden in Kanto or four Große Prüfungen in Alola)
shows localized badge names and level caps in the control panel and overlay.
Caps use the highest level on the corresponding Gym Leader's main-story team
(or the Kahuna's Great Trial team in Alola), a common Nuzlocke rule rather than
an official universal standard. Paldea's caps follow the recommended Gym order;
those Gyms can be challenged in any order. Progress is autosaved by the server,
and changing the game version resets Orden progress. Black 2/White 2 caps use
Normal Mode; Easy and Challenge Modes have different team levels.

## Monorepo layout

```
packages/shared     Shared protocol types, zod validation, error codes, and a static Gen I-V pokedex
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

```powershell
Copy-Item apps/server/.env.example apps/server/.env
# Edit apps/server/.env and enter your Discord application credentials.
npm.cmd run dev:server      # tsx watch, loads apps/server/.env, listens on PORT (default 8787)
# or, after `npm run build`:
node --env-file=apps/server/.env apps/server/dist/index.js
```

The server exposes a WebSocket endpoint, Discord OAuth endpoints, and a `GET /health`
check. Set up a Discord application and register
`https://<your-server>/auth/discord/callback` as an OAuth2 redirect URI. Configure
`DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, and `DISCORD_REDIRECT_URI` on the server;
the secret stays server-side. Players sign in through Discord and their Discord username
is used as their in-lobby name. Remote desktop connections must use `wss://`; entering an
`https://` server address automatically converts it to `wss://`. Local development may use
`ws://localhost`. The maximum number of connected players per lobby is
configurable via `MAX_PLAYERS_PER_LOBBY` (default 4).

The server is authoritative for lobby data. SQLite stores Discord identities and sessions,
permanent lobby ownership, the player roster and Pokémon slots, game version, and Orden
progress. Owned lobbies and departed players stay saved across disconnects and server
restarts until the owner deletes a lobby. Each desktop app encrypts its Discord session
token with Windows secure storage; signing in again on another device recovers ownership
through the same Discord account. Configure the SQLite file with `DB_PATH` (default
`./data/soullink.sqlite`, relative to the process's working directory); mount persistent
storage in production so both sessions and lobby state survive redeploys. See
[`.env.example`](apps/server/.env.example) and "Deploying to Railway" below.
