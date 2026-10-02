import { describe, expect, it } from 'vitest';
import { safeParseClientMessage } from '../src/protocol';
import { getPokemonByName, getPokemonById, isValidSpeciesId, searchPokedex, spriteUrlFor } from '../src/pokedex';
import {
  GAME_VERSION_GROUPS,
  getGameVersion,
  isGameVersionId,
  normalizeOrdenProgress,
} from '../src/gameVersions';

describe('protocol validation', () => {
  it('accepts a well formed CREATE_LOBBY message', () => {
    const result = safeParseClientMessage({ type: 'CREATE_LOBBY', name: 'Ash' });
    expect(result.success).toBe(true);
  });

  it('rejects messages with an unknown type', () => {
    const result = safeParseClientMessage({ type: 'not_a_real_type' });
    expect(result.success).toBe(false);
  });

  it('rejects a CREATE_LOBBY message with an empty name', () => {
    const result = safeParseClientMessage({ type: 'CREATE_LOBBY', name: '' });
    expect(result.success).toBe(false);
  });

  it('rejects a CREATE_LOBBY message with an overly long name', () => {
    const result = safeParseClientMessage({ type: 'CREATE_LOBBY', name: 'x'.repeat(100) });
    expect(result.success).toBe(false);
  });

  it('rejects SET_POKEMON with a non-positive pokemonId', () => {
    const result = safeParseClientMessage({
      type: 'SET_POKEMON',
      slotIndex: 0,
      pokemonId: 0,
    });
    expect(result.success).toBe(false);
  });

  it('rejects SET_POKEMON with an out-of-range slotIndex', () => {
    const result = safeParseClientMessage({
      type: 'SET_POKEMON',
      slotIndex: 6,
      pokemonId: 25,
    });
    expect(result.success).toBe(false);
  });

  it('accepts SET_POKEMON with a valid payload', () => {
    const result = safeParseClientMessage({
      type: 'SET_POKEMON',
      slotIndex: 0,
      pokemonId: 25,
    });
    expect(result.success).toBe(true);
  });

  it('accepts SET_POKEMON with a targetPlayerId for host-on-behalf edits', () => {
    const result = safeParseClientMessage({
      type: 'SET_POKEMON',
      slotIndex: 0,
      pokemonId: 25,
      targetPlayerId: 'p2',
    });
    expect(result.success).toBe(true);
  });

  it('rejects SET_POKEMON with an empty targetPlayerId', () => {
    const result = safeParseClientMessage({
      type: 'SET_POKEMON',
      slotIndex: 0,
      pokemonId: 25,
      targetPlayerId: '',
    });
    expect(result.success).toBe(false);
  });

  it('accepts REMOVE_POKEMON with a valid slotIndex', () => {
    const result = safeParseClientMessage({ type: 'REMOVE_POKEMON', slotIndex: 5 });
    expect(result.success).toBe(true);
  });

  it('accepts REMOVE_POKEMON with a targetPlayerId for host-on-behalf edits', () => {
    const result = safeParseClientMessage({ type: 'REMOVE_POKEMON', slotIndex: 5, targetPlayerId: 'p2' });
    expect(result.success).toBe(true);
  });

  it('accepts known game versions and rejects unknown versions', () => {
    expect(safeParseClientMessage({ type: 'SET_GAME_VERSION', gameVersionId: 'red' }).success).toBe(true);
    expect(safeParseClientMessage({ type: 'SET_GAME_VERSION', gameVersionId: 'unknown' }).success).toBe(false);
  });

  it('accepts an orden toggle index', () => {
    expect(safeParseClientMessage({ type: 'TOGGLE_ORDEN', index: 0 }).success).toBe(true);
  });

  it('accepts LEAVE_LOBBY with no extra fields', () => {
    expect(safeParseClientMessage({ type: 'LEAVE_LOBBY' }).success).toBe(true);
  });

  it('accepts death-counter increments for self and host-targeted players', () => {
    expect(safeParseClientMessage({ type: 'INCREMENT_DEATH_COUNTER' }).success).toBe(true);
    expect(
      safeParseClientMessage({ type: 'INCREMENT_DEATH_COUNTER', targetPlayerId: 'p2' }).success
    ).toBe(true);
    expect(safeParseClientMessage({ type: 'INCREMENT_DEATH_COUNTER', targetPlayerId: '' }).success).toBe(false);
  });

  it('accepts death-counter decrements for self and host-targeted players', () => {
    expect(safeParseClientMessage({ type: 'DECREMENT_DEATH_COUNTER' }).success).toBe(true);
    expect(
      safeParseClientMessage({ type: 'DECREMENT_DEATH_COUNTER', targetPlayerId: 'p2' }).success
    ).toBe(true);
    expect(safeParseClientMessage({ type: 'DECREMENT_DEATH_COUNTER', targetPlayerId: '' }).success).toBe(false);
  });

  it('accepts an increment-reset-counter message', () => {
    expect(safeParseClientMessage({ type: 'INCREMENT_RESET_COUNTER' }).success).toBe(true);
  });

  it('accepts a decrement-reset-counter message', () => {
    expect(safeParseClientMessage({ type: 'DECREMENT_RESET_COUNTER' }).success).toBe(true);
  });

  it('rejects RESTORE_LOBBY_STATE with a snapshot that has the wrong slot count', () => {
    const result = safeParseClientMessage({
      type: 'RESTORE_LOBBY_STATE',
      lobbyId: 'ABC123',
      playerId: 'p1',
      token: 't1',
      snapshot: {
        hostId: 'p1',
        players: [{ id: 'p1', name: 'Ash', isHost: true, slots: [{ pokemonId: 1 }] }],
      },
    });
    expect(result.success).toBe(false);
  });

  it('accepts a well formed RESTORE_LOBBY_STATE message without a snapshot', () => {
    const result = safeParseClientMessage({
      type: 'RESTORE_LOBBY_STATE',
      lobbyId: 'ABC123',
      playerId: 'p1',
      token: 't1',
    });
    expect(result.success).toBe(true);
  });

  it('rejects garbage input entirely', () => {
    expect(safeParseClientMessage(null).success).toBe(false);
    expect(safeParseClientMessage(42).success).toBe(false);
    expect(safeParseClientMessage('hello').success).toBe(false);
  });
});

