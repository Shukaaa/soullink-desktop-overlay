import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_OVERLAY_SETTINGS, SLOT_COUNT } from '@soullink/shared';
import { SaveStateService } from './SaveStateService';

function makePlayer(id: string, pokemonId: number | null = null) {
  return {
    id,
    name: 'Ash',
    isHost: true,
    slots: Array.from({ length: SLOT_COUNT }, (_, i) => ({ pokemonId: i === 0 ? pokemonId : null })),
  };
}

describe('SaveStateService - autosave', () => {
  let dir: string;
  let service: SaveStateService;

  beforeEach(() => {
    dir = path.join(__dirname, `.tmp-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    service = new SaveStateService(dir);
  });

  afterEach(() => {
    service.dispose();
    fs.rmSync(dir, { recursive: true, force: true });
    vi.useRealTimers();
  });

  it('returns an empty autosave file when nothing has been persisted yet', () => {
    const { data, recoveredFromCorruption } = service.loadAutosave();
    expect(recoveredFromCorruption).toBe(false);
    expect(data.players).toEqual([]);
    expect(data.id).toBe('autosave');
    expect(data.version).toBe(1);
    expect(data.overlaySettings).toEqual(DEFAULT_OVERLAY_SETTINGS);
  });

  it('persists and reloads the autosave slot', () => {
    service.loadAutosave();
    service.saveAutosaveNow({
      playerName: 'Ash',
      serverUrl: 'ws://localhost:8787',
      lobbyId: 'ABC123',
      hostId: 'p1',
      selfPlayerId: 'p1',
      selfToken: 'tok1',
      players: [makePlayer('p1', 25)],
    });

    const reloaded = new SaveStateService(dir).loadAutosave();
    expect(reloaded.data.playerName).toBe('Ash');
    expect(reloaded.data.players).toHaveLength(1);
    expect(reloaded.data.players[0].slots).toHaveLength(SLOT_COUNT);
    expect(reloaded.data.players[0].slots[0]).toEqual({ pokemonId: 25 });
  });

  it('writes atomically, leaving no stray temp file behind', () => {
    service.loadAutosave();
    service.saveAutosaveNow({ playerName: 'Ash' });
    expect(fs.existsSync(service.autosavePathForDebug)).toBe(true);
    expect(fs.existsSync(`${service.autosavePathForDebug}.tmp`)).toBe(false);
  });

  it('recovers from a corrupted autosave file by quarantining it and starting fresh', () => {
    fs.mkdirSync(path.dirname(service.autosavePathForDebug), { recursive: true });
    fs.writeFileSync(service.autosavePathForDebug, '{ this is not valid json');

    const { data, recoveredFromCorruption } = service.loadAutosave();
    expect(recoveredFromCorruption).toBe(true);
    expect(data.players).toEqual([]);

    const files = fs.readdirSync(path.dirname(service.autosavePathForDebug));
    expect(files.some((f) => f.startsWith('autosave.json.corrupt-'))).toBe(true);
  });

  it('recovers from an autosave file that fails schema validation', () => {
    fs.mkdirSync(path.dirname(service.autosavePathForDebug), { recursive: true });
    fs.writeFileSync(service.autosavePathForDebug, JSON.stringify({ version: 999, garbage: true }));

    const { recoveredFromCorruption } = service.loadAutosave();
    expect(recoveredFromCorruption).toBe(true);
  });

  it('rejects a player snapshot with the wrong slot count', () => {
    service.loadAutosave();
    expect(() =>
      service.saveAutosaveNow({
        players: [{ id: 'p1', name: 'Ash', isHost: true, slots: [{ pokemonId: 1 }] }] as never,
      })
    ).toThrow();
  });

  it('debounces autosave so only the last call within the window is written', () => {
    vi.useFakeTimers();
    service.loadAutosave();
    service.scheduleAutosave({ playerName: 'First' }, 2000);
    vi.advanceTimersByTime(500);
    service.scheduleAutosave({ playerName: 'Second' }, 2000);
    vi.advanceTimersByTime(1999);
    expect(fs.existsSync(service.autosavePathForDebug)).toBe(false);

    vi.advanceTimersByTime(2);
    expect(fs.existsSync(service.autosavePathForDebug)).toBe(true);
    expect(service.currentAutosave.playerName).toBe('Second');
  });

  it('cancelPendingAutosave prevents a scheduled write from happening', () => {
    vi.useFakeTimers();
    service.loadAutosave();
    service.scheduleAutosave({ playerName: 'Ash' }, 1000);
    service.cancelPendingAutosave();
    vi.advanceTimersByTime(5000);
    expect(fs.existsSync(service.autosavePathForDebug)).toBe(false);
  });
});

describe('SaveStateService - manual saves', () => {
  let dir: string;
  let service: SaveStateService;

  beforeEach(() => {
    dir = path.join(__dirname, `.tmp-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    service = new SaveStateService(dir);
  });

  afterEach(() => {
    service.dispose();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('starts with an empty list', () => {
    expect(service.listSaves()).toEqual([]);
  });

  it('creates, lists, and loads a manual save', () => {
    const created = service.createSave('Before Elite Four', {
      playerName: 'Ash',
      serverUrl: 'ws://localhost:8787',
      lobbyId: 'ABC123',
      hostId: 'p1',
      selfPlayerId: 'p1',
      selfToken: 'tok1',
      players: [makePlayer('p1', 25), makePlayer('p2', 1)],
    });

    const list = service.listSaves();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: created.id, name: 'Before Elite Four', playerCount: 2 });

    const loaded = service.loadSave(created.id);
    expect(loaded.players).toHaveLength(2);
    expect(loaded.players[0].slots[0]).toEqual({ pokemonId: 25 });
  });

  it('never includes the autosave slot in the manual save list', () => {
    service.loadAutosave();
    service.saveAutosaveNow({ playerName: 'Ash' });
    service.createSave('Manual 1', {
      playerName: 'Ash',
      serverUrl: null,
      lobbyId: null,
      hostId: null,
      selfPlayerId: null,
      selfToken: null,
      players: [],
    });

    const list = service.listSaves();
    expect(list).toHaveLength(1);
    expect(list.find((s) => s.id === 'autosave')).toBeUndefined();
  });

  it('deletes a manual save', () => {
    const created = service.createSave('Temp', {
      playerName: null,
      serverUrl: null,
      lobbyId: null,
      hostId: null,
      selfPlayerId: null,
      selfToken: null,
      players: [],
    });
    expect(service.listSaves()).toHaveLength(1);

    service.deleteSave(created.id);
    expect(service.listSaves()).toHaveLength(0);
    expect(() => service.loadSave(created.id)).toThrow();
  });

  it('silently succeeds deleting a save that does not exist', () => {
    expect(() => service.deleteSave('does-not-exist')).not.toThrow();
  });

  it('overwrites an existing manual save in place, preserving its id', () => {
    const created = service.createSave('Before Elite Four', {
      playerName: 'Ash',
      serverUrl: 'ws://localhost:8787',
      lobbyId: 'ABC123',
      hostId: 'p1',
      selfPlayerId: 'p1',
      selfToken: 'tok1',
      players: [makePlayer('p1', 25)],
    });

    const updated = service.updateSave(created.id, 'After Elite Four', {
      playerName: 'Ash',
      serverUrl: 'ws://localhost:8787',
      lobbyId: 'ABC123',
      hostId: 'p1',
      selfPlayerId: 'p1',
      selfToken: 'tok1',
      players: [makePlayer('p1', 6), makePlayer('p2', 1)],
    });

    expect(updated.id).toBe(created.id);
    expect(updated.name).toBe('After Elite Four');
    expect(updated.players).toHaveLength(2);

    const list = service.listSaves();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: created.id, name: 'After Elite Four', playerCount: 2 });

    const reloaded = service.loadSave(created.id);
    expect(reloaded.players[0].slots[0]).toEqual({ pokemonId: 6 });
  });

  it('throws when trying to update a save that does not exist', () => {
    expect(() =>
      service.updateSave('does-not-exist', 'Whatever', {
        playerName: null,
        serverUrl: null,
        lobbyId: null,
        hostId: null,
        selfPlayerId: null,
        selfToken: null,
        players: [],
      })
    ).toThrow();
  });

  it('sorts manual saves newest first', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    const first = service.createSave('First', {
      playerName: null,
      serverUrl: null,
      lobbyId: null,
      hostId: null,
      selfPlayerId: null,
      selfToken: null,
      players: [],
    });
    vi.setSystemTime(2000);
    const second = service.createSave('Second', {
      playerName: null,
      serverUrl: null,
      lobbyId: null,
      hostId: null,
      selfPlayerId: null,
      selfToken: null,
      players: [],
    });
    vi.useRealTimers();

    const list = service.listSaves();
    expect(list.map((s) => s.id)).toEqual([second.id, first.id]);
  });
});

