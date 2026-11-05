import { useEffect, useState } from 'react';
import { loadIndex } from './lib/data';
import HeroList from './pages/HeroList';
import HeroPage from './pages/HeroPage';

const HERO_ROUTE = /^#\/hero\/([^/?]+)$/;

const safeDecode = (s: string) => { try { return decodeURIComponent(s); } catch { return s; } };

export default function App() {
  const [hash, setHash] = useState(location.hash);
  const [latest, setLatest] = useState<string | null>(null);

  useEffect(() => {
    const onHash = () => setHash(location.hash);
    addEventListener('hashchange', onHash);
    return () => removeEventListener('hashchange', onHash);
  }, []);
  useEffect(() => { loadIndex().then((i) => setLatest(i?.periods[0] ?? null)).catch(() => {}); }, []);

  const code = HERO_ROUTE.exec(hash)?.[1];
  return (
    <>
      <header>
        <a href="#/">E7 Meta</a>
        {latest && <span> — Dernier instantané : {latest}</span>}
      </header>
      {code ? <HeroPage code={safeDecode(code)} /> : <HeroList />}
    </>
  );
}
