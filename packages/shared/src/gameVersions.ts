export const GAME_VERSION_GROUPS = [
  {
    label: '1. Generation',
    versions: [
      { id: 'red', label: 'Pokémon Rot', template: 'kanto' },
      { id: 'green-japan', label: 'Pokémon Grün (Japan)', template: 'kanto' },
      { id: 'blue', label: 'Pokémon Blau', template: 'kanto' },
      { id: 'yellow', label: 'Pokémon Gelb', template: 'kanto' },
    ],
  },
  {
    label: '2. Generation',
    versions: [
      { id: 'gold', label: 'Pokémon Gold', template: 'johto-kanto' },
      { id: 'silver', label: 'Pokémon Silber', template: 'johto-kanto' },
      { id: 'crystal', label: 'Pokémon Kristall', template: 'johto-kanto' },
    ],
  },
  {
    label: '3. Generation',
    versions: [
      { id: 'ruby', label: 'Pokémon Rubin', template: 'hoenn' },
      { id: 'sapphire', label: 'Pokémon Saphir', template: 'hoenn' },
      { id: 'emerald', label: 'Pokémon Smaragd', template: 'hoenn' },
      { id: 'firered', label: 'Pokémon Feuerrot', template: 'kanto' },
      { id: 'leafgreen', label: 'Pokémon Blattgrün', template: 'kanto' },
    ],
  },
  {
    label: '4. Generation',
    versions: [
      { id: 'diamond', label: 'Pokémon Diamant', template: 'sinnoh' },
      { id: 'pearl', label: 'Pokémon Perl', template: 'sinnoh' },
      { id: 'platinum', label: 'Pokémon Platin', template: 'sinnoh-platinum' },
      { id: 'heartgold', label: 'Pokémon HeartGold', template: 'johto-kanto' },
      { id: 'soulsilver', label: 'Pokémon SoulSilver', template: 'johto-kanto' },
    ],
  },
  {
    label: '5. Generation',
    versions: [
      { id: 'black', label: 'Pokémon Schwarz', template: 'unova' },
      { id: 'white', label: 'Pokémon Weiß', template: 'unova' },
      { id: 'black-2', label: 'Pokémon Schwarz 2', template: 'unova-sequel' },
      { id: 'white-2', label: 'Pokémon Weiß 2', template: 'unova-sequel' },
    ],
  },
  {
    label: '6. Generation',
    versions: [
      { id: 'x', label: 'Pokémon X', template: 'kalos' },
      { id: 'y', label: 'Pokémon Y', template: 'kalos' },
      { id: 'omega-ruby', label: 'Pokémon Omega Rubin', template: 'hoenn' },
      { id: 'alpha-sapphire', label: 'Pokémon Alpha Saphir', template: 'hoenn' },
    ],
  },
  {
    label: '7. Generation',
    versions: [
      { id: 'sun', label: 'Pokémon Sonne', template: 'alola' },
      { id: 'moon', label: 'Pokémon Mond', template: 'alola' },
      { id: 'ultra-sun', label: 'Pokémon Ultrasonne', template: 'alola' },
      { id: 'ultra-moon', label: 'Pokémon Ultramond', template: 'alola' },
      { id: 'lets-go-pikachu', label: "Pokémon: Let's Go, Pikachu!", template: 'kanto' },
      { id: 'lets-go-eevee', label: "Pokémon: Let's Go, Evoli!", template: 'kanto' },
    ],
  },
  {
    label: '8. Generation',
    versions: [
      { id: 'sword', label: 'Pokémon Schwert', template: 'galar-sword' },
      { id: 'shield', label: 'Pokémon Schild', template: 'galar-shield' },
      { id: 'brilliant-diamond', label: 'Pokémon Strahlender Diamant', template: 'sinnoh' },
      { id: 'shining-pearl', label: 'Pokémon Leuchtende Perle', template: 'sinnoh' },
      { id: 'legends-arceus', label: 'Pokémon-Legenden: Arceus', template: 'none' },
    ],
  },
  {
    label: '9. Generation',
    versions: [
      { id: 'scarlet', label: 'Pokémon Karmesin', template: 'paldea' },
      { id: 'violet', label: 'Pokémon Purpur', template: 'paldea' },
      { id: 'legends-za', label: 'Pokémon-Legenden: Z-A', template: 'none' },
    ],
  },
] as const;

export type GameVersionId = (typeof GAME_VERSION_GROUPS)[number]['versions'][number]['id'];

const KANTO_ORDER_NAMES = [
  'Felsorden',
  'Quellorden',
  'Donnerorden',
  'Farborden',
  'Seelenorden',
  'Sumpforden',
  'Vulkanorden',
  'Erdorden',
] as const;

const JOHTO_ORDER_NAMES = [
  'Flügelorden',
  'Insektorden',
  'Basisorden',
  'Phantomorden',
  'Faustorden',
  'Stahlorden',
  'Eisorden',
  'Drachenorden',
] as const;

