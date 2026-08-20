import { beforeEach, describe, expect, it } from 'vitest';
import type { LobbyState } from '@soullink/shared';
import { LobbyManager } from '../src/LobbyManager';
import { fakeWs } from './testUtils';

describe('LobbyManager - host permissions', () => {
  let manager: LobbyManager;
  let hostWs: ReturnType<typeof fakeWs>;
  let memberWs: ReturnType<typeof fakeWs>;
  let hostId: string;
  let memberId: string;

  beforeEach(() => {
    manager = new LobbyManager();
    hostWs = fakeWs();
    const created = manager.createLobby(hostWs, 'Ash');
    hostId = created.playerId;
    memberWs = fakeWs();
    const joined = manager.joinLobby(memberWs, created.lobbyId, 'Misty');
    memberId = joined.playerId;
  });

  it('lets each player only ever edit their own slots', () => {
    manager.setPokemon(memberWs, 0, 1);
    const state = memberWs.lastMessage<{ state: LobbyState }>()!.state;
    expect(state.players.find((p) => p.id === memberId)!.slots[0]).toEqual({ pokemonId: 1 });
    expect(state.players.find((p) => p.id === hostId)!.slots[0]).toEqual({ pokemonId: null });
  });

  it('forbids a non-host from kicking anyone', () => {
    expect(() => manager.kickPlayer(memberWs, hostId)).toThrowError(/only the lobby host/i);
  });

  it('forbids the host from kicking themselves', () => {
    expect(() => manager.kickPlayer(hostWs, hostId)).toThrowError(/cannot kick yourself/i);
  });

  it('lets the host kick a member, removing them and closing their socket', () => {
    manager.setPokemon(memberWs, 0, 1);
    manager.kickPlayer(hostWs, memberId);

    const state = hostWs.lastMessage<{ state: LobbyState }>()!.state;
    expect(state.players.find((p) => p.id === memberId)).toBeUndefined();
    expect(memberWs.closed).toBe(true);
  });

  it('rejects kicking an unknown player id', () => {
    expect(() => manager.kickPlayer(hostWs, 'ghost-id')).toThrowError(/not found/i);
  });

  it('reassigns host to the next connected player when the host leaves', () => {
    manager.leaveLobby(hostWs);
    const state = memberWs.lastMessage<{ state: LobbyState }>()!.state;
    expect(state.hostId).toBe(memberId);
    expect(state.players.find((p) => p.id === memberId)?.isHost).toBe(true);
  });

  it('lets a player leave voluntarily without a reconnect grace period', () => {
    manager.leaveLobby(memberWs);
    const state = hostWs.lastMessage<{ state: LobbyState }>()!.state;
    expect(state.players.find((p) => p.id === memberId)).toBeUndefined();
  });

  it('sends the leaving player an explicit LEFT_LOBBY message', () => {
    manager.leaveLobby(memberWs);
    expect(memberWs.lastMessage()).toEqual({ type: 'LEFT_LOBBY' });
  });

  it('rejects LEAVE_LOBBY from a socket that never joined', () => {
    expect(() => manager.leaveLobby(fakeWs())).toThrowError(/join a lobby/i);
  });
});
