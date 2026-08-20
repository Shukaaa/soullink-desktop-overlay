/**
 * Deterministic, purely visual color palette cycled across overlay player
 * rows by row index (red, blue, green, yellow, then repeat). This is *not*
 * a persisted setting -- it's derived at render time from each player's
 * position in the lobby's player list, so it needs no save/schema support
 * and stays stable as long as player order doesn't change.
 */

export const PLAYER_ROW_COLORS = ['red', 'blue', 'green', 'yellow'] as const;
export type PlayerRowColor = (typeof PLAYER_ROW_COLORS)[number];

/** Returns the palette color for the row at `index`, cycling through PLAYER_ROW_COLORS. */
export function getPlayerRowColor(index: number): PlayerRowColor {
  const normalized = ((index % PLAYER_ROW_COLORS.length) + PLAYER_ROW_COLORS.length) % PLAYER_ROW_COLORS.length;
  return PLAYER_ROW_COLORS[normalized];
}
