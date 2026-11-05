import { useState } from 'react';
import { heroPortrait } from '../lib/images';

/** Small official icon (set, artifact). Hidden when the image cannot load, the text next to it still says what it is. */
export function Icon({ src, className = 'icon' }: { src: string; className?: string }) {
  const [broken, setBroken] = useState(false);
  if (broken) return null;
  return <img className={className} src={src} alt="" loading="lazy" decoding="async" draggable={false} onError={() => setBroken(true)} />;
}

/** Square crop on the face of a hero portrait (same framing the official guide uses); initials when the image is missing. */
export function HeroFace({ code, name, className = 'face' }: { code: string; name: string; className?: string }) {
  const [broken, setBroken] = useState(false);
  return (
    <span className={className} aria-hidden>
      {broken
        ? <span className="face-initials">{name.slice(0, 2)}</span>
        : <img src={heroPortrait(code)} alt="" loading="lazy" decoding="async" draggable={false} onError={() => setBroken(true)} />}
    </span>
  );
}
