import { useEffect, useState } from 'react';
import { HeroFace } from '../components/Art';
import Bars from '../components/Bars';
import { NotFoundError, heroModeUsage, loadHero, loadHeroes, loadIndex, loadModes, loadTeams, type ModeUsage } from '../lib/data';
import { artifactIcon, setIcon } from '../lib/images';
import { heroTeams, type HeroTeam } from '../lib/modes';
import { statTarget } from '../lib/statTargets';
import { TeamRow } from './ModesPage';
import { STAT_RANGES } from '../shared/stats';
import type { HeroSnapshot, Period, StatKey } from '../shared/types';
import { elementLabel, jobLabel } from './HeroList';

const STATS: [StatKey, string][] = [
  ['attack', 'Attack'], ['defense', 'Defense'], ['health', 'Health'], ['speed', 'Speed'],
  ['critChance', 'Crit chance'], ['critDamage', 'Crit damage'], ['effectiveness', 'Effectiveness'],
  ['effectResistance', 'Effect resistance'],
];
const PERCENT_STATS = new Set<StatKey>(['critChance', 'critDamage', 'effectiveness', 'effectResistance']);
const num = (n: number) => n.toLocaleString('en-US');
/** "X+" for a lower bound; "Any" when the bound is the stat's minimum (nobody is held back by this stat). */
const from = (stat: StatKey, edge: number, unit: string) => (edge <= STAT_RANGES[stat][0] ? 'Any' : `${num(edge)}${unit}+`);
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

function TargetTable({ stats }: { stats: Record<StatKey, number[]> }) {
  return (
    <table className="targets" aria-label="Stat targets">
      <thead>
        <tr><th>Stat</th><th>Typical</th><th>Median</th><th>Top 25% from</th><th>Top 10% from</th></tr>
      </thead>
      <tbody>
        {STATS.map(([k, label]) => {
          const t = statTarget(k, stats[k]);
          const u = PERCENT_STATS.has(k) ? '%' : '';
          return (
            <tr key={k}>
              <th scope="row">{label}</th>
              {t ? (
                <>
                  <td>{num(t.typical[0])}–{num(t.typical[1])}{u}</td>
                  <td>{num(t.median[0])}–{num(t.median[1])}{u}</td>
                  <td>{from(k, t.top25, u)}</td>
                  <td>{from(k, t.top10, u)}</td>
                </>
              ) : <td colSpan={4}>No data</td>}
            </tr>
          );
        })}
      </tbody>
    </table>
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
  const [usage, setUsage] = useState<ModeUsage[]>([]);
  const [teamList, setTeamList] = useState<HeroTeam[]>([]);
  const [names, setNames] = useState<Map<string, string>>(new Map());

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

  // other game modes and teams are a bonus block: any failure or missing file just hides it
  useEffect(() => {
    if (!period) return;
    let live = true;
    setUsage([]);
    setTeamList([]);
    (async () => {
      const [modes, teams, heroes] = await Promise.all([
        loadModes(period).catch(() => null), loadTeams(period).catch(() => null), loadHeroes(period).catch(() => null),
      ]);
      if (!live) return;
      setUsage(modes ? heroModeUsage(modes, code) : []);
      setTeamList(modes && teams ? heroTeams(teams, modes, code, 6) : []);
      setNames(new Map((heroes ?? []).map((x) => [x.code, x.name])));
    })();
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
                <Bars items={top(h.sets, 10).map((s) => ({ label: s.name, value: s.share, icons: [setIcon(s.code)], href: `#/set/${s.code}` }))} />
              </Panel>
              <Panel title="Artifacts">
                <Bars items={top(h.artifacts, 10).map((a) => ({ label: a.name, value: a.share, title: a.effect, icons: [artifactIcon(a.code)], href: `#/artifact/${a.code}` }))} />
              </Panel>
            </div>
          </section>
          {(usage.length > 0 || teamList.length > 0) && (
            <section aria-label="Other game modes" className="source">
              <header>
                <h2>Other game modes</h2>
                <p className="period-chip">hero success rate, best first</p>
              </header>
              <div className="panels">
                {usage.length > 0 && (
                  <Panel title="Where it is used">
                    <Bars items={top(usage, 8).map((u) => ({ label: `#${u.rank} ${u.title}`, value: u.share, href: `#/modes/${u.id}` }))} />
                  </Panel>
                )}
                {teamList.length > 0 && (
                  <Panel title={`Best teams with ${h.hero.name}`}>
                    <ol className="teams">
                      {teamList.map((t) => (
                        <TeamRow key={`${t.listId}-${t.team.heroes.join()}`} team={t.team} names={names}
                          caption={<a href={`#/modes/${t.listId}`}>{t.title}</a>} />
                      ))}
                    </ol>
                  </Panel>
                )}
              </div>
            </section>
          )}
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
                  <Bars items={top(h.detail.artifacts, 10).map((a) => ({ label: a.name, value: a.share, icons: [artifactIcon(a.code)], href: `#/artifact/${a.code}` }))} />
                </Panel>
                <Panel title="Stats" wide>
                  <TargetTable stats={h.detail.stats} />
                  <p className="caption">
                    Typical is where most players are. Top 25% / 10% from is where the best-equipped players start: aim for
                    those to beat most of them. Ranges assume 10 equal buckets between min and max (estimate).
                  </p>
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
