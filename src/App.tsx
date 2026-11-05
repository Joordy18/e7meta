import { useEffect, useState } from 'react';
import { loadIndex } from './lib/data';
import HeroList from './pages/HeroList';
import HeroPage from './pages/HeroPage';
import GuidesPage, { GuidePage } from './pages/GuidesPage';
import ModesPage from './pages/ModesPage';

const HERO_ROUTE = /^#\/hero\/([^/?]+)$/;
const GUIDE_ROUTE = /^#\/guides\/([^/?]+)$/;

const safeDecode = (s: string) => { try { return decodeURIComponent(s); } catch { return s; } };

export default function App() {
  const [hash, setHash] = useState(location.hash);
  const [latest, setLatest] = useState<string | null>(null);

  useEffect(() => {
    const onHash = () => setHash(location.hash);
    addEventListener('hashchange', onHash);
    return () => removeEventListener('hashchange', onHash);
  }, []);
  useEffect(() => { window.scrollTo?.(0, 0); }, [hash]); // a new page starts at the top
  useEffect(() => { loadIndex().then((i) => setLatest(i?.periods[0] ?? null)).catch(() => {}); }, []);

  const code = HERO_ROUTE.exec(hash)?.[1];
  const guide = GUIDE_ROUTE.exec(hash)?.[1];
  return (
    <>
      <header className="top">
        <a className="logo" href="#/">E7 Meta</a>
        <nav aria-label="Main">
          <a href="#/" aria-current={!hash.startsWith('#/modes') && !hash.startsWith('#/guides') ? 'page' : undefined}>Heroes</a>
          <a href="#/modes" aria-current={hash.startsWith('#/modes') ? 'page' : undefined}>Modes</a>
          <a href="#/guides" aria-current={hash.startsWith('#/guides') ? 'page' : undefined}>Guides</a>
        </nav>
        {latest && <span className="week">Data: week of {latest}</span>}
      </header>
      <main>
        {code ? <HeroPage code={safeDecode(code)} />
          : guide ? <GuidePage slug={safeDecode(guide)} />
          : hash === '#/guides' ? <GuidesPage />
          : hash === '#/modes' ? <ModesPage />
          : <HeroList />}
      </main>
    </>
  );
}