const JOHTO_KANTO_ORDER_NAMES = [...JOHTO_ORDER_NAMES, ...KANTO_ORDER_NAMES] as const;

const PROGRESS_TEMPLATES = {
  kanto: {
    heading: 'Kanto-Orden',
    itemNames: KANTO_ORDER_NAMES,
    emptyMessage: null,
  },
  'johto-kanto': {
    heading: 'Johto- und Kanto-Orden',
    itemNames: JOHTO_KANTO_ORDER_NAMES,
    emptyMessage: null,
  },
  hoenn: {
    heading: 'Hoenn-Orden',
    itemNames: [
      'Steinorden',
      'Knöchelorden',
      'Dynamo-Orden',
      'Hitzeorden',
      'Balanceorden',
      'Federorden',
      'Mentalorden',
      'Schauerorden',
    ],
    emptyMessage: null,
  },
  sinnoh: {
    heading: 'Sinnoh-Orden',
    itemNames: [
      'Kohleorden',
      'Waldorden',
      'Bergorden',
      'Fennorden',
      'Reliktorden',
      'Minenorden',
      'Firnorden',
      'Lichtorden',
    ],
    emptyMessage: null,
  },
  'sinnoh-platinum': {
    heading: 'Sinnoh-Orden',
    itemNames: [
      'Kohleorden',
      'Waldorden',
      'Reliktorden',
      'Bergorden',
      'Fennorden',
      'Minenorden',
      'Firnorden',
      'Lichtorden',
    ],
    emptyMessage: null,
  },
  unova: {
    heading: 'Einall-Orden',
    itemNames: [
      'Triorden',
      'Grundorden',
      'Käferorden',
      'Voltorden',
      'Seismo-Orden',
      'Jetorden',
      'Eiszapforden',
      'Legendenorden',
    ],
    emptyMessage: null,
  },
  'unova-sequel': {
    heading: 'Einall-Orden',
    itemNames: [
      'Grundorden',
      'Giftorden',
      'Käferorden',
      'Voltorden',
      'Seismo-Orden',
      'Jetorden',
      'Legendenorden',
      'Wellenorden',
    ],
    progressNote: 'Level-Caps gelten im Normalmodus; Einfach- und Hürdenmodus können abweichen.',
    emptyMessage: null,
  },
  kalos: {
    heading: 'Kalos-Orden',
    itemNames: [
      'Krabbelorden',
      'Wallorden',
      'Rauforden',
      'Blattorden',
      'Ampere-Orden',
      'Feenorden',
      'Psi-Orden',
      'Eisbergorden',
    ],
    emptyMessage: null,
  },
  alola: {
    heading: 'Große Prüfungen',
    itemNames: [
      'Mele-Mele-Prüfung',
      'Akala-Prüfung',
      'Ula-Ula-Prüfung',
      'Poni-Prüfung',
    ],
    emptyMessage: null,
  },
  'galar-sword': {
    heading: 'Galar-Orden',
    itemNames: [
      'Pflanzen-Orden',
      'Wasser-Orden',
      'Feuer-Orden',
      'Kampf-Orden',
      'Feen-Orden',
      'Gesteins-Orden',
      'Unlicht-Orden',
      'Drachen-Orden',
    ],
    emptyMessage: null,
  },
  'galar-shield': {
    heading: 'Galar-Orden',
    itemNames: [
      'Pflanzen-Orden',
      'Wasser-Orden',
      'Feuer-Orden',
      'Geister-Orden',
      'Feen-Orden',
      'Eis-Orden',
      'Unlicht-Orden',
      'Drachen-Orden',
    ],
    emptyMessage: null,
  },
  paldea: {
    heading: 'Arenaorden',
    itemNames: [
      'Käfer-Arenaorden',
      'Pflanzen-Arenaorden',
      'Elektro-Arenaorden',
      'Wasser-Arenaorden',
      'Normal-Arenaorden',
      'Geister-Arenaorden',
      'Psycho-Arenaorden',
      'Eis-Arenaorden',
    ],
    progressNote: 'Die Arenen lassen sich frei wählen; die Liste folgt der empfohlenen Reihenfolge.',
    emptyMessage: null,
  },
  none: {
    heading: 'Orden',
    itemNames: [],
    emptyMessage: 'Diese Spielversion hat keine Arenenorden.',
  },
} as const;

