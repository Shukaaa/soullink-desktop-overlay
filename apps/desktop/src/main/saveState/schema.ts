import { z } from 'zod';
import {
  DEFAULT_OVERLAY_SETTINGS,
  MAX_NAME_LENGTH,
  MAX_OVERLAY_SCALE,
  MIN_OVERLAY_SCALE,
  OVERLAY_POSITIONS,
  SLOT_COUNT,
  TOOLTIP_LANGUAGES,
  normalizeOverlaySettings,
} from '@soullink/shared';

export const SAVE_FILE_VERSION = 1;

export const savedPokemonSlotSchema = z.object({
  pokemonId: z.number().int().positive().nullable(),
});
export type SavedPokemonSlot = z.infer<typeof savedPokemonSlotSchema>;

export const savedPlayerSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(MAX_NAME_LENGTH),
  isHost: z.boolean(),
  slots: z.array(savedPokemonSlotSchema).length(SLOT_COUNT),
});
export type SavedPlayer = z.infer<typeof savedPlayerSchema>;

/**
 * Validates (and, importantly, *repairs*) an overlay-settings value found in
 * a save file. `normalizeOverlaySettings` defaults anything missing or
 * invalid before the strict zod shape below runs, so an old save with no
 * `overlaySettings` field at all -- or a future save with a stray/corrupt
 * field -- both load with sane defaults instead of failing the whole file.
 */
export const overlaySettingsSchema = z.preprocess(
  (value) => normalizeOverlaySettings(value),
  z.object({
    position: z.enum(OVERLAY_POSITIONS),
    scale: z.number().min(MIN_OVERLAY_SCALE).max(MAX_OVERLAY_SCALE),
    tooltipsEnabled: z.boolean(),
    tooltipLanguage: z.enum(TOOLTIP_LANGUAGES),
  })
);

/**
 * Shape of a save file persisted under `app.getPath('userData')/saves`. This
 * is a full snapshot of the last known lobby (every player's exactly-six
 * PokemonSlots, not just the local player's), so it can both be displayed as
 * save history and be replayed to the server via RESTORE_LOBBY_STATE after a
 * crash/restart wipes the server's in-memory state.
 */
export const saveFileSchema = z.object({
  version: z.literal(SAVE_FILE_VERSION),
  /** File id: a uuid for manual saves, the fixed string 'autosave' for the autosave slot. */
  id: z.string().min(1).max(64),
  /** User-facing label shown in the save list. */
  name: z.string().min(1).max(64),
  playerName: z.string().max(MAX_NAME_LENGTH).nullable(),
  serverUrl: z.string().max(256).nullable(),
  lobbyId: z.string().max(64).nullable(),
  hostId: z.string().max(64).nullable(),
  selfPlayerId: z.string().max(64).nullable(),
  selfToken: z.string().max(128).nullable(),
  players: z.array(savedPlayerSchema).max(64),
  updatedAt: z.number(),
  overlaySettings: overlaySettingsSchema,
});
export type SaveFile = z.infer<typeof saveFileSchema>;

/** Lightweight metadata used to render the manual-save list without loading every file's full body. */
export interface SaveFileMeta {
  id: string;
  name: string;
  updatedAt: number;
  lobbyId: string | null;
  playerCount: number;
  /** The server URL the save was created against, if any -- used by the renderer to filter the save list. */
  serverUrl: string | null;
}

export function emptySaveFile(id: string, name: string): SaveFile {
  return {
    version: SAVE_FILE_VERSION,
    id,
    name,
    playerName: null,
    serverUrl: null,
    lobbyId: null,
    hostId: null,
    selfPlayerId: null,
    selfToken: null,
    players: [],
    updatedAt: Date.now(),
    overlaySettings: DEFAULT_OVERLAY_SETTINGS,
  };
}

export function toSaveFileMeta(save: SaveFile): SaveFileMeta {
  return {
    id: save.id,
    name: save.name,
    updatedAt: save.updatedAt,
    lobbyId: save.lobbyId,
    playerCount: save.players.length,
    serverUrl: save.serverUrl,
  };
}
