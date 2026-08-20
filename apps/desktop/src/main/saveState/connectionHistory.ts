import { z } from 'zod';
import { MAX_NAME_LENGTH } from '@soullink/shared';
import { serverUrlsMatch } from '../../common/serverUrl';

/**
 * A single remembered "start screen" connection attempt: the server URL and
 * player name that were used, plus when that combination was last used to
 * connect. Deliberately *not* part of `SaveFile`/`SaveFileMeta` -- this is
 * connection history, not lobby-snapshot save data, and must never surface
 * inside the Saves UI.
 */
export const connectionHistoryEntrySchema = z.object({
  serverUrl: z.string().min(1).max(256),
  playerName: z.string().min(1).max(MAX_NAME_LENGTH),
  lastConnectedAt: z.number(),
});
export type ConnectionHistoryEntry = z.infer<typeof connectionHistoryEntrySchema>;

/** The whole history file: newest first, capped defensively at parse time. */
export const connectionHistoryFileSchema = z.array(connectionHistoryEntrySchema).max(200);

export const MAX_CONNECTION_HISTORY_ENTRIES = 20;

/** Case/whitespace-insensitive identity for a player name, used only for history de-duplication. */
function normalizePlayerNameForCompare(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * Merges a freshly-used `{ serverUrl, playerName }` into an existing
 * (already newest-first) history list:
 *  - any existing entry whose URL *and* player name both match the new one
 *    (using the same normalized-URL comparison used for save filtering, and
 *    a case/whitespace-insensitive name comparison) is removed rather than
 *    duplicated,
 *  - the new entry is placed at the front (newest first),
 *  - the result is capped to `maxEntries`.
 */
export function mergeConnectionHistoryEntry(
  existing: ConnectionHistoryEntry[],
  entry: ConnectionHistoryEntry,
  maxEntries = MAX_CONNECTION_HISTORY_ENTRIES
): ConnectionHistoryEntry[] {
  const withoutDuplicate = existing.filter(
    (candidate) =>
      !(
        serverUrlsMatch(candidate.serverUrl, entry.serverUrl) &&
        normalizePlayerNameForCompare(candidate.playerName) === normalizePlayerNameForCompare(entry.playerName)
      )
  );
  return [entry, ...withoutDuplicate].slice(0, maxEntries);
}
