import { useEffect, useRef } from 'react';
import type { CSSProperties } from 'react';
import { clampOverlayScale, getGameVersion, getPlayerRowColor } from '@soullink/shared';
import { useAppStore } from '../state/store';
import { useWsBridge } from '../state/useWsBridge';
import { SlotRow } from '../components/SlotRow';

/** Base (scale=1) pixel sizes; multiplied by the configured overlay scale. */
const BASE_SLOT_SIZE = 32;
const BASE_NAME_FONT_SIZE = 12;
const BASE_NAME_WIDTH = 88;
const BASE_NAME_AND_GAP_WIDTH = 96;
const BASE_ROOT_PADDING = 8;
const BASE_ROOT_GAP = 6;
const BASE_PLAYER_GAP = 8;
const BASE_SLOT_GAP = 6;
const BASE_ORDEN_GAP = 5;
const BASE_ORDEN_FONT_SIZE = 10;
const BASE_ORDEN_PADDING_Y = 3;
const BASE_ORDEN_PADDING_X = 5;
const BASE_ORDEN_CAP_GAP = 4;
const BASE_ORDEN_CAP_MIN_WIDTH = 16;
const BASE_ORDEN_CAP_PADDING_LEFT = 4;
const BASE_ORDEN_CAP_FONT_SIZE = 9;
const BASE_CELL_RADIUS = 4;

type OverlayScaleStyle = CSSProperties & {
  '--overlay-root-padding': string;
  '--overlay-root-gap': string;
  '--overlay-player-gap': string;
  '--overlay-slot-gap': string;
  '--overlay-orden-indent': string;
  '--overlay-orden-gap': string;
  '--overlay-orden-font-size': string;
  '--overlay-orden-padding-y': string;
  '--overlay-orden-padding-x': string;
  '--overlay-orden-cap-gap': string;
  '--overlay-orden-cap-min-width': string;
  '--overlay-orden-cap-padding-left': string;
  '--overlay-orden-cap-font-size': string;
  '--overlay-cell-radius': string;
};

/**
 * The overlay renders one row per player: the player's name, followed by
 * their six-slot row (a sprite for a filled slot, an empty cell otherwise).
 * A shared Orden list follows the player rows. Every player row uses a
 * fixed-width name column so the slot columns line up across players.
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
  const selectedGameVersion = lobby?.gameVersionId ? getGameVersion(lobby.gameVersionId) : null;
  const scaledPx = (size: number) => `${Math.max(1, Math.round(size * scale))}px`;
  const scaleStyle: OverlayScaleStyle = {
    '--overlay-root-padding': scaledPx(BASE_ROOT_PADDING),
    '--overlay-root-gap': scaledPx(BASE_ROOT_GAP),
    '--overlay-player-gap': scaledPx(BASE_PLAYER_GAP),
    '--overlay-slot-gap': scaledPx(BASE_SLOT_GAP),
    '--overlay-orden-indent': scaledPx(BASE_NAME_AND_GAP_WIDTH),
    '--overlay-orden-gap': scaledPx(BASE_ORDEN_GAP),
    '--overlay-orden-font-size': scaledPx(BASE_ORDEN_FONT_SIZE),
    '--overlay-orden-padding-y': scaledPx(BASE_ORDEN_PADDING_Y),
    '--overlay-orden-padding-x': scaledPx(BASE_ORDEN_PADDING_X),
    '--overlay-orden-cap-gap': scaledPx(BASE_ORDEN_CAP_GAP),
    '--overlay-orden-cap-min-width': scaledPx(BASE_ORDEN_CAP_MIN_WIDTH),
    '--overlay-orden-cap-padding-left': scaledPx(BASE_ORDEN_CAP_PADDING_LEFT),
    '--overlay-orden-cap-font-size': scaledPx(BASE_ORDEN_CAP_FONT_SIZE),
    '--overlay-cell-radius': scaledPx(BASE_CELL_RADIUS),
  };
  const slotSize = Math.round(BASE_SLOT_SIZE * scale);
  const nameStyle = {
    fontSize: Math.round(BASE_NAME_FONT_SIZE * scale),
    flexBasis: Math.round(BASE_NAME_WIDTH * scale),
    width: Math.round(BASE_NAME_WIDTH * scale),
  };

  return (
    <div ref={containerRef} className="overlay-root" style={scaleStyle}>
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
      {!!selectedGameVersion?.count && lobby && (
        <div className="overlay-orden-row" aria-label={selectedGameVersion.heading}>
          {lobby.ordenes.map((checked, index) => (
            <span
              key={index}
              className={`overlay-orden-item${checked ? ' overlay-orden-checked' : ' overlay-orden-unchecked'}`}
            >
              <span className="overlay-orden-name">{selectedGameVersion.itemNames[index]}</span>
              <span
                className="overlay-orden-cap"
                title={`Level-Cap: ${selectedGameVersion.levelCaps[index]}`}
                aria-label={`Level-Cap ${selectedGameVersion.levelCaps[index]}`}
              >
                Lv {selectedGameVersion.levelCaps[index]}
              </span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
