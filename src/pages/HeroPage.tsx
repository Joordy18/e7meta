import { useEffect, useState } from 'react';
import { HeroFace } from '../components/Art';
import Bars from '../components/Bars';
import { NotFoundError, loadHero, loadIndex } from '../lib/data';
import { artifactIcon, setIcon } from '../lib/images';
import { STAT_RANGES } from '../shared/stats';
import type { HeroSnapshot, Period, StatKey } from '../shared/types';
import { elementLabel, jobLabel } from './HeroList';

const STATS: [StatKey, string][] = [
  ['attack', 'Attack'], ['defense', 'Defense'], ['health', 'Health'], ['speed', 'Speed'],
  ['critChance', 'Crit chance'], ['critDamage', 'Crit damage'], ['effectiveness', 'Effectiveness'],
  ['effectResistance', 'Effect resistance'],
];
const range = (p: Period) => `${p.start} to ${p.end}`;
const top = <T,>(xs: T[], n: number) => xs.slice(0, n);

type State = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ok'; hero: HeroSnapshot };

function Histogram({ stat, label, counts }: { stat: StatKey; label: string; counts: number[] }) {
  const max = Math.max(...counts, 1);
  const [lo, hi] = STAT_RANGES[stat];
  return (
    <div role="group" aria-label={label} className="histo">
      <strong>{label}</strong>
      <div className="histo-bars">
        {counts.map((c, i) => (
          <div key={i} role="meter" aria-label={`${label}, bucket ${i + 1}`} aria-valuenow={c} aria-valuemin={0} aria-valuemax={max}
            title={String(c)} className={c === max ? 'peak' : undefined} style={{ height: `${(c / max) * 100}%` }} />
        ))}
      </div>
      <div className="histo-axis"><span>{lo}</span><span>{hi}</span></div>
    </div>
  );
}

function Panel({ title, children, wide }: { title: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <section aria-label={title} className={wide ? 'panel wide' : 'panel'}>
      <h3>{title}</h3>
      {children}
    </section>
  );
}

export default function HeroPage({ code }: { code: string }) {
  const [periods, setPeriods] = useState<string[]>([]);
  const [period, setPeriod] = useState('');
  const [state, setState] = useState<State>({ status: 'loading' });

  useEffect(() => {
    let live = true;
    loadIndex()
      .then((i) => {
        if (!live) return;
        if (!i || i.periods.length === 0) setState({ status: 'error', message: 'No data yet. Run npm run collect' });
        else { setPeriods(i.periods); setPeriod(i.periods[0]); }
      })
      .catch((e: unknown) => live && setState({ status: 'error', message: `Failed to load: ${String(e)}` }));
    return () => { live = false; };
  }, []);

  useEffect(() => {
    if (!period) return;
    let live = true;
    setState({ status: 'loading' });
    loadHero(period, code)
      .then((hero) => live && setState({ status: 'ok', hero }))
      .catch((e: unknown) => live && setState({
        status: 'error',
        message: e instanceof NotFoundError ? 'No data for this hero in this period' : `Failed to load: ${String(e)}`,
      }));
    return () => { live = false; };
  }, [period, code]);

  const h = state.status === 'ok' ? state.hero : undefined;
  return (
    <div>
      <div className="hero-bar">
        <a className="back" href="#/">← All heroes</a>
        {periods.length > 0 && (
          <label className="period">Period{' '}
            <select value={period} onChange={(e) => setPeriod(e.target.value)}>
              {periods.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
        )}
      </div>
      {state.status === 'loading' && <p className="note">Loading…</p>}
      {state.status === 'error' && <p className="note error">{state.message}</p>}
      {h && (
        <>
          <div className="hero-head">
            <HeroFace code={h.hero.code} name={h.hero.name} className="face big" />
            <div>
              <h1>{h.hero.name}</h1>
              <p className="tags">
                {h.hero.grade}★ <span className="el" data-el={h.hero.element} aria-hidden /> {elementLabel(h.hero.element)}, {jobLabel(h.hero.job)}
              </p>
            </div>
          </div>
          <section aria-label="Source: gear ranking" className="source">
            <header>
              <h2>Source: gear ranking</h2>
              <p className="period-chip">{range(h.period)}</p>
            </header>
            <div className="panels">
              <Panel title="Sets">
                <Bars items={top(h.sets, 10).map((s) => ({ label: s.name, value: s.share, icons: [setIcon(s.code)] }))} />
              </Panel>
              <Panel title="Artifacts">
                <Bars items={top(h.artifacts, 10).map((a) => ({ label: a.name, value: a.share, title: a.effect, icons: [artifactIcon(a.code)] }))} />
              </Panel>
            </div>
          </section>
          {h.detail && (
            <section aria-label="Source: hunts" className="source">
              <header>
                <h2>Source: hunts</h2>
                <p className="period-chip">{range(h.detail.period)}</p>
              </header>
              <div className="panels">
                <Panel title="Set combinations">
                  <Bars items={top(h.detail.combos, 3).map((c) => ({ label: c.sets.join(' + '), value: c.share, icons: (c.codes ?? []).map(setIcon) /* periods collected before codes existed have none */ }))} />
                </Panel>
                <Panel title="Artifacts (hunts)">
                  <Bars items={top(h.detail.artifacts, 10).map((a) => ({ label: a.name, value: a.share, icons: [artifactIcon(a.code)] }))} />
                </Panel>
                <Panel title="Stats" wide>
                  <p className="caption">Distribution in 10 buckets between min and max (estimate)</p>
                  <div className="histos">
                    {STATS.map(([k, label]) => <Histogram key={k} stat={k} label={label} counts={h.detail!.stats[k]} />)}
                  </div>
                </Panel>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
