import { useEffect, useState } from 'react';
import { loadIndex } from './lib/data';
import HeroList from './pages/HeroList';
import HomePage from './pages/HomePage';
import HeroPage from './pages/HeroPage';
import GuidesPage, { GuidePage } from './pages/GuidesPage';
import ModesPage, { ModePage } from './pages/ModesPage';
import ArenaPage from './pages/ArenaPage';
import TiersPage from './pages/TiersPage';
import ToolsPage from './pages/ToolsPage';
import DraftPage from './pages/DraftPage';
import AboutPage, { type AboutSection } from './pages/AboutPage';
import Footer from './components/Footer';
import { ArtifactPage } from './pages/GearPage';
import Search from './components/Search';
import LanguageMenu from './components/LanguageMenu';
import { I18nProvider, useI18n } from './i18n';

const HERO_ROUTE = /^#\/hero\/([^/?]+)$/;
const GUIDE_ROUTE = /^#\/guides\/([^/?]+)$/;
const MODE_ROUTE = /^#\/modes\/([^/?]+)$/;
const ARTIFACT_ROUTE = /^#\/artifact\/([^/?]+)$/;
const ABOUT_ROUTE = /^#\/about(?:\/(faq|data|limits|legal))?$/;

const safeDecode = (s: string) => { try { return decodeURIComponent(s); } catch { return s; } };

/** Which entry of the main menu a page belongs to (hero and artifact pages belong to Heroes). */
const section = (hash: string) =>
  /^#\/about/.test(hash) ? 'about' : /^#\/modes/.test(hash) ? 'modes' : /^#\/tiers/.test(hash) ? 'tiers' : /^#\/tools/.test(hash) ? 'tools' : /^#\/arena/.test(hash) ? 'arena' : /^#\/guides/.test(hash) ? 'guides'
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
  const about = ABOUT_ROUTE.exec(hash);
  if (about) return <AboutPage section={about[1] as AboutSection | undefined} />;
  if (hash === '#/guides') return <GuidesPage />;
  if (hash === '#/modes') return <ModesPage />;
  if (hash === '#/arena') return <ArenaPage />;
  if (hash === '#/tiers') return <TiersPage />;
  if (hash === '#/tools') return <ToolsPage />;
  if (hash === '#/tools/draft') return <DraftPage />;
  if (hash === '#/heroes') return <HeroList />;
  return <HomePage />;
}

export default function App() {
  return <I18nProvider><Shell /></I18nProvider>;
}

function Shell() {
  const { t } = useI18n();
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
        <nav aria-label={t('nav.main')}>
          <a href="#/" aria-current={section(hash) === 'home' ? 'page' : undefined}>{t('nav.home')}</a>
          <a href="#/heroes" aria-current={section(hash) === 'heroes' ? 'page' : undefined}>{t('nav.heroes')}</a>
          <a href="#/modes" aria-current={section(hash) === 'modes' ? 'page' : undefined}>{t('nav.modes')}</a>
          <a href="#/tiers" aria-current={section(hash) === 'tiers' ? 'page' : undefined}>{t('nav.tiers')}</a>
          <a href="#/arena" aria-current={section(hash) === 'arena' ? 'page' : undefined}>{t('nav.rta')}</a>
          <a href="#/tools" aria-current={section(hash) === 'tools' ? 'page' : undefined}>{t('nav.tools')}</a>
          <a href="#/guides" aria-current={section(hash) === 'guides' ? 'page' : undefined}>{t('nav.guides')}</a>
        </nav>
        <Search />
        {latest && <span className="week">{t('app.dataWeek', { date: latest })}</span>}
        <LanguageMenu />
      </header>
      <main><Page hash={hash} /></main>
      <Footer />
    </>
  );
}
