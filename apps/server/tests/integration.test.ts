import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { LobbyManager } from '../src/LobbyManager';
import { attachLobbyProtocol, createWebSocketServer } from '../src/wsServer';

/** End-to-end smoke test exercising the real ws wiring, not just LobbyManager. */
describe('ws server integration', () => {
  let httpServer: HttpServer;
  let stopHeartbeat: () => void;
  let url: string;

  beforeEach(async () => {
    httpServer = createServer();
    const lobbyManager = new LobbyManager();
    const wss = createWebSocketServer(httpServer);
    stopHeartbeat = attachLobbyProtocol(wss, lobbyManager);
    await new Promise<void>((resolve) => httpServer.listen(0, resolve));
    const port = (httpServer.address() as AddressInfo).port;
    url = `ws://127.0.0.1:${port}`;
  });

  afterEach(async () => {
    stopHeartbeat();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  });

  function connect(): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      ws.once('open', () => resolve(ws));
      ws.once('error', reject);
    });
  }

  function nextMessage(ws: WebSocket): Promise<any> {
    return new Promise((resolve) => {
      ws.once('message', (data) => resolve(JSON.parse(data.toString())));
    });
  }

  it('creates a lobby and returns a STATE message with self identity over a real socket', async () => {
    const ws = await connect();
    const welcome = nextMessage(ws);
    ws.send(JSON.stringify({ type: 'CREATE_LOBBY', name: 'Ash' }));
    const msg = await welcome;
    expect(msg.type).toBe('STATE');
    expect(msg.self.playerId).toBeTruthy();
    expect(msg.state.players[0].name).toBe('Ash');
    expect(msg.state.players[0].slots).toHaveLength(6);
    ws.close();
  });

  it('sends an error frame for invalid JSON', async () => {
    const ws = await connect();
    const errorMsg = nextMessage(ws);
    ws.send('not json{{{');
    const msg = await errorMsg;
    expect(msg.type).toBe('ERROR');
    expect(msg.code).toBe('INVALID_MESSAGE');
    ws.close();
  });

  it('notifies the host with an updated STATE containing both players when a second player joins', async () => {
    const hostWs = await connect();
    const hostWelcome = nextMessage(hostWs);
    hostWs.send(JSON.stringify({ type: 'CREATE_LOBBY', name: 'Ash' }));
    const hostMsg = await hostWelcome;
    const lobbyId = hostMsg.state.id;
    expect(hostMsg.state.players).toHaveLength(1);

    const hostJoinUpdate = nextMessage(hostWs);

    const memberWs = await connect();
    const memberWelcome = nextMessage(memberWs);
    memberWs.send(JSON.stringify({ type: 'JOIN_LOBBY', lobbyId, name: 'Misty' }));

    const [hostUpdate, memberMsg] = await Promise.all([hostJoinUpdate, memberWelcome]);

    expect(hostUpdate.type).toBe('STATE');
    expect(hostUpdate.state.players).toHaveLength(2);
    const names = hostUpdate.state.players.map((p: { name: string }) => p.name).sort();
    expect(names).toEqual(['Ash', 'Misty']);

    expect(memberMsg.type).toBe('STATE');
    expect(memberMsg.state.players).toHaveLength(2);
    expect(memberMsg.self.playerId).toBeTruthy();

    hostWs.close();
    memberWs.close();
  });

  it('propagates a STATE update to a second connected client when a Pokemon slot is set', async () => {
    const hostWs = await connect();
    const hostWelcome = nextMessage(hostWs);
    hostWs.send(JSON.stringify({ type: 'CREATE_LOBBY', name: 'Ash' }));
    const hostMsg = await hostWelcome;
    const lobbyId = hostMsg.state.id;

    const memberWs = await connect();
    const memberWelcome = nextMessage(memberWs);
    memberWs.send(JSON.stringify({ type: 'JOIN_LOBBY', lobbyId, name: 'Misty' }));
    await memberWelcome;

    const hostUpdate = nextMessage(hostWs);
    memberWs.send(JSON.stringify({ type: 'SET_POKEMON', slotIndex: 0, pokemonId: 1 }));
    const update = await hostUpdate;
    expect(update.type).toBe('STATE');
    const memberPlayer = update.state.players.find((p: { name: string }) => p.name === 'Misty');
    expect(memberPlayer.slots[0]).toEqual({ pokemonId: 1 });

    hostWs.close();
    memberWs.close();
  });

  it('lets a player leave the lobby via LEAVE_LOBBY', async () => {
    const hostWs = await connect();
    const hostWelcome = nextMessage(hostWs);
    hostWs.send(JSON.stringify({ type: 'CREATE_LOBBY', name: 'Ash' }));
    const hostMsg = await hostWelcome;
    const lobbyId = hostMsg.state.id;

    const memberWs = await connect();
    const memberWelcome = nextMessage(memberWs);
    memberWs.send(JSON.stringify({ type: 'JOIN_LOBBY', lobbyId, name: 'Misty' }));
    await memberWelcome;

    const hostUpdate = nextMessage(hostWs);
    const memberLeftConfirmation = nextMessage(memberWs);
    memberWs.send(JSON.stringify({ type: 'LEAVE_LOBBY' }));
    const update = await hostUpdate;
    expect(update.state.players).toHaveLength(1);

    const leftMsg = await memberLeftConfirmation;
    expect(leftMsg).toEqual({ type: 'LEFT_LOBBY' });

    hostWs.close();
    memberWs.close();
  });
});