const LEVEL_CAP_TEMPLATES = {
  'kanto-red-blue': [14, 21, 24, 29, 43, 43, 47, 50],
  'kanto-yellow': [12, 21, 28, 32, 50, 50, 54, 55],
  'kanto-lets-go': [12, 19, 26, 34, 44, 44, 48, 50],
  'johto-kanto-gold-silver-crystal': [
    9, 16, 20, 25, 30, 35, 31, 40, 44, 47, 46, 46, 39, 48, 50, 58,
  ],
  'johto-kanto-heartgold-soulsilver': [
    13, 17, 19, 25, 31, 35, 34, 41, 54, 54, 53, 56, 50, 55, 59, 60,
  ],
  'hoenn-ruby-sapphire': [15, 18, 23, 28, 31, 33, 42, 43],
  'hoenn-emerald': [15, 19, 24, 29, 31, 33, 42, 46],
  'hoenn-omega-ruby-alpha-sapphire': [14, 16, 21, 28, 30, 35, 45, 46],
  'sinnoh-diamond-pearl': [14, 22, 30, 30, 36, 39, 42, 49],
  'sinnoh-platinum': [14, 22, 26, 32, 37, 41, 44, 50],
  'unova-black-white': [14, 20, 23, 27, 31, 35, 39, 43],
  'unova-black-2-white-2': [13, 18, 24, 30, 33, 39, 48, 51],
  kalos: [12, 25, 32, 34, 37, 42, 48, 59],
  'alola-sun-moon': [15, 27, 39, 48],
  'alola-ultra-sun-ultra-moon': [16, 28, 44, 54],
  'galar-sword': [20, 24, 27, 36, 38, 42, 46, 48],
  'galar-shield': [20, 24, 27, 36, 38, 42, 46, 48],
  paldea: [15, 17, 24, 30, 36, 42, 45, 48],
  none: [],
} as const;

type LevelCapTemplateId = keyof typeof LEVEL_CAP_TEMPLATES;

const LEVEL_CAP_TEMPLATE_BY_VERSION: Record<GameVersionId, LevelCapTemplateId> = {
  red: 'kanto-red-blue',
  'green-japan': 'kanto-red-blue',
  blue: 'kanto-red-blue',
  yellow: 'kanto-yellow',
  gold: 'johto-kanto-gold-silver-crystal',
  silver: 'johto-kanto-gold-silver-crystal',
  crystal: 'johto-kanto-gold-silver-crystal',
  ruby: 'hoenn-ruby-sapphire',
  sapphire: 'hoenn-ruby-sapphire',
  emerald: 'hoenn-emerald',
  firered: 'kanto-red-blue',
  leafgreen: 'kanto-red-blue',
  diamond: 'sinnoh-diamond-pearl',
  pearl: 'sinnoh-diamond-pearl',
  platinum: 'sinnoh-platinum',
  heartgold: 'johto-kanto-heartgold-soulsilver',
  soulsilver: 'johto-kanto-heartgold-soulsilver',
  black: 'unova-black-white',
  white: 'unova-black-white',
  'black-2': 'unova-black-2-white-2',
  'white-2': 'unova-black-2-white-2',
  x: 'kalos',
  y: 'kalos',
  'omega-ruby': 'hoenn-omega-ruby-alpha-sapphire',
  'alpha-sapphire': 'hoenn-omega-ruby-alpha-sapphire',
  sun: 'alola-sun-moon',
  moon: 'alola-sun-moon',
  'ultra-sun': 'alola-ultra-sun-ultra-moon',
  'ultra-moon': 'alola-ultra-sun-ultra-moon',
  'lets-go-pikachu': 'kanto-lets-go',
  'lets-go-eevee': 'kanto-lets-go',
  sword: 'galar-sword',
  shield: 'galar-shield',
  'brilliant-diamond': 'sinnoh-diamond-pearl',
  'shining-pearl': 'sinnoh-diamond-pearl',
  'legends-arceus': 'none',
  scarlet: 'paldea',
  violet: 'paldea',
  'legends-za': 'none',
};

const FLEXIBLE_KANTO_VERSION_IDS = new Set<GameVersionId>([
  'gold',
  'silver',
  'crystal',
  'heartgold',
  'soulsilver',
]);

export function isGameVersionId(value: unknown): value is GameVersionId {
  return GAME_VERSION_GROUPS.some((group) => group.versions.some((version) => version.id === value));
}

export function getGameVersion(id: GameVersionId) {
  for (const group of GAME_VERSION_GROUPS) {
    const version = group.versions.find((entry) => entry.id === id);
    if (version) {
      const template = PROGRESS_TEMPLATES[version.template];
      const levelCaps = LEVEL_CAP_TEMPLATES[LEVEL_CAP_TEMPLATE_BY_VERSION[id]];
      const hasFlexibleKantoOrder = FLEXIBLE_KANTO_VERSION_IDS.has(id);
      if (levelCaps.length !== template.itemNames.length) {
        throw new RangeError(`Invalid progress template for game version: ${id}`);
      }
      const progressNote =
        'progressNote' in template
          ? template.progressNote
          : hasFlexibleKantoOrder
            ? 'Die Kanto-Arenen sind frei wählbar; den Erdorden erhältst du zuletzt.'
            : null;
      return {
        id: version.id,
        label: version.label,
        generation: group.label,
        ...template,
        progressNote,
        levelCaps,
        count: template.itemNames.length,
      };
    }
  }
  throw new RangeError(`Unknown game version: ${id}`);
}

export function normalizeOrdenProgress(gameVersionId: GameVersionId | null, values: readonly boolean[]): boolean[] {
  const count = gameVersionId ? getGameVersion(gameVersionId).count : 0;
  return Array.from({ length: count }, (_, index) => values[index] === true);
}
