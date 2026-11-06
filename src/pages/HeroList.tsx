import { useEffect, useMemo, useState } from 'react';
import { filterHeroes, loadHeroes, loadIndex, sortHeroes, type SortKey } from '../lib/data';
import { ElementIcon, HeroFace, JobIcon } from '../components/Art';
import { elementLabel, jobLabel } from '../lib/labels';
import { formatValue } from '../components/Bars';
import type { HeroSummary } from '../shared/types';

type State = { status: 'loading' } | { status: 'empty' } | { status: 'error'; message: string } | { status: 'ok'; heroes: HeroSummary[] };

export default function HeroList() {
  const [state, setState] = useState<State>({ status: 'loading' });
  const [text, setText] = useState('');
  const [job, setJob] = useState('');
  const [element, setElement] = useState('');
  const [grade, setGrade] = useState('');
  const [sort, setSort] = useState<SortKey>('name');

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
      ? sortHeroes(filterHeroes(state.heroes, { text, job: job || undefined, element: element || undefined, grade: grade ? Number(grade) : undefined }), sort)
      : []),
    [state, text, job, element, grade, sort],
  );

  if (state.status === 'loading') return <p className="note">Loading…</p>;
  if (state.status === 'error') return <p className="note error">Failed to load: {state.message}</p>;
  if (state.status === 'empty') return <p className="note">No data yet. Run <code>npm run collect</code></p>;

  const jobs = [...new Set(state.heroes.map((h) => h.job))];
  const elements = [...new Set(state.heroes.map((h) => h.element))];
  return (
    <div>
      <div className="toolbar">
        <input type="search" aria-label="Search heroes" placeholder="Search heroes" value={text} onChange={(e) => setText(e.target.value)} />
        <select aria-label="Class" value={job} onChange={(e) => setJob(e.target.value)}>
          <option value="">All classes</option>
          {jobs.map((j) => <option key={j} value={j}>{jobLabel(j)}</option>)}
        </select>
        <select aria-label="Element" value={element} onChange={(e) => setElement(e.target.value)}>
          <option value="">All elements</option>
          {elements.map((x) => <option key={x} value={x}>{elementLabel(x)}</option>)}
        </select>
        <select aria-label="Stars" value={grade} onChange={(e) => setGrade(e.target.value)}>
          <option value="">All stars</option>
          {[5, 4, 3].map((g) => <option key={g} value={g}>{g} ★</option>)}
        </select>
        <select aria-label="Sort by" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
          <option value="name">Name</option>
          <option value="topSet">Top set share</option>
          <option value="topArtifact">Top artifact share</option>
        </select>
        <span className="count">{shown.length} heroes</span>
      </div>
      <ul className="grid">
        {shown.map((h) => (
          <li key={h.code} className="card">
            <HeroFace code={h.code} name={h.name} />
            <a href={`#/hero/${h.code}`}>{h.name}</a>
            <small className="tags">
              {h.grade}★ <ElementIcon element={h.element} /> <JobIcon job={h.job} />
            </small>
            {sort !== 'name' && h[sort] !== undefined && <strong className="metric">{formatValue(h[sort]!)}</strong>}
          </li>
        ))}
      </ul>
    </div>
  );
}
