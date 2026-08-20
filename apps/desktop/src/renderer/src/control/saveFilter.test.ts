import { describe, expect, it } from 'vitest';
import type { SaveFileMeta } from '../../../common/saveTypes';
import { filterSavesByServerUrl } from './saveFilter';

function meta(overrides: Partial<SaveFileMeta> = {}): SaveFileMeta {
  return {
    id: 'id-1',
    name: 'Save',
    updatedAt: 0,
    lobbyId: null,
    playerCount: 0,
    serverUrl: 'ws://localhost:8787',
    ...overrides,
  };
}

describe('filterSavesByServerUrl', () => {
  it('returns all saves unfiltered when the entered URL is blank', () => {
    const saves = [meta({ id: 'a', serverUrl: 'ws://a:8787' }), meta({ id: 'b', serverUrl: 'ws://b:8787' })];
    expect(filterSavesByServerUrl(saves, '')).toEqual(saves);
    expect(filterSavesByServerUrl(saves, '   ')).toEqual(saves);
  });

  it('keeps only saves whose serverUrl matches, using normalized comparison', () => {
    const saves = [
      meta({ id: 'a', serverUrl: 'ws://localhost:8787' }),
      meta({ id: 'b', serverUrl: 'ws://otherhost:8787' }),
    ];
    expect(filterSavesByServerUrl(saves, 'WS://LocalHost:8787/').map((s) => s.id)).toEqual(['a']);
  });

  it('hides saves with no recorded serverUrl once a URL is entered', () => {
    const saves = [meta({ id: 'a', serverUrl: null }), meta({ id: 'b', serverUrl: 'ws://localhost:8787' })];
    expect(filterSavesByServerUrl(saves, 'ws://localhost:8787').map((s) => s.id)).toEqual(['b']);
  });

  it('returns an empty array when nothing matches', () => {
    const saves = [meta({ id: 'a', serverUrl: 'ws://a:8787' })];
    expect(filterSavesByServerUrl(saves, 'ws://b:8787')).toEqual([]);
  });
});
