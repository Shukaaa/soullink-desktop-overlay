import { EventEmitter } from 'node:events';
import WebSocket from 'ws';
import type { ClientMessage, ServerMessage } from '@soullink/shared';

const DEFAULT_RECONNECT_DELAYS_MS = [1000, 2000, 5000, 10_000, 15_000];

export interface WsClientEvents {
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
    this.openSocket();
  }

  disconnect(): void {
    this.manualClose = true;
    this.clearReconnectTimer();
    this.ws?.close();
    this.ws = null;
  }

  send(message: ClientMessage): boolean {
    if (!this.isConnected) return false;
    this.ws!.send(JSON.stringify(message));
    return true;
  }

  dispose(): void {
    this.manualClose = true;
    this.clearReconnectTimer();
    this.ws?.terminate();
    this.ws = null;
    this.removeAllListeners();
  }

  private openSocket(): void {
    if (!this.url) return;
    const ws = new WebSocket(this.url);
    this.ws = ws;

    ws.on('open', () => {
      this.reconnectAttempt = 0;
      this.emit('open');
    });

    ws.on('message', (data) => {
      try {
        const parsed = JSON.parse(data.toString()) as ServerMessage;
        this.emit('message', parsed);
      } catch {
        this.emit('error', new Error('Received a malformed message from the server.'));
      }
    });

    ws.on('close', () => {
      this.emit('close');
      if (!this.manualClose) this.scheduleReconnect();
    });

    ws.on('error', (err) => {
      this.emit('error', err instanceof Error ? err : new Error(String(err)));
    });
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
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
