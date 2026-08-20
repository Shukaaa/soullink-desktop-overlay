import { describe, expect, it } from 'vitest';
import {
  DEFAULT_OVERLAY_SETTINGS,
  MAX_OVERLAY_SCALE,
  MIN_OVERLAY_SCALE,
  clampOverlayScale,
  isOverlayPosition,
  isTooltipLanguage,
  normalizeOverlaySettings,
} from '../src/overlaySettings';
import { getPokemonDisplayName } from '../src/pokedex';

describe('clampOverlayScale', () => {
  it('leaves in-range values untouched', () => {
    expect(clampOverlayScale(1)).toBe(1);
    expect(clampOverlayScale(1.5)).toBe(1.5);
  });

  it('clamps below the minimum', () => {
    expect(clampOverlayScale(0.1)).toBe(MIN_OVERLAY_SCALE);
  });

  it('clamps above the maximum', () => {
    expect(clampOverlayScale(10)).toBe(MAX_OVERLAY_SCALE);
  });

  it('falls back to the default for non-finite input', () => {
    expect(clampOverlayScale(Number.NaN)).toBe(DEFAULT_OVERLAY_SETTINGS.scale);
    expect(clampOverlayScale(Number.POSITIVE_INFINITY)).toBe(DEFAULT_OVERLAY_SETTINGS.scale);
  });
});

describe('isOverlayPosition / isTooltipLanguage', () => {
  it('accepts every known position', () => {
    for (const p of ['bottom-right', 'bottom-left', 'top-right', 'top-left']) {
      expect(isOverlayPosition(p)).toBe(true);
    }
  });

  it('rejects unknown positions and non-strings', () => {
    expect(isOverlayPosition('middle')).toBe(false);
    expect(isOverlayPosition(null)).toBe(false);
    expect(isOverlayPosition(42)).toBe(false);
  });

  it('accepts known tooltip languages and rejects others', () => {
    expect(isTooltipLanguage('en')).toBe(true);
    expect(isTooltipLanguage('de')).toBe(true);
    expect(isTooltipLanguage('fr')).toBe(false);
    expect(isTooltipLanguage(undefined)).toBe(false);
  });
});

describe('normalizeOverlaySettings', () => {
  it('returns full defaults for undefined/null/non-object input', () => {
    expect(normalizeOverlaySettings(undefined)).toEqual(DEFAULT_OVERLAY_SETTINGS);
    expect(normalizeOverlaySettings(null)).toEqual(DEFAULT_OVERLAY_SETTINGS);
    expect(normalizeOverlaySettings('nope')).toEqual(DEFAULT_OVERLAY_SETTINGS);
  });

  it('returns defaults for an empty object (old save with no overlaySettings field)', () => {
    expect(normalizeOverlaySettings({})).toEqual(DEFAULT_OVERLAY_SETTINGS);
  });

  it('passes through a fully valid settings object unchanged', () => {
    const valid = { position: 'top-left', scale: 1.25, tooltipsEnabled: true, tooltipLanguage: 'de' };
    expect(normalizeOverlaySettings(valid)).toEqual(valid);
  });

  it('defaults an invalid position while keeping other valid fields', () => {
    const result = normalizeOverlaySettings({ position: 'middle', scale: 1.5, tooltipsEnabled: true, tooltipLanguage: 'de' });
    expect(result).toEqual({ position: 'bottom-right', scale: 1.5, tooltipsEnabled: true, tooltipLanguage: 'de' });
  });

  it('clamps an out-of-range scale rather than rejecting it', () => {
    expect(normalizeOverlaySettings({ scale: 999 }).scale).toBe(MAX_OVERLAY_SCALE);
    expect(normalizeOverlaySettings({ scale: -5 }).scale).toBe(MIN_OVERLAY_SCALE);
  });

  it('defaults a non-boolean tooltipsEnabled and an invalid tooltipLanguage', () => {
    const result = normalizeOverlaySettings({ tooltipsEnabled: 'yes', tooltipLanguage: 'fr' });
    expect(result.tooltipsEnabled).toBe(DEFAULT_OVERLAY_SETTINGS.tooltipsEnabled);
    expect(result.tooltipLanguage).toBe(DEFAULT_OVERLAY_SETTINGS.tooltipLanguage);
  });
});

describe('getPokemonDisplayName', () => {
  it('returns the English name by default', () => {
    expect(getPokemonDisplayName(25)).toBe('Pikachu');
  });

  it('returns the German name when requested', () => {
    expect(getPokemonDisplayName(25, 'de')).toBe('Pikachu');
    expect(getPokemonDisplayName(1, 'de')).toBe('Bisasam');
  });

  it('falls back to #id for an unknown species', () => {
    expect(getPokemonDisplayName(999999)).toBe('#999999');
  });
});
