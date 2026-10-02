import { z } from 'zod';
import {
  DEFAULT_OVERLAY_SETTINGS,
  MAX_NAME_LENGTH,
  MAX_OVERLAY_SCALE,
  MIN_OVERLAY_SCALE,
  OVERLAY_POSITIONS,
  TOOLTIP_LANGUAGES,
  normalizeOverlaySettings,
} from '@soullink/shared';

/** Validated local-only display and connection preferences. */
export const overlaySettingsSchema = z.preprocess(
  (value) => normalizeOverlaySettings(value),
  z.object({
    position: z.enum(OVERLAY_POSITIONS),
    scale: z.number().min(MIN_OVERLAY_SCALE).max(MAX_OVERLAY_SCALE),
    tooltipsEnabled: z.boolean(),
    tooltipLanguage: z.enum(TOOLTIP_LANGUAGES),
  })
);

export const clientPreferencesSchema = z.object({
  playerName: z.string().max(MAX_NAME_LENGTH).nullable().default(null),
  serverUrl: z.string().max(256).nullable().default(null),
  overlaySettings: overlaySettingsSchema,
});

export type ClientPreferences = z.infer<typeof clientPreferencesSchema>;

export function emptyClientPreferences(): ClientPreferences {
  return {
    playerName: null,
    serverUrl: null,
    overlaySettings: DEFAULT_OVERLAY_SETTINGS,
  };
}
