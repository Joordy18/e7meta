import { useEffect, useState } from 'react';
import { HeroIcon, Icon } from '../components/Art';
import Loadout from '../components/Loadout';
import Bars from '../components/Bars';
import { NotFoundError, heroModeUsage, loadArenaIndex, loadArenaSeason, loadHero, loadHeroes, loadIndex, loadModes, loadSkills, loadTeams, type ModeUsage } from '../lib/data';
import { artifactIcon, setIcon, skillIcon } from '../lib/images';
import { TIERS, heroArena, type HeroArenaRow } from '../lib/arena';
import { heroTeams, teammates, type HeroTeam, type Teammate } from '../lib/modes';
import { PERCENT_STATS, STATS, lowerBound, num, statTarget } from '../lib/statTargets';
import { TeamRow } from './ModesPage';
import { STAT_RANGES } from '../shared/stats';
import type { ArenaSeason, ExclusiveEquipment, HeroSnapshot, Period, SkillsFile, StatKey } from '../shared/types';

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
                  <td>{lowerBound(k, t.top25)}</td>
                  <td>{lowerBound(k, t.top10)}</td>
                </>
              ) : <td colSpan={4}>No data</td>}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/** The exclusive equipment: what it gives, and what each upgrade option does, with how many players pick it. */
function ExclusivePanel({ hero, ee }: { hero: HeroSnapshot; ee?: ExclusiveEquipment }) {
  const uses = hero.exclusive ?? [];
  if (uses.length === 0 && !ee) return null;
  if (!ee) {
    return (
      <Panel title="Upgrade options players choose">
        <Bars items={uses.map((e) => ({
          label: `${hero.skills?.[e.skill - 1] ?? `Skill ${e.skill}`}, option ${e.option}`, value: e.share, icons: [skillIcon(hero.hero.code, e.skill)],
        }))} />
      </Panel>
    );
  }
  const options = ee.options
    .map((o, i) => ({ ...o, n: i + 1, use: uses.find((u) => u.option === i + 1) }))
    .sort((a, b) => (b.use?.share ?? -1) - (a.use?.share ?? -1) || a.n - b.n);
  return (
    <Panel title={ee.name || 'Upgrade options'}>
      {ee.stat && <p className="ee-stat"><span className="chip">{ee.stat.name} {ee.stat.min} to {ee.stat.max}</span></p>}
      <ol className="ee-options">
        {options.map((o, i) => {
          const skillN = o.use?.skill ?? (hero.skills?.indexOf(o.skill) ?? -1) + 1;
          return (
            <li key={o.n} className={i === 0 && o.use ? 'top' : undefined}>
              {skillN > 0 && <Icon src={skillIcon(hero.hero.code, skillN)} className="skill-icon" />}
              <div>
                <strong>{o.skill}</strong>
                <p>{o.text}</p>
              </div>
              {o.use && <span className="ee-share">{i === 0 && <small>Most used</small>}<em>{o.use.share}%</em></span>}
            </li>
          );
        })}
      </ol>
    </Panel>
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
  const [period, setPeriod] = useState('');
  const [state, setState] = useState<State>({ status: 'loading' });
  const [usage, setUsage] = useState<ModeUsage[]>([]);
  const [teamList, setTeamList] = useState<HeroTeam[]>([]);
  const [mates, setMates] = useState<Teammate[]>([]);
  const [arena, setArena] = useState<{ season: ArenaSeason; rows: HeroArenaRow[] } | null>(null);
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [skills, setSkills] = useState<SkillsFile | null>(null);

  // skill texts come from a separate file; without it the page still shows the skill names
  useEffect(() => { loadSkills().then(setSkills).catch(() => {}); }, []);

  useEffect(() => {
    let live = true;
    loadIndex()
      .then((i) => {
        if (!live) return;
        if (!i || i.periods.length === 0) setState({ status: 'error', message: 'No data yet. Run npm run collect' });
        else setPeriod(i.periods[0]); // the latest week only: the site is about the current meta
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
    setMates([]);
    (async () => {
      const [modes, teams, heroes] = await Promise.all([
        loadModes(period).catch(() => null), loadTeams(period).catch(() => null), loadHeroes(period).catch(() => null),
      ]);
      if (!live) return;
      setUsage(modes ? heroModeUsage(modes, code) : []);
      setTeamList(modes && teams ? heroTeams(teams, modes, code, 6) : []);
      setMates(teams ? teammates(teams, code, 8) : []);
      setNames(new Map((heroes ?? []).map((x) => [x.code, x.name])));
    })();
    return () => { live = false; };
  }, [period, code]);

  const h = state.status === 'ok' ? state.hero : undefined;
  const heroName = h?.hero.name;

  // the World Arena block is a bonus too: no data, or a failure, just hides it
  useEffect(() => {
    setArena(null);
    if (!heroName) return;
    let live = true;
    (async () => {
      const first = (await loadArenaIndex())?.seasons[0];
      const season = first ? await loadArenaSeason(first.id) : null;
      const rows = season ? heroArena(season, heroName) : [];
      if (live && season && rows.length > 0) setArena({ season, rows }); // the block only exists when the hero is in a published table
    })().catch(() => {});
    return () => { live = false; };
  }, [heroName]);

  return (
    <div>
      <div className="hero-bar">
        <a className="back" href="#/heroes">← All heroes</a>
      </div>
      {state.status === 'loading' && <p className="note">Loading…</p>}
      {state.status === 'error' && <p className="note error">{state.message}</p>}
      {h && (
        <>
          <Loadout hero={h} skills={skills?.heroes[h.hero.code]} ee={skills?.exclusive?.[h.hero.code]} />
          {arena && (
            <section aria-label="World Arena (RTA)" className="source">
              <header>
                <h2>World Arena (RTA)</h2>
                <p className="period-chip">{arena.season.season}</p>
              </header>
              <div className="panels">
                <section aria-label="RTA stats" className="panel rta">
                                    <table className="targets" aria-label="RTA stats">
                    <thead><tr><th>League</th><th>Pick</th><th>Win rate</th><th>First pick</th><th>Pre-ban</th></tr></thead>
                    <tbody>
                      {arena.rows.map((r) => (
                        <tr key={r.tier}>
                          <th scope="row">{TIERS.find(([t]) => t === r.tier)![1]}</th>
                          <td>{r.pick ? `${r.pick.rate}% (#${r.pick.rank})` : '—'}</td>
                          <td>{r.pick?.win !== undefined ? `${r.pick.win}%` : '—'}</td>
                          <td>{r.firstPick ? `${r.firstPick.rate}% (#${r.firstPick.rank})` : '—'}</td>
                          <td>{r.preBan ? `${r.preBan.rate}% (#${r.preBan.rank})` : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="caption">
                    Rates are shares of matches in that league and above; "#" is the place in the published top 20.
                    Source: <a href={arena.season.url} target="_blank" rel="noopener noreferrer">official infographic</a>, published {arena.season.published}.
                    The game does not publish matchups or team compositions for RTA.
                  </p>
                </section>
              </div>
            </section>
          )}
          {(usage.length > 0 || teamList.length > 0 || mates.length > 0) && (
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
                {mates.length > 0 && (
                  <Panel title="Often played with">
                    <p className="caption">Heroes found most often in the best hunt, abyss and expedition teams that include {h.hero.name}.</p>
                    <ol className="ranking mates">
                      {mates.map((m) => (
                        <li key={m.code} className="rank-row">
                          <HeroIcon code={m.code} name={names.get(m.code) ?? m.code} decorative />
                          <a href={`#/hero/${m.code}`}>{names.get(m.code) ?? m.code}</a>
                          <span className="rank-bar" aria-hidden><span style={{ width: `${(m.teams / m.total) * 100}%` }} /></span>
                          <strong>{m.teams} of {m.total} teams</strong>
                        </li>
                      ))}
                    </ol>
                  </Panel>
                )}
                {teamList.length > 0 && (
                  <Panel title={`Best PvE teams with ${h.hero.name}`}>
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
          {((h.exclusive && h.exclusive.length > 0) || skills?.exclusive?.[h.hero.code]) && (
            <section aria-label="Exclusive equipment" className="source">
              <header>
                <h2>Exclusive equipment</h2>
                <p className="period-chip">most used upgrades</p>
              </header>
              <div className="panels">
                <ExclusivePanel hero={h} ee={skills?.exclusive?.[h.hero.code]} />
              </div>
            </section>
          )}
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
                <Bars items={top(h.artifacts, 10).map((a) => ({ label: a.name, value: a.share, title: a.effect, icons: [artifactIcon(a.code)], href: `#/artifact/${a.code}` }))} />
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
