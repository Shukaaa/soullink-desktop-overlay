import { getPokemonDisplayName, spriteUrlFor, type TooltipLanguage } from '@soullink/shared';

/** Thin abstraction over where sprite images come from, so the CDN can be swapped later. */
export function getSpriteUrl(speciesId: number): string {
  return spriteUrlFor(speciesId);
}

export function getSpeciesName(speciesId: number, language: TooltipLanguage = 'en'): string {
  return getPokemonDisplayName(speciesId, language);
}
