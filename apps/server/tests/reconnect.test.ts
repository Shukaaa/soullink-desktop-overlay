import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LobbyState } from '@soullink/shared';
import { RECONNECT_GRACE_MS, SLOT_COUNT } from '@soullink/shared';
import { LobbyManager } from '../src/LobbyManager';
import { fakeWs } from './testUtils';

describe('LobbyManager - disconnect and reconnect', () => {
  let manager: LobbyManager;

  beforeEach(() => {
    vi.useFakeTimers();
    manager = new LobbyManager();
  });

  afterEach(() => {
    manager.shutdown();
    vi.useRealTimers();
  });

  it('marks a player disconnected but keeps them in the lobby during the grace period', () => {
    const hostWs = fakeWs();
    const { lobbyId } = manager.createLobby(hostWs, 'Ash');
    const memberWs = fakeWs();
    const { playerId: memberId } = manager.joinLobby(memberWs, lobbyId, 'Misty');

    manager.handleDisconnect(memberWs);
    const state = hostWs.lastMessage<{ state: LobbyState }>()!.state;
    const member = state.players.find((p) => p.id === memberId);
    expect(member).toBeDefined();
    expect(member!.connected).toBe(false);
  });

  it('resumes identity via RESTORE_LOBBY_STATE within the grace period', () => {
    const hostWs = fakeWs();
    const { lobbyId } = manager.createLobby(hostWs, 'Ash');
    const memberWs = fakeWs();
    const { playerId: memberId, token } = manager.joinLobby(memberWs, lobbyId, 'Misty');
    manager.setPokemon(memberWs, 0, 1);

    manager.handleDisconnect(memberWs);
    vi.advanceTimersByTime(RECONNECT_GRACE_MS / 2);

    const newWs = fakeWs();
    const result = manager.restoreLobbyState(newWs, {
      type: 'RESTORE_LOBBY_STATE',
      lobbyId,
      playerId: memberId,
      token,
    });
    expect(result.playerId).toBe(memberId);
    const member = result.state.players.find((p) => p.id === memberId);
    expect(member!.connected).toBe(true);
    // Slot data survived the disconnect.
    expect(member!.slots[0]).toEqual({ pokemonId: 1 });
  });

  it('rejects RESTORE_LOBBY_STATE with an incorrect token and no snapshot', () => {
    const hostWs = fakeWs();
    const { lobbyId } = manager.createLobby(hostWs, 'Ash');
    const memberWs = fakeWs();
    const { playerId: memberId } = manager.joinLobby(memberWs, lobbyId, 'Misty');
    manager.handleDisconnect(memberWs);

    expect(() =>
      manager.restoreLobbyState(fakeWs(), {
        type: 'RESTORE_LOBBY_STATE',
        lobbyId,
        playerId: memberId,
        token: 'wrong-token',
      })
    ).toThrowError(/invalid/i);
  });

  it('permanently removes a player once the grace period elapses without reconnect', () => {
    const hostWs = fakeWs();
    const { lobbyId } = manager.createLobby(hostWs, 'Ash');
    const memberWs = fakeWs();
    const { playerId: memberId, token } = manager.joinLobby(memberWs, lobbyId, 'Misty');

    manager.handleDisconnect(memberWs);
    vi.advanceTimersByTime(RECONNECT_GRACE_MS + 1000);

    const state = hostWs.lastMessage<{ state: LobbyState }>()!.state;
    expect(state.players.find((p) => p.id === memberId)).toBeUndefined();
    expect(() =>
      manager.restoreLobbyState(fakeWs(), {
        type: 'RESTORE_LOBBY_STATE',
        lobbyId,
        playerId: memberId,
        token,
      })
    ).toThrowError(/player no longer exists/i);
  });

  it('reassigns host to the next connected player if the host disconnects and grace expires', () => {
    const hostWs = fakeWs();
    const { lobbyId, playerId: hostId } = manager.createLobby(hostWs, 'Ash');
    const memberWs = fakeWs();
    const { playerId: memberId } = manager.joinLobby(memberWs, lobbyId, 'Misty');

    manager.handleDisconnect(hostWs);
    vi.advanceTimersByTime(RECONNECT_GRACE_MS + 1000);

    const state = memberWs.lastMessage<{ state: LobbyState }>()!.state;
    expect(state.hostId).toBe(memberId);
    expect(state.players.find((p) => p.id === memberId)?.isHost).toBe(true);
    expect(state.players.find((p) => p.id === hostId)).toBeUndefined();
  });

  it('deletes an empty lobby after the empty-lobby TTL elapses', () => {
    const hostWs = fakeWs();
    const { lobbyId } = manager.createLobby(hostWs, 'Ash');

    manager.handleDisconnect(hostWs);
    vi.advanceTimersByTime(RECONNECT_GRACE_MS + 6 * 60_000);

    expect(manager.lobbyCount).toBe(0);
    expect(() => manager.joinLobby(fakeWs(), lobbyId, 'Brock')).toThrowError(/not found/i);
  });
});

