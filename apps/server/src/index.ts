import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { DEFAULT_MAX_PLAYERS_PER_LOBBY } from '@soullink/shared';
import { LobbyManager } from './LobbyManager';
import { attachLobbyProtocol, createWebSocketServer } from './wsServer';
import { logger } from './logger';
import { SqliteLobbyRepository } from './db/sqliteLobbyRepository';

const PORT = Number(process.env.PORT ?? 8787);
const MAX_PLAYERS_PER_LOBBY = Number(process.env.MAX_PLAYERS_PER_LOBBY ?? DEFAULT_MAX_PLAYERS_PER_LOBBY);
// See README "Deploying to Railway" for why this must point at a mounted
// Railway Volume, and why exactly one server instance may run against it.
const DB_PATH = resolve(process.env.DB_PATH ?? './data/soullink.sqlite');

const httpServer = createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok' }));
    return;
  }
  res.writeHead(404);
  res.end();
});

const repository = new SqliteLobbyRepository(DB_PATH);
const lobbyManager = new LobbyManager({ maxPlayersPerLobby: MAX_PLAYERS_PER_LOBBY, repository });
lobbyManager.loadFromRepository();
logger.info(`Loaded ${lobbyManager.lobbyCount} lobbies from ${DB_PATH}`);

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
