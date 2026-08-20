import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { emptySaveFile, saveFileSchema, toSaveFileMeta, type SaveFile, type SaveFileMeta } from './schema';
import {
  connectionHistoryFileSchema,
  mergeConnectionHistoryEntry,
  removeConnectionHistoryEntry,
  type ConnectionHistoryEntry,
} from './connectionHistory';

export interface LoadResult {
  data: SaveFile;
  recoveredFromCorruption: boolean;
}

/** Fields required to create/update a manual save. `overlaySettings` is
 * optional here (unlike the rest of `SaveFile`) so callers that don't care
 * about overlay settings -- notably existing tests -- aren't forced to pass
 * them; the schema defaults it the same way it does for an old save file
 * that never had the field at all. */
export type SaveFileInput = Partial<Pick<SaveFile, 'overlaySettings'>> &
  Omit<SaveFile, 'version' | 'id' | 'name' | 'updatedAt' | 'overlaySettings'>;

const DEFAULT_AUTOSAVE_DEBOUNCE_MS = 2000;
const AUTOSAVE_ID = 'autosave';
const AUTOSAVE_FILE_NAME = 'autosave.json';
/** Lives directly under userData (a sibling of the `saves/` directory, not inside it) --
 * connection history is start-screen convenience data, not a lobby-snapshot save. */
const CONNECTION_HISTORY_FILE_NAME = 'connection-history.json';

/**
 * Persists lobby-snapshot save files to disk under
 * `<userData>/saves/`, with atomic writes (write to a temp file, then
 * rename over the target so a crash mid-write can never leave a
 * half-written file behind) and zod validation on every read.
 *
 * Two kinds of saves live side by side in the same directory but never mix:
 *  - `autosave.json`: a single, debounced, automatically updated snapshot.
 *  - `<uuid>.json`: user-created "manual" saves, listable/loadable/deletable
 *    independently of the autosave slot.
 *
 * Takes a plain directory path so it can be unit tested without an Electron
 * runtime; the caller is responsible for passing `app.getPath('userData')`.
 */
export class SaveStateService {
  private readonly dir: string;
  private readonly autosavePath: string;
  private readonly historyPath: string;
  private autosaveTimer: NodeJS.Timeout | null = null;
  private cachedAutosave: SaveFile;
  /** Accumulates partials across scheduleAutosave calls made within the same
   * debounce window, so an in-flight settings change and an in-flight lobby
   * update (say) never clobber each other -- only the write actually lost is
   * whichever field was itself overwritten by a later call for that field. */
  private pendingAutosavePartial: Partial<Omit<SaveFile, 'version' | 'id' | 'name' | 'updatedAt'>> = {};

  constructor(userDataDir: string, saveDirName = 'saves') {
    this.dir = path.join(userDataDir, saveDirName);
    this.autosavePath = path.join(this.dir, AUTOSAVE_FILE_NAME);
    this.historyPath = path.join(userDataDir, CONNECTION_HISTORY_FILE_NAME);
    this.cachedAutosave = emptySaveFile(AUTOSAVE_ID, 'Autosave');
  }

  get autosavePathForDebug(): string {
    return this.autosavePath;
  }

  get currentAutosave(): SaveFile {
    return this.cachedAutosave;
  }

  // -- autosave ---------------------------------------------------------

  /** Loads and validates the autosave file, recovering gracefully from corruption. */
  loadAutosave(): LoadResult {
    fs.mkdirSync(this.dir, { recursive: true });
    if (!fs.existsSync(this.autosavePath)) {
      this.cachedAutosave = emptySaveFile(AUTOSAVE_ID, 'Autosave');
      return { data: this.cachedAutosave, recoveredFromCorruption: false };
    }
    try {
      const parsed = readValidated(this.autosavePath);
      this.cachedAutosave = parsed;
      return { data: parsed, recoveredFromCorruption: false };
    } catch {
      quarantine(this.autosavePath);
      this.cachedAutosave = emptySaveFile(AUTOSAVE_ID, 'Autosave');
      return { data: this.cachedAutosave, recoveredFromCorruption: true };
    }
  }

  /** Immediately (synchronously) persists the autosave slot, merged onto the current state. */
  saveAutosaveNow(partial: Partial<Omit<SaveFile, 'version' | 'id' | 'name' | 'updatedAt'>>): SaveFile {
    const next = saveFileSchema.parse({
      ...this.cachedAutosave,
      ...partial,
      version: SAVE_FILE_VERSION_LITERAL,
      id: AUTOSAVE_ID,
      name: 'Autosave',
      updatedAt: Date.now(),
    });
    writeAtomic(this.dir, this.autosavePath, next);
    this.cachedAutosave = next;
    return next;
  }

