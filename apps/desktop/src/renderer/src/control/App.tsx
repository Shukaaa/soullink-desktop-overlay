import { useEffect, useMemo, useRef, useState } from 'react';
import type { PokedexEntry, OverlayPosition, OverlaySettings, TooltipLanguage } from '@soullink/shared';
import { DEFAULT_OVERLAY_SETTINGS, MAX_OVERLAY_SCALE, MIN_OVERLAY_SCALE } from '@soullink/shared';
import type { ConnectionHistoryEntry } from '../../../common/connectionHistoryTypes';
import type { SaveFileMeta } from '../../../common/saveTypes';
import { useAppStore, type ConnectionStatus } from '../state/store';
import { useWsBridge } from '../state/useWsBridge';
import { PokemonPicker } from '../components/PokemonPicker';
import { PlayerRow } from '../components/PlayerRow';
import { AccordionItem } from '../components/AccordionItem';
import { getPanelVisibility } from './visibility';
import { nextAccordionSection, toggleAccordionSection, type AccordionSection } from './accordion';
import { filterSavesByServerUrl } from './saveFilter';

/** Human-readable label for the compact status tag shown once a connection
 * attempt has started (see `showConnectionForm` below). The 'open' case is
 * handled separately by the caller so it can show the signed-in username. */
function connectionStatusLabel(
  status: ConnectionStatus,
  reconnectInfo: { attempt: number; delayMs: number } | null
): string {
  switch (status) {
    case 'connecting':
      return 'Verbinde…';
    case 'reconnecting':
      return reconnectInfo
        ? `Verbindung unterbrochen – Versuch #${reconnectInfo.attempt} in ${Math.round(reconnectInfo.delayMs / 1000)}s`
        : 'Verbindung unterbrochen – erneuter Versuch…';
    case 'closed':
      return 'Getrennt';
    default:
      return status;
  }
}

