import { EventEmitter } from 'node:events';
import WebSocket from 'ws';
import type { ClientMessage, ServerMessage } from '@soullink/shared';

const DEFAULT_RECONNECT_DELAYS_MS = [1000, 2000, 5000, 10_000, 15_000];

export interface WsClientEvents {
  connecting: [];
  open: [];
  message: [ServerMessage];
  close: [];
  error: [Error];
  reconnecting: [attempt: number, delayMs: number];
}

/**
 * The single authoritative WebSocket connection to the SoulLink server,
 * owned entirely by the Electron main process. Renderer windows never talk
 * to the network directly; they go through preload -> ipcMain -> this class.
 * Automatically reconnects with backoff after an unexpected close.
 */
export class WsClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private url: string | null = null;
  private manualClose = false;
  private reconnectAttempt = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;

  constructor(private readonly reconnectDelaysMs: number[] = DEFAULT_RECONNECT_DELAYS_MS) {
    super();
  }

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  get currentUrl(): string | null {
    return this.url;
  }

  connect(url: string): void {
    this.url = url;
    this.manualClose = false;
    this.reconnectAttempt = 0;
    this.clearReconnectTimer();
    // Emitted synchronously, before the socket even starts its handshake, so
    // the UI can show the status tag + Disconnect/Cancel action right away
    // instead of leaving the user stuck on the connection form while a slow
    // or hanging attempt plays out.
    this.emit('connecting');
    this.openSocket();
  }

  disconnect(): void {
    // Once disconnect() is called, no automatic reconnect should ever fire
    // again for this attempt, whether we're mid-handshake, connected, or
    // sitting in the gap between two retry attempts.
    const wasActive = this.url !== null;
    this.manualClose = true;
    this.url = null;
    this.clearReconnectTimer();
    const ws = this.ws;
    this.ws = null;
    ws?.close();
    // If we were in the middle of a retry-wait (no live socket to fire its
    // own 'close' event) the UI would otherwise never learn the connection
    // attempt was cancelled, so emit it ourselves. When there *is* a live
    // socket, its own close handler is guarded (`this.ws !== ws`) and will
    // no-op, avoiding a duplicate emission.
    if (wasActive) this.emit('close');
  }

  send(message: ClientMessage): boolean {
    if (!this.isConnected) return false;
    this.ws!.send(JSON.stringify(message));
    return true;
  }

  dispose(): void {
    this.manualClose = true;
    this.url = null;
    this.clearReconnectTimer();
    this.ws?.terminate();
    this.ws = null;
    this.removeAllListeners();
  }

  private openSocket(): void {
    if (!this.url) return;
    const ws = new WebSocket(this.url);
    this.ws = ws;

    // Every handler below guards against `this.ws !== ws`: once disconnect()
    // or a newer openSocket() call has moved `this.ws` on, events from this
    // now-stale socket (which may arrive asynchronously after we've already
    // moved on) must not affect current state or emit misleading events.
    ws.on('open', () => {
      if (this.ws !== ws) return;
      this.reconnectAttempt = 0;
      this.emit('open');
    });

    ws.on('message', (data) => {
      if (this.ws !== ws) return;
      try {
        const parsed = JSON.parse(data.toString()) as ServerMessage;
        this.emit('message', parsed);
      } catch {
        this.emit('error', new Error('Received a malformed message from the server.'));
      }
    });

    ws.on('close', () => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.emit('close');
      if (!this.manualClose) this.scheduleReconnect();
    });

    ws.on('error', (err) => {
      if (this.ws !== ws) return;
      this.emit('error', err instanceof Error ? err : new Error(String(err)));
    });
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    if (!this.url) return;
    const idx = Math.min(this.reconnectAttempt, this.reconnectDelaysMs.length - 1);
    const delay = this.reconnectDelaysMs[idx];
    this.reconnectAttempt++;
    this.emit('reconnecting', this.reconnectAttempt, delay);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.openSocket();
    }, delay);
    this.reconnectTimer.unref?.();
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}
