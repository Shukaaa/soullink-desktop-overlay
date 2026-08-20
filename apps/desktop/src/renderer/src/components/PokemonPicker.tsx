import { useMemo, useState } from 'react';
import { searchPokedex, type PokedexEntry } from '@soullink/shared';
import { SpriteImage } from './SpriteImage';

const MAX_RESULTS = 20;

interface PokemonPickerProps {
  onSelect: (entry: PokedexEntry) => void;
  selectedId?: number | null;
}

/**
 * Searches the shared bilingual pokedex data (English + German names) and
 * lets the user pick a result. Selecting a result reports the full
 * `PokedexEntry`; callers keep using `entry.id` as the wire `pokemonId`.
 */
export function PokemonPicker({ onSelect, selectedId }: PokemonPickerProps) {
  const [query, setQuery] = useState('');

  const results = useMemo(() => searchPokedex(query).slice(0, MAX_RESULTS), [query]);

  return (
    <div className="pokemon-picker">
      <input
        type="text"
        placeholder="Search Pokemon (English or German)..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="Search Pokemon"
      />
      <div className="pokemon-picker-results">
        {results.map((entry) => (
          <button
            type="button"
            key={entry.id}
            className={`pokemon-picker-item${selectedId === entry.id ? ' selected' : ''}`}
            onClick={() => onSelect(entry)}
            title={`${entry.name} / ${entry.nameDe}`}
          >
            <SpriteImage speciesId={entry.id} size={32} alt={entry.name} />
            <span className="pokemon-picker-item-names">
              <span className="pokemon-picker-item-name-en">{entry.name}</span>
              <span className="pokemon-picker-item-name-de">{entry.nameDe}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
