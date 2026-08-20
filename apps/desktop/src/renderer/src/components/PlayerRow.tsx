import type { PlayerInfo } from '@soullink/shared';
import { SlotRow } from './SlotRow';

interface PlayerRowProps {
  player: PlayerInfo;
  isSelf: boolean;
  isHost: boolean;
  editingSlotIndex: number | null;
  onSlotClick: (index: number) => void;
  onKick: (playerId: string) => void;
}

/** One row in the control panel's player list: identity/host/kick controls plus that player's six slots. */
export function PlayerRow({ player, isSelf, isHost, editingSlotIndex, onSlotClick, onKick }: PlayerRowProps) {
  return (
    <div className={`player-row${player.connected ? '' : ' disconnected'}`}>
      <div className="player-row-header">
        <span className="player-name">
          {player.isHost ? '👑 ' : ''}
          {player.name}
          {isSelf ? ' (you)' : ''}
          {!player.connected ? ' - reconnecting…' : ''}
        </span>
        {isHost && !isSelf && (
          <button type="button" onClick={() => onKick(player.id)}>
            Kick
          </button>
        )}
      </div>
      <SlotRow
        slots={player.slots}
        onSlotClick={isSelf ? onSlotClick : undefined}
        activeIndex={isSelf ? editingSlotIndex : null}
      />
    </div>
  );
}
