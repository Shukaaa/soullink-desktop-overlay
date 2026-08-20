import { describe, expect, it } from 'vitest';
import { PLAYER_ROW_COLORS, getPlayerRowColor } from '../src/playerPalette';

describe('getPlayerRowColor', () => {
  it('cycles red, blue, green, yellow for the first four rows', () => {
    expect(getPlayerRowColor(0)).toBe('red');
    expect(getPlayerRowColor(1)).toBe('blue');
    expect(getPlayerRowColor(2)).toBe('green');
    expect(getPlayerRowColor(3)).toBe('yellow');
  });

  it('wraps back to the start of the palette after 4 rows', () => {
    expect(getPlayerRowColor(4)).toBe('red');
    expect(getPlayerRowColor(5)).toBe('blue');
    expect(getPlayerRowColor(8)).toBe('red');
  });

  it('is deterministic for a given index', () => {
    expect(getPlayerRowColor(7)).toBe(getPlayerRowColor(7));
  });

  it('always returns a value from PLAYER_ROW_COLORS', () => {
    for (let i = 0; i < 20; i++) {
      expect(PLAYER_ROW_COLORS).toContain(getPlayerRowColor(i));
    }
  });

  it('handles negative indices gracefully', () => {
    expect(getPlayerRowColor(-1)).toBe('yellow');
  });
});
