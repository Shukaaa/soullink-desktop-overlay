import { describe, expect, it } from 'vitest';
import { safeParseClientMessage } from '../src/protocol';
import { getPokemonByName, getPokemonById, isValidSpeciesId, searchPokedex, spriteUrlFor } from '../src/pokedex';

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

  it('accepts REMOVE_POKEMON with a valid slotIndex', () => {
    const result = safeParseClientMessage({ type: 'REMOVE_POKEMON', slotIndex: 5 });
    expect(result.success).toBe(true);
  });

  it('accepts LEAVE_LOBBY with no extra fields', () => {
    expect(safeParseClientMessage({ type: 'LEAVE_LOBBY' }).success).toBe(true);
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

  it('contains the full Gen I-IV range', () => {
    expect(isValidSpeciesId(493)).toBe(true);
  });

  it('builds a deterministic sprite url', () => {
    expect(spriteUrlFor(25)).toContain('/25.png');
  });
});

describe('searchPokedex', () => {
  it('returns everything for an empty query', () => {
    expect(searchPokedex('')).toHaveLength(493);
    expect(searchPokedex('   ')).toHaveLength(493);
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
