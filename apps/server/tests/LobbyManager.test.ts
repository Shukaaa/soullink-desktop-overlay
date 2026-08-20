import { beforeEach, describe, expect, it } from 'vitest';
import type { LobbyState } from '@soullink/shared';
import { SLOT_COUNT } from '@soullink/shared';
import { LobbyManager } from '../src/LobbyManager';
import { fakeWs } from './testUtils';

describe('LobbyManager - lobby lifecycle', () => {
  let manager: LobbyManager;

  beforeEach(() => {
    manager = new LobbyManager();
  });

  it('creates a lobby with the creator as host and six empty slots', () => {
    const ws = fakeWs();
    const { lobbyId, playerId, state } = manager.createLobby(ws, 'Ash');

    expect(lobbyId).toHaveLength(6);
    expect(state.hostId).toBe(playerId);
    expect(state.players).toEqual([
      {
        id: playerId,
        name: 'Ash',
        isHost: true,
        connected: true,
        slots: Array.from({ length: SLOT_COUNT }, () => ({ pokemonId: null })),
      },
    ]);
  });

  it('allows a second player to join an existing lobby', () => {
    const hostWs = fakeWs();
    const { lobbyId } = manager.createLobby(hostWs, 'Ash');

    const joinerWs = fakeWs();
    const { state } = manager.joinLobby(joinerWs, lobbyId, 'Misty');

    expect(state.players).toHaveLength(2);
    expect(state.players.map((p) => p.name)).toEqual(['Ash', 'Misty']);
    expect(state.players[1].slots).toHaveLength(SLOT_COUNT);
  });

  it('rejects joining an unknown lobby', () => {
    expect(() => manager.joinLobby(fakeWs(), 'NOPE12', 'Misty')).toThrowError(/not found/i);
  });

  it('rejects duplicate names within the same lobby (case-insensitive)', () => {
    const { lobbyId } = manager.createLobby(fakeWs(), 'Ash');
    expect(() => manager.joinLobby(fakeWs(), lobbyId, 'ash')).toThrowError(/already taken/i);
  });

  it('rejects joining once the lobby is full', () => {
    const { lobbyId } = manager.createLobby(fakeWs(), 'P0');
    for (let i = 1; i < 4; i++) {
      manager.joinLobby(fakeWs(), lobbyId, `P${i}`);
    }
    expect(() => manager.joinLobby(fakeWs(), lobbyId, 'P4')).toThrowError(/full/i);
  });

  it('honors a configurable max players per lobby', () => {
    const smallManager = new LobbyManager({ maxPlayersPerLobby: 2 });
    const { lobbyId } = smallManager.createLobby(fakeWs(), 'Ash');
    smallManager.joinLobby(fakeWs(), lobbyId, 'Misty');
    expect(() => smallManager.joinLobby(fakeWs(), lobbyId, 'Brock')).toThrowError(/full/i);
  });

  it('broadcasts state_update to existing players when someone joins', () => {
    const hostWs = fakeWs();
    const { lobbyId } = manager.createLobby(hostWs, 'Ash');
    manager.joinLobby(fakeWs(), lobbyId, 'Misty');

    // The existing host socket must be pushed a fresh STATE containing the
    // new player; the joiner gets its own STATE reply from the ws layer.
    expect(hostWs.sent).toHaveLength(1);
    const [message] = hostWs.sent as [{ type: string; state: { players: { name: string }[] } }];
    expect(message.type).toBe('STATE');
    expect(message.state.players.map((p) => p.name)).toEqual(['Ash', 'Misty']);
  });
});

describe('LobbyManager - Pokemon slots', () => {
  let manager: LobbyManager;
  let hostWs: ReturnType<typeof fakeWs>;
  let joinerWs: ReturnType<typeof fakeWs>;
  let lobbyId: string;
  let hostId: string;
  let joinerId: string;

  beforeEach(() => {
    manager = new LobbyManager();
    hostWs = fakeWs();
    const created = manager.createLobby(hostWs, 'Ash');
    lobbyId = created.lobbyId;
    hostId = created.playerId;
    joinerWs = fakeWs();
    const joined = manager.joinLobby(joinerWs, lobbyId, 'Misty');
    joinerId = joined.playerId;
  });

  function lastState(ws: ReturnType<typeof fakeWs>): LobbyState {
    return ws.lastMessage<{ state: LobbyState }>()!.state;
  }

  it('sets a Pokemon into a slot for the sender only', () => {
    manager.setPokemon(hostWs, 0, 25);
    const state = lastState(hostWs);
    const host = state.players.find((p) => p.id === hostId)!;
    const joiner = state.players.find((p) => p.id === joinerId)!;
    expect(host.slots[0]).toEqual({ pokemonId: 25 });
    expect(joiner.slots[0]).toEqual({ pokemonId: null });
  });

  it('links slot index across players -- same index means the same SoulLink slot', () => {
    manager.setPokemon(hostWs, 2, 25);
    manager.setPokemon(joinerWs, 2, 1);
    const state = lastState(joinerWs);
    expect(state.players.map((p) => p.slots[2].pokemonId)).toEqual(
      expect.arrayContaining([25, 1])
    );
  });

  it('rejects unknown species ids', () => {
    expect(() => manager.setPokemon(hostWs, 0, 999999)).toThrowError(/species/i);
  });

  it('rejects an out-of-range slot index', () => {
    expect(() => manager.setPokemon(hostWs, SLOT_COUNT, 25)).toThrowError(/slot index/i);
    expect(() => manager.setPokemon(hostWs, -1, 25)).toThrowError(/slot index/i);
  });

  it('clears a slot back to empty', () => {
    manager.setPokemon(hostWs, 0, 25);
    manager.removePokemon(hostWs, 0);
    const state = lastState(hostWs);
    expect(state.players.find((p) => p.id === hostId)!.slots[0]).toEqual({ pokemonId: null });
  });

  it('rejects operations from a socket that never joined a lobby', () => {
    const strangerWs = fakeWs();
    expect(() => manager.setPokemon(strangerWs, 0, 25)).toThrowError(/join a lobby/i);
  });
});
