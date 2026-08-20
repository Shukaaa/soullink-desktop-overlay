import { useState } from 'react';
import { getSpriteUrl } from '../services/spriteProvider';

const FALLBACK_SPRITE =
  'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48"><rect width="48" height="48" fill="%23333"/></svg>';

interface SpriteImageProps {
  speciesId: number;
  size?: number;
  alt?: string;
}

export function SpriteImage({ speciesId, size = 48, alt }: SpriteImageProps) {
  const [failed, setFailed] = useState(false);
  return (
    <img
      src={failed ? FALLBACK_SPRITE : getSpriteUrl(speciesId)}
      onError={() => setFailed(true)}
      width={size}
      height={size}
      alt={alt ?? `Species #${speciesId}`}
      style={{ imageRendering: 'pixelated', objectFit: 'contain' }}
    />
  );
}