describe('LobbyManager - restoring from a snapshot after the server loses state', () => {
  it('rebuilds a lobby from a saved snapshot, validated against SLOT_COUNT', () => {
    const manager = new LobbyManager();
    const ws = fakeWs();
    const result = manager.restoreLobbyState(ws, {
      type: 'RESTORE_LOBBY_STATE',
      lobbyId: 'GONE01',
      playerId: 'host-1',
      token: 'stale-token',
      snapshot: {
        hostId: 'host-1',
        players: [
          {
            id: 'host-1',
            name: 'Ash',
            isHost: true,
            slots: Array.from({ length: SLOT_COUNT }, (_, i) => ({ pokemonId: i === 0 ? 25 : null })),
          },
          {
            id: 'member-1',
            name: 'Misty',
            isHost: false,
            slots: Array.from({ length: SLOT_COUNT }, () => ({ pokemonId: null })),
          },
        ],
      },
    });

    expect(result.playerId).toBe('host-1');
    expect(result.state.players).toHaveLength(2);
    const host = result.state.players.find((p) => p.id === 'host-1')!;
    expect(host.connected).toBe(true);
    expect(host.slots[0]).toEqual({ pokemonId: 25 });
    const member = result.state.players.find((p) => p.id === 'member-1')!;
    expect(member.connected).toBe(false);
  });

  it('lets a second device claim its placeholder identity after a snapshot restore', () => {
    const manager = new LobbyManager();
    const hostWs = fakeWs();
    const restored = manager.restoreLobbyState(hostWs, {
      type: 'RESTORE_LOBBY_STATE',
      lobbyId: 'GONE01',
      playerId: 'host-1',
      token: 'stale-token',
      snapshot: {
        hostId: 'host-1',
        players: [
          { id: 'host-1', name: 'Ash', isHost: true, slots: Array.from({ length: SLOT_COUNT }, () => ({ pokemonId: null })) },
          { id: 'member-1', name: 'Misty', isHost: false, slots: Array.from({ length: SLOT_COUNT }, () => ({ pokemonId: null })) },
        ],
      },
    });

    const memberWs = fakeWs();
    const claimed = manager.restoreLobbyState(memberWs, {
      type: 'RESTORE_LOBBY_STATE',
      lobbyId: restored.lobbyId,
      playerId: 'member-1',
      token: 'anything-unclaimed-placeholders-do-not-check-tokens',
    });

    expect(claimed.playerId).toBe('member-1');
    expect(claimed.state.players.find((p) => p.id === 'member-1')?.connected).toBe(true);
  });

  it('rejects a snapshot whose player count exceeds the configured max', () => {
    const manager = new LobbyManager({ maxPlayersPerLobby: 1 });
    expect(() =>
      manager.restoreLobbyState(fakeWs(), {
        type: 'RESTORE_LOBBY_STATE',
        lobbyId: 'GONE01',
        playerId: 'host-1',
        token: 'stale-token',
        snapshot: {
          hostId: 'host-1',
          players: [
            { id: 'host-1', name: 'Ash', isHost: true, slots: Array.from({ length: SLOT_COUNT }, () => ({ pokemonId: null })) },
            { id: 'member-1', name: 'Misty', isHost: false, slots: Array.from({ length: SLOT_COUNT }, () => ({ pokemonId: null })) },
          ],
        },
      })
    ).toThrowError(/full/i);
  });

  it('rejects RESTORE_LOBBY_STATE when the lobby is gone and no snapshot is provided', () => {
    const manager = new LobbyManager();
    expect(() =>
      manager.restoreLobbyState(fakeWs(), {
        type: 'RESTORE_LOBBY_STATE',
        lobbyId: 'GONE01',
        playerId: 'host-1',
        token: 'stale-token',
      })
    ).toThrowError(/not found/i);
  });
});
