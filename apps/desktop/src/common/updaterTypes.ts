/**
 * Types shared by the main process's electron-updater wrapper, the preload
 * bridge, and the renderer control UI. Kept separate from `ipc.ts` for the
 * same reason as `saveTypes.ts`/`connectionHistoryTypes.ts`: plain data
 * shapes only, no imports of `electron` or `electron-updater` itself, so the
 * renderer's TypeScript project (which only includes `src/common/**`) can
 * use them directly.
 */

export type UpdaterStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'error';

export interface UpdaterProgress {
  percent: number;
  bytesPerSecond: number;
  transferred: number;
  total: number;
}

/** Pushed from main -> every renderer window whenever the updater's state changes. */
export type UpdaterEvent =
  | { kind: 'checking' }
  | { kind: 'available'; version: string }
  | { kind: 'not-available'; version: string }
  | { kind: 'download-progress'; progress: UpdaterProgress }
  | { kind: 'downloaded'; version: string }
  | { kind: 'error'; message: string };

/** Renderer-side view of the updater's current state, derived from `UpdaterEvent`s. */
export interface UpdaterState {
  currentVersion: string;
  status: UpdaterStatus;
  availableVersion: string | null;
  progress: UpdaterProgress | null;
  errorMessage: string | null;
}

export const INITIAL_UPDATER_STATE: UpdaterState = {
  currentVersion: '',
  status: 'idle',
  availableVersion: null,
  progress: null,
  errorMessage: null,
};
