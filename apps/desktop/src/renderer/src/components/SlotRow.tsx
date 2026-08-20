import type { PokemonSlot, TooltipLanguage } from '@soullink/shared';
import { SpriteImage } from './SpriteImage';
import { getSpeciesName } from '../services/spriteProvider';

interface SlotRowProps {
  slots: PokemonSlot[];
  size?: number;
  /** When provided, overrides the wrapping cell's width/height (used by the
   * overlay to grow/shrink cells coherently with the configured scale). */
  cellSize?: number;
  /** When provided, slots become clickable buttons (used by the control panel's own row). */
  onSlotClick?: (index: number) => void;
  activeIndex?: number | null;
  /** Shows a Pokemon-name tooltip (native title + aria-label) on hover, in `tooltipLanguage`. */
  tooltipsEnabled?: boolean;
  tooltipLanguage?: TooltipLanguage;
}

/**
 * Renders exactly SLOT_COUNT horizontal cells: a sprite for a filled slot, or
 * an empty cell otherwise. This is the one component shared by both the
 * control panel and the overlay -- the overlay renders it with no click
 * handler and no surrounding text, exactly matching a bare six-slot row.
 */
export function SlotRow({
  slots,
  size = 40,
  cellSize,
  onSlotClick,
  activeIndex,
  tooltipsEnabled = false,
  tooltipLanguage = 'en',
}: SlotRowProps) {
  return (
    <div className="slot-row">
      {slots.map((slot, index) => {
        const className = [
          'slot-cell',
          slot.pokemonId === null ? 'slot-empty' : '',
          activeIndex === index ? 'slot-active' : '',
        ]
          .filter(Boolean)
          .join(' ');
        const content = slot.pokemonId !== null ? <SpriteImage speciesId={slot.pokemonId} size={size} /> : null;
        const tooltip =
          tooltipsEnabled && slot.pokemonId !== null ? getSpeciesName(slot.pokemonId, tooltipLanguage) : undefined;
        const style = cellSize ? { width: cellSize, height: cellSize } : undefined;

        if (!onSlotClick) {
          return (
            <div key={index} className={className} style={style} title={tooltip} aria-label={tooltip}>
              {content}
            </div>
          );
        }
        return (
          <button
            key={index}
            type="button"
            className={className}
            style={style}
            onClick={() => onSlotClick(index)}
            title={tooltip}
            aria-label={tooltip}
          >
            {content}
          </button>
        );
      })}
    </div>
  );
}
