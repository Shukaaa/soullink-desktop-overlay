import { describe, expect, it } from 'vitest';
import {
  mergeConnectionHistoryEntry,
  removeConnectionHistoryEntry,
  type ConnectionHistoryEntry,
} from './connectionHistory';

function entry(overrides: Partial<ConnectionHistoryEntry> = {}): ConnectionHistoryEntry {
  return {
    serverUrl: 'ws://localhost:8787',
    playerName: 'Ash',
    lastConnectedAt: 1,
    ...overrides,
  };
}

describe('mergeConnectionHistoryEntry', () => {
  it('adds a brand new entry to the front of an empty list', () => {
    const result = mergeConnectionHistoryEntry([], entry());
    expect(result).toEqual([entry()]);
  });

  describe('removeConnectionHistoryEntry', () => {
    it('removes only the matching URL and player name', () => {
      const removed = entry();
      const retained = entry({ playerName: 'Misty' });

      expect(removeConnectionHistoryEntry([removed, retained], removed)).toEqual([retained]);
    });

    it('uses the same URL and player-name normalization as de-duplication', () => {
      const existing = entry({ serverUrl: 'WS://LOCALHOST:8787/', playerName: '  ash  ' });

      expect(
        removeConnectionHistoryEntry([existing], { serverUrl: 'ws://localhost:8787', playerName: 'ASH' })
      ).toEqual([]);
    });
  });

  it('puts the newest entry first, ahead of unrelated existing entries', () => {
    const older = entry({ serverUrl: 'ws://otherhost:8787', playerName: 'Misty', lastConnectedAt: 1 });
    const result = mergeConnectionHistoryEntry([older], entry({ lastConnectedAt: 2 }));
    expect(result).toEqual([entry({ lastConnectedAt: 2 }), older]);
  });

  it('de-duplicates when both URL and player name match, moving the entry to the front with updated timestamp', () => {
    const existing = entry({ lastConnectedAt: 1 });
    const result = mergeConnectionHistoryEntry([existing], entry({ lastConnectedAt: 99 }));
    expect(result).toEqual([entry({ lastConnectedAt: 99 })]);
  });

  it('treats matching de-duplication as case/whitespace-insensitive for player name', () => {
    const existing = entry({ playerName: '  ash  ', lastConnectedAt: 1 });
    const result = mergeConnectionHistoryEntry([existing], entry({ playerName: 'ASH', lastConnectedAt: 2 }));
    expect(result).toHaveLength(1);
    expect(result[0].playerName).toBe('ASH');
    expect(result[0].lastConnectedAt).toBe(2);
  });

  it('treats matching de-duplication as normalized-URL-insensitive (trailing slash/case)', () => {
    const existing = entry({ serverUrl: 'WS://LOCALHOST:8787/', lastConnectedAt: 1 });
    const result = mergeConnectionHistoryEntry([existing], entry({ serverUrl: 'ws://localhost:8787', lastConnectedAt: 2 }));
    expect(result).toHaveLength(1);
    expect(result[0].serverUrl).toBe('ws://localhost:8787');
  });

  it('keeps entries for the same URL but a different player name as distinct', () => {
    const existing = entry({ playerName: 'Ash' });
    const result = mergeConnectionHistoryEntry([existing], entry({ playerName: 'Misty', lastConnectedAt: 2 }));
    expect(result).toHaveLength(2);
  });

  it('keeps entries for the same player name but a different URL as distinct', () => {
    const existing = entry({ serverUrl: 'ws://hosta:8787' });
    const result = mergeConnectionHistoryEntry([existing], entry({ serverUrl: 'ws://hostb:8787', lastConnectedAt: 2 }));
    expect(result).toHaveLength(2);
  });

  it('caps the result at maxEntries, dropping the oldest', () => {
    const existing: ConnectionHistoryEntry[] = Array.from({ length: 5 }, (_, i) =>
      entry({ serverUrl: `ws://host${i}:8787`, lastConnectedAt: i })
    );
    const result = mergeConnectionHistoryEntry(existing, entry({ serverUrl: 'ws://new:8787', lastConnectedAt: 100 }), 3);
    expect(result).toHaveLength(3);
    expect(result[0].serverUrl).toBe('ws://new:8787');
  });
});
