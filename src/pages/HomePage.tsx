import { useEffect, useState } from 'react';
import { HeroIcon, Icon } from '../components/Art';
import { artifactIcon } from '../lib/images';
import { elementLabel, jobLabel } from './HeroList';
import { loadArenaIndex, loadArenaSeason, loadHeroes, loadFeed, loadIndex, loadModes, loadTrends, normalize } from '../lib/data';
import { guides } from '../lib/guides';
import { arenaLeaders, preBanLeaders, pveLeaders, type Leader } from '../lib/home';
import type { ArenaSeason, Feed, FeedBoard, Modes, Trends } from '../shared/types';

type Data = {
  latest: string;
  modes: Modes | null;
  prevModes: Modes | null;
  trends: Trends | null;
  feed: Feed | null;
  arena: { season: ArenaSeason; prev?: ArenaSeason } | null;
  codes: Map<string, string>; // normalized hero name -> code
};
type State = { status: 'loading' } | { status: 'none' } | { status: 'error'; message: string } | { status: 'ok'; data: Data };

const soft = <T,>(p: Promise<T>) => p.catch(() => null); // every block but the index is a bonus: a failure just hides it
const BOARDS: [FeedBoard, string][] = [['patch', 'Patches'], ['notice', 'Notices'], ['dev', 'Developer notes'], ['event', 'Events']];
const QUIET = 3; // points: below this, nothing moved much

function Delta({ value }: { value?: number }) {
  if (value === undefined || Math.abs(value) < 0.05) return <span />;
  return <small className={value > 0 ? 'delta up' : 'delta down'} title="Change in points since the previous week">{value > 0 ? '+' : ''}{value}</small>;
}

function PveList({ title, leaders }: { title: string; leaders: Leader[] }) {
  if (leaders.length === 0) return null;
  return (
    <section aria-label={title} className="panel">
      <h3>{title}</h3>
      <ol className="leaders">
        {leaders.map((l) => (
          <li key={l.code}>
            <HeroIcon code={l.code} name={l.name} decorative />
            <a href={`#/hero/${l.code}`}>{l.name}</a>
            <strong>{l.share}%</strong>
            <Delta value={l.delta} />
          </li>
        ))}
      </ol>
    </section>
  );
}

