import type { ConnectionStatus } from '../state/store';

export interface PanelVisibility {
  /** The connection form (server URL + name + Connect button). */
  showConnectionForm: boolean;
  /** The compact status tag shown once a connection attempt has started. */
  showStatusTag: boolean;
  /** The "create or join a lobby" panel. */
  showLobbyCreateJoin: boolean;
  /** The active-lobby panel (player rows, slot editor, leave button). */
  showLobbyDetail: boolean;
  /** The overlay click-through settings panel. */
  showOverlaySettings: boolean;
}

/**
 * Decides which control-panel sections are visible for a given connection
 * status and whether a lobby is currently joined. Only a fully `open`
 * connection unlocks the lobby/overlay sections -- while idle, closed,
 * connecting, or reconnecting, only the connection form (plus header/error/
 * status, handled separately by the caller) is shown.
 */
export function getPanelVisibility(connectionStatus: ConnectionStatus, hasLobby: boolean): PanelVisibility {
  const isOpen = connectionStatus === 'open';
  const showConnectionForm = connectionStatus === 'idle' || connectionStatus === 'closed';
  return {
    showConnectionForm,
    showStatusTag: !showConnectionForm,
    showLobbyCreateJoin: isOpen && !hasLobby,
    showLobbyDetail: isOpen && hasLobby,
    showOverlaySettings: isOpen,
  };
}
