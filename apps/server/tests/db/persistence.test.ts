import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { RECONNECT_GRACE_MS, SLOT_COUNT } from '@soullink/shared';
import { LobbyManager } from '../../src/LobbyManager';
import { SqliteLobbyRepository } from '../../src/db/sqliteLobbyRepository';
import { fakeWs } from '../testUtils';

/**
 * End-to-end persistence tests: real `LobbyManager` instances backed by a
 * real (file-based) `SqliteLobbyRepository`, simulating a full server
 * restart by closing one manager/repository pair and opening a brand new
 * one against the same database file -- exactly what `index.ts` does on
 * boot with `DB_PATH`.
 */
const SCRATCH_ROOT = join(__dirname, '.tmp-test');

function makeTempDbPath(): { dir: string; dbPath: string } {
  mkdirSync(SCRATCH_ROOT, { recursive: true });
  const dir = mkdtempSync(join(SCRATCH_ROOT, 'persist-'));
  return { dir, dbPath: join(dir, 'soullink.sqlite') };
}

describe('LobbyManager + SqliteLobbyRepository - persistence across restarts', () => {
  let dir: string;
  let managers: LobbyManager[] = [];

  afterEach(() => {
    for (const m of managers) m.shutdown();
    managers = [];
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  function openManager(dbPath: string): LobbyManager {
    const repository = new SqliteLobbyRepository(dbPath);
    const manager = new LobbyManager({ repository });
    managers.push(manager);
    return manager;
  }

  it('keeps an active lobby (players, six slots, host, tokens) alive across a manager restart', () => {
    const { dir: d, dbPath } = makeTempDbPath();
    dir = d;

    const managerA = openManager(dbPath);
    const hostWs = fakeWs();
    const { lobbyId, playerId: hostId, token: hostToken } = managerA.createLobby(hostWs, 'Ash');
    const memberWs = fakeWs();
    const { playerId: memberId, token: memberToken } = managerA.joinLobby(memberWs, lobbyId, 'Misty');
    managerA.setPokemon(hostWs, 0, 25);
    managerA.setPokemon(memberWs, 3, 1);
    // Both sockets "disconnect" (simulating the process dying) without an
    // explicit LEAVE_LOBBY -- this is the realistic restart scenario.
    managerA.shutdown();

    // Fresh manager + fresh repository instance, same DB file: this is what
    // happens when the Railway container restarts and index.ts boots again.
    const managerB = openManager(dbPath);
    managerB.loadFromRepository();
    expect(managerB.lobbyCount).toBe(1);

    // The host reconnects using its original lobbyId/playerId/token.
    const hostReconnectWs = fakeWs();
    const hostResult = managerB.restoreLobbyState(hostReconnectWs, {
      type: 'RESTORE_LOBBY_STATE',
      lobbyId,
      playerId: hostId,
      token: hostToken,
    });
    expect(hostResult.playerId).toBe(hostId);
    expect(hostResult.state.hostId).toBe(hostId);
    const hostSlots = hostResult.state.players.find((p) => p.id === hostId)!.slots;
    expect(hostSlots).toHaveLength(SLOT_COUNT);
    expect(hostSlots[0]).toEqual({ pokemonId: 25 });

    // The member reconnects too, using its own token, and its slot survived.
    const memberReconnectWs = fakeWs();
    const memberResult = managerB.restoreLobbyState(memberReconnectWs, {
      type: 'RESTORE_LOBBY_STATE',
      lobbyId,
      playerId: memberId,
      token: memberToken,
    });
    const memberSlots = memberResult.state.players.find((p) => p.id === memberId)!.slots;
    expect(memberSlots[3]).toEqual({ pokemonId: 1 });
  });

  it('rejects reconnecting with the wrong token after a restart, same as before a restart', () => {
    const { dir: d, dbPath } = makeTempDbPath();
    dir = d;

    const managerA = openManager(dbPath);
    const hostWs = fakeWs();
    const { lobbyId, playerId: hostId } = managerA.createLobby(hostWs, 'Ash');
    managerA.shutdown();

    const managerB = openManager(dbPath);
    managerB.loadFromRepository();

    expect(() =>
      managerB.restoreLobbyState(fakeWs(), {
        type: 'RESTORE_LOBBY_STATE',
        lobbyId,
        playerId: hostId,
        token: 'not-the-real-token',
      })
    ).toThrowError(/invalid/i);
  });

  it('drops a player whose reconnect grace period had already elapsed before the restart', () => {
    const { dir: d, dbPath } = makeTempDbPath();
    dir = d;

    // Build the persisted state directly so we can control disconnectedAt
    // precisely (deterministic, no fake timers needed for the DB layer).
    const repoA = new SqliteLobbyRepository(dbPath);
    const longAgo = Date.now() - RECONNECT_GRACE_MS - 5_000;
    repoA.saveLobby({
      id: 'STALE1',
      hostId: 'host-1',
      createdAt: longAgo,
      players: [
        {
          id: 'host-1',
          name: 'Ash',
          token: 'host-token',
          isHost: true,
          connected: false,
          joinedAt: longAgo,
          disconnectedAt: longAgo,
          restoredPlaceholder: false,
          slots: Array.from({ length: SLOT_COUNT }, () => ({ pokemonId: null })),
        },
        {
          id: 'member-1',
          name: 'Misty',
          token: 'member-token',
          isHost: false,
          connected: false,
          joinedAt: longAgo + 1,
          disconnectedAt: Date.now(), // still well within grace
          restoredPlaceholder: false,
          slots: Array.from({ length: SLOT_COUNT }, () => ({ pokemonId: null })),
        },
      ],
    });
    repoA.close();

    const manager = openManager(dbPath);
    manager.loadFromRepository();
    expect(manager.lobbyCount).toBe(1);

    // The host's grace expired before we even loaded -- gone permanently,
    // and host duties should have passed to the still-in-grace member.
    expect(() =>
      manager.restoreLobbyState(fakeWs(), {
        type: 'RESTORE_LOBBY_STATE',
        lobbyId: 'STALE1',
        playerId: 'host-1',
        token: 'host-token',
      })
    ).toThrowError(/no longer exists/i);

    const memberResult = manager.restoreLobbyState(fakeWs(), {
      type: 'RESTORE_LOBBY_STATE',
      lobbyId: 'STALE1',
      playerId: 'member-1',
      token: 'member-token',
    });
    expect(memberResult.state.hostId).toBe('member-1');
    expect(memberResult.state.players.find((p) => p.id === 'member-1')?.isHost).toBe(true);
  });

  it('deletes a lobby from the database on load if every player has exceeded the grace period', () => {
    const { dir: d, dbPath } = makeTempDbPath();
    dir = d;

    const repoA = new SqliteLobbyRepository(dbPath);
    const longAgo = Date.now() - RECONNECT_GRACE_MS - 60_000;
    repoA.saveLobby({
      id: 'GONE1',
      hostId: 'host-1',
      createdAt: longAgo,
      players: [
        {
          id: 'host-1',
          name: 'Ash',
          token: 'host-token',
          isHost: true,
          connected: false,
          joinedAt: longAgo,
          disconnectedAt: longAgo,
          restoredPlaceholder: false,
          slots: Array.from({ length: SLOT_COUNT }, () => ({ pokemonId: null })),
        },
      ],
    });
    repoA.close();

    const manager = openManager(dbPath);
    manager.loadFromRepository();
    expect(manager.lobbyCount).toBe(0);

    // Also gone from disk, not just memory -- a later restart won't resurrect it.
    const repoB = new SqliteLobbyRepository(dbPath);
    expect(repoB.loadAll()).toHaveLength(0);
    repoB.close();
  });

  it('persists a leave/kick so the departed player cannot be reconnected to after a restart', () => {
    const { dir: d, dbPath } = makeTempDbPath();
    dir = d;

    const managerA = openManager(dbPath);
    const hostWs = fakeWs();
    const { lobbyId } = managerA.createLobby(hostWs, 'Ash');
    const memberWs = fakeWs();
    const { playerId: memberId, token: memberToken } = managerA.joinLobby(memberWs, lobbyId, 'Misty');
    managerA.leaveLobby(memberWs);
    managerA.shutdown();

    const managerB = openManager(dbPath);
    managerB.loadFromRepository();
    expect(managerB.lobbyCount).toBe(1);

    expect(() =>
      managerB.restoreLobbyState(fakeWs(), {
        type: 'RESTORE_LOBBY_STATE',
        lobbyId,
        playerId: memberId,
        token: memberToken,
      })
    ).toThrowError(/no longer exists/i);
  });
});