export function App() {
  useWsBridge();

  const { connectionStatus, error, lobby, selfPlayerId, reconnectInfo } = useAppStore();

  const [serverUrl, setServerUrl] = useState('ws://localhost:8787');
  const [playerName, setPlayerName] = useState('');
  const [joinLobbyId, setJoinLobbyId] = useState('');
  const [editingSlotIndex, setEditingSlotIndex] = useState<number | null>(null);
  const [overlayClickThrough, setOverlayClickThrough] = useState(true);
  const [overlaySettings, setOverlaySettingsState] = useState<OverlaySettings>(DEFAULT_OVERLAY_SETTINGS);
  const [saves, setSaves] = useState<SaveFileMeta[]>([]);
  const [savedHint, setSavedHint] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveName, setSaveName] = useState('');
  const [selectedSaveId, setSelectedSaveId] = useState('');
  const [history, setHistory] = useState<ConnectionHistoryEntry[]>([]);
  const [openSection, setOpenSection] = useState<AccordionSection>('lobby');

  useEffect(() => {
    window.api.loadAutosave().then((save) => {
      if (save.serverUrl) setServerUrl(save.serverUrl);
      if (save.playerName) setPlayerName(save.playerName);
    });
    // Overlay settings are fetched from main separately (rather than solely
    // relying on the autosave payload above) so this mirrors the exact
    // in-memory state the overlay window itself starts from at app launch.
    window.api.getOverlaySettings().then(setOverlaySettingsState);
    refreshSaves();
    refreshHistory();
    const unsubscribe = window.api.onOverlayClickThroughChange(setOverlayClickThrough);
    return unsubscribe;
  }, []);

  // Whenever we're no longer in a lobby (left voluntarily, kicked, or never
  // joined one) make sure no stale slot-editing/picker state lingers around.
  useEffect(() => {
    if (!lobby) setEditingSlotIndex(null);
  }, [lobby]);

  // Accordion default: force the Lobby section open right after connecting
  // (no lobby yet) and again right after a lobby is created/joined, so the
  // user always lands on the most relevant section without it fighting a
  // manually-opened Overlay/Saves section the rest of the time.
  const prevConnectedRef = useRef(false);
  const prevHasLobbyRef = useRef(false);
  useEffect(() => {
    const connected = connectionStatus === 'open';
    setOpenSection((current) =>
      nextAccordionSection({
        prevConnected: prevConnectedRef.current,
        connected,
        prevHasLobby: prevHasLobbyRef.current,
        hasLobby: !!lobby,
        current,
      })
    );
    prevConnectedRef.current = connected;
    prevHasLobbyRef.current = !!lobby;
  }, [connectionStatus, lobby]);

  function refreshSaves(): void {
    window.api.listSaves().then(setSaves);
  }

  function refreshHistory(): void {
    window.api.listConnectionHistory().then(setHistory);
  }

  const isHost = !!lobby && !!selfPlayerId && lobby.hostId === selfPlayerId;
  const selfPlayer = lobby?.players.find((p) => p.id === selfPlayerId) ?? null;
  const visibility = getPanelVisibility(connectionStatus, !!lobby);
  const filteredSaves = useMemo(() => filterSavesByServerUrl(saves, serverUrl), [saves, serverUrl]);

  // If the saved server URL changes such that the previously-selected save
  // is no longer for this server, drop the selection rather than leaving a
  // stale/invisible id selected.
  useEffect(() => {
    if (selectedSaveId && !filteredSaves.some((s) => s.id === selectedSaveId)) {
      setSelectedSaveId('');
      setSaveName('');
    }
  }, [filteredSaves, selectedSaveId]);

  function connect() {
    window.api.connect({ serverUrl, playerName }).then(refreshHistory);
  }

  /** Fills in the URL/name from a history entry and connects directly with it
   * (rather than relying on state having flushed into `serverUrl`/`playerName`). */
  function connectFromHistory(entry: ConnectionHistoryEntry) {
    setServerUrl(entry.serverUrl);
    setPlayerName(entry.playerName);
    window.api.connect({ serverUrl: entry.serverUrl, playerName: entry.playerName }).then(refreshHistory);
  }

  function disconnect() {
    window.api.disconnect();
  }

  function createLobby() {
    window.api.send({ type: 'CREATE_LOBBY', name: playerName });
  }

  function joinLobby() {
    window.api.send({ type: 'JOIN_LOBBY', lobbyId: joinLobbyId.trim().toUpperCase(), name: playerName });
  }

  function leaveLobby() {
    window.api.send({ type: 'LEAVE_LOBBY' });
  }

  function kickPlayer(playerId: string) {
    window.api.send({ type: 'KICK_PLAYER', playerId });
  }

  function onSlotClick(index: number) {
    setEditingSlotIndex((current) => (current === index ? null : index));
  }

  function pickSpecies(entry: PokedexEntry) {
    if (editingSlotIndex === null) return;
    window.api.send({ type: 'SET_POKEMON', slotIndex: editingSlotIndex, pokemonId: entry.id });
    setEditingSlotIndex(null);
  }

  function clearEditingSlot() {
    if (editingSlotIndex === null) return;
    window.api.send({ type: 'REMOVE_POKEMON', slotIndex: editingSlotIndex });
    setEditingSlotIndex(null);
  }

  function toggleOverlayClickThrough(checked: boolean) {
    setOverlayClickThrough(checked);
    window.api.setOverlayIgnoreMouse(checked);
  }

  /** Applies an overlay-settings change optimistically, then reconciles with
   * the normalized value main actually persisted/applied (e.g. a clamped scale). */
  async function updateOverlaySettings(partial: Partial<OverlaySettings>) {
    setOverlaySettingsState((current) => ({ ...current, ...partial }));
    const applied = await window.api.updateOverlaySettings(partial);
    setOverlaySettingsState(applied);
  }

  function onSelectSave(id: string) {
    setSelectedSaveId(id);
    setSaveError(null);
    const meta = saves.find((s) => s.id === id);
    setSaveName(meta ? meta.name : '');
  }

  /** Creates a new save when nothing is selected, or overwrites the selected one. */
  async function saveCurrent() {
    const name = saveName.trim();
    if (!name) return;
    setSaveError(null);
    try {
      if (selectedSaveId) {
        await window.api.updateSave(selectedSaveId, name);
        setSavedHint(`Updated "${name}"`);
      } else {
        const created = await window.api.createSave(name);
        setSelectedSaveId(created.id);
        setSavedHint(`Saved "${name}"`);
      }
      refreshSaves();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save.');
    }
  }

  async function loadSelectedSave() {
    if (!selectedSaveId) return;
    setSaveError(null);
    try {
      const save = await window.api.restoreSave(selectedSaveId);
      if (save.serverUrl) setServerUrl(save.serverUrl);
      if (save.playerName) setPlayerName(save.playerName);
      setOverlaySettingsState(save.overlaySettings);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to load save.');
    }
  }

  async function handleDeleteSave(id: string) {
    setSaveError(null);
    try {
      await window.api.deleteSave(id);
      if (selectedSaveId === id) {
        setSelectedSaveId('');
        setSaveName('');
      }
      refreshSaves();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to delete save.');
    }
  }

  return (
    <div className="app">
      <h1>SoulLink Overlay</h1>

      {visibility.showStatusTag && (
        <div className={`connection-status-tag status-${connectionStatus}`}>
          <span className="connection-status-text">
            {connectionStatus === 'open'
              ? `Angemeldet als ${playerName}`
              : connectionStatusLabel(connectionStatus, reconnectInfo)}
          </span>
          <button type="button" className="disconnect-link" onClick={disconnect}>
            Disconnect
          </button>
        </div>
      )}
      {error && <p className="error-line">{error}</p>}

      {visibility.showConnectionForm && (
        <section className="panel">
          <h2>Connection</h2>
          <label>
            Server URL
            <input value={serverUrl} onChange={(e) => setServerUrl(e.target.value)} />
          </label>
          <label>
            Your name
            <input value={playerName} onChange={(e) => setPlayerName(e.target.value)} />
          </label>
          <div className="button-row">
            <button type="button" onClick={connect} disabled={!playerName.trim() || !serverUrl.trim()}>
              Connect
            </button>
          </div>
        </section>
      )}

      {visibility.showConnectionForm && history.length > 0 && (
        <section className="panel history-panel">
          <h2>Recent Connections</h2>
          <ul className="history-list">
            {history.map((entry) => (
              <li key={`${entry.serverUrl}|${entry.playerName}`} className="history-row">
                <div className="history-info">
                  <span className="history-name">{entry.playerName}</span>
                  <span className="history-url">{entry.serverUrl}</span>
                </div>
                <button type="button" onClick={() => connectFromHistory(entry)}>
                  Connect
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {(visibility.showLobbyCreateJoin || visibility.showLobbyDetail) && (
        <AccordionItem
          id="lobby"
          title={visibility.showLobbyDetail && lobby ? `Lobby ${lobby.id}` : 'Lobby'}
          isOpen={openSection === 'lobby'}
          onToggle={() => setOpenSection((current) => toggleAccordionSection(current, 'lobby'))}
        >
          {visibility.showLobbyCreateJoin && (
            <>
              <div className="button-row">
                <button type="button" onClick={createLobby}>
                  Create Lobby
                </button>
              </div>
              <div className="button-row">
                <input
                  placeholder="Lobby code"
                  value={joinLobbyId}
                  onChange={(e) => setJoinLobbyId(e.target.value)}
                />
                <button type="button" onClick={joinLobby} disabled={!joinLobbyId.trim()}>
                  Join Lobby
                </button>
              </div>
            </>
          )}

          {visibility.showLobbyDetail && lobby && (
            <>
              <div className="player-list">
                {lobby.players.map((p) => (
                  <PlayerRow
                    key={p.id}
                    player={p}
                    isSelf={p.id === selfPlayerId}
                    isHost={isHost}
                    editingSlotIndex={editingSlotIndex}
                    onSlotClick={onSlotClick}
                    onKick={kickPlayer}
                  />
                ))}
              </div>
              {selfPlayer && editingSlotIndex !== null && (
                <div className="slot-editor">
                  <div className="button-row">
                    <span>Editing slot {editingSlotIndex + 1}</span>
                    <button type="button" onClick={clearEditingSlot}>
                      Clear slot
                    </button>
                  </div>
                  <PokemonPicker onSelect={pickSpecies} selectedId={selfPlayer.slots[editingSlotIndex]?.pokemonId} />
                </div>
              )}
              <div className="button-row leave-lobby-row">
                <button type="button" onClick={leaveLobby}>
                  Leave Lobby
                </button>
              </div>
            </>
          )}
        </AccordionItem>
      )}

      {visibility.showOverlaySettings && (
        <AccordionItem
          id="overlay"
          title="Overlay"
          isOpen={openSection === 'overlay'}
          onToggle={() => setOpenSection((current) => toggleAccordionSection(current, 'overlay'))}
        >
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={overlayClickThrough}
              onChange={(e) => toggleOverlayClickThrough(e.target.checked)}
            />
            Click-through (lock overlay so it never blocks game input)
          </label>
          <p className="hint-line">Toggle anytime with Ctrl+Shift+O.</p>

          <label>
            Position
            <select
              value={overlaySettings.position}
              onChange={(e) => updateOverlaySettings({ position: e.target.value as OverlayPosition })}
            >
              <option value="bottom-right">Bottom right</option>
              <option value="bottom-left">Bottom left</option>
              <option value="top-right">Top right</option>
              <option value="top-left">Top left</option>
            </select>
          </label>

          <label>
            Scale ({Math.round(overlaySettings.scale * 100)}%)
            <input
              type="range"
              min={Math.round(MIN_OVERLAY_SCALE * 100)}
              max={Math.round(MAX_OVERLAY_SCALE * 100)}
              step={5}
              value={Math.round(overlaySettings.scale * 100)}
              onChange={(e) => updateOverlaySettings({ scale: Number(e.target.value) / 100 })}
            />
          </label>

          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={overlaySettings.tooltipsEnabled}
              onChange={(e) => updateOverlaySettings({ tooltipsEnabled: e.target.checked })}
            />
            Show Pokemon name tooltips on overlay hover
          </label>

          <label>
            Tooltip language
            <select
              value={overlaySettings.tooltipLanguage}
              disabled={!overlaySettings.tooltipsEnabled}
              onChange={(e) => updateOverlaySettings({ tooltipLanguage: e.target.value as TooltipLanguage })}
            >
              <option value="en">English</option>
              <option value="de">Deutsch</option>
            </select>
          </label>

          {overlaySettings.tooltipsEnabled && (
            <p className="hint-line">
              Tooltips need real mouse hover -- if they don't appear over the overlay, toggle off click-through
              (Ctrl+Shift+O) first.
            </p>
          )}
        </AccordionItem>
      )}

      {visibility.showSaves && (
        <AccordionItem
          id="saves"
          title="Saves"
          isOpen={openSection === 'saves'}
          onToggle={() => setOpenSection((current) => toggleAccordionSection(current, 'saves'))}
        >
          {visibility.showSaveCurrentAction && (
            <div className="save-current-row">
              <label>
                Save name
                <input
                  value={saveName}
                  onChange={(e) => setSaveName(e.target.value)}
                  placeholder={new Date().toLocaleString()}
                />
              </label>
              <div className="button-row">
                <button type="button" onClick={saveCurrent} disabled={!saveName.trim()}>
                  {selectedSaveId ? 'Overwrite / Speichern' : 'Save / Speichern'}
                </button>
                {savedHint && <span className="saved-hint">{savedHint}</span>}
              </div>
            </div>
          )}

          {saveError && <p className="error-line">{saveError}</p>}

          <div className="save-load-row">
            <label>
              Existing saves
              <select value={selectedSaveId} onChange={(e) => onSelectSave(e.target.value)}>
                <option value="">— New save —</option>
                {filteredSaves.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.playerCount} players, {new Date(s.updatedAt).toLocaleString()})
                  </option>
                ))}
              </select>
            </label>
            <div className="button-row">
              <button type="button" onClick={loadSelectedSave} disabled={!selectedSaveId}>
                Load / Restore
              </button>
              <button type="button" onClick={() => handleDeleteSave(selectedSaveId)} disabled={!selectedSaveId}>
                Delete
              </button>
            </div>
            {filteredSaves.length === 0 && (
              <p className="empty-hint">
                {saves.length === 0 ? 'No manual saves yet.' : 'No manual saves for this server yet.'}
              </p>
            )}
          </div>
        </AccordionItem>
      )}
    </div>
  );
}
