import { describe, expect, it } from 'vitest';
import type { LobbyState } from '@soullink/shared';
import { DEFAULT_OVERLAY_SETTINGS, SLOT_COUNT } from '@soullink/shared';
import { reduceWsEvent, type AppState } from './store';

const baseState: AppState = {
  connectionStatus: 'idle',
  error: null,
  lobby: null,
  selfPlayerId: null,
  reconnectInfo: null,
  overlaySettings: DEFAULT_OVERLAY_SETTINGS,
};

const emptySlots = () => Array.from({ length: SLOT_COUNT }, () => ({ pokemonId: null }));

const lobbyState: LobbyState = {
  id: 'ABC123',
  hostId: 'p1',
  players: [{ id: 'p1', name: 'Ash', isHost: true, connected: true, slots: emptySlots() }],
  createdAt: Date.now(),
};

describe('reduceWsEvent', () => {
  it('moves to connecting and clears errors', () => {
    const result = reduceWsEvent({ ...baseState, error: 'boom' }, { kind: 'connecting' });
    expect(result).toEqual({ connectionStatus: 'connecting', error: null });
  });

  it('moves to open and clears reconnect info', () => {
    const result = reduceWsEvent(
      { ...baseState, reconnectInfo: { attempt: 1, delayMs: 500 } },
      { kind: 'open' }
    );
    expect(result).toMatchObject({ connectionStatus: 'open', reconnectInfo: null });
  });

  it('tracks reconnect attempts', () => {
    const result = reduceWsEvent(baseState, { kind: 'reconnecting', attempt: 2, delayMs: 2000 });
    expect(result).toEqual({
      connectionStatus: 'reconnecting',
      reconnectInfo: { attempt: 2, delayMs: 2000 },
    });
  });

  it('moves to closed and clears stale reconnect info (e.g. after cancelling a retry)', () => {
    const result = reduceWsEvent(
      { ...baseState, connectionStatus: 'reconnecting', reconnectInfo: { attempt: 3, delayMs: 5000 } },
      { kind: 'close' }
    );
    expect(result).toEqual({ connectionStatus: 'closed', reconnectInfo: null });
  });

  it('records client errors without touching connection status', () => {
    const result = reduceWsEvent(baseState, { kind: 'client-error', message: 'oops' });
    expect(result).toEqual({ error: 'oops' });
  });

  it('applies a STATE message with self identity', () => {
    const result = reduceWsEvent(baseState, {
      kind: 'server-message',
      message: { type: 'STATE', state: lobbyState, self: { playerId: 'p1', token: 't1' } },
    });
    expect(result).toEqual({ lobby: lobbyState, selfPlayerId: 'p1', error: null });
  });

  it('applies a STATE message without self identity (a broadcast update)', () => {
    const result = reduceWsEvent(baseState, {
      kind: 'server-message',
      message: { type: 'STATE', state: lobbyState },
    });
    expect(result).toEqual({ lobby: lobbyState, error: null });
  });

  it('surfaces a server error message', () => {
    const result = reduceWsEvent(baseState, {
      kind: 'server-message',
      message: { type: 'ERROR', code: 'NOT_HOST', message: 'nope' },
    });
    expect(result).toEqual({ error: 'nope' });
  });

  it('clears the lobby and self identity on LEFT_LOBBY without touching connectionStatus', () => {
    const connectedWithLobby: AppState = {
      ...baseState,
      connectionStatus: 'open',
      lobby: lobbyState,
      selfPlayerId: 'p1',
      error: 'stale error',
    };
    const result = reduceWsEvent(connectedWithLobby, {
      kind: 'server-message',
      message: { type: 'LEFT_LOBBY' },
    });
    expect(result).toEqual({ lobby: null, selfPlayerId: null, error: null });
    expect(result.connectionStatus).toBeUndefined();
  });

  it('applies an overlay-settings broadcast', () => {
    const settings = { position: 'top-left' as const, scale: 1.5, tooltipsEnabled: true, tooltipLanguage: 'de' as const };
    const result = reduceWsEvent(baseState, { kind: 'overlay-settings', settings });
    expect(result).toEqual({ overlaySettings: settings });
  });
});
