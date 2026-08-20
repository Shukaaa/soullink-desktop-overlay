import type { PlayerInfo } from '@soullink/shared';
import { SlotRow } from './SlotRow';

interface PlayerRowProps {
  player: PlayerInfo;
  isSelf: boolean;
  isHost: boolean;
  /** Player id + slot index currently open in the editor, or null if none. */
  editingPlayerId: string | null;
  editingSlotIndex: number | null;
  onSlotClick: (playerId: string, index: number) => void;
  onKick: (playerId: string) => void;
}

/** One row in the control panel's player list: identity/host/kick controls plus that player's six slots. */
export function PlayerRow({
  player,
  isSelf,
  isHost,
  editingPlayerId,
  editingSlotIndex,
  onSlotClick,
  onKick,
}: PlayerRowProps) {
  // Every player may edit their own slots; the host may additionally edit
  // any other player's slots. This must mirror LobbyManager.resolveEditTarget.
  const canEdit = isSelf || isHost;
  const activeIndex = player.id === editingPlayerId ? editingSlotIndex : null;

  return (
    <div className={`player-row${player.connected ? '' : ' disconnected'}`}>
      <div className="player-row-header">
        <span className="player-name">
          {player.isHost ? '👑 ' : ''}
          {player.name}
          {isSelf ? ' (du)' : ''}
          {!player.connected ? ' (wird neu verbunden …)' : ''}
        </span>
        {isHost && !isSelf && (
          <button type="button" onClick={() => onKick(player.id)}>
            Entfernen
          </button>
        )}
      </div>
      <SlotRow
        slots={player.slots}
        onSlotClick={canEdit ? (index) => onSlotClick(player.id, index) : undefined}
        activeIndex={activeIndex}
      />
    </div>
  );
}
