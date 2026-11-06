import { useEffect, useState } from 'react';
import { HeroIcon, Icon } from '../components/Art';
import Loadout from '../components/Loadout';
import { useI18n, type Key } from '../i18n';
import PageNav from '../components/PageNav';
import Bars from '../components/Bars';
import { NotFoundError, heroModeUsage, loadArenaIndex, loadArenaSeason, loadHero, loadHeroes, loadIndex, loadModes, loadRta, loadRtaBuilds, loadRtaPairs, loadSkills, loadTeams, type ModeUsage } from '../lib/data';
import { heroRta, type RtaRow } from '../lib/rta';
import { artifactIcon, setIcon, skillIcon } from '../lib/images';
import { TIERS, heroArena, type HeroArenaRow } from '../lib/arena';
import { heroTeams, teammates, type HeroTeam, type Teammate } from '../lib/modes';
import { PERCENT_STATS, STATS, lowerBound, num, statTarget } from '../lib/statTargets';
import { TeamRow } from './ModesPage';
import { STAT_RANGES } from '../shared/stats';
import type { ArenaSeason, ExclusiveEquipment, HeroSnapshot, RtaBuilds, RtaHeroBuilds, RtaHeroPairs, RtaPairEntry, SkillsFile, StatKey } from '../shared/types';

const top = <T,>(xs: T[], n: number) => xs.slice(0, n);

type State = { status: 'loading' } | { status: 'error'; code: 'noData' | 'notFound' | 'failed'; detail?: string } | { status: 'ok'; hero: HeroSnapshot };

function Histogram({ stat, label, counts }: { stat: StatKey; label: string; counts: number[] }) {
  const { t } = useI18n();
  const max = Math.max(...counts, 1);
  const [lo, hi] = STAT_RANGES[stat];
  return (
    <div role="group" aria-label={label} className="histo">
      <strong>{label}</strong>
      <div className="histo-bars">
        {counts.map((c, i) => (
          <div key={i} role="meter" aria-label={t('hero.bucket', { label, n: i + 1 })} aria-valuenow={c} aria-valuemin={0} aria-valuemax={max}
            title={String(c)} className={c === max ? 'peak' : undefined} style={{ height: `${(c / max) * 100}%` }} />
        ))}
      </div>
      <div className="histo-axis"><span>{lo}</span><span>{hi}</span></div>
    </div>
  );
}

