import { join } from 'node:path';
import { BrowserWindow, screen } from 'electron';
import type { OverlayPosition } from '@soullink/shared';
import { anchoredPosition, anchoredResize } from './overlayGeometry';

const isDev = !!process.env['ELECTRON_RENDERER_URL'];

const OVERLAY_MARGIN = 24;
const OVERLAY_INITIAL_WIDTH = 360;
const OVERLAY_INITIAL_HEIGHT = 120;

function loadPage(win: BrowserWindow, page: 'index' | 'overlay'): void {
  if (isDev) {
    win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/${page === 'index' ? 'index.html' : 'overlay.html'}`);
  } else {
    win.loadFile(join(__dirname, `../renderer/${page}.html`));
  }
}

export function createControlWindow(preloadPath: string): BrowserWindow {
  const win = new BrowserWindow({
    width: 480,
    height: 720,
    minWidth: 360,
    minHeight: 480,
    title: 'SoulLink Overlay - Control Panel',
    autoHideMenuBar: true,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  loadPage(win, 'index');
  return win;
}

export function createOverlayWindow(preloadPath: string, position: OverlayPosition = 'bottom-right'): BrowserWindow {
  const display = screen.getPrimaryDisplay();
  const { x, y } = anchoredPosition(
    display.workArea,
    OVERLAY_INITIAL_WIDTH,
    OVERLAY_INITIAL_HEIGHT,
    position,
    OVERLAY_MARGIN
  );
  const win = new BrowserWindow({
    width: OVERLAY_INITIAL_WIDTH,
    height: OVERLAY_INITIAL_HEIGHT,
    x,
    y,
    transparent: true,
    frame: false,
    hasShadow: false,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    focusable: false,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  // Default to fully click-through so the overlay never blocks game input.
  win.setIgnoreMouseEvents(true, { forward: true });
  loadPage(win, 'overlay');
  return win;
}

/**
 * Resizes the (frameless, transparent) overlay window while keeping the
 * corner matching `position` anchored in place -- so as the six-slot grid
 * grows to fit more players it grows inward from the selected edge/corner
 * rather than drifting away from it.
 */
export function resizeOverlayAnchored(win: BrowserWindow, width: number, height: number, position: OverlayPosition): void {
  win.setBounds(anchoredResize(win.getBounds(), width, height, position));
}

/**
 * Repositions the overlay window to the corner of the primary display's
 * work area matching `position`, keeping its current size. Used when the
 * user changes the overlay position setting without resizing.
 */
export function repositionOverlay(win: BrowserWindow, position: OverlayPosition): void {
  const display = screen.getPrimaryDisplay();
  const bounds = win.getBounds();
  const { x, y } = anchoredPosition(display.workArea, bounds.width, bounds.height, position, OVERLAY_MARGIN);
  win.setBounds({ x, y, width: bounds.width, height: bounds.height });
}