describe('SaveStateService - connection history', () => {
  let dir: string;
  let service: SaveStateService;

  beforeEach(() => {
    dir = path.join(__dirname, `.tmp-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    service = new SaveStateService(dir);
  });

  afterEach(() => {
    service.dispose();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('starts with an empty history', () => {
    expect(service.listConnectionHistory()).toEqual([]);
  });

  it('records and lists a connection, newest first', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    service.recordConnection({ serverUrl: 'ws://localhost:8787', playerName: 'Ash' });
    vi.setSystemTime(2000);
    service.recordConnection({ serverUrl: 'ws://otherhost:8787', playerName: 'Misty' });
    vi.useRealTimers();

    const history = service.listConnectionHistory();
    expect(history).toHaveLength(2);
    expect(history[0]).toMatchObject({ serverUrl: 'ws://otherhost:8787', playerName: 'Misty' });
    expect(history[1]).toMatchObject({ serverUrl: 'ws://localhost:8787', playerName: 'Ash' });
  });

  it('de-duplicates a repeat connection to the same URL + name, moving it to the front', () => {
    service.recordConnection({ serverUrl: 'ws://a:8787', playerName: 'Ash' });
    service.recordConnection({ serverUrl: 'ws://b:8787', playerName: 'Misty' });
    service.recordConnection({ serverUrl: 'ws://a:8787', playerName: 'Ash' });

    const history = service.listConnectionHistory();
    expect(history).toHaveLength(2);
    expect(history[0]).toMatchObject({ serverUrl: 'ws://a:8787', playerName: 'Ash' });
  });

  it('ignores blank server URL or player name', () => {
    service.recordConnection({ serverUrl: '  ', playerName: 'Ash' });
    service.recordConnection({ serverUrl: 'ws://a:8787', playerName: '  ' });
    expect(service.listConnectionHistory()).toEqual([]);
  });

  it('persists history atomically across service instances', () => {
    service.recordConnection({ serverUrl: 'ws://localhost:8787', playerName: 'Ash' });
    expect(fs.existsSync(path.join(dir, 'connection-history.json.tmp'))).toBe(false);

    const reloaded = new SaveStateService(dir).listConnectionHistory();
    expect(reloaded).toHaveLength(1);
    expect(reloaded[0]).toMatchObject({ serverUrl: 'ws://localhost:8787', playerName: 'Ash' });
  });

  it('recovers gracefully (empty list) from a corrupted history file', () => {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'connection-history.json'), '{ not valid json');
    expect(service.listConnectionHistory()).toEqual([]);
  });

  it('never stores connection history entries under the saves directory', () => {
    service.recordConnection({ serverUrl: 'ws://localhost:8787', playerName: 'Ash' });
    expect(service.listSaves()).toEqual([]);
  });
});

describe('SaveStateService - overlaySettings persistence & backward compatibility', () => {
  let dir: string;
  let service: SaveStateService;

  beforeEach(() => {
    dir = path.join(__dirname, `.tmp-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    service = new SaveStateService(dir);
  });

  afterEach(() => {
    service.dispose();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('defaults overlaySettings on a brand new manual save when omitted', () => {
    const created = service.createSave('Fresh', {
      playerName: null,
      serverUrl: null,
      lobbyId: null,
      hostId: null,
      selfPlayerId: null,
      selfToken: null,
      players: [],
    });
    expect(created.overlaySettings).toEqual(DEFAULT_OVERLAY_SETTINGS);
  });

  it('round-trips custom overlaySettings through a manual save', () => {
    const created = service.createSave('Custom', {
      playerName: null,
      serverUrl: null,
      lobbyId: null,
      hostId: null,
      selfPlayerId: null,
      selfToken: null,
      players: [],
      overlaySettings: { position: 'top-left', scale: 1.5, tooltipsEnabled: true, tooltipLanguage: 'de' },
    });
    const reloaded = service.loadSave(created.id);
    expect(reloaded.overlaySettings).toEqual({
      position: 'top-left',
      scale: 1.5,
      tooltipsEnabled: true,
      tooltipLanguage: 'de',
    });
  });

  it('round-trips custom overlaySettings through the autosave slot', () => {
    service.loadAutosave();
    service.saveAutosaveNow({
      overlaySettings: { position: 'bottom-left', scale: 0.75, tooltipsEnabled: true, tooltipLanguage: 'en' },
    });
    const reloaded = new SaveStateService(dir).loadAutosave();
    expect(reloaded.data.overlaySettings).toEqual({
      position: 'bottom-left',
      scale: 0.75,
      tooltipsEnabled: true,
      tooltipLanguage: 'en',
    });
  });

  it('loads an old-format autosave file with no overlaySettings field at all, defaulting it', () => {
    fs.mkdirSync(path.dirname(service.autosavePathForDebug), { recursive: true });
    const legacySave = {
      version: 1,
      id: 'autosave',
      name: 'Autosave',
      playerName: 'Ash',
      serverUrl: 'ws://localhost:8787',
      lobbyId: null,
      hostId: null,
      selfPlayerId: null,
      selfToken: null,
      players: [],
      updatedAt: Date.now(),
      // no overlaySettings key -- simulates a save written before this feature existed
    };
    fs.writeFileSync(service.autosavePathForDebug, JSON.stringify(legacySave));

    const { data, recoveredFromCorruption } = service.loadAutosave();
    expect(recoveredFromCorruption).toBe(false);
    expect(data.playerName).toBe('Ash');
    expect(data.overlaySettings).toEqual(DEFAULT_OVERLAY_SETTINGS);
  });

  it('normalizes an invalid/corrupt overlaySettings value instead of rejecting the whole save', () => {
    fs.mkdirSync(path.dirname(service.autosavePathForDebug), { recursive: true });
    const save = {
      version: 1,
      id: 'autosave',
      name: 'Autosave',
      playerName: null,
      serverUrl: null,
      lobbyId: null,
      hostId: null,
      selfPlayerId: null,
      selfToken: null,
      players: [],
      updatedAt: Date.now(),
      overlaySettings: { position: 'diagonal', scale: 999, tooltipsEnabled: 'yes', tooltipLanguage: 'fr' },
    };
    fs.writeFileSync(service.autosavePathForDebug, JSON.stringify(save));

    const { data, recoveredFromCorruption } = service.loadAutosave();
    expect(recoveredFromCorruption).toBe(false);
    // position/tooltipsEnabled/tooltipLanguage are invalid types/values so
    // they fall back to defaults; scale is a number, just out of range, so
    // it gets clamped rather than defaulted.
    expect(data.overlaySettings).toEqual({ ...DEFAULT_OVERLAY_SETTINGS, scale: 2 });
  });

  it('preserves previously-persisted overlaySettings when a lobby-only autosave partial is scheduled', () => {
    service.loadAutosave();
    service.saveAutosaveNow({
      overlaySettings: { position: 'top-right', scale: 2, tooltipsEnabled: true, tooltipLanguage: 'de' },
    });
    // A later autosave that only updates lobby fields (no overlaySettings key at all).
    service.saveAutosaveNow({ playerName: 'Ash' });
    expect(service.currentAutosave.overlaySettings).toEqual({
      position: 'top-right',
      scale: 2,
      tooltipsEnabled: true,
      tooltipLanguage: 'de',
    });
  });

  it('merges (rather than clobbers) concurrent debounced scheduleAutosave calls with different fields', () => {
    vi.useFakeTimers();
    service.loadAutosave();
    service.scheduleAutosave({ overlaySettings: { position: 'top-left', scale: 1, tooltipsEnabled: false, tooltipLanguage: 'en' } }, 2000);
    vi.advanceTimersByTime(500);
    // A second, unrelated partial scheduled inside the same debounce window
    // must not wipe out the first call's overlaySettings field.
    service.scheduleAutosave({ playerName: 'Ash' }, 2000);
    vi.advanceTimersByTime(2000);

    expect(service.currentAutosave.playerName).toBe('Ash');
    expect(service.currentAutosave.overlaySettings).toEqual({
      position: 'top-left',
      scale: 1,
      tooltipsEnabled: false,
      tooltipLanguage: 'en',
    });
    vi.useRealTimers();
  });
});
