import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { LobbyManager } from '../src/LobbyManager';
import { NullLobbyRepository } from '../src/db/lobbyRepository';
import type { DiscordUser } from '../src/db/lobbyRepository';
import { attachLobbyProtocol, createWebSocketServer } from '../src/wsServer';

const ASH_TOKEN = 'ash-session-token-012345678901234567890123';
const MISTY_TOKEN = 'misty-session-token-0123456789012345678901';

class IntegrationRepository extends NullLobbyRepository {
  private readonly sessions = new Map<string, DiscordUser>();

  saveDiscordSession(user: DiscordUser, tokenHash: string): void {
    this.sessions.set(tokenHash, user);
  }

  findDiscordUserByTokenHash(tokenHash: string): DiscordUser | null {
    return this.sessions.get(tokenHash) ?? null;
  }
}

/** End-to-end smoke test exercising the real ws wiring, not just LobbyManager. */
describe('ws server integration', () => {
  let httpServer: HttpServer;
  let stopHeartbeat: () => void;
  let url: string;
  let lobbyManager: LobbyManager;
  let repository: IntegrationRepository;

  beforeEach(async () => {
    httpServer = createServer();
    repository = new IntegrationRepository();
    repository.saveDiscordSession(
      { id: 'discord-ash', username: 'Ash' },
      createHash('sha256').update(ASH_TOKEN).digest('hex')
    );
    repository.saveDiscordSession(
      { id: 'discord-misty', username: 'Misty' },
      createHash('sha256').update(MISTY_TOKEN).digest('hex')
    );
    lobbyManager = new LobbyManager({ repository });
    const wss = createWebSocketServer(httpServer);
    stopHeartbeat = attachLobbyProtocol(wss, lobbyManager);
    await new Promise<void>((resolve) => httpServer.listen(0, resolve));
    const port = (httpServer.address() as AddressInfo).port;
    url = `ws://127.0.0.1:${port}`;
  });

  afterEach(async () => {
    stopHeartbeat();
    lobbyManager.shutdown();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  });

  function connect(token = ASH_TOKEN): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      let authenticated = false;
      let ownedLobbiesReceived = false;
      ws.on('message', (data) => {
        const message = JSON.parse(data.toString());
        if (message.type === 'AUTHENTICATED') authenticated = true;
        if (message.type === 'OWNED_LOBBIES') ownedLobbiesReceived = true;
        if (authenticated && ownedLobbiesReceived) resolve(ws);
      });
      ws.once('open', () => {
        ws.send(JSON.stringify({ type: 'AUTHENTICATE', token }));
      });
      ws.once('error', reject);
    });
  }

  function nextMessage(ws: WebSocket): Promise<any> {
    return new Promise((resolve) => {
      ws.once('message', (data) => resolve(JSON.parse(data.toString())));
    });
  }

  function nextState(ws: WebSocket): Promise<any> {
    return new Promise((resolve) => {
      const listener = (data: WebSocket.RawData) => {
        const message = JSON.parse(data.toString());
        if (message.type !== 'STATE') return;
        ws.off('message', listener);
        resolve(message);
      };
      ws.on('message', listener);
    });
  }

  it('creates a lobby and returns a STATE message with self identity over a real socket', async () => {
    const ws = await connect();
    const welcome = nextState(ws);
    ws.send(JSON.stringify({ type: 'CREATE_LOBBY', name: 'forged-name' }));
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

  it('rejects lobby actions before Discord authentication', async () => {
    const ws = await new Promise<WebSocket>((resolve, reject) => {
      const socket = new WebSocket(url);
      socket.once('open', () => resolve(socket));
      socket.once('error', reject);
    });
    const errorMsg = nextMessage(ws);
    ws.send(JSON.stringify({ type: 'CREATE_LOBBY', name: 'forged-name' }));
    expect(await errorMsg).toMatchObject({ type: 'ERROR', code: 'NOT_AUTHENTICATED' });
    ws.close();
  });

  it('notifies the host with an updated STATE containing both players when a second player joins', async () => {
    const hostWs = await connect();
    const hostWelcome = nextState(hostWs);
    hostWs.send(JSON.stringify({ type: 'CREATE_LOBBY', name: 'Ash' }));
    const hostMsg = await hostWelcome;
    const lobbyId = hostMsg.state.id;
    expect(hostMsg.state.players).toHaveLength(1);

    const hostJoinUpdate = nextState(hostWs);

    const memberWs = await connect(MISTY_TOKEN);
    const memberWelcome = nextState(memberWs);
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
    const hostWelcome = nextState(hostWs);
    hostWs.send(JSON.stringify({ type: 'CREATE_LOBBY', name: 'Ash' }));
    const hostMsg = await hostWelcome;
    const lobbyId = hostMsg.state.id;

    const memberWs = await connect(MISTY_TOKEN);
    const memberWelcome = nextState(memberWs);
    memberWs.send(JSON.stringify({ type: 'JOIN_LOBBY', lobbyId, name: 'Misty' }));
    await memberWelcome;

    const hostUpdate = nextState(hostWs);
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
    const hostWelcome = nextState(hostWs);
    hostWs.send(JSON.stringify({ type: 'CREATE_LOBBY', name: 'Ash' }));
    const hostMsg = await hostWelcome;
    const lobbyId = hostMsg.state.id;

    const memberWs = await connect(MISTY_TOKEN);
    const memberWelcome = nextState(memberWs);
    memberWs.send(JSON.stringify({ type: 'JOIN_LOBBY', lobbyId, name: 'Misty' }));
    await memberWelcome;

    const hostUpdate = nextState(hostWs);
    const memberLeftConfirmation = nextMessage(memberWs);
    memberWs.send(JSON.stringify({ type: 'LEAVE_LOBBY' }));
    const update = await hostUpdate;
    expect(update.state.players).toHaveLength(2);
    expect(update.state.players.find((p: { name: string }) => p.name === 'Misty').connected).toBe(false);

    const leftMsg = await memberLeftConfirmation;
    expect(leftMsg).toEqual({ type: 'LEFT_LOBBY' });

    hostWs.close();
    memberWs.close();
  });
});
