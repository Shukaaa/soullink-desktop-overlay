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
import { INITIAL_UPDATER_STATE, reduceUpdaterEvent, type UpdaterState } from './updater';

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
        ? `Verbindung unterbrochen. Versuch ${reconnectInfo.attempt} in ${Math.round(reconnectInfo.delayMs / 1000)} Sekunden`
        : 'Verbindung unterbrochen. Neuer Versuch läuft…';
    case 'closed':
      return 'Getrennt';
    default:
      return 'Verbindungsstatus';
  }
}

/** Human-readable status line for the update panel, shown below the app version. */
function updaterStatusText(state: UpdaterState): string {
  switch (state.status) {
    case 'checking':
      return 'Suche nach Updates…';
    case 'available':
      return `Update verfügbar: Version ${state.availableVersion}`;
    case 'downloading':
      return `Update wird heruntergeladen… ${Math.round(state.progress?.percent ?? 0)}%`;
    case 'downloaded':
      return `Update heruntergeladen (Version ${state.availableVersion}). Bereit zur Installation.`;
    case 'not-available':
      return 'Du verwendest bereits die aktuelle Version.';
    case 'error':
      return `Update-Prüfung fehlgeschlagen: ${state.errorMessage ?? 'Unbekannter Fehler'}`;
    default:
      return '';
  }
}

function translateErrorMessage(message: string): string {
  const translations: Array<[string, string]> = [
    ['This lobby is full.', 'Diese Lobby ist voll.'],
    ['That name is already taken in this lobby.', 'Dieser Name wird in dieser Lobby bereits verwendet.'],
    ['Reconnect token is invalid.', 'Das Reconnect-Token ist ungültig.'],
    ['Player no longer exists in this lobby.', 'Der Spieler existiert nicht mehr in dieser Lobby.'],
    ['Unknown species id.', 'Unbekannte Pokémonkennung.'],
    ['You cannot kick yourself.', 'Du kannst dich nicht selbst entfernen.'],
    ['Player not found in this lobby.', 'Der Spieler wurde in dieser Lobby nicht gefunden.'],
    ['You must join a lobby first.', 'Du musst zuerst einer Lobby beitreten.'],
    ['Only the lobby host can do that.', 'Nur der Host darf diese Aktion ausführen.'],
    ['This save has no server URL to reconnect to.', 'Dieser Speicherstand enthält keine Serveradresse.'],
    ['This save has no lobby to restore.', 'Dieser Speicherstand enthält keine Lobby zum Wiederherstellen.'],
  ];
  const translation = translations.find(([english]) => message === english);
  if (translation) return translation[1];
  if (message.startsWith('Lobby "') && message.endsWith('" was not found.')) {
    return message.replace(/^Lobby "(.+)" was not found\.$/, 'Die Lobby "$1" wurde nicht gefunden.');
  }
  if (message.startsWith('WebSocket')) return 'Die Verbindung zum Server ist fehlgeschlagen.';
  return message;
}

