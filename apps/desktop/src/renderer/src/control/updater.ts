import { INITIAL_UPDATER_STATE, type UpdaterEvent, type UpdaterState } from '../../../common/updaterTypes';

export { INITIAL_UPDATER_STATE };
export type { UpdaterState };

/**
 * Pure reducer over updater events pushed from the main process. Exported
 * standalone (mirroring `state/store.ts`'s `reduceWsEvent`) so it can be unit
 * tested without mounting React or Electron.
 */
export function reduceUpdaterEvent(state: UpdaterState, event: UpdaterEvent): UpdaterState {
  switch (event.kind) {
    case 'checking':
      return { ...state, status: 'checking', errorMessage: null };
    case 'available':
      return { ...state, status: 'available', availableVersion: event.version, errorMessage: null };
    case 'not-available':
      return { ...state, status: 'not-available', availableVersion: null, progress: null, errorMessage: null };
    case 'download-progress':
      return { ...state, status: 'downloading', progress: event.progress, errorMessage: null };
    case 'downloaded':
      return { ...state, status: 'downloaded', availableVersion: event.version, progress: null, errorMessage: null };
    case 'error':
      return { ...state, status: 'error', errorMessage: event.message };
    default:
      return state;
  }
}
