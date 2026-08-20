import { describe, expect, it } from 'vitest';
import type { OverlayPosition } from '@soullink/shared';
import { anchoredPosition, anchoredResize } from './overlayGeometry';

const AREA = { x: 0, y: 0, width: 1920, height: 1080 };
const MARGIN = 24;

describe('anchoredPosition', () => {
  it('anchors to the bottom-right corner by default margins', () => {
    expect(anchoredPosition(AREA, 360, 120, 'bottom-right', MARGIN)).toEqual({
      x: 1920 - 360 - MARGIN,
      y: 1080 - 120 - MARGIN,
    });
  });

  it('anchors to the bottom-left corner', () => {
    expect(anchoredPosition(AREA, 360, 120, 'bottom-left', MARGIN)).toEqual({
      x: MARGIN,
      y: 1080 - 120 - MARGIN,
    });
  });

  it('anchors to the top-right corner', () => {
    expect(anchoredPosition(AREA, 360, 120, 'top-right', MARGIN)).toEqual({
      x: 1920 - 360 - MARGIN,
      y: MARGIN,
    });
  });

  it('anchors to the top-left corner', () => {
    expect(anchoredPosition(AREA, 360, 120, 'top-left', MARGIN)).toEqual({
      x: MARGIN,
      y: MARGIN,
    });
  });

  it('respects a non-origin work area (e.g. a secondary monitor)', () => {
    const area = { x: 1920, y: 0, width: 1920, height: 1080 };
    expect(anchoredPosition(area, 360, 120, 'bottom-right', MARGIN)).toEqual({
      x: 1920 + 1920 - 360 - MARGIN,
      y: 1080 - 120 - MARGIN,
    });
  });
});

describe('anchoredResize', () => {
  const positions: OverlayPosition[] = ['bottom-right', 'bottom-left', 'top-right', 'top-left'];

  it('keeps the bottom-right corner fixed when growing', () => {
    const bounds = { x: 1500, y: 900, width: 360, height: 120 };
    const right = bounds.x + bounds.width;
    const bottom = bounds.y + bounds.height;
    const result = anchoredResize(bounds, 500, 200, 'bottom-right');
    expect(result).toEqual({ x: right - 500, y: bottom - 200, width: 500, height: 200 });
  });

  it('keeps the bottom-left corner fixed when growing (x unchanged)', () => {
    const bounds = { x: 24, y: 900, width: 360, height: 120 };
    const bottom = bounds.y + bounds.height;
    const result = anchoredResize(bounds, 500, 200, 'bottom-left');
    expect(result).toEqual({ x: bounds.x, y: bottom - 200, width: 500, height: 200 });
  });

  it('keeps the top-right corner fixed when growing (y unchanged)', () => {
    const bounds = { x: 1500, y: 24, width: 360, height: 120 };
    const right = bounds.x + bounds.width;
    const result = anchoredResize(bounds, 500, 200, 'top-right');
    expect(result).toEqual({ x: right - 500, y: bounds.y, width: 500, height: 200 });
  });

  it('keeps the top-left corner fixed when growing (x and y unchanged)', () => {
    const bounds = { x: 24, y: 24, width: 360, height: 120 };
    const result = anchoredResize(bounds, 500, 200, 'top-left');
    expect(result).toEqual({ x: bounds.x, y: bounds.y, width: 500, height: 200 });
  });

  it('produces the same corner (within rounding) for every position after resize', () => {
    for (const position of positions) {
      const bounds = { x: 800, y: 400, width: 360, height: 120 };
      const before = cornerFor(bounds, position);
      const after = anchoredResize(bounds, 720, 240, position);
      const afterCorner = cornerFor(after, position);
      expect(afterCorner).toEqual(before);
    }
  });
});

function cornerFor(rect: { x: number; y: number; width: number; height: number }, position: OverlayPosition) {
  const isLeft = position === 'bottom-left' || position === 'top-left';
  const isTop = position === 'top-left' || position === 'top-right';
  return {
    x: isLeft ? rect.x : rect.x + rect.width,
    y: isTop ? rect.y : rect.y + rect.height,
  };
}
