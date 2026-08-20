/**
 * Overlay display settings: persisted through the save system, defaulted,
 * and validated centrally so every process (main, control renderer, overlay
 * renderer) shares one definition and one notion of "what counts as valid".
 */

/** Corner of the primary display's work area the overlay window is anchored to. */
export const OVERLAY_POSITIONS = ['bottom-right', 'bottom-left', 'top-right', 'top-left'] as const;
export type OverlayPosition = (typeof OVERLAY_POSITIONS)[number];

export function isOverlayPosition(value: unknown): value is OverlayPosition {
  return typeof value === 'string' && (OVERLAY_POSITIONS as readonly string[]).includes(value);
}

/** Language used for the Pokemon-name tooltip shown on overlay hover. */
export const TOOLTIP_LANGUAGES = ['en', 'de'] as const;
export type TooltipLanguage = (typeof TOOLTIP_LANGUAGES)[number];

export function isTooltipLanguage(value: unknown): value is TooltipLanguage {
  return typeof value === 'string' && (TOOLTIP_LANGUAGES as readonly string[]).includes(value);
}

export const MIN_OVERLAY_SCALE = 0.5;
export const MAX_OVERLAY_SCALE = 2;

export interface OverlaySettings {
  /** Screen corner the overlay window is anchored to. */
  position: OverlayPosition;
  /** Multiplier applied to sprite/name sizing and window sizing. */
  scale: number;
  /** Whether hovering a filled slot shows a Pokemon-name tooltip. */
  tooltipsEnabled: boolean;
  /** Language used for the tooltip's Pokemon name, when enabled. */
  tooltipLanguage: TooltipLanguage;
}

export const DEFAULT_OVERLAY_SETTINGS: OverlaySettings = {
  position: 'bottom-right',
  scale: 1,
  tooltipsEnabled: false,
  tooltipLanguage: 'en',
};

/** Clamps a scale value into the supported [MIN_OVERLAY_SCALE, MAX_OVERLAY_SCALE] range. */
export function clampOverlayScale(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_OVERLAY_SETTINGS.scale;
  return Math.min(MAX_OVERLAY_SCALE, Math.max(MIN_OVERLAY_SCALE, value));
}

/**
 * Coerces an arbitrary (possibly missing, stale, or corrupt) value into a
 * fully populated, valid `OverlaySettings`, defaulting anything missing or
 * invalid rather than throwing. This is what keeps older save files (from
 * before overlay settings existed) -- and any future schema drift -- loading
 * cleanly instead of being rejected outright.
 */
export function normalizeOverlaySettings(input: unknown): OverlaySettings {
  const raw: Record<string, unknown> = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
  return {
    position: isOverlayPosition(raw['position']) ? raw['position'] : DEFAULT_OVERLAY_SETTINGS.position,
    scale: typeof raw['scale'] === 'number' ? clampOverlayScale(raw['scale']) : DEFAULT_OVERLAY_SETTINGS.scale,
    tooltipsEnabled:
      typeof raw['tooltipsEnabled'] === 'boolean' ? raw['tooltipsEnabled'] : DEFAULT_OVERLAY_SETTINGS.tooltipsEnabled,
    tooltipLanguage: isTooltipLanguage(raw['tooltipLanguage'])
      ? raw['tooltipLanguage']
      : DEFAULT_OVERLAY_SETTINGS.tooltipLanguage,
  };
}
