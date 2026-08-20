import type { WebSocket } from 'ws';

/**
 * Minimal stand-in for a `ws` WebSocket used to unit test LobbyManager
 * without opening real sockets. Captures every JSON message sent to it so
 * assertions can inspect exactly what the client would have received.
 */
export class FakeSocket {
  readonly OPEN = 1 as const;
  readyState: number = 1;
  sent: unknown[] = [];
  closed = false;

  send(data: string): void {
    this.sent.push(JSON.parse(data));
  }

  close(): void {
    this.closed = true;
    this.readyState = 3;
  }

  lastMessage<T = unknown>(): T | undefined {
    return this.sent[this.sent.length - 1] as T | undefined;
  }
}

export function fakeWs(): WebSocket & FakeSocket {
  return new FakeSocket() as unknown as WebSocket & FakeSocket;
}
