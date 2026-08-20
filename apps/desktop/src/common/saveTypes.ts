/**
 * Plain (non-zod) mirror of the save-file shape produced by
 * `main/saveState/schema.ts`. Defined independently (rather than imported)
 * so this file can be shared by the renderer's TypeScript project, which
 * intentionally does not include `src/main/**` -- only `src/common/**`.
 * `SaveStateService` is the actual source of truth/validator; these types
 * just need to stay structurally compatible with it.
 */
import type { OverlaySettings, PokemonSlot } from '@soullink/shared';

export interface SavedPlayer {
  id: string;
  name: string;
  isHost: boolean;
  /** Always exactly SLOT_COUNT entries. */
  slots: PokemonSlot[];
}

export interface SaveFile {
  version: number;
  /** File id: a uuid for manual saves, the fixed string 'autosave' for the autosave slot. */
  id: string;
  /** User-facing label shown in the save list. */
  name: string;
  playerName: string | null;
  serverUrl: string | null;
  lobbyId: string | null;
  hostId: string | null;
  selfPlayerId: string | null;
  selfToken: string | null;
  players: SavedPlayer[];
  updatedAt: number;
  overlaySettings: OverlaySettings;
}

export interface SaveFileMeta {
  id: string;
  name: string;
  updatedAt: number;
  lobbyId: string | null;
  playerCount: number;
  /** The server URL the save was created against, if any -- used by the renderer to filter the save list. */
  serverUrl: string | null;
}

/** The renderer never needs (or should have) the reconnect token -- main
 * process keeps it and performs restores on the renderer's behalf. */
export type PublicSaveFile = Omit<SaveFile, 'selfToken'>;
