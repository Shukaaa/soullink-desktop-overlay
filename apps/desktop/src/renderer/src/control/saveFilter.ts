import type { SaveFileMeta } from '../../../common/saveTypes';
import { serverUrlsMatch } from '../../../common/serverUrl';

/**
 * Only keeps manual saves whose recorded `serverUrl` matches the currently
 * entered/connected server URL (normalized comparison -- see
 * `serverUrlsMatch`). If the entered URL is blank, no filtering happens
 * (nothing useful to compare against). Saves with no recorded `serverUrl`
 * (very old saves, or ones created before a connection existed) are hidden
 * once a URL is entered, since we can't know which server they belong to.
 */
export function filterSavesByServerUrl(saves: SaveFileMeta[], serverUrl: string): SaveFileMeta[] {
  const trimmedUrl = serverUrl.trim();
  if (!trimmedUrl) return saves;
  return saves.filter((save) => serverUrlsMatch(save.serverUrl, trimmedUrl));
}
