import { describe, expect, it } from 'vitest';
import { nextAccordionSection, toggleAccordionSection, type AccordionSection } from './accordion';

describe('nextAccordionSection', () => {
  it('forces Lobby open when just connected with no lobby', () => {
    const result = nextAccordionSection({
      prevConnected: false,
      connected: true,
      prevHasLobby: false,
      hasLobby: false,
      current: 'saves',
    });
    expect(result).toBe('lobby');
  });

  it('forces Lobby open when a lobby was just joined/created', () => {
    const result = nextAccordionSection({
      prevConnected: true,
      connected: true,
      prevHasLobby: false,
      hasLobby: true,
      current: 'overlay',
    });
    expect(result).toBe('lobby');
  });

  it('leaves the current section alone when neither transition applies', () => {
    const result = nextAccordionSection({
      prevConnected: true,
      connected: true,
      prevHasLobby: true,
      hasLobby: true,
      current: 'saves',
    });
    expect(result).toBe('saves');
  });

  it('leaves the current section alone (including null/collapsed) when disconnecting', () => {
    const result = nextAccordionSection({
      prevConnected: true,
      connected: false,
      prevHasLobby: false,
      hasLobby: false,
      current: null,
    });
    expect(result).toBe(null);
  });

  it('leaves the current section alone when a lobby is left (hasLobby goes from true to false)', () => {
    const result = nextAccordionSection({
      prevConnected: true,
      connected: true,
      prevHasLobby: true,
      hasLobby: false,
      current: 'saves',
    });
    expect(result).toBe('saves');
  });
});

describe('toggleAccordionSection', () => {
  it('opens a different section, replacing whatever was open', () => {
    expect(toggleAccordionSection('lobby', 'saves')).toBe('saves');
    expect(toggleAccordionSection(null, 'overlay')).toBe('overlay');
  });

  it('collapses the section if it was already open', () => {
    expect(toggleAccordionSection('saves', 'saves')).toBe(null);
  });

  it('only ever returns one of the three sections or null', () => {
    const sections: Exclude<AccordionSection, null>[] = ['lobby', 'overlay', 'saves'];
    for (const clicked of sections) {
      const result = toggleAccordionSection('lobby', clicked);
      expect([...sections, null]).toContain(result);
    }
  });
});
