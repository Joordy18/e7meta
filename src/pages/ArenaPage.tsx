import { useEffect, useState } from 'react';
import { HeroIcon } from '../components/Art';
import PageNav from '../components/PageNav';
import { TIERS } from '../lib/arena';
import { loadArenaIndex, loadArenaSeason, loadHeroes, loadIndex, loadRta, normalize } from '../lib/data';
import { rtaRows, type RtaRow } from '../lib/rta';
import type { ArenaIndex, ArenaSeason, ArenaTier, RtaStats } from '../shared/types';

const METRICS = [['pick', 'Pick'], ['firstPick', 'First pick'], ['preBan', 'Pre-ban']] as const;
type Metric = (typeof METRICS)[number][0];
const METRIC_COLUMN: Record<Metric, string> = { pick: 'Pick rate', firstPick: 'First pick rate', preBan: 'Pre-ban rate' };
const pct = (n: number) => `${n}%`;

const SAMPLE_SORTS = [['pick', 'By pick'], ['win', 'By win rate'], ['ban', 'By ban'], ['preban', 'By pre-ban']] as const;
type SampleSort = (typeof SAMPLE_SORTS)[number][0];
const SAMPLE_SHOWN = 30;

type Load = { status: 'loading' } | { status: 'none' } | { status: 'error'; message: string } | { status: 'ok'; index: ArenaIndex };

