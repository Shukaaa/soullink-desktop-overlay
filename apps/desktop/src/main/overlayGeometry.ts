import type { OverlayPosition } from '@soullink/shared';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Computes the top-left {x, y} for a box of the given size anchored to the
 * corner of `area` matching `position`, inset by `margin` from both edges of
 * that corner. `area` is typically a display's workArea.
 */
export function anchoredPosition(
  area: Rect,
  width: number,
  height: number,
  position: OverlayPosition,
  margin: number
): { x: number; y: number } {
  const isLeft = position === 'bottom-left' || position === 'top-left';
  const isTop = position === 'top-left' || position === 'top-right';
  const x = isLeft ? area.x + margin : area.x + area.width - width - margin;
  const y = isTop ? area.y + margin : area.y + area.height - height - margin;
  return { x, y };
}

/**
 * Computes new bounds for resizing `bounds` to `width` x `height` while
 * keeping the corner matching `position` anchored (fixed) in place -- so the
 * overlay grows inward from the selected edge/corner rather than always
 * drifting toward the bottom-right of the screen.
 */
export function anchoredResize(bounds: Rect, width: number, height: number, position: OverlayPosition): Rect {
  const isLeft = position === 'bottom-left' || position === 'top-left';
  const isTop = position === 'top-left' || position === 'top-right';
  const x = isLeft ? bounds.x : bounds.x + bounds.width - width;
  const y = isTop ? bounds.y : bounds.y + bounds.height - height;
  return { x, y, width, height };
}