export default function HomePage() {
  const [state, setState] = useState<State>({ status: 'loading' });

  useEffect(() => {
    let live = true;
    (async () => {
      const index = await loadIndex();
      if (!index || index.periods.length === 0) return live && setState({ status: 'none' });
      const [latest, before] = index.periods;
      const [modes, prevModes, heroes, trends, feed, arena] = await Promise.all([
        soft(loadModes(latest)), before ? soft(loadModes(before)) : Promise.resolve(null), soft(loadHeroes(latest)), soft(loadTrends()), soft(loadFeed()),
        soft((async () => {
          const seasons = (await loadArenaIndex())?.seasons ?? [];
          if (seasons.length === 0) return null;
          const [season, prev] = await Promise.all([loadArenaSeason(seasons[0].id), seasons[1] ? soft(loadArenaSeason(seasons[1].id)) : Promise.resolve(null)]);
          return { season, ...(prev ? { prev } : {}) };
        })()),
      ]);
      if (live) {
        setState({ status: 'ok', data: { latest, modes, prevModes, trends, feed, arena, codes: new Map((heroes ?? []).map((h) => [normalize(h.name), h.code])) } });
      }
    })().catch((e: unknown) => live && setState({ status: 'error', message: String(e) }));
    return () => { live = false; };
  }, []);

  if (state.status === 'loading') return <p className="note">Loading…</p>;
  if (state.status === 'error') return <p className="note error">Failed to load: {state.message}</p>;
  if (state.status === 'none') return <p className="note">No data yet. Run <code>npm run collect</code></p>;

  const { latest, modes, prevModes, trends, feed, arena, codes } = state.data;
  // a previous week with the very same mode data would make every change 0: only compare weeks that differ
  const prev = modes && prevModes && prevModes.key !== modes.key ? prevModes : undefined;
  const quiet = !trends || trends.builds.every((b) => Math.abs(b.after - b.before) < QUIET);
  const heroCode = (name: string) => codes.get(normalize(name));

  return (
    <div>
      <h1 className="page-title">Meta of the week</h1>
      <p className="lede">What players use right now, from the game's own rankings. Gear ranking week of {latest}.</p>

      {feed && (
        <section aria-label="What's new" className="source">
          <header><h2>What's new</h2><p className="period-chip">updated {feed.updated}</p></header>
          <div className="panels">
            {feed.releases.length > 0 && (
              <section aria-label="New in the game" className="panel wide-2">
                <h3>New in the game</h3>
                <div className="panels">
                  {([['hero', 'New heroes'], ['artifact', 'New artifacts']] as const).map(([kind, title]) => {
                    const items = feed.releases.filter((r) => r.kind === kind).slice(0, 4);
                    return (
                      <section key={kind} aria-label={title}>
                        <h4>{title}</h4>
                        {items.length === 0 ? <p className="note">Nothing new yet.</p> : (
                          <ul className="news">
                            {items.map((r) => (
                              <li key={r.code ?? r.name} className="release">
                                {r.code && (kind === 'hero' ? <HeroIcon code={r.code} name={r.name} decorative /> : <Icon src={artifactIcon(r.code)} className="hicon art" />)}
                                <span>
                                  {r.code
                                    ? <a href={kind === 'hero' ? `#/hero/${r.code}` : `#/artifact/${r.code}`}>{r.name}</a>
                                    : <a href={r.announced?.url} target="_blank" rel="noopener noreferrer">{r.name}</a>}
                                  <small className="meta">
                                    {r.grade ? `${r.grade}★ ` : ''}
                                    {r.element && <><span className="el" data-el={r.element} aria-hidden /> {elementLabel(r.element)}{r.job ? ', ' : ''}</>}
                                    {r.job && (kind === 'hero' ? jobLabel(r.job) : `${jobLabel(r.job)} exclusive`)}
                                  </small>
                                </span>
                                <small className="when" title={r.announced ? 'Date of the official update post that announced it' : 'First week of data that lists it'}>
                                  {r.announced ? `announced ${r.announced.date}` : `week of ${r.since}`}
                                </small>
                              </li>
                            ))}
                          </ul>
                        )}
                      </section>
                    );
                  })}
                </div>
              </section>
            )}
            {BOARDS.map(([board, title]) => {
              const posts = feed.posts.filter((p) => p.board === board).slice(0, 4);
              return posts.length === 0 ? null : (
                <section key={board} aria-label={title} className="panel">
                  <h3>{title}</h3>
                  <ul className="news">
                    {posts.map((p, i) => (
                      <li key={p.id}>
                        <a href={p.url} target="_blank" rel="noopener noreferrer">{i === 0 && p.image && <Icon src={p.image} className="banner" />}{p.title}</a>
                        <small className="when">{p.date}</small>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
          <p className="caption">Official posts from the game's community boards, and heroes or artifacts that appeared in the game's data.</p>
        </section>
      )}

      {modes && (
        <section aria-label="Most used in PvE" className="source">
          <header><h2>Most used in PvE</h2></header>
          <div className="panels">
            <PveList title="Hunts" leaders={pveLeaders(modes, 'hunts', 5, prev)} />
            <PveList title="Abyss" leaders={pveLeaders(modes, 'abyss', 5, prev)} />
            <PveList title="Expeditions" leaders={pveLeaders(modes, 'expedition', 5, prev)} />
          </div>
          <p className="caption">
            Average share of each hero over the rankings of the mode (hunt bosses and difficulties, abyss floors, expedition bosses and levels).
            {!prev && ' The change since last week appears once another week of mode data is collected.'}
          </p>
        </section>
      )}

      {arena && (
        <section aria-label="World Arena (RTA)" className="source">
          <header>
            <h2>World Arena (RTA)</h2>
            <p className="period-chip">{arena.season.season}</p>
          </header>
          <div className="panels">
            <section aria-label="Most picked" className="panel">
              <h3>Most picked, Champion and above</h3>
              <ol className="leaders">
                {arenaLeaders(arena.season, arena.prev, 'champion', 5).map((r) => {
                  const code = heroCode(r.hero);
                  return (
                    <li key={r.hero}>
                      {code ? <HeroIcon code={code} name={r.hero} decorative /> : <span />}
                      {code ? <a href={`#/hero/${code}`}>{r.hero}</a> : <span>{r.hero}</span>}
                      <strong>{r.rate}%</strong>
                      <span className="sub">{r.win}% win{r.isNew ? <small className="delta new"> new</small> : <Delta value={r.delta} />}</span>
                    </li>
                  );
                })}
              </ol>
            </section>
            <section aria-label="Most pre-banned" className="panel">
              <h3>Most pre-banned, Legend and above</h3>
              <ol className="leaders">
                {preBanLeaders(arena.season, 'legend', 5).map((r) => {
                  const code = heroCode(r.hero);
                  return (
                    <li key={r.hero}>
                      {code ? <HeroIcon code={code} name={r.hero} decorative /> : <span />}
                      {code ? <a href={`#/hero/${code}`}>{r.hero}</a> : <span>{r.hero}</span>}
                      <strong>{r.rate}%</strong>
                      <span />
                    </li>
                  );
                })}
              </ol>
            </section>
          </div>
          <p className="caption">
            Season infographic, top 20 only. Pick and pre-ban rates are shares of matches; the change is in points against the previous season.{' '}
            Source: <a href={arena.season.url} target="_blank" rel="noopener noreferrer">official infographic</a>.
          </p>
        </section>
      )}

      {trends && (
        <section aria-label="Build shifts" className="source">
          <header>
            <h2>Build shifts</h2>
            <p className="period-chip">{trends.from} to {trends.to}</p>
          </header>
          <div className="panels">
            <section aria-label="Shifts" className="panel wide-2">
              {quiet && <p className="note">A quiet week: no set or artifact moved by {QUIET} points or more.</p>}
              {trends.builds.length > 0 && (
                <ul className="shifts">
                  {trends.builds.slice(0, 10).map((b) => (
                    <li key={`${b.hero}-${b.kind}-${b.code}`}>
                      <HeroIcon code={b.hero} name={b.name} decorative />
                      <a href={`#/hero/${b.hero}`}>{b.name}</a>
                      <span>{b.kind === 'artifact' ? <a href={`#/artifact/${b.code}`}>{b.item}</a> : b.item}</span>
                      <strong className={b.after >= b.before ? 'delta up' : 'delta down'}>{b.before}% → {b.after}%</strong>
                    </li>
                  ))}
                </ul>
              )}
              <p className="caption">Share of the players of each hero wearing the set or artifact, gear ranking, latest week against the one before. Items under 5% in both weeks are left out.</p>
            </section>
          </div>
        </section>
      )}

      <section aria-label="Guides" className="source">
        <header><h2>Guides</h2></header>
        <ul className="guide-list">
          {guides.slice(0, 2).map((g) => (
            <li key={g.slug} className="panel">
              <a href={`#/guides/${g.slug}`}>{g.title}</a>
              <p>{g.summary}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
