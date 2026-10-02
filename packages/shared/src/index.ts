// Explicit named re-exports (rather than `export * from`) so bundlers like
// Rollup/Vite can statically analyze which named exports this CJS package
// provides. `export * from` compiles to a runtime `__exportStar` helper that
// bundlers cannot see through, which breaks `import { x } from '@soullink/shared'`
// in the renderer build.

export type { PlayerId, LobbyId, PokemonSlot, PlayerInfo, LobbyState } from './types';
export type { GameVersionId } from './gameVersions';
export {
  SLOT_COUNT,
  MAX_ORDEN_COUNT,
  MAX_NAME_LENGTH,
  DEFAULT_MAX_PLAYERS_PER_LOBBY,
  RECONNECT_GRACE_MS,
  EMPTY_LOBBY_TTL_MS,
  emptySlots,
} from './types';
export { GAME_VERSION_GROUPS, isGameVersionId, getGameVersion, normalizeOrdenProgress } from './gameVersions';

export {
  AuthenticateMessage,
  ListOwnedLobbiesMessage,
  RejoinOwnedLobbyMessage,
  DeleteOwnedLobbyMessage,
  pokemonSlotSchema,
  playerSnapshotSchema,
  CreateLobbyMessage,
  JoinLobbyMessage,
  SetPokemonMessage,
  RemovePokemonMessage,
  ToggleOrdenMessage,
  SetGameVersionMessage,
  KickPlayerMessage,
  LeaveLobbyMessage,
  IncrementDeathCounterMessage,
  DecrementDeathCounterMessage,
  IncrementResetCounterMessage,
  DecrementResetCounterMessage,
  RestoreLobbyStateMessage,
  ClientMessage,
  parseClientMessage,
  safeParseClientMessage,
} from './protocol';
export type {
  AuthenticateMessage as AuthenticateMessageType,
  ListOwnedLobbiesMessage as ListOwnedLobbiesMessageType,
  RejoinOwnedLobbyMessage as RejoinOwnedLobbyMessageType,
  DeleteOwnedLobbyMessage as DeleteOwnedLobbyMessageType,
  IncrementDeathCounterMessage as IncrementDeathCounterMessageType,
  DecrementDeathCounterMessage as DecrementDeathCounterMessageType,
  IncrementResetCounterMessage as IncrementResetCounterMessageType,
  DecrementResetCounterMessage as DecrementResetCounterMessageType,
  PokemonSlotInput,
  PlayerSnapshot,
  StateMessage,
  ErrorMessage,
  LeftLobbyMessage,
  AuthenticatedMessage,
  OwnedLobbySummary,
  OwnedLobbiesMessage,
  ServerMessage,
} from './protocol';

export { ErrorCode, ProtocolError } from './errors';

export type { PokedexEntry } from './pokedex';
export {
  POKEDEX,
  getPokemonById,
  getPokemonByName,
  getPokemonDisplayName,
  isValidSpeciesId,
  searchPokedex,
  spriteUrlFor,
} from './pokedex';

export type { OverlayPosition, TooltipLanguage, OverlaySettings } from './overlaySettings';
export {
  OVERLAY_POSITIONS,
  TOOLTIP_LANGUAGES,
  MIN_OVERLAY_SCALE,
  MAX_OVERLAY_SCALE,
  DEFAULT_OVERLAY_SETTINGS,
  isOverlayPosition,
  isTooltipLanguage,
  clampOverlayScale,
  normalizeOverlaySettings,
} from './overlaySettings';

export type { PlayerRowColor } from './playerPalette';
export { PLAYER_ROW_COLORS, getPlayerRowColor } from './playerPalette';