describe('game version templates', () => {
  it('provides the expected progress counts for supported game formats', () => {
    expect(getGameVersion('red').count).toBe(8);
    expect(getGameVersion('heartgold').count).toBe(16);
    expect(getGameVersion('sun').count).toBe(4);
    expect(getGameVersion('legends-arceus').count).toBe(0);
  });

  it('uses the actual localized Orden names and version-specific gym lineups', () => {
    expect(getGameVersion('red').itemNames).toEqual([
      'Felsorden',
      'Quellorden',
      'Donnerorden',
      'Farborden',
      'Seelenorden',
      'Sumpforden',
      'Vulkanorden',
      'Erdorden',
    ]);
    expect(getGameVersion('black').itemNames[0]).toBe('Triorden');
    expect(getGameVersion('black-2').itemNames[0]).toBe('Grundorden');
    expect(getGameVersion('black-2').itemNames[1]).toBe('Giftorden');
    expect(getGameVersion('platinum').itemNames[2]).toBe('Reliktorden');
    expect(getGameVersion('platinum').itemNames[3]).toBe('Bergorden');
    expect(getGameVersion('sword').itemNames[3]).toBe('Kampf-Orden');
    expect(getGameVersion('shield').itemNames[3]).toBe('Geister-Orden');
    expect(getGameVersion('shield').itemNames[5]).toBe('Eis-Orden');
  });

  it('provides version-specific caps and keeps each cap aligned with its Orden', () => {
    expect(getGameVersion('red').levelCaps).toEqual([14, 21, 24, 29, 43, 43, 47, 50]);
    expect(getGameVersion('yellow').levelCaps).toEqual([12, 21, 28, 32, 50, 50, 54, 55]);
    expect(getGameVersion('lets-go-pikachu').levelCaps).toEqual([12, 19, 26, 34, 44, 44, 48, 50]);
    expect(getGameVersion('emerald').levelCaps).toEqual([15, 19, 24, 29, 31, 33, 42, 46]);
    expect(getGameVersion('platinum').levelCaps).toEqual([14, 22, 26, 32, 37, 41, 44, 50]);
    expect(getGameVersion('black-2').levelCaps).toEqual([13, 18, 24, 30, 33, 39, 48, 51]);
    expect(getGameVersion('ultra-sun').levelCaps).toEqual([16, 28, 44, 54]);
    expect(getGameVersion('heartgold').levelCaps).toHaveLength(16);
    expect(getGameVersion('gold').levelCaps).toEqual([
      9, 16, 20, 25, 30, 35, 31, 40, 44, 47, 46, 46, 39, 48, 50, 58,
    ]);
    expect(getGameVersion('legends-arceus').levelCaps).toEqual([]);

    for (const group of GAME_VERSION_GROUPS) {
      for (const version of group.versions) {
        const template = getGameVersion(version.id);
        expect(template.levelCaps).toHaveLength(template.count);
      }
    }
  });

  it('normalizes saved progress to the selected game template', () => {
    expect(normalizeOrdenProgress('red', [true, false])).toEqual([
      true, false, false, false, false, false, false, false,
    ]);
    expect(normalizeOrdenProgress(null, [true])).toEqual([]);
    expect(isGameVersionId('violet')).toBe(true);
    expect(isGameVersionId('unknown')).toBe(false);
  });
});

