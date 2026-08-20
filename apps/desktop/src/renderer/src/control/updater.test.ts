import { describe, expect, it } from 'vitest';
import { INITIAL_UPDATER_STATE, reduceUpdaterEvent } from './updater';
import type { UpdaterState } from '../../../common/updaterTypes';

const baseState: UpdaterState = { ...INITIAL_UPDATER_STATE, currentVersion: '0.1.5' };

describe('reduceUpdaterEvent', () => {
  it('moves to checking and clears any previous error', () => {
    const result = reduceUpdaterEvent({ ...baseState, status: 'error', errorMessage: 'oops' }, { kind: 'checking' });
    expect(result.status).toBe('checking');
    expect(result.errorMessage).toBeNull();
  });

  it('records the available version', () => {
    const result = reduceUpdaterEvent(baseState, { kind: 'available', version: '0.2.0' });
    expect(result.status).toBe('available');
    expect(result.availableVersion).toBe('0.2.0');
  });

  it('clears availableVersion/progress when no update is available', () => {
    const result = reduceUpdaterEvent(
      { ...baseState, status: 'available', availableVersion: '0.2.0' },
      { kind: 'not-available', version: '0.1.5' }
    );
    expect(result.status).toBe('not-available');
    expect(result.availableVersion).toBeNull();
  });

  it('tracks download progress', () => {
    const progress = { percent: 37.5, bytesPerSecond: 2048, transferred: 375, total: 1000 };
    const result = reduceUpdaterEvent(baseState, { kind: 'download-progress', progress });
    expect(result.status).toBe('downloading');
    expect(result.progress).toEqual(progress);
  });

  it('marks the update downloaded and ready to install', () => {
    const result = reduceUpdaterEvent(
      { ...baseState, status: 'downloading', progress: { percent: 100, bytesPerSecond: 0, transferred: 1000, total: 1000 } },
      { kind: 'downloaded', version: '0.2.0' }
    );
    expect(result.status).toBe('downloaded');
    expect(result.availableVersion).toBe('0.2.0');
    expect(result.progress).toBeNull();
  });

  it('surfaces errors with their message', () => {
    const result = reduceUpdaterEvent(baseState, { kind: 'error', message: 'network down' });
    expect(result.status).toBe('error');
    expect(result.errorMessage).toBe('network down');
  });

  it('never mutates the input state object', () => {
    const input = { ...baseState };
    reduceUpdaterEvent(input, { kind: 'checking' });
    expect(input).toEqual(baseState);
  });
});