function TargetTable({ stats }: { stats: Record<StatKey, number[]> }) {
  const { t } = useI18n();
  return (
    <table className="targets" aria-label={t('hero.statTargets')}>
      <thead>
        <tr><th>{t('hero.thStat')}</th><th>{t('hero.typical')}</th><th>{t('hero.median')}</th><th>{t('hero.top25')}</th><th>{t('hero.top10')}</th></tr>
      </thead>
      <tbody>
        {STATS.map(([k]) => {
          const target = statTarget(k, stats[k]);
          const bound = (edge: number) => { const v = lowerBound(k, edge); return v === 'Any' ? t('stat.any') : v; };
          const u = PERCENT_STATS.has(k) ? '%' : '';
          return (
            <tr key={k}>
              <th scope="row">{t(`stat.${k}` as Key)}</th>
              {target ? (
                <>
                  <td>{num(target.typical[0])}–{num(target.typical[1])}{u}</td>
                  <td>{num(target.median[0])}–{num(target.median[1])}{u}</td>
                  <td>{bound(target.top25)}</td>
                  <td>{bound(target.top10)}</td>
                </>
              ) : <td colSpan={4}>{t('common.noData')}</td>}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/** The exclusive equipment: what it gives, and what each upgrade option does, with how many players pick it. */
function ExclusivePanel({ hero, ee }: { hero: HeroSnapshot; ee?: ExclusiveEquipment }) {
  const { t } = useI18n();
  const uses = hero.exclusive ?? [];
  if (uses.length === 0 && !ee) return null;
  if (!ee) {
    return (
      <Panel title={t('hero.upgradeOptionsChosen')}>
        <Bars items={uses.map((e) => ({
          label: t('loadout.skillOption', { skill: hero.skills?.[e.skill - 1] ?? t('loadout.skillN', { n: e.skill }), n: e.option }), value: e.share, icons: [skillIcon(hero.hero.code, e.skill)],
        }))} />
      </Panel>
    );
  }
  const options = ee.options
    .map((o, i) => ({ ...o, n: i + 1, use: uses.find((u) => u.option === i + 1) }))
    .sort((a, b) => (b.use?.share ?? -1) - (a.use?.share ?? -1) || a.n - b.n);
  return (
    <Panel title={ee.name || t('hero.upgradeOptions')}>
      {ee.stat && <p className="ee-stat"><span className="chip">{t('hero.eeRange', { name: ee.stat.name, min: ee.stat.min, max: ee.stat.max })}</span></p>}
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
              {o.use && <span className="ee-share">{i === 0 && <small>{t('hero.mostUsed')}</small>}<em>{o.use.share}%</em></span>}
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
  const { t, rich, locale, name } = useI18n();
  const [period, setPeriod] = useState('');
  const [state, setState] = useState<State>({ status: 'loading' });
  const [usage, setUsage] = useState<ModeUsage[]>([]);
  const [teamList, setTeamList] = useState<HeroTeam[]>([]);
  const [mates, setMates] = useState<Teammate[]>([]);
  const [arena, setArena] = useState<{ season: ArenaSeason; rows: HeroArenaRow[] } | null>(null);
  const [rtaSample, setRtaSample] = useState<{ season: string; battles: number; players: number; since?: string; until?: string; row: RtaRow } | null>(null);
  const [pairs, setPairs] = useState<{ hero: RtaHeroPairs; battles: number; min: number } | null>(null);
  const [rtaBuilds, setRtaBuilds] = useState<{ hero: RtaHeroBuilds; setNames: RtaBuilds['setNames']; artifactNames: RtaBuilds['artifactNames'] } | null>(null);
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [skills, setSkills] = useState<SkillsFile | null>(null);

  // skill texts come from a separate file; without it the page still shows the skill names
  useEffect(() => { loadSkills().then(setSkills).catch(() => {}); }, []);

  useEffect(() => {
    let live = true;
    loadIndex()
      .then((i) => {
        if (!live) return;
        if (!i || i.periods.length === 0) setState({ status: 'error', code: 'noData' });
        else setPeriod(i.periods[0]); // the latest week only: the site is about the current meta
      })
      .catch((e: unknown) => live && setState({ status: 'error', code: 'failed', detail: String(e) }));
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
        code: e instanceof NotFoundError ? 'notFound' : 'failed',
        detail: String(e),
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

  // the sample of the top players' battles covers every hero: no file, a failure or too few games just hides the block
  useEffect(() => {
    setRtaSample(null);
    if (!h) return;
    let live = true;
    Promise.resolve(loadRta())
      .then((r) => {
        const row = r ? heroRta(r, h.hero.code) : undefined;
        if (live && r && row) setRtaSample({ season: r.season, battles: r.battles, players: r.players, since: r.since, until: r.until, row });
      })
      .catch(() => {});
    return () => { live = false; };
  }, [h?.hero.code]);

  const shownNames = new Map([...names].map(([c, n]) => [c, name.hero(c, n)])); // heroes of the teams, in the language
  // partners and matchups come from the same accumulated battles: no file, or nothing clear for this hero, just hides the section
  useEffect(() => {
    setPairs(null);
    if (!h) return;
    let live = true;
    Promise.resolve(loadRtaPairs())
      .then((p) => { const hero = p?.heroes[h.hero.code]; if (live && p && hero && (hero.with.length > 0 || hero.over.length > 0 || hero.under.length > 0)) setPairs({ hero, battles: p.battles, min: p.minGames }); })
      .catch(() => {});
    return () => { live = false; };
  }, [h?.hero.code]);
  // what the hero wears in RTA comes from the accumulated battles: no file, or no list for this hero, just hides the panels
  useEffect(() => {
    setRtaBuilds(null);
    if (!h) return;
    let live = true;
    Promise.resolve(loadRtaBuilds())
      .then((b) => { const hero = b?.heroes[h.hero.code]; if (live && b && hero) setRtaBuilds({ hero, setNames: b.setNames, artifactNames: b.artifactNames }); })
      .catch(() => {});
    return () => { live = false; };
  }, [h?.hero.code]);

  const hasExclusive = !!h && !!((h.exclusive && h.exclusive.length > 0) || skills?.exclusive?.[h.hero.code]);
  const navItems = !h ? [] : ([
    { id: 'loadout', label: t('hero.navBuild') }, arena && { id: 'arena', label: t('home.arena') }, rtaSample && { id: 'rta-sample', label: t('hero.rtaSample') },
    pairs && { id: 'rta-pairs', label: t('hero.pairs') },
    (usage.length > 0 || teamList.length > 0 || mates.length > 0) && { id: 'other-modes', label: t('hero.otherModes') }, hasExclusive && { id: 'exclusive', label: t('loadout.exclusive') },
    { id: 'gear', label: t('hero.navGear') }, h.detail && { id: 'hunts', label: t('hero.navHunts') },
  ].filter(Boolean) as { id: string; label: string }[]);

  return (
    <div className="with-rail">
      <PageNav items={navItems} />
      <div className="content">
      <div className="hero-bar">
        <a className="back" href="#/heroes">{t('common.allHeroes')}</a>
      </div>
      {state.status === 'loading' && <p className="note">{t('common.loading')}</p>}
      {state.status === 'error' && (
        <p className="note error">
          {state.code === 'noData' ? rich('common.noDataYet', { cmd: <code>npm run collect</code> })
            : state.code === 'notFound' ? t('hero.noHeroData') : t('common.failed', { message: state.detail ?? '' })}
        </p>
      )}
      {h && (
        <>
          <div id="loadout"><Loadout hero={h} skills={skills?.heroes[h.hero.code]} ee={skills?.exclusive?.[h.hero.code]} /></div>
          {arena && (
            <section id="arena" aria-label={t('home.arena')} className="source">
              <header>
                <h2>{t('home.arena')}</h2>
                <p className="period-chip">{arena.season.season}</p>
              </header>
              <div className="panels">
                <section aria-label={t('hero.rtaStats')} className="panel rta">
                                    <table className="targets" aria-label={t('hero.rtaStats')}>
                    <thead><tr><th>{t('hero.league')}</th><th>{t('hero.pick')}</th><th>{t('hero.winRate')}</th><th>{t('hero.firstPick')}</th><th>{t('hero.preBan')}</th></tr></thead>
                    <tbody>
                      {arena.rows.map((r) => (
                        <tr key={r.tier}>
                          <th scope="row">{TIERS.find(([tier]) => tier === r.tier)![1]}</th>
                          <td>{r.pick ? `${r.pick.rate}% (#${r.pick.rank})` : '—'}</td>
                          <td>{r.pick?.win !== undefined ? `${r.pick.win}%` : '—'}</td>
                          <td>{r.firstPick ? `${r.firstPick.rate}% (#${r.firstPick.rank})` : '—'}</td>
                          <td>{r.preBan ? `${r.preBan.rate}% (#${r.preBan.rank})` : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="caption">
                    {rich('hero.arenaCaption', { link: <a href={arena.season.url} target="_blank" rel="noopener noreferrer">{t('home.officialInfographic')}</a>, date: arena.season.published })}
                  </p>
                </section>
              </div>
            </section>
          )}
          {rtaSample && (
            <section id="rta-sample" aria-label={t('hero.rtaSample')} className="source">
              <header>
                <h2>{t('hero.rtaSample')}</h2>
                <p className="period-chip">{rtaSample.season}</p>
                {rtaSample.since && rtaSample.until && <p className="period-chip">{t('modes.dates', { start: rtaSample.since, end: rtaSample.until })}</p>}
              </header>
              <div className="panels">
                <section aria-label={t('hero.rtaSampleRegion')} className="panel rta">
                  <table className="targets" aria-label={t('hero.rtaSample')}>
                    <thead><tr><th>{t('hero.pick')}</th><th>{t('hero.winRate')}</th><th>{t('hero.ban')}</th><th>{t('hero.preBan')}</th><th>{t('hero.firstPick')}</th></tr></thead>
                    <tbody>
                      <tr>
                        <td>{rtaSample.row.pick}%</td>
                        <td>{rtaSample.row.win === null ? '—' : `${rtaSample.row.win}%`}</td>
                        <td>{rtaSample.row.ban}%</td>
                        <td>{rtaSample.row.preban}%</td>
                        <td>{rtaSample.row.first}%</td>
                      </tr>
                    </tbody>
                  </table>
                  <p className="caption">
                    {rich('hero.rtaCaption', { battles: rtaSample.battles.toLocaleString(locale), players: rtaSample.players, games: rtaSample.row.played, link: <a href="#/arena">{t('hero.rtaAllHeroes')}</a> })}
                  </p>
                </section>
                {rtaBuilds && (
                  <>
                    <Panel title={t('hero.rtaSets')}>
                      <Bars items={rtaBuilds.hero.sets.combos.map((c) => ({
                        label: name.sets(c.sets, c.sets.map((code) => rtaBuilds.setNames[code] ?? code)).join(' + '),
                        value: Math.round((c.n / rtaBuilds.hero.sets.n) * 1000) / 10, icons: c.sets.map(setIcon),
                      }))} />
                      <p className="caption">{t('hero.rtaBuildsCaption', { n: rtaBuilds.hero.sets.n })}</p>
                    </Panel>
                    <Panel title={t('hero.rtaArtifacts')}>
                      <Bars items={rtaBuilds.hero.artifacts.top.map((a) => ({
                        label: name.artifact(a.code, rtaBuilds.artifactNames[a.code] ?? a.code),
                        value: Math.round((a.n / rtaBuilds.hero.artifacts.n) * 1000) / 10, icons: [artifactIcon(a.code)], href: `#/artifact/${a.code}`,
                      }))} />
                    </Panel>
                  </>
                )}
              </div>
            </section>
          )}
          {pairs && (
            <section id="rta-pairs" aria-label={t('hero.pairs')} className="source">
              <header>
                <h2>{t('hero.pairs')}</h2>
                {rtaSample && <p className="period-chip">{rtaSample.season}</p>}
              </header>
              <div className="panels">
                {([['hero.pairsWith', pairs.hero.with], ['hero.pairsOver', pairs.hero.over], ['hero.pairsUnder', pairs.hero.under]] as const).map(([title, list]) => list.length > 0 && (
                  <Panel key={title} title={t(title)}>
                    <ol className="ranking mates pairs">
                      {list.map((e: RtaPairEntry) => (
                        <li key={e.code} className="rank-row">
                          <HeroIcon code={e.code} name={shownNames.get(e.code) ?? e.code} decorative />
                          <a href={`#/hero/${e.code}`}>{shownNames.get(e.code) ?? e.code}</a>
                          <span className="rank-bar" aria-hidden><span style={{ width: `${Math.min(100, (Math.abs(e.edge) / 15) * 100)}%` }} /></span>
                          <strong className={e.edge < 0 ? 'neg' : undefined} title={t('hero.pairsEdge')}>{e.edge > 0 ? '+' : ''}{e.edge}<small>{t('hero.pairsGames', { win: e.win, n: e.n })}</small></strong>
                        </li>
                      ))}
                    </ol>
                  </Panel>
                ))}
              </div>
              <p className="caption">{t('hero.pairsCaption', { battles: pairs.battles.toLocaleString(locale), min: pairs.min })}</p>
            </section>
          )}
          {(usage.length > 0 || teamList.length > 0 || mates.length > 0) && (
            <section id="other-modes" aria-label={t('hero.otherModes')} className="source">
              <header>
                <h2>{t('hero.otherModes')}</h2>
                <p className="period-chip">{t('hero.rateNote')}</p>
              </header>
              <div className="panels">
                {usage.length > 0 && (
                  <Panel title={t('hero.whereUsed')}>
                    <Bars items={top(usage, 8).map((u) => ({ label: `#${u.rank} ${u.title}`, value: u.share, href: `#/modes/${u.id}` }))} />
                  </Panel>
                )}
                {mates.length > 0 && (
                  <Panel title={t('hero.playedWith')}>
                    <p className="caption">{t('hero.playedWithCaption', { hero: name.hero(h.hero.code, h.hero.name) })}</p>
                    <ol className="ranking mates">
                      {mates.map((m) => (
                        <li key={m.code} className="rank-row">
                          <HeroIcon code={m.code} name={shownNames.get(m.code) ?? m.code} decorative />
                          <a href={`#/hero/${m.code}`}>{shownNames.get(m.code) ?? m.code}</a>
                          <span className="rank-bar" aria-hidden><span style={{ width: `${(m.teams / m.total) * 100}%` }} /></span>
                          <strong>{t('hero.teamsOf', { n: m.teams, total: m.total })}</strong>
                        </li>
                      ))}
                    </ol>
                  </Panel>
                )}
                {teamList.length > 0 && (
                  <Panel title={t('hero.bestTeams', { hero: name.hero(h.hero.code, h.hero.name) })}>
                    <ol className="teams">
                      {teamList.map((tl) => (
                        <TeamRow key={`${tl.listId}-${tl.team.heroes.join()}`} team={tl.team} names={shownNames}
                          caption={<a href={`#/modes/${tl.listId}`}>{tl.title}</a>} />
                      ))}
                    </ol>
                  </Panel>
                )}
              </div>
            </section>
          )}
          {((h.exclusive && h.exclusive.length > 0) || skills?.exclusive?.[h.hero.code]) && (
            <section id="exclusive" aria-label={t('loadout.exclusive')} className="source">
              <header>
                <h2>{t('loadout.exclusive')}</h2>
                <p className="period-chip">{t('hero.mostUsedUpgrades')}</p>
              </header>
              <div className="panels">
                <ExclusivePanel hero={h} ee={skills?.exclusive?.[h.hero.code]} />
              </div>
            </section>
          )}
          <section id="gear" aria-label={t('hero.gearSource')} className="source">
            <header>
              <h2>{t('hero.gearSource')}</h2>
              <p className="period-chip">{t('modes.dates', { start: h.period.start, end: h.period.end })}</p>
            </header>
            <div className="panels">
              <Panel title={t('loadout.sets')}>
                <Bars items={top(h.sets, 10).map((s) => ({ label: name.set(s.code, s.name), value: s.share, icons: [setIcon(s.code)] }))} />
              </Panel>
              <Panel title={t('loadout.artifacts')}>
                <Bars items={top(h.artifacts, 10).map((a) => ({ label: name.artifact(a.code, a.name), value: a.share, title: a.effect, icons: [artifactIcon(a.code)], href: `#/artifact/${a.code}` }))} />
              </Panel>
            </div>
          </section>
          {h.detail && (
            <section id="hunts" aria-label={t('hero.huntsSource')} className="source">
              <header>
                <h2>{t('hero.huntsSource')}</h2>
                <p className="period-chip">{t('modes.dates', { start: h.detail.period.start, end: h.detail.period.end })}</p>
              </header>
              <div className="panels">
                <Panel title={t('hero.combos')}>
                  <Bars items={top(h.detail.combos, 3).map((c) => ({ label: name.sets(c.codes, c.sets).join(' + '), value: c.share, icons: (c.codes ?? []).map(setIcon) /* periods collected before codes existed have none */ }))} />
                </Panel>
                <Panel title={t('hero.artifactsHunts')}>
                  <Bars items={top(h.detail.artifacts, 10).map((a) => ({ label: name.artifact(a.code, a.name), value: a.share, icons: [artifactIcon(a.code)], href: `#/artifact/${a.code}` }))} />
                </Panel>
                <Panel title={t('hero.stats')} wide>
                  <TargetTable stats={h.detail.stats} />
                  <p className="caption">{t('hero.statsCaption')}</p>
                  <div className="histos">
                    {STATS.map(([k]) => <Histogram key={k} stat={k} label={t(`stat.${k}` as Key)} counts={h.detail!.stats[k]} />)}
                  </div>
                </Panel>
              </div>
            </section>
          )}
        </>
      )}
      </div>
    </div>
  );
}