describe('pokedex', () => {
  it('resolves pikachu by name case-insensitively', () => {
    expect(getPokemonByName('pikachu')?.id).toBe(25);
    expect(getPokemonByName('PIKACHU')?.id).toBe(25);
  });

  it('resolves species by id', () => {
    expect(getPokemonById(1)?.name).toBe('Bulbasaur');
  });

  it('every entry has both an English and a German name', () => {
    expect(getPokemonById(1)?.nameDe).toBe('Bisasam');
    expect(getPokemonById(4)?.nameDe).toBe('Glumanda');
    expect(getPokemonById(25)?.nameDe).toBe('Pikachu');
  });

  it('resolves a Pokemon by its German name too', () => {
    expect(getPokemonByName('Glumanda')?.id).toBe(4);
    expect(getPokemonByName('glumanda')?.id).toBe(4);
  });

  it('validates species ids', () => {
    expect(isValidSpeciesId(1)).toBe(true);
    expect(isValidSpeciesId(999999)).toBe(false);
  });

  it('contains the full Gen I-V range', () => {
    expect(isValidSpeciesId(494)).toBe(true);
    expect(getPokemonById(495)?.nameDe).toBe('Serpifeu');
    expect(getPokemonById(649)?.name).toBe('Genesect');
    expect(searchPokedex('Serpifeu').map((pokemon) => pokemon.id)).toContain(495);
  });

  it('builds a deterministic sprite url', () => {
    expect(spriteUrlFor(25)).toContain('/25.png');
  });
});

describe('searchPokedex', () => {
  it('returns everything for an empty query', () => {
    expect(searchPokedex('')).toHaveLength(649);
    expect(searchPokedex('   ')).toHaveLength(649);
  });

  it('matches on the English name', () => {
    const results = searchPokedex('charm');
    expect(results.map((p) => p.id)).toEqual(expect.arrayContaining([4, 5]));
  });

  it('matches on the German name', () => {
    const results = searchPokedex('glumanda');
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe(4);
  });

  it('is case-insensitive and matches substrings in either language', () => {
    expect(searchPokedex('GLUR').some((p) => p.id === 6)).toBe(true); // Glurak (Charizard)
    expect(searchPokedex('char').some((p) => p.id === 6)).toBe(true); // Charizard
  });

  it('returns no results for a query matching nothing', () => {
    expect(searchPokedex('zzzznotarealpokemon')).toHaveLength(0);
  });
});
