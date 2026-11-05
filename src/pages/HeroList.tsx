import { useEffect, useMemo, useState } from 'react';
import { filterHeroes, loadHeroes, loadIndex } from '../lib/data';
import type { HeroSummary } from '../shared/types';

const JOBS: Record<string, string> = {
  warrior: 'Guerrier', knight: 'Chevalier', assassin: 'Voleur', mage: 'Mage', ranger: 'Rôdeur', manauser: 'Tisseur d’âme',
};
const ELEMENTS: Record<string, string> = { fire: 'Feu', ice: 'Glace', wind: 'Terre', light: 'Lumière', dark: 'Ténèbres' };
export const jobLabel = (c: string) => JOBS[c] ?? c;
export const elementLabel = (c: string) => ELEMENTS[c] ?? c;

type State = { status: 'loading' } | { status: 'empty' } | { status: 'error'; message: string } | { status: 'ok'; heroes: HeroSummary[] };

export default function HeroList() {
  const [state, setState] = useState<State>({ status: 'loading' });
  const [text, setText] = useState('');
  const [job, setJob] = useState('');
  const [element, setElement] = useState('');
  const [grade, setGrade] = useState('');

  useEffect(() => {
    let live = true;
    (async () => {
      const index = await loadIndex();
      if (!index || index.periods.length === 0) return live && setState({ status: 'empty' });
      const heroes = await loadHeroes(index.periods[0]);
      if (live) setState({ status: 'ok', heroes });
    })().catch((e: unknown) => live && setState({ status: 'error', message: String(e) }));
    return () => { live = false; };
  }, []);

  const shown = useMemo(
    () => (state.status === 'ok'
      ? filterHeroes(state.heroes, { text, job: job || undefined, element: element || undefined, grade: grade ? Number(grade) : undefined })
      : []),
    [state, text, job, element, grade],
  );

  if (state.status === 'loading') return <p>Chargement…</p>;
  if (state.status === 'error') return <p>Erreur de chargement : {state.message}</p>;
  if (state.status === 'empty') return <p>Aucune donnée, lance <code>npm run collect</code></p>;

  const jobs = [...new Set(state.heroes.map((h) => h.job))];
  const elements = [...new Set(state.heroes.map((h) => h.element))];
  return (
    <div>
      <input placeholder="Rechercher un héros" value={text} onChange={(e) => setText(e.target.value)} />
      <select aria-label="Classe" value={job} onChange={(e) => setJob(e.target.value)}>
        <option value="">Toutes les classes</option>
        {jobs.map((j) => <option key={j} value={j}>{jobLabel(j)}</option>)}
      </select>
      <select aria-label="Élément" value={element} onChange={(e) => setElement(e.target.value)}>
        <option value="">Tous les éléments</option>
        {elements.map((x) => <option key={x} value={x}>{elementLabel(x)}</option>)}
      </select>
      <select aria-label="Étoiles" value={grade} onChange={(e) => setGrade(e.target.value)}>
        <option value="">Toutes les étoiles</option>
        {[5, 4, 3].map((g) => <option key={g} value={g}>{g} ★</option>)}
      </select>
      <p>{shown.length} héros</p>
      <ul style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 8, listStyle: 'none', padding: 0 }}>
        {shown.map((h) => (
          <li key={h.code}>
            <a href={`#/hero/${h.code}`}>{h.name}</a>
            <small> {h.grade}★ · {jobLabel(h.job)} · {elementLabel(h.element)}</small>
          </li>
        ))}
      </ul>
    </div>
  );
}
