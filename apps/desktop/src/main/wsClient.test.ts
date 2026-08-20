import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { WebSocketServer } from 'ws';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { WsClient } from './wsClient';

describe('WsClient', () => {
  let httpServer: HttpServer;
  let wss: WebSocketServer;
  let url: string;

  beforeEach(async () => {
    httpServer = createServer();
    wss = new WebSocketServer({ server: httpServer });
    await new Promise<void>((resolve) => httpServer.listen(0, resolve));
    const port = (httpServer.address() as AddressInfo).port;
    url = `ws://127.0.0.1:${port}`;
  });

  afterEach(async () => {
    wss.close();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  });

  it('emits open and can send/receive messages', async () => {
    wss.on('connection', (ws) => {
      ws.on('message', (data) => ws.send(data.toString()));
    });

    const client = new WsClient();
    const opened = new Promise<void>((resolve) => client.once('open', () => resolve()));
    client.connect(url);
    await opened;

    const messageReceived = new Promise((resolve) => client.once('message', resolve));
    client.send({ type: 'LEAVE_LOBBY' });
    const msg = await messageReceived;
    expect(msg).toEqual({ type: 'LEAVE_LOBBY' });

    client.dispose();
  });

  it('does not reconnect after a manual disconnect', async () => {
    const client = new WsClient([20, 20]);
    const opened = new Promise<void>((resolve) => client.once('open', () => resolve()));
    client.connect(url);
    await opened;

    client.disconnect();
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(client.isConnected).toBe(false);
    client.dispose();
  });

  it('reconnects automatically after the server drops the connection', async () => {
    let connectionCount = 0;
    wss.on('connection', (ws) => {
      connectionCount++;
      if (connectionCount === 1) {
        ws.close();
      }
    });

    const client = new WsClient([20, 20, 20]);
    let openCount = 0;
    const secondOpen = new Promise<void>((resolve) => {
      client.on('open', () => {
        openCount++;
        if (openCount === 2) resolve();
      });
    });
    client.connect(url);
    await secondOpen;

    expect(openCount).toBe(2);
    expect(client.isConnected).toBe(true);
    client.dispose();
  }, 10_000);

  it('reports isConnected false before connecting', () => {
    const client = new WsClient();
    expect(client.isConnected).toBe(false);
    client.dispose();
  });
});
