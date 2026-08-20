import type { Server as HttpServer } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import { ErrorCode, ProtocolError, safeParseClientMessage } from '@soullink/shared';
import { LobbyManager } from './LobbyManager';
import { logger } from './logger';

const HEARTBEAT_INTERVAL_MS = 30_000;

interface TrackedSocket extends WebSocket {
  isAlive?: boolean;
}

/**
 * Wires an existing `ws` WebSocketServer to a LobbyManager: parses/validates
 * incoming JSON messages, dispatches them, and translates thrown
 * ProtocolErrors into `error` frames sent back to the offending client.
 */
export function attachLobbyProtocol(wss: WebSocketServer, lobbyManager: LobbyManager): () => void {
  const heartbeat = setInterval(() => {
    for (const raw of wss.clients) {
      const ws = raw as TrackedSocket;
      if (ws.isAlive === false) {
        ws.terminate();
        continue;
      }
      ws.isAlive = false;
      ws.ping();
    }
  }, HEARTBEAT_INTERVAL_MS);
  heartbeat.unref?.();

  wss.on('connection', (rawWs) => {
    const ws = rawWs as TrackedSocket;
    ws.isAlive = true;
    ws.on('pong', () => {
      ws.isAlive = true;
    });

    ws.on('message', (data) => {
      handleMessage(ws, data.toString(), lobbyManager);
    });

    ws.on('close', () => {
      lobbyManager.handleDisconnect(ws);
    });

    ws.on('error', (err) => {
      logger.warn('websocket error', { message: (err as Error).message });
    });
  });

  return () => clearInterval(heartbeat);
}

function handleMessage(ws: WebSocket, raw: string, lobbyManager: LobbyManager): void {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    sendError(ws, ErrorCode.INVALID_MESSAGE, 'Message was not valid JSON.');
    return;
  }

  const parsed = safeParseClientMessage(json);
  if (!parsed.success) {
    sendError(ws, ErrorCode.INVALID_MESSAGE, 'Message failed validation.');
    return;
  }

  const message = parsed.data;
  try {
    switch (message.type) {
      case 'CREATE_LOBBY': {
        const result = lobbyManager.createLobby(ws, message.name);
        send(ws, { type: 'STATE', state: result.state, self: { playerId: result.playerId, token: result.token } });
        break;
      }
      case 'JOIN_LOBBY': {
        const result = lobbyManager.joinLobby(ws, message.lobbyId, message.name);
        send(ws, { type: 'STATE', state: result.state, self: { playerId: result.playerId, token: result.token } });
        break;
      }
      case 'RESTORE_LOBBY_STATE': {
        const result = lobbyManager.restoreLobbyState(ws, message);
        send(ws, { type: 'STATE', state: result.state, self: { playerId: result.playerId, token: result.token } });
        break;
      }
      case 'SET_POKEMON':
        lobbyManager.setPokemon(ws, message.slotIndex, message.pokemonId);
        break;
      case 'REMOVE_POKEMON':
        lobbyManager.removePokemon(ws, message.slotIndex);
        break;
      case 'KICK_PLAYER':
        lobbyManager.kickPlayer(ws, message.playerId);
        break;
      case 'LEAVE_LOBBY':
        lobbyManager.leaveLobby(ws);
        break;
    }
  } catch (err) {
    if (err instanceof ProtocolError) {
      sendError(ws, err.code, err.message);
    } else {
      logger.error('unexpected error handling message', {
        type: message.type,
        error: (err as Error).message,
      });
      sendError(ws, ErrorCode.INTERNAL_ERROR, 'Internal server error.');
    }
  }
}

function send(ws: WebSocket, message: unknown): void {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

function sendError(ws: WebSocket, code: ErrorCode, message: string): void {
  send(ws, { type: 'ERROR', code, message });
}

export function createWebSocketServer(httpServer: HttpServer): WebSocketServer {
  return new WebSocketServer({ server: httpServer });
}
