import { useEffect, useRef, useState } from 'react';
import type { PokedexEntry, OverlayPosition, OverlaySettings, TooltipLanguage } from '@soullink/shared';
import {
  DEFAULT_OVERLAY_SETTINGS,
  GAME_VERSION_GROUPS,
  getGameVersion,
  MAX_OVERLAY_SCALE,
  MIN_OVERLAY_SCALE,
  isGameVersionId,
} from '@soullink/shared';
import type { ConnectionHistoryEntry } from '../../../common/connectionHistoryTypes';
import { useAppStore, type ConnectionStatus } from '../state/store';
import { useWsBridge } from '../state/useWsBridge';
import { PokemonPicker } from '../components/PokemonPicker';
import { PlayerRow } from '../components/PlayerRow';
import { AccordionItem } from '../components/AccordionItem';
import { getPanelVisibility } from './visibility';
import { nextAccordionSection, toggleAccordionSection, type AccordionSection } from './accordion';
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
    ['Sign in with Discord before using the lobby server.', 'Melde dich zuerst mit Discord an.'],
    ['Sign in with Discord before creating a lobby.', 'Melde dich zuerst mit Discord an.'],
    ['Sign in with Discord before joining a lobby.', 'Melde dich zuerst mit Discord an.'],
    ['Sign in with Discord first.', 'Melde dich zuerst mit Discord an.'],
    ['You do not own this lobby.', 'Diese Lobby gehört nicht zu deinem Discord-Konto.'],
    ['You were removed from this lobby by the admin.', 'Du wurdest vom Admin aus dieser Lobby entfernt.'],
    ['Discord session is invalid. Sign in again.', 'Deine Discord-Anmeldung ist abgelaufen. Bitte melde dich erneut an.'],
    ['Discord OAuth is not configured on this server.', 'Discord-Login ist auf diesem Server noch nicht eingerichtet.'],
  ];
  const translation = translations.find(([english]) => message === english);
  if (translation) return translation[1];
  if (message.startsWith('The SoulLink server returned an empty response')) {
    return 'Der Server hat leer geantwortet. Prüfe die Serveradresse und aktualisiere den Server auf eine Version mit Discord-Login.';
  }
  if (message.startsWith('The SoulLink server returned a non-JSON response')) {
    return 'Der Server hat eine ungültige Antwort geliefert. Prüfe die Serveradresse und aktualisiere den Server auf eine Version mit Discord-Login.';
  }
  if (message.startsWith('Could not reach the SoulLink server')) {
    return 'Der Server ist nicht erreichbar. Prüfe Serveradresse, Netzwerkverbindung und das HTTPS-Zertifikat.';
  }
  if (message.startsWith('Lobby "') && message.endsWith('" was not found.')) {
    return message.replace(/^Lobby "(.+)" was not found\.$/, 'Die Lobby "$1" wurde nicht gefunden.');
  }
  if (message.startsWith('WebSocket')) return 'Die Verbindung zum Server ist fehlgeschlagen.';
  return message;
}

