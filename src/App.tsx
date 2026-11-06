import { useEffect, useState } from 'react';
import { loadIndex } from './lib/data';
import HeroList from './pages/HeroList';
import HomePage from './pages/HomePage';
import HeroPage from './pages/HeroPage';
import GuidesPage, { GuidePage } from './pages/GuidesPage';
import ModesPage, { ModePage } from './pages/ModesPage';
import ArenaPage from './pages/ArenaPage';
import { ArtifactPage } from './pages/GearPage';
import Search from './components/Search';

const HERO_ROUTE = /^#\/hero\/([^/?]+)$/;
const GUIDE_ROUTE = /^#\/guides\/([^/?]+)$/;
const MODE_ROUTE = /^#\/modes\/([^/?]+)$/;
const ARTIFACT_ROUTE = /^#\/artifact\/([^/?]+)$/;

const safeDecode = (s: string) => { try { return decodeURIComponent(s); } catch { return s; } };

/** Which entry of the main menu a page belongs to (hero and artifact pages belong to Heroes). */
const section = (hash: string) =>
  /^#\/modes/.test(hash) ? 'modes' : /^#\/arena/.test(hash) ? 'arena' : /^#\/guides/.test(hash) ? 'guides'
    : /^#\/(heroes|hero\/|artifact\/)/.test(hash) ? 'heroes' : 'home';

function Page({ hash }: { hash: string }) {
  const hero = HERO_ROUTE.exec(hash)?.[1];
  if (hero) return <HeroPage code={safeDecode(hero)} />;
  const guide = GUIDE_ROUTE.exec(hash)?.[1];
  if (guide) return <GuidePage slug={safeDecode(guide)} />;
  const mode = MODE_ROUTE.exec(hash)?.[1];
  if (mode) return <ModePage id={safeDecode(mode)} />;
  const artifact = ARTIFACT_ROUTE.exec(hash)?.[1];
  if (artifact) return <ArtifactPage code={safeDecode(artifact)} />;
  if (hash === '#/guides') return <GuidesPage />;
  if (hash === '#/modes') return <ModesPage />;
  if (hash === '#/arena') return <ArenaPage />;
  if (hash === '#/heroes') return <HeroList />;
  return <HomePage />;
}

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

  return (
    <>
      <header className="top">
        <a className="logo" href="#/">E7 Meta</a>
        <nav aria-label="Main">
          <a href="#/" aria-current={section(hash) === 'home' ? 'page' : undefined}>Home</a>
          <a href="#/heroes" aria-current={section(hash) === 'heroes' ? 'page' : undefined}>Heroes</a>
          <a href="#/modes" aria-current={section(hash) === 'modes' ? 'page' : undefined}>Modes</a>
          <a href="#/arena" aria-current={section(hash) === 'arena' ? 'page' : undefined}>RTA</a>
          <a href="#/guides" aria-current={section(hash) === 'guides' ? 'page' : undefined}>Guides</a>
        </nav>
        <Search />
        {latest && <span className="week">Data: week of {latest}</span>}
      </header>
      <main><Page hash={hash} /></main>
    </>
  );
}
