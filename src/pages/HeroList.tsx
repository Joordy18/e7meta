import { useEffect, useMemo, useState } from 'react';
import { filterHeroes, loadHeroes, loadIndex, normalize, sortHeroes, type SortKey } from '../lib/data';
import { ElementIcon, HeroFace, JobIcon } from '../components/Art';
import { useI18n, useLabels } from '../i18n';
import { formatValue } from '../components/Bars';
import type { HeroSummary } from '../shared/types';

type State = { status: 'loading' } | { status: 'empty' } | { status: 'error'; message: string } | { status: 'ok'; heroes: HeroSummary[] };

export default function HeroList() {
  const { t, rich, name } = useI18n();
  const labels = useLabels();
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

  // heroes are shown, sorted and searched by their name in the language; the English name still finds them
  const shown = useMemo(() => {
    if (state.status !== 'ok') return [];
    const q = normalize(text.trim());
    const named = state.heroes.map((h) => ({ ...h, name: name.hero(h.code, h.name), english: h.name }));
    const found = filterHeroes(named, { text: '', job: job || undefined, element: element || undefined, grade: grade ? Number(grade) : undefined })
      .filter((h) => !q || normalize(h.name).includes(q) || normalize((h as (typeof named)[number]).english).includes(q));
    return sortHeroes(found, sort);
  }, [state, text, job, element, grade, sort, name]);

  if (state.status === 'loading') return <p className="note">{t('common.loading')}</p>;
  if (state.status === 'error') return <p className="note error">{t('common.failed', { message: state.message })}</p>;
  if (state.status === 'empty') return <p className="note">{rich('common.noDataYet', { cmd: <code>npm run collect</code> })}</p>;

  const jobs = [...new Set(state.heroes.map((h) => h.job))];
  const elements = [...new Set(state.heroes.map((h) => h.element))];
  return (
    <div>
      <div className="toolbar">
        <input type="search" aria-label={t('heroList.search')} placeholder={t('heroList.search')} value={text} onChange={(e) => setText(e.target.value)} />
        <select aria-label={t('heroList.class')} value={job} onChange={(e) => setJob(e.target.value)}>
          <option value="">{t('heroList.allClasses')}</option>
          {jobs.map((j) => <option key={j} value={j}>{labels.job(j)}</option>)}
        </select>
        <select aria-label={t('heroList.element')} value={element} onChange={(e) => setElement(e.target.value)}>
          <option value="">{t('heroList.allElements')}</option>
          {elements.map((x) => <option key={x} value={x}>{labels.element(x)}</option>)}
        </select>
        <select aria-label={t('heroList.stars')} value={grade} onChange={(e) => setGrade(e.target.value)}>
          <option value="">{t('heroList.allStars')}</option>
          {[5, 4, 3].map((g) => <option key={g} value={g}>{g} ★</option>)}
        </select>
        <select aria-label={t('heroList.sortBy')} value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
          <option value="name">{t('heroList.sortName')}</option>
          <option value="topSet">{t('heroList.sortTopSet')}</option>
          <option value="topArtifact">{t('heroList.sortTopArtifact')}</option>
        </select>
        <span className="count">{t('heroList.count', { n: shown.length })}</span>
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
