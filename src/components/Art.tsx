import { useState } from 'react';
import { heroIcon, heroPortrait } from '../lib/images';

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

/** Small hero icon for rankings and teams; the name stays available as a tooltip and to screen readers. */
export function HeroIcon({ code, name, className = 'hicon', decorative = false }: { code: string; name: string; className?: string; decorative?: boolean }) {
  const [broken, setBroken] = useState(false);
  return (
    <span className={className} {...(decorative ? { 'aria-hidden': true } : { title: name, role: 'img', 'aria-label': name })}>
      {broken
        ? <span className="face-initials">{name.slice(0, 2)}</span>
        : <img src={heroIcon(code)} alt="" loading="lazy" decoding="async" draggable={false} onError={() => setBroken(true)} />}
    </span>
  );
}
