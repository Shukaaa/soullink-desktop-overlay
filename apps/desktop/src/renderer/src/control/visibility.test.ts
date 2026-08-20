import { describe, expect, it } from 'vitest';
import type { ConnectionStatus } from '../state/store';
import { getPanelVisibility } from './visibility';

const statuses: ConnectionStatus[] = ['idle', 'connecting', 'open', 'reconnecting', 'closed'];

describe('getPanelVisibility', () => {
  it.each(statuses)('shows only the connection form (plus status tag) while not open: %s', (status) => {
    if (status === 'open') return;
    const visibility = getPanelVisibility(status, false);
    expect(visibility.showLobbyCreateJoin).toBe(false);
    expect(visibility.showLobbyDetail).toBe(false);
    expect(visibility.showOverlaySettings).toBe(false);
    expect(visibility.showSaves).toBe(false);
    expect(visibility.showSaveCurrentAction).toBe(false);
  });

  it('shows the connection form only when idle or closed', () => {
    expect(getPanelVisibility('idle', false).showConnectionForm).toBe(true);
    expect(getPanelVisibility('closed', false).showConnectionForm).toBe(true);
    expect(getPanelVisibility('connecting', false).showConnectionForm).toBe(false);
    expect(getPanelVisibility('reconnecting', false).showConnectionForm).toBe(false);
    expect(getPanelVisibility('open', false).showConnectionForm).toBe(false);
  });

  it('shows the status tag whenever the connection form is hidden', () => {
    for (const status of statuses) {
      const visibility = getPanelVisibility(status, false);
      expect(visibility.showStatusTag).toBe(!visibility.showConnectionForm);
    }
  });

  it('hides lobby/overlay/save sections while connecting or reconnecting even if a lobby persists', () => {
    for (const status of ['connecting', 'reconnecting'] as ConnectionStatus[]) {
      const visibility = getPanelVisibility(status, true);
      expect(visibility.showLobbyCreateJoin).toBe(false);
      expect(visibility.showLobbyDetail).toBe(false);
      expect(visibility.showOverlaySettings).toBe(false);
      expect(visibility.showSaves).toBe(false);
      expect(visibility.showSaveCurrentAction).toBe(false);
    }
  });

  it('shows create/join lobby panel when open with no lobby', () => {
    const visibility = getPanelVisibility('open', false);
    expect(visibility.showLobbyCreateJoin).toBe(true);
    expect(visibility.showLobbyDetail).toBe(false);
    expect(visibility.showOverlaySettings).toBe(true);
    expect(visibility.showSaves).toBe(true);
    expect(visibility.showSaveCurrentAction).toBe(false);
  });

  it('shows lobby detail and the save-current action when open with a lobby', () => {
    const visibility = getPanelVisibility('open', true);
    expect(visibility.showLobbyCreateJoin).toBe(false);
    expect(visibility.showLobbyDetail).toBe(true);
    expect(visibility.showOverlaySettings).toBe(true);
    expect(visibility.showSaves).toBe(true);
    expect(visibility.showSaveCurrentAction).toBe(true);
  });

  it('shows the saves load dropdown even when open with no lobby (no save-current action though)', () => {
    const visibility = getPanelVisibility('open', false);
    expect(visibility.showSaves).toBe(true);
    expect(visibility.showSaveCurrentAction).toBe(false);
  });
});