  /** Debounced autosave: repeated calls within `debounceMs` collapse into a single write. */
  scheduleAutosave(
    partial: Partial<Omit<SaveFile, 'version' | 'id' | 'name' | 'updatedAt'>>,
    debounceMs = DEFAULT_AUTOSAVE_DEBOUNCE_MS
  ): void {
    this.pendingAutosavePartial = { ...this.pendingAutosavePartial, ...partial };
    if (this.autosaveTimer) clearTimeout(this.autosaveTimer);
    this.autosaveTimer = setTimeout(() => {
      this.autosaveTimer = null;
      const toWrite = this.pendingAutosavePartial;
      this.pendingAutosavePartial = {};
      this.saveAutosaveNow(toWrite);
    }, debounceMs);
    this.autosaveTimer.unref?.();
  }

  /** Cancels any pending debounced autosave without writing it. */
  cancelPendingAutosave(): void {
    if (this.autosaveTimer) {
      clearTimeout(this.autosaveTimer);
      this.autosaveTimer = null;
    }
    this.pendingAutosavePartial = {};
  }

  // -- manual saves -------------------------------------------------------

  /** Lists manual saves (never includes the autosave slot), newest first. */
  listSaves(): SaveFileMeta[] {
    fs.mkdirSync(this.dir, { recursive: true });
    const metas: SaveFileMeta[] = [];
    for (const fileName of fs.readdirSync(this.dir)) {
      if (fileName === AUTOSAVE_FILE_NAME || !fileName.endsWith('.json')) continue;
      try {
        const save = readValidated(path.join(this.dir, fileName));
        metas.push(toSaveFileMeta(save));
      } catch {
        // Skip unreadable/corrupt manual save files rather than failing the whole list.
      }
    }
    return metas.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  /** Loads one manual save by id. Throws if it does not exist or fails validation. */
  loadSave(id: string): SaveFile {
    const filePath = this.manualSavePath(id);
    return readValidated(filePath);
  }

  /** Creates a new manual save file (generated uuid id) and returns it. */
  createSave(name: string, partial: SaveFileInput): SaveFile {
    const id = randomUUID();
    const save = saveFileSchema.parse({
      ...partial,
      version: SAVE_FILE_VERSION_LITERAL,
      id,
      name: name.trim().slice(0, 64) || 'Save',
      updatedAt: Date.now(),
    });
    writeAtomic(this.dir, this.manualSavePath(id), save);
    return save;
  }

  /**
   * Overwrites an existing manual save in place, preserving its id (and
   * therefore its position/identity in the save list -- callers never see a
   * new id after an overwrite). Throws if no save with that id exists yet;
   * use `createSave` for a brand new save.
   */
  updateSave(id: string, name: string, partial: SaveFileInput): SaveFile {
    const filePath = this.manualSavePath(id);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Save "${id}" does not exist.`);
    }
    const save = saveFileSchema.parse({
      ...partial,
      version: SAVE_FILE_VERSION_LITERAL,
      id,
      name: name.trim().slice(0, 64) || 'Save',
      updatedAt: Date.now(),
    });
    writeAtomic(this.dir, filePath, save);
    return save;
  }

  /** Deletes a manual save by id. Silently succeeds if it does not exist. */
  deleteSave(id: string): void {
    try {
      fs.rmSync(this.manualSavePath(id), { force: true });
    } catch {
      // Best-effort; nothing else useful to do if the filesystem refuses the delete.
    }
  }

  // -- connection history -------------------------------------------------

  /**
   * Lists remembered start-screen connections (server URL + player name),
   * newest first. Never throws: a missing, corrupt, or schema-invalid file
   * is treated the same as an empty history rather than surfacing an error
   * to the (purely convenience) start-screen UI.
   */
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

  /**
   * Records a (successful or attempted) connection, de-duplicating by
   * normalized URL + player name (see `mergeConnectionHistoryEntry`) and
   * moving any existing match to the front with a fresh timestamp. Blank
   * input is ignored -- returns the unmodified history in that case.
   */
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

  dispose(): void {
    this.cancelPendingAutosave();
  }

  private manualSavePath(id: string): string {
    const safeId = id.replace(/[^a-zA-Z0-9-]/g, '');
    return path.join(this.dir, `${safeId}.json`);
  }

  private writeHistoryAtomic(entries: ConnectionHistoryEntry[]): void {
    const dir = path.dirname(this.historyPath);
    fs.mkdirSync(dir, { recursive: true });
    const tmpPath = `${this.historyPath}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(entries, null, 2), 'utf-8');
    fs.renameSync(tmpPath, this.historyPath);
  }
}

const SAVE_FILE_VERSION_LITERAL = 1 as const;

function writeAtomic(dir: string, filePath: string, data: SaveFile): void {
  fs.mkdirSync(dir, { recursive: true });
  const tmpPath = `${filePath}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(tmpPath, filePath);
}

function readValidated(filePath: string): SaveFile {
  const raw = fs.readFileSync(filePath, 'utf-8');
  return saveFileSchema.parse(JSON.parse(raw));
}

function quarantine(filePath: string): void {
  try {
    const backupPath = `${filePath}.corrupt-${Date.now()}`;
    fs.renameSync(filePath, backupPath);
  } catch {
    // Best-effort only; if we can't even move the corrupt file, fall back
    // to starting fresh rather than crashing the app.
  }
}
