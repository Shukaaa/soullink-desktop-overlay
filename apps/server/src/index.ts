import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { DEFAULT_MAX_PLAYERS_PER_LOBBY } from '@soullink/shared';
import { LobbyManager } from './LobbyManager';
import { attachLobbyProtocol, createWebSocketServer } from './wsServer';
import { logger } from './logger';
import { SqliteLobbyRepository } from './db/sqliteLobbyRepository';
import { DiscordOAuthService } from './discordOAuth';

const PORT = Number(process.env.PORT ?? 8787);
const MAX_PLAYERS_PER_LOBBY = Number(process.env.MAX_PLAYERS_PER_LOBBY ?? DEFAULT_MAX_PLAYERS_PER_LOBBY);
// See README "Deploying to Railway" for why this must point at a mounted
// Railway Volume, and why exactly one server instance may run against it.
const DB_PATH = resolve(process.env.DB_PATH ?? './data/soullink.sqlite');

const repository = new SqliteLobbyRepository(DB_PATH);
const lobbyManager = new LobbyManager({ maxPlayersPerLobby: MAX_PLAYERS_PER_LOBBY, repository });
lobbyManager.loadFromRepository();
logger.info(`Loaded ${lobbyManager.lobbyCount} lobbies from ${DB_PATH}`);

const discordOAuth = new DiscordOAuthService(repository, {
  clientId: process.env.DISCORD_CLIENT_ID,
  clientSecret: process.env.DISCORD_CLIENT_SECRET,
  redirectUri: process.env.DISCORD_REDIRECT_URI,
});

const httpServer = createServer((req, res) => {
  if (discordOAuth.handles(req)) {
    void discordOAuth.handleRequest(req, res).catch((error: unknown) => {
      logger.error('Discord OAuth request failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify({ error: 'Discord login failed.' }));
      } else {
        res.end();
      }
    });
    return;
  }
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok' }));
    return;
  }
  res.writeHead(404);
  res.end();
});

const wss = createWebSocketServer(httpServer);
const stopHeartbeat = attachLobbyProtocol(wss, lobbyManager);

httpServer.listen(PORT, () => {
  logger.info(`SoulLink server listening on port ${PORT} (max ${MAX_PLAYERS_PER_LOBBY} players/lobby)`);
});

function shutdown(signal: string): void {
  logger.info(`Received ${signal}, shutting down`);
  stopHeartbeat();
  lobbyManager.shutdown();
  wss.close();
  httpServer.close(() => process.exit(0));
  // Force exit if something keeps the event loop alive.
  setTimeout(() => process.exit(0), 2000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
