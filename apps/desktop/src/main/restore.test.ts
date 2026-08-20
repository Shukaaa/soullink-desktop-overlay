import { describe, expect, it } from 'vitest';
import type { LobbyState } from '@soullink/shared';
import { SLOT_COUNT } from '@soullink/shared';
import { emptySaveFile } from './saveState/schema';
import { buildRestoreMessage, decideOpenMessage, deriveSaveLobbyFields } from './restore';
import type { RestoreLobbyStateMessage } from '@soullink/shared';

function emptySlots(pokemonId: number | null = null) {
  return Array.from({ length: SLOT_COUNT }, () => ({ pokemonId }));
}

describe('buildRestoreMessage', () => {
  it('returns null when the save never joined a lobby', () => {
    const save = emptySaveFile('autosave', 'Autosave');
    expect(buildRestoreMessage(save)).toBeNull();
  });

  it('builds a message without a snapshot when there is no known roster', () => {
    const save = {
      ...emptySaveFile('autosave', 'Autosave'),
      lobbyId: 'ABC123',
      selfPlayerId: 'p1',
      selfToken: 'tok1',
    };
    const message = buildRestoreMessage(save);
    expect(message).toEqual({
      type: 'RESTORE_LOBBY_STATE',
      lobbyId: 'ABC123',
      playerId: 'p1',
      token: 'tok1',
      snapshot: undefined,
    });
  });

  it('attaches a full-roster snapshot when players are known', () => {
    const save = {
      ...emptySaveFile('autosave', 'Autosave'),
      lobbyId: 'ABC123',
      hostId: 'p1',
      selfPlayerId: 'p1',
      selfToken: 'tok1',
      players: [
        { id: 'p1', name: 'Ash', isHost: true, slots: emptySlots(25) },
        { id: 'p2', name: 'Misty', isHost: false, slots: emptySlots() },
      ],
    };
    const message = buildRestoreMessage(save);
    expect(message?.snapshot).toEqual({
      hostId: 'p1',
      players: [
        { id: 'p1', name: 'Ash', isHost: true, slots: emptySlots(25) },
        { id: 'p2', name: 'Misty', isHost: false, slots: emptySlots() },
      ],
    });
  });
});

describe('deriveSaveLobbyFields', () => {
  it('maps a LobbyState into the save-file player shape', () => {
    const state: LobbyState = {
      id: 'ABC123',
      hostId: 'p1',
      createdAt: Date.now(),
      players: [
        { id: 'p1', name: 'Ash', isHost: true, connected: true, slots: emptySlots(25) },
        { id: 'p2', name: 'Misty', isHost: false, connected: true, slots: emptySlots() },
      ],
    };
    expect(deriveSaveLobbyFields(state, 'p1')).toEqual({
      lobbyId: 'ABC123',
      hostId: 'p1',
      selfPlayerId: 'p1',
      players: [
        { id: 'p1', name: 'Ash', isHost: true, slots: emptySlots(25) },
        { id: 'p2', name: 'Misty', isHost: false, slots: emptySlots() },
      ],
    });
  });
});

describe('decideOpenMessage', () => {
  const noSession = { lobbyId: null, playerId: null, token: null };

  it('sends nothing on a cold start with no in-memory session and no pending restore', () => {
    expect(decideOpenMessage(null, noSession)).toBeNull();
  });

  it('never falls back to an autosave-derived restore on a cold start', () => {
    // Regression guard: even a fully-populated-looking session-less start
    // (simulating "an autosave exists") must not auto-restore.
    expect(decideOpenMessage(null, noSession)).toBeNull();
  });

  it('prefers an explicit pending restore over the in-memory session', () => {
    const pending: RestoreLobbyStateMessage = {
      type: 'RESTORE_LOBBY_STATE',
      lobbyId: 'FROM-SAVE',
      playerId: 'p9',
      token: 'tok9',
    };
    const session = { lobbyId: 'LIVE', playerId: 'p1', token: 'tok1' };
    expect(decideOpenMessage(pending, session)).toEqual(pending);
  });

  it('sends a plain reconnect for a live in-memory session when there is no pending restore', () => {
    const session = { lobbyId: 'LIVE', playerId: 'p1', token: 'tok1' };
    expect(decideOpenMessage(null, session)).toEqual({
      type: 'RESTORE_LOBBY_STATE',
      lobbyId: 'LIVE',
      playerId: 'p1',
      token: 'tok1',
    });
  });

  it('sends nothing when the in-memory session is only partially populated', () => {
    expect(decideOpenMessage(null, { lobbyId: 'LIVE', playerId: null, token: 'tok1' })).toBeNull();
  });
});
