import { useEffect, useState } from 'react';
import { ElementIcon, HeroIcon, Icon, JobIcon } from '../components/Art';
import PageNav from '../components/PageNav';
import { artifactIcon } from '../lib/images';
import { loadArenaIndex, loadArenaSeason, loadHeroes, loadFeed, loadIndex, loadModes, loadTrends, normalize } from '../lib/data';
import { diffWords } from '../lib/diff';
import { guides } from '../lib/guides';
import { arenaLeaders, preBanLeaders, pveLeaders, type Leader } from '../lib/home';
import type { ArenaSeason, Balance, Feed, FeedBoard, Modes, SkillChange, Trends } from '../shared/types';

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

const tagClass = (t: string) => (/increased/i.test(t) ? 'tag up' : /decreased/i.test(t) ? 'tag down' : 'tag');

/** What changes in each skill: the effect labels, then the text before and after with the changed words marked. */
function SkillChanges({ details }: { details: SkillChange[] }) {
  return (
    <div className="exact-list">
      {details.map((d) => {
        const same = d.before === d.after;
        const parts = diffWords(d.before, d.after);
        const pairs = d.tags && d.tags.before.length > 0 && d.tags.before.length === d.tags.after.length;
        return (
          <div key={d.skill} className="exact">
            <h4>{d.skill}</h4>
            {d.tags && (
              <p className="tags-row">
                {pairs
                  ? d.tags.before.map((b, k) => <span key={k} className="tag">{`${b} → ${d.tags!.after[k]}`}</span>)
                  : (<>
                      {d.tags.before.map((t) => <span key={`b-${t}`} className="tag">{`was: ${t}`}</span>)}
                      {d.tags.after.map((t) => <span key={`a-${t}`} className={tagClass(t)}>{t}</span>)}
                    </>)}
              </p>
            )}
            {same ? (
              <p className="after">{d.after}<span className="unchanged"> The description is unchanged: the values behind it change.</span></p>
            ) : (
              <div className="cols">
                <p className="before"><small>Before</small>{parts.filter((x) => x.kind !== 'add').map((x, k) => (x.kind === 'del' ? <mark key={k} className="del">{x.text}</mark> : <span key={k}> {x.text} </span>))}</p>
                <p className="after"><small>After</small>{parts.filter((x) => x.kind !== 'del').map((x, k) => (x.kind === 'add' ? <mark key={k} className="add">{x.text}</mark> : <span key={k}> {x.text} </span>))}</p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** The latest balance preview: who the developers change, which skills, and why, in their words. */
function BalanceSection({ balance }: { balance: Balance }) {
  const live = balance.date <= new Date().toISOString().slice(0, 10); // the patch day has come
  return (
    <section id="balance-changes" aria-label="Balance changes" className="source">
      <header>
        <h2>Balance changes</h2>
        <p className="period-chip">{balance.date}</p>
        <p className="period-chip">{live ? 'live' : 'upcoming'}</p>
      </header>
      <div className="panels">
        <section aria-label="Changes" className="panel wide-2">
          <ul className="changes">
            {balance.changes.map((c) => (
              <li key={`${c.kind}-${c.name}`}>
                {c.code && (c.kind === 'hero' ? <HeroIcon code={c.code} name={c.name} decorative /> : <Icon src={artifactIcon(c.code)} className="hicon art" />)}
                <div>
                  <p className="who">
                    {c.code ? <a href={c.kind === 'hero' ? `#/hero/${c.code}` : `#/artifact/${c.code}`}>{c.name}</a> : <span>{c.name}</span>}
                    <small className="meta">
                      {c.grade ? `${c.grade}★ ` : ''}
                      {c.element && <ElementIcon element={c.element} />}{' '}
                      {c.job && <JobIcon job={c.job} />}
                    </small>
                  </p>
                  {c.skills && c.skills.length > 0 && <p className="skills">{c.skills.join(', ')}</p>}
                  {c.summary && <p className="summary">{c.summary}</p>}
                  {c.details && c.details.length > 0 && (
                    <details className="exact-changes">
                      <summary>Exact changes</summary>
                      <SkillChanges details={c.details} />
                    </details>
                  )}
                </div>
              </li>
            ))}
          </ul>
          <p className="caption">
            In the developers' own words, from the balance preview ({balance.title}). Changes apply on the patch day; the values may still change.{' '}
            <a href={balance.url} target="_blank" rel="noopener noreferrer">Read the full preview</a>.
          </p>
        </section>
      </div>
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
  const sections = ([
    feed && ['whats-new', "What's new"], feed?.balance && ['balance-changes', 'Balance changes'], modes && ['pve', 'Most used in PvE'],
    arena && ['arena', 'World Arena (RTA)'], trends && ['build-shifts', 'Build shifts'], ['guides', 'Guides'],
  ] as (readonly [string, string] | null | undefined | false)[]).filter((x): x is readonly [string, string] => !!x);

  return (
    <div className="with-rail">
      <PageNav items={sections.map(([id, label]) => ({ id, label }))} />
      <div className="content">
      <h1 className="page-title">Meta of the week</h1>
      <p className="lede">What players use right now, from the game's own rankings. Gear ranking week of {latest}.</p>


      {feed && (
        <section id="whats-new" aria-label="What's new" className="source">
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
                                    {r.element && <ElementIcon element={r.element} />}{' '}
                                    {r.job && <JobIcon job={r.job} />}
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

      {feed?.balance && <BalanceSection balance={feed.balance} />}

      {modes && (
        <section id="pve" aria-label="Most used in PvE" className="source">
          <header><h2>Most used in PvE</h2><a className="see-all" href="#/modes">All modes</a></header>
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
        <section id="arena" aria-label="World Arena (RTA)" className="source">
          <header>
            <h2>World Arena (RTA)</h2>
            <p className="period-chip">{arena.season.season}</p>
            <a className="see-all" href="#/arena">Full RTA stats</a>
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
        <section id="build-shifts" aria-label="Build shifts" className="source">
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

      <section id="guides" aria-label="Guides" className="source">
        <header><h2>Guides</h2><a className="see-all" href="#/guides">All guides</a></header>
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
    </div>
  );
}
