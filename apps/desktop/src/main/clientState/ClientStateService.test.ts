import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_OVERLAY_SETTINGS } from '@soullink/shared';
import { ClientStateService } from './ClientStateService';

describe('ClientStateService - client preferences', () => {
  let dir: string;
  let service: ClientStateService;

  beforeEach(() => {
    dir = path.join(__dirname, `.tmp-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    service = new ClientStateService(dir);
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
    vi.useRealTimers();
  });

  it('returns defaults without writing a lobby snapshot', () => {
    expect(service.loadClientPreferences()).toEqual({
      playerName: null,
      serverUrl: null,
      overlaySettings: DEFAULT_OVERLAY_SETTINGS,
    });
    expect(fs.existsSync(dir)).toBe(false);
  });

  it('persists only client preferences atomically', () => {
    service.loadClientPreferences();
    const preferences = service.saveClientPreferences({
      playerName: 'Ash',
      serverUrl: 'ws://localhost:8787',
      overlaySettings: { ...DEFAULT_OVERLAY_SETTINGS, scale: 1.25 },
    });

    expect(preferences).toEqual({
      playerName: 'Ash',
      serverUrl: 'ws://localhost:8787',
      overlaySettings: { ...DEFAULT_OVERLAY_SETTINGS, scale: 1.25 },
    });
    expect(fs.existsSync(path.join(dir, 'client-preferences.json.tmp'))).toBe(false);
    expect(JSON.parse(fs.readFileSync(path.join(dir, 'client-preferences.json'), 'utf-8'))).toEqual(preferences);
    expect(new ClientStateService(dir).loadClientPreferences()).toEqual(preferences);
  });

  it('migrates only preferences from the legacy autosave without deleting it', () => {
    const legacyPath = path.join(dir, 'saves', 'autosave.json');
    fs.mkdirSync(path.dirname(legacyPath), { recursive: true });
    fs.writeFileSync(
      legacyPath,
      JSON.stringify({
        playerName: 'Ash',
        serverUrl: 'ws://localhost:8787',
        overlaySettings: DEFAULT_OVERLAY_SETTINGS,
        lobbyId: 'ABC123',
        hostId: 'p1',
        selfToken: 'private-lobby-token',
        players: [{ id: 'p1', name: 'Ash' }],
        ordenes: [true],
      })
    );

    expect(service.loadClientPreferences()).toEqual({
      playerName: 'Ash',
      serverUrl: 'ws://localhost:8787',
      overlaySettings: DEFAULT_OVERLAY_SETTINGS,
    });
    expect(JSON.parse(fs.readFileSync(path.join(dir, 'client-preferences.json'), 'utf-8'))).toEqual({
      playerName: 'Ash',
      serverUrl: 'ws://localhost:8787',
      overlaySettings: DEFAULT_OVERLAY_SETTINGS,
    });
    expect(fs.existsSync(legacyPath)).toBe(true);
  });

  it('quarantines a corrupt legacy autosave and starts with defaults', () => {
    const legacyPath = path.join(dir, 'saves', 'autosave.json');
    fs.mkdirSync(path.dirname(legacyPath), { recursive: true });
    fs.writeFileSync(legacyPath, '{ not valid JSON');

    expect(service.loadClientPreferences().overlaySettings).toEqual(DEFAULT_OVERLAY_SETTINGS);
    expect(fs.existsSync(legacyPath)).toBe(false);
    expect(fs.readdirSync(path.dirname(legacyPath)).some((name) => name.startsWith('autosave.json.legacy-'))).toBe(true);
  });
});

describe('ClientStateService - connection history', () => {
  let dir: string;
  let service: ClientStateService;

  beforeEach(() => {
    dir = path.join(__dirname, `.tmp-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    service = new ClientStateService(dir);
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
    vi.useRealTimers();
  });

  it('starts with an empty history', () => {
    expect(service.listConnectionHistory()).toEqual([]);
  });

  it('records and lists connections newest first', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    service.recordConnection({ serverUrl: 'ws://localhost:8787', playerName: 'Ash' });
    vi.setSystemTime(2000);
    service.recordConnection({ serverUrl: 'ws://otherhost:8787', playerName: 'Misty' });

    expect(service.listConnectionHistory().map((entry) => entry.playerName)).toEqual(['Misty', 'Ash']);
  });

  it('deduplicates connections and removes history entries', () => {
    service.recordConnection({ serverUrl: 'ws://a:8787', playerName: 'Ash' });
    service.recordConnection({ serverUrl: 'ws://b:8787', playerName: 'Misty' });
    service.recordConnection({ serverUrl: 'ws://a:8787', playerName: 'Ash' });

    const remaining = service.removeConnectionHistoryEntry({
      serverUrl: 'WS://A:8787/',
      playerName: ' ash ',
    });
    expect(remaining).toHaveLength(1);
    expect(remaining[0]).toMatchObject({ serverUrl: 'ws://b:8787', playerName: 'Misty' });
    expect(new ClientStateService(dir).listConnectionHistory()).toEqual(remaining);
  });

  it('ignores blank connections and recovers from a corrupt history file', () => {
    service.recordConnection({ serverUrl: '  ', playerName: 'Ash' });
    expect(service.listConnectionHistory()).toEqual([]);

    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'connection-history.json'), '{ not valid JSON');
    expect(service.listConnectionHistory()).toEqual([]);
  });
});
