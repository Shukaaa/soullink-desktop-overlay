/**
 * At most one of the Lobby / Overlay / Saves control-panel sections may be
 * open (accordion behaviour). `null` means everything is collapsed.
 */
export type AccordionSection = 'lobby' | 'overlay' | 'saves' | null;

export interface AccordionTransitionInput {
  /** Whether the connection was already `open` before this render. */
  prevConnected: boolean;
  /** Whether the connection is `open` now. */
  connected: boolean;
  /** Whether a lobby was already joined before this render. */
  prevHasLobby: boolean;
  /** Whether a lobby is joined now. */
  hasLobby: boolean;
  /** The section currently open (or `null`). */
  current: AccordionSection;
}

/**
 * Decides which section should be forced open after a state transition:
 *  - just connected (no lobby yet) -> open Lobby (create/join controls),
 *  - just joined/created a lobby -> open Lobby (now showing the active lobby),
 *  - otherwise -> leave whatever the user currently has open/closed alone.
 */
export function nextAccordionSection(input: AccordionTransitionInput): AccordionSection {
  const justConnected = input.connected && !input.prevConnected;
  const justJoinedLobby = input.hasLobby && !input.prevHasLobby;
  if (justConnected || justJoinedLobby) return 'lobby';
  return input.current;
}

/**
 * Click behaviour for an accordion section's title: clicking the
 * already-open section collapses it (`null`); clicking any other section
 * opens it, implicitly closing whichever one was open before.
 */
export function toggleAccordionSection(
  current: AccordionSection,
  clicked: Exclude<AccordionSection, null>
): AccordionSection {
  return current === clicked ? null : clicked;
}
