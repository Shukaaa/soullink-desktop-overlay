/**
 * Plain mirror of `main/saveState/connectionHistory.ts`'s `ConnectionHistoryEntry`,
 * defined independently for the same reason as `saveTypes.ts`: the renderer's
 * TypeScript project only includes `src/common/**`, not `src/main/**`.
 */
export interface ConnectionHistoryEntry {
  serverUrl: string;
  playerName: string;
  lastConnectedAt: number;
}