export function App() {
  useWsBridge();

  const { connectionStatus, error, lobby, selfPlayerId, reconnectInfo, setConnecting } = useAppStore();

  const [serverUrl, setServerUrl] = useState('ws://localhost:8787');
  const [playerName, setPlayerName] = useState('');
  const [joinLobbyId, setJoinLobbyId] = useState('');
  const [editingSlotIndex, setEditingSlotIndex] = useState<number | null>(null);
  const [overlayClickThrough, setOverlayClickThrough] = useState(true);
  const [overlaySettings, setOverlaySettingsState] = useState<OverlaySettings>(DEFAULT_OVERLAY_SETTINGS);
  const [saves, setSaves] = useState<SaveFileMeta[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveName, setSaveName] = useState('');
  const [selectedSaveId, setSelectedSaveId] = useState('');
  const [history, setHistory] = useState<ConnectionHistoryEntry[]>([]);
  const [lobbyCodeCopied, setLobbyCodeCopied] = useState(false);
  const [successAlert, setSuccessAlert] = useState<string | null>(null);
  const successAlertTimerRef = useRef<number | null>(null);
  const [openSection, setOpenSection] = useState<AccordionSection>('lobby');
  const [updaterState, setUpdaterState] = useState<UpdaterState>(INITIAL_UPDATER_STATE);

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

  useEffect(() => {
    window.api.getAppVersion().then((currentVersion) => setUpdaterState((s) => ({ ...s, currentVersion })));
    const unsubscribe = window.api.onUpdaterEvent((event) => setUpdaterState((s) => reduceUpdaterEvent(s, event)));
    return unsubscribe;
  }, []);

  useEffect(
    () => () => {
      if (successAlertTimerRef.current) window.clearTimeout(successAlertTimerRef.current);
    },
    []
  );

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
    if (!prevHasLobbyRef.current && lobby) {
      showSuccessAlert(`Lobby ${lobby.id} ist bereit.`);
    } else if (prevHasLobbyRef.current && !lobby) {
      showSuccessAlert('Lobby verlassen.');
    }
    prevConnectedRef.current = connected;
    prevHasLobbyRef.current = !!lobby;
  }, [connectionStatus, lobby]);

  function refreshSaves(): void {
    window.api.listSaves().then(setSaves);
  }

  function refreshHistory(): void {
    window.api.listConnectionHistory().then(setHistory);
  }

  function showSuccessAlert(message: string): void {
    if (successAlertTimerRef.current) window.clearTimeout(successAlertTimerRef.current);
    setSuccessAlert(message);
    successAlertTimerRef.current = window.setTimeout(() => {
      setSuccessAlert(null);
      successAlertTimerRef.current = null;
    }, 2600);
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
    // Flip to 'connecting' immediately rather than waiting for the IPC round
    // trip + main-process broadcast, so the status tag and Disconnect/Cancel
    // action appear the instant the user clicks Connect.
    setConnecting();
    window.api.connect({ serverUrl, playerName }).then(refreshHistory);
  }

  /** Fills in the URL/name from a history entry and connects directly with it
   * (rather than relying on state having flushed into `serverUrl`/`playerName`). */
  function connectFromHistory(entry: ConnectionHistoryEntry) {
    setServerUrl(entry.serverUrl);
    setPlayerName(entry.playerName);
    setConnecting();
    window.api.connect({ serverUrl: entry.serverUrl, playerName: entry.playerName }).then(refreshHistory);
  }

  function disconnect() {
    window.api.disconnect();
  }

  function checkForUpdates() {
    window.api.checkForUpdates();
  }

  function downloadUpdate() {
    window.api.downloadUpdate();
  }

  function installUpdate() {
    window.api.installUpdate();
  }

  async function copyLobbyCode() {
    if (!lobby) return;
    await window.api.copyToClipboard(lobby.id);
    setLobbyCodeCopied(true);
    showSuccessAlert('Lobbycode wurde kopiert.');
    window.setTimeout(() => setLobbyCodeCopied(false), 1500);
  }

  async function deleteHistoryEntry(entry: ConnectionHistoryEntry) {
    setHistory(await window.api.deleteConnectionHistoryEntry(entry));
    showSuccessAlert('Verbindung aus der Historie entfernt.');
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
        showSuccessAlert(`Speicherstand "${name}" aktualisiert.`);
      } else {
        const created = await window.api.createSave(name);
        setSelectedSaveId(created.id);
        showSuccessAlert(`Speicherstand "${name}" gespeichert.`);
      }
      refreshSaves();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Speichern fehlgeschlagen.');
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
      showSuccessAlert(`Speicherstand "${save.name}" geladen.`);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Laden fehlgeschlagen.');
    }
  }

  async function handleDeleteSave(id: string) {
    setSaveError(null);
    try {
      const deletedSave = saves.find((save) => save.id === id);
      await window.api.deleteSave(id);
      if (selectedSaveId === id) {
        setSelectedSaveId('');
        setSaveName('');
      }
      refreshSaves();
      showSuccessAlert(`Speicherstand "${deletedSave?.name ?? 'unbekannt'}" gelöscht.`);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Löschen fehlgeschlagen.');
    }
  }

  const updateAvailable = updaterState.status === 'available' || updaterState.status === 'downloaded';
  const showUpdatePanel =
    updaterState.status === 'available' ||
    updaterState.status === 'downloading' ||
    updaterState.status === 'downloaded' ||
    updaterState.status === 'error';

  return (
    <div className="app">
      <div className="app-header">
        <h1>SoulLink Overlay</h1>
        <div className="app-version-row">
          {updaterState.currentVersion && <span className="app-version">v{updaterState.currentVersion}</span>}
          {updateAvailable && <span className="update-dot" title="Update verfügbar" />}
          <button
            type="button"
            className="update-check-link"
            onClick={checkForUpdates}
            disabled={updaterState.status === 'checking' || updaterState.status === 'downloading'}
          >
            {updaterState.status === 'checking' ? 'Suche…' : 'Nach Updates suchen'}
          </button>
        </div>
      </div>

      {showUpdatePanel && (
        <div className={`update-alert update-alert-${updaterState.status}`} role="status">
          <span className="update-alert-text">{updaterStatusText(updaterState)}</span>
          {updaterState.status === 'downloading' && (
            <div className="update-progress-track">
              <div
                className="update-progress-fill"
                style={{ width: `${Math.round(updaterState.progress?.percent ?? 0)}%` }}
              />
            </div>
          )}
          {updaterState.status === 'available' && (
            <button type="button" onClick={downloadUpdate}>
              Herunterladen
            </button>
          )}
          {updaterState.status === 'downloaded' && (
            <button type="button" onClick={installUpdate}>
              Neu starten &amp; installieren
            </button>
          )}
          {updaterState.status === 'error' && (
            <button type="button" onClick={checkForUpdates}>
              Erneut versuchen
            </button>
          )}
        </div>
      )}

      {visibility.showStatusTag && (
        <div className={`connection-status-tag status-${connectionStatus}`}>
          <span className="connection-status-text">
            {connectionStatus === 'open'
              ? `Angemeldet als ${playerName}`
              : connectionStatusLabel(connectionStatus, reconnectInfo)}
          </span>
          <button type="button" className="disconnect-link" onClick={disconnect}>
            {connectionStatus === 'connecting' || connectionStatus === 'reconnecting' ? 'Abbrechen' : 'Trennen'}
          </button>
        </div>
      )}
      {error && <p className="error-line">{translateErrorMessage(error)}</p>}

      {visibility.showConnectionForm && (
        <section className="panel">
          <h2>Verbindung</h2>
          <label>
            Serveradresse
            <input value={serverUrl} onChange={(e) => setServerUrl(e.target.value)} />
          </label>
          <label>
            Dein Name
            <input value={playerName} onChange={(e) => setPlayerName(e.target.value)} />
          </label>
          <div className="button-row">
            <button type="button" onClick={connect} disabled={!playerName.trim() || !serverUrl.trim()}>
              Verbinden
            </button>
          </div>
        </section>
      )}

      {visibility.showConnectionForm && history.length > 0 && (
        <section className="panel history-panel">
          <h2>Letzte Verbindungen</h2>
          <ul className="history-list">
            {history.map((entry) => (
              <li key={`${entry.serverUrl}|${entry.playerName}`} className="history-row">
                <div className="history-info">
                  <span className="history-name">{entry.playerName}</span>
                  <span className="history-url">{entry.serverUrl}</span>
                </div>
                <div className="history-actions">
                  <button type="button" onClick={() => connectFromHistory(entry)}>
                    Verbinden
                  </button>
                  <button
                    type="button"
                    className="history-delete-button"
                    onClick={() => deleteHistoryEntry(entry)}
                    aria-label={`Verbindung von ${entry.playerName} entfernen`}
                    title="Entfernen"
                  >
                    Entfernen
                  </button>
                </div>
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
                  Lobby erstellen
                </button>
              </div>
              <div className="button-row">
                <input
                  placeholder="Lobbycode"
                  value={joinLobbyId}
                  onChange={(e) => setJoinLobbyId(e.target.value)}
                />
                <button type="button" onClick={joinLobby} disabled={!joinLobbyId.trim()}>
                  Lobby beitreten
                </button>
              </div>
            </>
          )}

          {visibility.showLobbyDetail && lobby && (
            <>
              <div className="lobby-code-row">
                <span className="lobby-code-label">Lobbycode</span>
                <code>{lobby.id}</code>
                <button type="button" onClick={copyLobbyCode}>
                  {lobbyCodeCopied ? 'Kopiert' : 'Code kopieren'}
                </button>
              </div>
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
                    <span>                    Slot {editingSlotIndex + 1} bearbeiten</span>
                    <button type="button" onClick={clearEditingSlot}>
                      Slot leeren
                    </button>
                  </div>
                  <PokemonPicker onSelect={pickSpecies} selectedId={selfPlayer.slots[editingSlotIndex]?.pokemonId} />
                </div>
              )}
              <div className="button-row leave-lobby-row">
                <button type="button" onClick={leaveLobby}>
                  Lobby verlassen
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
            Click-through aktivieren, damit das Overlay keine Spieleingaben blockiert
          </label>
          <p className="hint-line">Mit Strg+Umschalt+O jederzeit umschalten.</p>

          <label>
            Position
            <select
              value={overlaySettings.position}
              onChange={(e) => updateOverlaySettings({ position: e.target.value as OverlayPosition })}
            >
              <option value="bottom-right">Unten rechts</option>
              <option value="bottom-left">Unten links</option>
              <option value="top-right">Oben rechts</option>
              <option value="top-left">Oben links</option>
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
            Pokémonnamen bei Hover anzeigen
          </label>

          <label>
            Sprache der Tooltips
            <select
              value={overlaySettings.tooltipLanguage}
              disabled={!overlaySettings.tooltipsEnabled}
              onChange={(e) => updateOverlaySettings({ tooltipLanguage: e.target.value as TooltipLanguage })}
            >
              <option value="en">Englisch</option>
              <option value="de">Deutsch</option>
            </select>
          </label>

          {overlaySettings.tooltipsEnabled && (
            <p className="hint-line">
              Tooltips funktionieren nur bei echtem Hover. Wenn sie nicht erscheinen, schalte Click-through zuerst mit
              Strg+Umschalt+O aus.
            </p>
          )}
        </AccordionItem>
      )}

      {visibility.showSaves && (
        <AccordionItem
          id="saves"
          title="Speicherstände"
          isOpen={openSection === 'saves'}
          onToggle={() => setOpenSection((current) => toggleAccordionSection(current, 'saves'))}
        >
          {visibility.showSaveCurrentAction && (
            <div className="save-current-row">
              <label>
                Name des Speicherstands
                <input
                  value={saveName}
                  onChange={(e) => setSaveName(e.target.value)}
                  placeholder={new Date().toLocaleString()}
                />
              </label>
              <div className="button-row">
                <button type="button" onClick={saveCurrent} disabled={!saveName.trim()}>
                  {selectedSaveId ? 'Überschreiben' : 'Speichern'}
                </button>
              </div>
            </div>
          )}

          {saveError && <p className="error-line">{saveError}</p>}

          <div className="save-load-row">
            <label>
              Vorhandene Speicherstände
              <select value={selectedSaveId} onChange={(e) => onSelectSave(e.target.value)}>
                <option value="">Neuer Speicherstand</option>
                {filteredSaves.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.playerCount} Spieler, {new Date(s.updatedAt).toLocaleString()})
                  </option>
                ))}
              </select>
            </label>
            <div className="button-row">
              <button type="button" onClick={loadSelectedSave} disabled={!selectedSaveId}>
                Laden / Wiederherstellen
              </button>
              <button type="button" onClick={() => handleDeleteSave(selectedSaveId)} disabled={!selectedSaveId}>
                Löschen
              </button>
            </div>
            {filteredSaves.length === 0 && (
              <p className="empty-hint">
                {saves.length === 0
                  ? 'Noch keine Speicherstände vorhanden.'
                  : 'Für diesen Server gibt es noch keine Speicherstände.'}
              </p>
            )}
          </div>
        </AccordionItem>
      )}
      {successAlert && (
        <div className="success-alert" role="status">
          {successAlert}
        </div>
      )}
    </div>
  );
}