export function App() {
  useWsBridge();

  const {
    connectionStatus,
    error,
    lobby,
    selfPlayerId,
    reconnectInfo,
    discordUser,
    ownedLobbies,
    setConnecting,
  } = useAppStore();

  const [serverUrl, setServerUrl] = useState('ws://localhost:8787');
  const [playerName, setPlayerName] = useState('');
  const [joinLobbyId, setJoinLobbyId] = useState('');
  const [editingPlayerId, setEditingPlayerId] = useState<string | null>(null);
  const [editingSlotIndex, setEditingSlotIndex] = useState<number | null>(null);
  const [overlayClickThrough, setOverlayClickThrough] = useState(true);
  const [overlaySettings, setOverlaySettingsState] = useState<OverlaySettings>(DEFAULT_OVERLAY_SETTINGS);
  const [authError, setAuthError] = useState<string | null>(null);
  const [history, setHistory] = useState<ConnectionHistoryEntry[]>([]);
  const [lobbyCodeCopied, setLobbyCodeCopied] = useState(false);
  const [successAlert, setSuccessAlert] = useState<string | null>(null);
  const successAlertTimerRef = useRef<number | null>(null);
  const [openSection, setOpenSection] = useState<AccordionSection>('lobby');
  const [updaterState, setUpdaterState] = useState<UpdaterState>(INITIAL_UPDATER_STATE);

  useEffect(() => {
    window.api.loadClientPreferences().then((preferences) => {
      if (preferences.serverUrl) setServerUrl(preferences.serverUrl);
      if (preferences.playerName) setPlayerName(preferences.playerName);
    });
    window.api.getOverlaySettings().then(setOverlaySettingsState);
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
  // or joining, without overriding a manually-opened Overlay section otherwise.
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
  const selectedGameVersion = lobby?.gameVersionId ? getGameVersion(lobby.gameVersionId) : null;
  const ordenCheckedCount = lobby?.ordenes.filter(Boolean).length ?? 0;
  const ordenProgress =
    selectedGameVersion && selectedGameVersion.count > 0
      ? (ordenCheckedCount / selectedGameVersion.count) * 100
      : 0;
  const editingPlayer = editingPlayerId ? (lobby?.players.find((p) => p.id === editingPlayerId) ?? null) : null;
  const visibility = getPanelVisibility(connectionStatus, !!lobby);

  function connect(forceDiscordLogin = false) {
    // Flip to 'connecting' immediately rather than waiting for the IPC round
    // trip + main-process broadcast, so the status tag and Disconnect/Cancel
    // action appear the instant the user clicks Connect.
    setConnecting();
    setAuthError(null);
    window.api
      .connect({ serverUrl, forceDiscordLogin })
      .then(refreshHistory)
      .catch((err: unknown) => setAuthError(err instanceof Error ? err.message : 'Discord-Anmeldung fehlgeschlagen.'));
  }

  /** Fills in the URL/name from a history entry and connects directly with it
   * (rather than relying on state having flushed into `serverUrl`/`playerName`). */
  function connectFromHistory(entry: ConnectionHistoryEntry) {
    setServerUrl(entry.serverUrl);
    setPlayerName(entry.playerName);
    setConnecting();
    setAuthError(null);
    window.api
      .connect({ serverUrl: entry.serverUrl })
      .then(refreshHistory)
      .catch((err: unknown) => setAuthError(err instanceof Error ? err.message : 'Discord-Anmeldung fehlgeschlagen.'));
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

  async function copyLobbyCode(lobbyId: string) {
    await window.api.copyToClipboard(lobbyId);
    setLobbyCodeCopied(true);
    showSuccessAlert('Lobbycode wurde kopiert.');
    window.setTimeout(() => setLobbyCodeCopied(false), 1500);
  }

  async function deleteHistoryEntry(entry: ConnectionHistoryEntry) {
    setHistory(await window.api.deleteConnectionHistoryEntry(entry));
    showSuccessAlert('Verbindung aus der Historie entfernt.');
  }

  function createLobby() {
    window.api.send({ type: 'CREATE_LOBBY' });
  }

  function joinLobby() {
    window.api.send({ type: 'JOIN_LOBBY', lobbyId: joinLobbyId.trim().toUpperCase() });
  }

  function rejoinOwnedLobby(lobbyId: string) {
    window.api.send({ type: 'REJOIN_OWNED_LOBBY', lobbyId });
  }

  function deleteOwnedLobby(lobbyId: string) {
    if (!window.confirm(`Lobby ${lobbyId} und alle gespeicherten Daten dauerhaft löschen?`)) return;
    window.api.send({ type: 'DELETE_OWNED_LOBBY', lobbyId });
  }

  function leaveLobby() {
    window.api.send({ type: 'LEAVE_LOBBY' });
  }

  function changeGameVersion(gameVersionId: string) {
    if (!isGameVersionId(gameVersionId)) return;
    window.api.send({ type: 'SET_GAME_VERSION', gameVersionId });
  }

  function toggleOrden(index: number) {
    window.api.send({ type: 'TOGGLE_ORDEN', index });
  }

  function kickPlayer(playerId: string) {
    window.api.send({ type: 'KICK_PLAYER', playerId });
  }

  function incrementDeathCounter(playerId: string) {
    window.api.send({
      type: 'INCREMENT_DEATH_COUNTER',
      ...(playerId === selfPlayerId ? {} : { targetPlayerId: playerId }),
    });
  }

  function decrementDeathCounter(playerId: string) {
    window.api.send({
      type: 'DECREMENT_DEATH_COUNTER',
      ...(playerId === selfPlayerId ? {} : { targetPlayerId: playerId }),
    });
  }

  function incrementResetCounter() {
    window.api.send({ type: 'INCREMENT_RESET_COUNTER' });
  }

  function decrementResetCounter() {
    window.api.send({ type: 'DECREMENT_RESET_COUNTER' });
  }

  function onSlotClick(playerId: string, index: number) {
    if (editingPlayerId === playerId && editingSlotIndex === index) {
      setEditingPlayerId(null);
      setEditingSlotIndex(null);
    } else {
      setEditingPlayerId(playerId);
      setEditingSlotIndex(index);
    }
  }

  function pickSpecies(entry: PokedexEntry) {
    if (editingSlotIndex === null || !editingPlayerId) return;
    if (editingPlayerId === selfPlayerId) {
      // Preserve the legacy own-player message shape (no targetPlayerId).
      window.api.send({ type: 'SET_POKEMON', slotIndex: editingSlotIndex, pokemonId: entry.id });
    } else {
      window.api.send({
        type: 'SET_POKEMON',
        slotIndex: editingSlotIndex,
        pokemonId: entry.id,
        targetPlayerId: editingPlayerId,
      });
    }
    setEditingPlayerId(null);
    setEditingSlotIndex(null);
  }

  function clearEditingSlot() {
    if (editingSlotIndex === null || !editingPlayerId) return;
    if (editingPlayerId === selfPlayerId) {
      // Preserve the legacy own-player message shape (no targetPlayerId).
      window.api.send({ type: 'REMOVE_POKEMON', slotIndex: editingSlotIndex });
    } else {
      window.api.send({ type: 'REMOVE_POKEMON', slotIndex: editingSlotIndex, targetPlayerId: editingPlayerId });
    }
    setEditingPlayerId(null);
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
              ? `Angemeldet als ${discordUser?.username ?? playerName}`
              : connectionStatusLabel(connectionStatus, reconnectInfo)}
          </span>
          <button type="button" className="disconnect-link" onClick={disconnect}>
            {connectionStatus === 'connecting' || connectionStatus === 'reconnecting' ? 'Abbrechen' : 'Trennen'}
          </button>
        </div>
      )}
      {(error || authError) && <p className="error-line">{translateErrorMessage(error ?? authError ?? '')}</p>}

      {visibility.showConnectionForm && (
        <section className="panel">
          <h2>Verbindung</h2>
          <label>
            Serveradresse
            <input value={serverUrl} onChange={(e) => setServerUrl(e.target.value)} />
          </label>
          <div className="button-row">
            <button type="button" onClick={() => connect()} disabled={!serverUrl.trim()}>
              Mit Discord anmelden
            </button>
            {discordUser && (
              <button type="button" onClick={() => connect(true)} disabled={!serverUrl.trim()}>
                Discord-Konto wechseln
              </button>
            )}
          </div>
          <p className="hint-line">Dein Discord-Benutzername wird automatisch als Spielername verwendet.</p>
          <p className="hint-line">
            Remote-Server kannst du mit https:// oder wss:// eingeben; lokal funktioniert ws://localhost:8787.
          </p>
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
          {ownedLobbies.length > 0 && (
            <section className="owned-lobbies">
              <h3>Deine Lobbys</h3>
              <ul className="owned-lobby-list">
                {ownedLobbies.map((ownedLobby) => (
                  <li key={ownedLobby.id} className="owned-lobby-row">
                    <div className="owned-lobby-info">
                      <code>{ownedLobby.id}</code>
                      <span>
                        {ownedLobby.connectedPlayerCount}/{ownedLobby.playerCount} Spieler verbunden
                      </span>
                      <span>
                        {ownedLobby.gameVersionId
                          ? getGameVersion(ownedLobby.gameVersionId).label
                          : 'Keine Spielversion ausgewählt'}
                      </span>
                      <span>
                        Spieler: {ownedLobby.players.map((player) => player.name).join(', ') || 'Noch keine'}
                      </span>
                      <span>Zuletzt geändert {new Date(ownedLobby.updatedAt).toLocaleString()}</span>
                    </div>
                    <div className="button-row">
                      <button
                        type="button"
                        onClick={() => rejoinOwnedLobby(ownedLobby.id)}
                        disabled={lobby?.id === ownedLobby.id}
                      >
                        {lobby?.id === ownedLobby.id ? 'Aktuelle Lobby' : 'Beitreten'}
                      </button>
                      <button type="button" onClick={() => copyLobbyCode(ownedLobby.id)}>
                        Code kopieren
                      </button>
                      <button
                        type="button"
                        className="history-delete-button"
                        onClick={() => deleteOwnedLobby(ownedLobby.id)}
                      >
                        Löschen
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
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
                <button type="button" onClick={() => copyLobbyCode(lobby.id)}>
                  {lobbyCodeCopied ? 'Kopiert' : 'Code kopieren'}
                </button>
              </div>
              <div className="counter-control-row">
                <span className="counter-control-label">
                  Reset-Counter <strong>{lobby.resetCount}</strong>
                </span>
                {isHost && (
                  <div className="counter-actions">
                    <button
                      type="button"
                      onClick={decrementResetCounter}
                      disabled={lobby.resetCount === 0}
                      aria-label="Reset-Counter verringern"
                    >
                      − Reset
                    </button>
                    <button type="button" onClick={incrementResetCounter} aria-label="Reset-Counter erhöhen">
                      + Reset
                    </button>
                  </div>
                )}
              </div>
              <div className="orden-panel">
                <label className="orden-version-control">
                  Spielversion
                  <select
                    value={lobby.gameVersionId ?? ''}
                    disabled={!isHost}
                    required
                    onChange={(e) => changeGameVersion(e.target.value)}
                  >
                    <option value="" disabled>
                      Spielversion auswählen
                    </option>
                    {GAME_VERSION_GROUPS.map((group) => (
                      <optgroup key={group.label} label={group.label}>
                        {group.versions.map((version) => (
                          <option key={version.id} value={version.id}>
                            {version.label}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </label>
                {!isHost && <p className="orden-hint">Nur der Host kann die Spielversion ändern.</p>}
                {!selectedGameVersion ? (
                  <p className="orden-hint">Wähle eine Spielversion, um die passende Liste anzuzeigen.</p>
                ) : selectedGameVersion.count === 0 ? (
                  <p className="orden-hint">{selectedGameVersion.emptyMessage}</p>
                ) : (
                  <>
                    <div className="orden-heading">
                      <h3>{selectedGameVersion.heading}</h3>
                      <span>
                        {ordenCheckedCount} von {selectedGameVersion.count} abgehakt
                      </span>
                    </div>
                    <div
                      className="orden-progress"
                      role="progressbar"
                      aria-label={`${selectedGameVersion.heading}-Fortschritt`}
                      aria-valuemin={0}
                      aria-valuemax={selectedGameVersion.count}
                      aria-valuenow={ordenCheckedCount}
                    >
                      <span style={{ width: `${ordenProgress}%` }} />
                    </div>
                    <p className="orden-hint">
                      Übliche Nuzlocke-Regel: Cap = höchstes Level im Team der Herausforderung. Ein Versionswechsel
                      setzt den Fortschritt zurück.
                    </p>
                    {selectedGameVersion.progressNote && (
                      <p className="orden-hint">{selectedGameVersion.progressNote}</p>
                    )}
                    <div className="orden-list">
                      {lobby.ordenes.map((checked, index) => (
                        <label
                          key={index}
                          className={`orden-item${checked ? ' orden-item-checked' : ''}`}
                        >
                          <span className="orden-item-main">
                            <input type="checkbox" checked={checked} onChange={() => toggleOrden(index)} />
                            <span className="orden-item-name">{selectedGameVersion.itemNames[index]}</span>
                          </span>
                          <span
                            className="orden-level-cap"
                            title={`Level-Cap: ${selectedGameVersion.levelCaps[index]}`}
                            aria-label={`Level-Cap ${selectedGameVersion.levelCaps[index]}`}
                          >
                            <span>LEVEL-CAP</span>
                            <strong>{selectedGameVersion.levelCaps[index]}</strong>
                          </span>
                        </label>
                      ))}
                    </div>
                  </>
                )}
              </div>
              <div className="player-list">
                {lobby.players.map((p) => (
                  <PlayerRow
                    key={p.id}
                    player={p}
                    isSelf={p.id === selfPlayerId}
                    isHost={isHost}
                    editingPlayerId={editingPlayerId}
                    editingSlotIndex={editingSlotIndex}
                    onSlotClick={onSlotClick}
                    onKick={kickPlayer}
                    canChangeDeathCounter={isHost || p.id === selfPlayerId}
                    onIncrementDeathCounter={incrementDeathCounter}
                    onDecrementDeathCounter={decrementDeathCounter}
                  />
                ))}
              </div>
              {editingPlayer && editingSlotIndex !== null && (
                <div className="slot-editor">
                  <div className="button-row">
                    <span>
                      Slot {editingSlotIndex + 1} bearbeiten
                      {editingPlayer.id !== selfPlayerId ? ` (${editingPlayer.name})` : ''}
                    </span>
                    <button type="button" onClick={clearEditingSlot}>
                      Slot leeren
                    </button>
                  </div>
                  <PokemonPicker onSelect={pickSpecies} selectedId={editingPlayer.slots[editingSlotIndex]?.pokemonId} />
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

      {successAlert && (
        <div className="success-alert" role="status">
          {successAlert}
        </div>
      )}
    </div>
  );
}
