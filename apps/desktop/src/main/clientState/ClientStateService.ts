import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import type { ClientPreferences } from '../../common/ipc';
import {
  clientPreferencesSchema,
  emptyClientPreferences,
} from './schema';
import {
  connectionHistoryFileSchema,
  mergeConnectionHistoryEntry,
  removeConnectionHistoryEntry,
  type ConnectionHistoryEntry,
} from './connectionHistory';

const CLIENT_PREFERENCES_FILE_NAME = 'client-preferences.json';
const LEGACY_AUTOSAVE_FILE_NAME = 'autosave.json';
const CONNECTION_HISTORY_FILE_NAME = 'connection-history.json';

/** Stores desktop preferences and connection history, never lobby snapshots. */
export class ClientStateService {
  private readonly preferencesPath: string;
  private readonly legacyAutosavePath: string;
  private readonly historyPath: string;
  private preferences: ClientPreferences = emptyClientPreferences();

  constructor(userDataDir: string) {
    this.preferencesPath = path.join(userDataDir, CLIENT_PREFERENCES_FILE_NAME);
    this.legacyAutosavePath = path.join(userDataDir, 'saves', LEGACY_AUTOSAVE_FILE_NAME);
    this.historyPath = path.join(userDataDir, CONNECTION_HISTORY_FILE_NAME);
  }

  loadClientPreferences(): ClientPreferences {
    if (fs.existsSync(this.preferencesPath)) {
      this.preferences = clientPreferencesSchema.parse(
        JSON.parse(fs.readFileSync(this.preferencesPath, 'utf-8'))
      );
      return this.preferences;
    }

    if (!fs.existsSync(this.legacyAutosavePath)) {
      this.preferences = emptyClientPreferences();
      return this.preferences;
    }

    try {
      const legacy = JSON.parse(fs.readFileSync(this.legacyAutosavePath, 'utf-8')) as unknown;
      this.preferences = clientPreferencesSchema.parse(legacy);
      this.writePreferences(this.preferences);
      return this.preferences;
    } catch (error) {
      if (!(error instanceof SyntaxError) && !(error instanceof z.ZodError)) throw error;
      quarantine(this.legacyAutosavePath);
      this.preferences = emptyClientPreferences();
      return this.preferences;
    }
  }

  saveClientPreferences(partial: Partial<ClientPreferences>): ClientPreferences {
    this.preferences = clientPreferencesSchema.parse({ ...this.preferences, ...partial });
    this.writePreferences(this.preferences);
    return this.preferences;
  }

  listConnectionHistory(): ConnectionHistoryEntry[] {
    if (!fs.existsSync(this.historyPath)) return [];
    try {
      const raw = fs.readFileSync(this.historyPath, 'utf-8');
      const parsed = connectionHistoryFileSchema.parse(JSON.parse(raw));
      return [...parsed].sort((a, b) => b.lastConnectedAt - a.lastConnectedAt);
    } catch {
      return [];
    }
  }

  recordConnection(entry: { serverUrl: string; playerName: string }): ConnectionHistoryEntry[] {
    const serverUrl = entry.serverUrl.trim();
    const playerName = entry.playerName.trim();
    const current = this.listConnectionHistory();
    if (!serverUrl || !playerName) return current;
    const next = mergeConnectionHistoryEntry(current, { serverUrl, playerName, lastConnectedAt: Date.now() });
    this.writeHistoryAtomic(next);
    return next;
  }

  removeConnectionHistoryEntry(entry: Pick<ConnectionHistoryEntry, 'serverUrl' | 'playerName'>): ConnectionHistoryEntry[] {
    const next = removeConnectionHistoryEntry(this.listConnectionHistory(), entry);
    this.writeHistoryAtomic(next);
    return next;
  }

  private writePreferences(preferences: ClientPreferences): void {
    const dir = path.dirname(this.preferencesPath);
    fs.mkdirSync(dir, { recursive: true });
    const tmpPath = `${this.preferencesPath}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(preferences, null, 2), 'utf-8');
    fs.renameSync(tmpPath, this.preferencesPath);
  }

  private writeHistoryAtomic(entries: ConnectionHistoryEntry[]): void {
    const dir = path.dirname(this.historyPath);
    fs.mkdirSync(dir, { recursive: true });
    const tmpPath = `${this.historyPath}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(entries, null, 2), 'utf-8');
    fs.renameSync(tmpPath, this.historyPath);
  }
}

function quarantine(filePath: string): void {
  try {
    fs.renameSync(filePath, `${filePath}.legacy-${Date.now()}`);
  } catch {
    // Keep startup available when an obsolete local snapshot cannot be moved.
  }
}