export default function ArenaPage() {
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [seasonId, setSeasonId] = useState('');
  const [season, setSeason] = useState<ArenaSeason | null>(null);
  const [tier, setTier] = useState<ArenaTier>('champion');
  const [metric, setMetric] = useState<Metric>('pick');
  const [codes, setCodes] = useState<Map<string, string>>(new Map()); // normalized hero name -> code
  const [names, setNames] = useState<Map<string, string>>(new Map()); // code -> hero name
  const [rta, setRta] = useState<RtaStats | null>(null);
  const [sampleSort, setSampleSort] = useState<SampleSort>('pick');
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    let live = true;
    loadArenaIndex()
      .then((index) => {
        if (!live) return;
        if (!index || index.seasons.length === 0) setLoad({ status: 'none' });
        else { setLoad({ status: 'ok', index }); setSeasonId(index.seasons[0].id); }
      })
      .catch((e: unknown) => live && setLoad({ status: 'error', message: String(e) }));
    // hero names are only used to link and illustrate rows: if they cannot be loaded the table still works
    (async () => {
      const period = (await loadIndex())?.periods[0];
      const heroes = period ? await loadHeroes(period) : [];
      if (live) { setCodes(new Map(heroes.map((h) => [normalize(h.name), h.code]))); setNames(new Map(heroes.map((h) => [h.code, h.name]))); }
    })().catch(() => {});
    // the sample of all heroes is a bonus: without it the page shows the infographic only
    Promise.resolve(loadRta()).then((r) => live && setRta(r)).catch(() => {});
    return () => { live = false; };
  }, []);

  useEffect(() => {
    if (!seasonId) return;
    let live = true;
    setSeason(null);
    loadArenaSeason(seasonId)
      .then((s) => live && setSeason(s))
      .catch((e: unknown) => live && setLoad({ status: 'error', message: String(e) }));
    return () => { live = false; };
  }, [seasonId]);

  if (load.status === 'loading') return <p className="note">Loading…</p>;
  if (load.status === 'error') return <p className="note error">Failed to load: {load.message}</p>;
  if (load.status === 'none') return <p className="note">No World Arena data yet. Run <code>npm run arena</code></p>;
  if (!season) return <p className="note">Loading…</p>;

  const draft = metric === 'preBan' ? null : season[metric][tier];
  const preBan = metric === 'preBan' ? season.preBan[tier] : null;
  const list = (draft ?? preBan ?? []) as { hero: string; rate: number; ban?: number; win?: number }[];
  const cutoff = (league: string) => season.cutoffs.find((c) => c.league === league)?.points;

  return (
    <div className="with-rail">
      <PageNav items={[{ id: 'draft-rates', label: 'Draft rates' }, { id: 'leagues', label: 'Top leagues' }, { id: 'meaning', label: 'What the numbers mean' }, ...(rta ? [{ id: 'top-players', label: 'All heroes, top players' }] : [])]} />
      <div className="content">
      <h1 className="page-title">World Arena: {season.season}</h1>
      <p className="lede">
        Draft statistics of the game's ranked real-time arena (RTA), from the season infographic the developers publish.
        Rates are shares of all counted matches in the chosen league and above.
      </p>
      <div className="toolbar">
        <select aria-label="Season" value={seasonId} onChange={(e) => setSeasonId(e.target.value)}>
          {load.index.seasons.map((s) => <option key={s.id} value={s.id}>{s.season}</option>)}
        </select>
        {TIERS.map(([t, label]) => (
          <button key={t} type="button" className="tab" aria-pressed={t === tier} onClick={() => setTier(t)}>{label}</button>
        ))}
        <span className="toolbar-gap" />
        {METRICS.map(([m, label]) => (
          <button key={m} type="button" className="tab" aria-pressed={m === metric} onClick={() => setMetric(m)}>{label}</button>
        ))}
      </div>
      <div className="panels">
        <section id="draft-rates" aria-label="Draft rates" className="panel wide-2">
          <table className="targets draft" aria-label="Draft rates">
            <thead>
              <tr>
                <th>#</th><th>Hero</th><th>{METRIC_COLUMN[metric]}</th>
                {metric !== 'preBan' && <><th>Ban</th><th>Win rate</th></>}
              </tr>
            </thead>
            <tbody>
              {list.map((r, i) => {
                const code = codes.get(normalize(r.hero));
                return (
                  <tr key={r.hero}>
                    <td>{i + 1}</td>
                    <td><span className="hero-cell">
                      {code && <HeroIcon code={code} name={r.hero} decorative />}
                      {code ? <a href={`#/hero/${code}`}>{r.hero}</a> : r.hero}
                    </span></td>
                    <td className="rate-cell"><span className="rate-bar" aria-hidden><span style={{ width: `${Math.min(100, r.rate)}%` }} /></span><span className="rate-val">{pct(r.rate)}</span></td>
                    {metric !== 'preBan' && (
                      <>
                        <td>{pct(r.ban!)}</td>
                        <td className={r.win! >= 50 ? 'win up' : 'win'}>{pct(r.win!)}</td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
        <section id="leagues" aria-label="Leagues" className="panel">
          <h3>Top leagues</h3>
          <table className="targets" aria-label="Leagues">
            <thead><tr><th /><th>Avg. win rate</th><th>Players</th><th>Cutoff</th></tr></thead>
            <tbody>
              {season.leagues.map((l) => (
                <tr key={l.league}>
                  <th scope="row">{l.league}</th>
                  <td>{pct(l.avgWinRate)}</td>
                  <td>{l.players}</td>
                  <td>{cutoff(l.league) ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="caption">
            Source: <a href={season.url} target="_blank" rel="noopener noreferrer">official infographic</a>, published {season.published}.
          </p>
        </section>
        <section id="meaning" aria-label="What the numbers mean" className="panel">
          <h3>What the numbers mean</h3>
          <ul className="notes">
            <li><strong>Pre-ban</strong>: share of matches where the hero was pre-banned.</li>
            <li><strong>First pick</strong>: the hero was the very first pick of the player who picks first, one hero per match.</li>
            <li><strong>Pick</strong>: share of matches where either player drafted the hero, first picks included.</li>
            <li><strong>Ban</strong>: how often the hero was banned after the picks. <strong>Win rate</strong>: wins when picked.</li>
          </ul>
          <p className="caption">Each table lists the 20 heroes the game ranks highest.</p>
        </section>
      </div>
      {rta && <SampleSection rta={rta} names={names} sort={sampleSort} setSort={setSampleSort} showAll={showAll} setShowAll={setShowAll} />}
      </div>
    </div>
  );
}

function SampleSection({ rta, names, sort, setSort, showAll, setShowAll }: {
  rta: RtaStats; names: Map<string, string>; sort: SampleSort; setSort: (s: SampleSort) => void; showAll: boolean; setShowAll: (b: boolean) => void;
}) {
  const key = (r: RtaRow) => (sort === 'win' ? r.win ?? -1 : r[sort]);
  const rows = rtaRows(rta).sort((a, b) => key(b) - key(a) || b.pick - a.pick);
  const shown = showAll ? rows : rows.slice(0, SAMPLE_SHOWN);
  return (
    <section id="top-players" aria-label="Top players sample" className="source">
      <header>
        <h2>All heroes, top players</h2>
        <p className="period-chip">{rta.season}</p>
      </header>
      <div className="toolbar">
        {SAMPLE_SORTS.map(([k, label]) => (
          <button key={k} type="button" className="tab" aria-pressed={k === sort} onClick={() => setSort(k)}>{label}</button>
        ))}
      </div>
      <div className="panels">
        <section aria-label="Top players table" className="panel wide-2">
          <table className="targets draft" aria-label="Top players, all heroes">
            <thead><tr><th>#</th><th>Hero</th><th>Pick</th><th>Win rate</th><th>Ban</th><th>Pre-ban</th><th>First pick</th></tr></thead>
            <tbody>
              {shown.map((r, i) => {
                const name = names.get(r.code) ?? r.code;
                return (
                  <tr key={r.code}>
                    <td>{i + 1}</td>
                    <td><span className="hero-cell">
                      <HeroIcon code={r.code} name={name} decorative />
                      <a href={`#/hero/${r.code}`}>{name}</a>
                    </span></td>
                    <td>{pct(r.pick)}</td>
                    <td className={r.win !== null && r.win >= 50 ? 'win up' : 'win'}>{r.win === null ? '—' : pct(r.win)}</td>
                    <td>{pct(r.ban)}</td>
                    <td>{pct(r.preban)}</td>
                    <td>{pct(r.first)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {rows.length > SAMPLE_SHOWN && (
            <button type="button" className="tab" onClick={() => setShowAll(!showAll)}>{showAll ? 'Show fewer' : `Show all ${rows.length} heroes`}</button>
          )}
          <p className="caption">
            Counted by this site from {rta.battles.toLocaleString('en-US')} recent ranked battles of the top {rta.players} players of the global leaderboard in {rta.season}, updated {rta.updated}.
            It is a sample of the best players, not of everyone, so it will differ from the infographic. Heroes with fewer than 20 games are left out.
            Pick, ban, pre-ban and first pick are shares of all battles; the win rate is over the games the hero was played.
          </p>
        </section>
      </div>
    </section>
  );
}
