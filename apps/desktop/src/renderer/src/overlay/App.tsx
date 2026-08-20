import { useEffect, useRef } from 'react';
import { clampOverlayScale, getPlayerRowColor } from '@soullink/shared';
import { useAppStore } from '../state/store';
import { useWsBridge } from '../state/useWsBridge';
import { SlotRow } from '../components/SlotRow';

/** Base (scale=1) pixel sizes; multiplied by the configured overlay scale. */
const BASE_SLOT_SIZE = 32;
const BASE_NAME_FONT_SIZE = 12;
const BASE_NAME_WIDTH = 88;

/**
 * The overlay renders one row per player: the player's name, followed by
 * their six-slot row (a sprite for a filled slot, an empty cell otherwise).
 * Kept intentionally minimal and transparent -- no other UI chrome. Every
 * row uses a fixed-width name column so the slot columns line up exactly
 * across players, which is what makes shared SoulLink slot indices readable
 * at a glance.
 */
export function App() {
  useWsBridge();
  const lobby = useAppStore((s) => s.lobby);
  const overlaySettings = useAppStore((s) => s.overlaySettings);
  const setOverlaySettings = useAppStore((s) => s.setOverlaySettings);
  const containerRef = useRef<HTMLDivElement>(null);

  // The overlay renderer never touches the filesystem itself -- it asks the
  // main process (which owns SaveStateService) for the persisted settings
  // once at startup, then stays in sync via the 'overlay-settings' broadcast
  // (see useWsBridge / reduceWsEvent) whenever the control panel changes them.
  useEffect(() => {
    window.api.getOverlaySettings().then(setOverlaySettings);
  }, [setOverlaySettings]);

  // Resize the (frameless, transparent) Electron window to hug the content
  // exactly, so the overlay never covers more of the game than necessary.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      window.api.resizeOverlay({ width: Math.ceil(width) + 16, height: Math.ceil(height) + 16 });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [lobby, overlaySettings.scale]);

  const scale = clampOverlayScale(overlaySettings.scale);
  const slotSize = Math.round(BASE_SLOT_SIZE * scale);
  const nameStyle = {
    fontSize: Math.round(BASE_NAME_FONT_SIZE * scale),
    flexBasis: Math.round(BASE_NAME_WIDTH * scale),
    width: Math.round(BASE_NAME_WIDTH * scale),
  };

  return (
    <div ref={containerRef} className="overlay-root">
      {lobby?.players.map((player, index) => (
        <div key={player.id} className={`overlay-player-row overlay-player-row--${getPlayerRowColor(index)}`}>
          <span className="overlay-player-name" style={nameStyle} title={player.name}>
            {player.name}
          </span>
          <SlotRow
            slots={player.slots}
            size={slotSize}
            cellSize={slotSize}
            tooltipsEnabled={overlaySettings.tooltipsEnabled}
            tooltipLanguage={overlaySettings.tooltipLanguage}
          />
        </div>
      ))}
    </div>
  );
}
