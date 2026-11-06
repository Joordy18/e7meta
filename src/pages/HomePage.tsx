import { useEffect, useState } from 'react';
import { ElementIcon, HeroIcon, Icon, JobIcon } from '../components/Art';
import PageNav from '../components/PageNav';
import { useI18n, type Key } from '../i18n';
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
const BOARDS: [FeedBoard, Key][] = [['patch', 'board.patch'], ['notice', 'board.notice'], ['dev', 'board.dev'], ['event', 'board.event']];
const QUIET = 3; // points: below this, nothing moved much

function Delta({ value }: { value?: number }) {
  const { t } = useI18n();
  if (value === undefined || Math.abs(value) < 0.05) return <span />;
  return <small className={value > 0 ? 'delta up' : 'delta down'} title={t('home.deltaTitle')}>{value > 0 ? '+' : ''}{value}</small>;
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
  const { t } = useI18n();
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
                      {d.tags.before.map((tag) => <span key={`b-${tag}`} className="tag">{t('home.was', { tag })}</span>)}
                      {d.tags.after.map((tag) => <span key={`a-${tag}`} className={tagClass(tag)}>{tag}</span>)}
                    </>)}
              </p>
            )}
            {same ? (
              <p className="after">{d.after}<span className="unchanged"> {t('home.unchanged')}</span></p>
            ) : (
              <div className="cols">
                <p className="before"><small>{t('home.before')}</small>{parts.filter((x) => x.kind !== 'add').map((x, k) => (x.kind === 'del' ? <mark key={k} className="del">{x.text}</mark> : <span key={k}> {x.text} </span>))}</p>
                <p className="after"><small>{t('home.after')}</small>{parts.filter((x) => x.kind !== 'del').map((x, k) => (x.kind === 'add' ? <mark key={k} className="add">{x.text}</mark> : <span key={k}> {x.text} </span>))}</p>
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
  const { t, rich } = useI18n();
  const live = balance.date <= new Date().toISOString().slice(0, 10); // the patch day has come
  return (
    <section id="balance-changes" aria-label={t('home.balance')} className="source">
      <header>
        <h2>{t('home.balance')}</h2>
        <p className="period-chip">{balance.date}</p>
        <p className="period-chip">{live ? t('home.live') : t('home.upcoming')}</p>
      </header>
      <div className="panels">
        <section aria-label={t('home.balanceList')} className="panel wide-2">
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
                      <summary>{t('home.exactChanges')}</summary>
                      <SkillChanges details={c.details} />
                    </details>
                  )}
                </div>
              </li>
            ))}
          </ul>
          <p className="caption">
            {rich('home.fullPreview', { title: balance.title, link: <a href={balance.url} target="_blank" rel="noopener noreferrer">{t('home.readPreview')}</a> })}
          </p>
        </section>
      </div>
    </section>
  );
}

export default function HomePage() {
  const { t, rich } = useI18n();
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

  if (state.status === 'loading') return <p className="note">{t('common.loading')}</p>;
  if (state.status === 'error') return <p className="note error">{t('common.failed', { message: state.message })}</p>;
  if (state.status === 'none') return <p className="note">{rich('common.noDataYet', { cmd: <code>npm run collect</code> })}</p>;

  const { latest, modes, prevModes, trends, feed, arena, codes } = state.data;
  // a previous week with the very same mode data would make every change 0: only compare weeks that differ
  const prev = modes && prevModes && prevModes.key !== modes.key ? prevModes : undefined;
  const quiet = !trends || trends.builds.every((b) => Math.abs(b.after - b.before) < QUIET);
  const heroCode = (name: string) => codes.get(normalize(name));
  const sections = ([
    feed && ['whats-new', t('home.whatsNew')], feed?.balance && ['balance-changes', t('home.balance')], modes && ['pve', t('home.pve')],
    arena && ['arena', t('home.arena')], trends && ['build-shifts', t('home.shifts')], guides.length > 0 && ['guides', t('nav.guides')],
  ] as (readonly [string, string] | null | undefined | false)[]).filter((x): x is readonly [string, string] => !!x);

  return (
    <div className="with-rail">
      <PageNav items={sections.map(([id, label]) => ({ id, label }))} />
      <div className="content">
      <h1 className="page-title">{t('home.title')}</h1>
      <p className="lede">{t('home.lede', { date: latest })}</p>


      {feed && (
        <section id="whats-new" aria-label={t('home.whatsNew')} className="source">
          <header><h2>{t('home.whatsNew')}</h2><p className="period-chip">{t('home.updated', { date: feed.updated })}</p></header>
          <div className="panels">
            {feed.releases.length > 0 && (
              <section aria-label={t('home.newInGame')} className="panel wide-2">
                <h3>{t('home.newInGame')}</h3>
                <div className="panels">
                  {([['hero', 'home.newHeroes'], ['artifact', 'home.newArtifacts']] as const).map(([kind, titleKey]) => {
                    const title = t(titleKey);
                    const items = feed.releases.filter((r) => r.kind === kind).slice(0, 4);
                    return (
                      <section key={kind} aria-label={title}>
                        <h4>{title}</h4>
                        {items.length === 0 ? <p className="note">{t('home.nothingNew')}</p> : (
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
                                <small className="when" title={r.announced ? t('home.announcedTitle') : t('home.sinceTitle')}>
                                  {r.announced ? t('home.announced', { date: r.announced.date }) : t('home.weekOf', { date: r.since ?? '' })}
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
            {BOARDS.map(([board, titleKey]) => {
              const title = t(titleKey);
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
          <p className="caption">{t('home.newsCaption')}</p>
        </section>
      )}

      {feed?.balance && <BalanceSection balance={feed.balance} />}

      {modes && (
        <section id="pve" aria-label={t('home.pve')} className="source">
          <header><h2>{t('home.pve')}</h2><a className="see-all" href="#/modes">{t('home.allModes')}</a></header>
          <div className="panels">
            <PveList title={t('modes.hunts')} leaders={pveLeaders(modes, 'hunts', 5, prev)} />
            <PveList title={t('modes.abyss')} leaders={pveLeaders(modes, 'abyss', 5, prev)} />
            <PveList title={t('modes.expeditions')} leaders={pveLeaders(modes, 'expedition', 5, prev)} />
          </div>
          <p className="caption">
            {t('home.pveCaption')}
            {!prev && ` ${t('home.pveNoDelta')}`}
          </p>
        </section>
      )}

      {arena && (
        <section id="arena" aria-label={t('home.arena')} className="source">
          <header>
            <h2>{t('home.arena')}</h2>
            <p className="period-chip">{arena.season.season}</p>
            <a className="see-all" href="#/arena">{t('home.fullRta')}</a>
          </header>
          <div className="panels">
            <section aria-label={t('home.mostPicked')} className="panel">
              <h3>{t('home.mostPickedTitle')}</h3>
              <ol className="leaders">
                {arenaLeaders(arena.season, arena.prev, 'champion', 5).map((r) => {
                  const code = heroCode(r.hero);
                  return (
                    <li key={r.hero}>
                      {code ? <HeroIcon code={code} name={r.hero} decorative /> : <span />}
                      {code ? <a href={`#/hero/${code}`}>{r.hero}</a> : <span>{r.hero}</span>}
                      <strong>{r.rate}%</strong>
                      <span className="sub">{t('home.win', { n: r.win })}{r.isNew ? <small className="delta new"> {t('home.new')}</small> : <Delta value={r.delta} />}</span>
                    </li>
                  );
                })}
              </ol>
            </section>
            <section aria-label={t('home.mostPreBanned')} className="panel">
              <h3>{t('home.mostPreBannedTitle')}</h3>
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
            {rich('home.arenaCaption', { link: <a href={arena.season.url} target="_blank" rel="noopener noreferrer">{t('home.officialInfographic')}</a> })}
          </p>
        </section>
      )}

      {trends && (
        <section id="build-shifts" aria-label={t('home.shifts')} className="source">
          <header>
            <h2>{t('home.shifts')}</h2>
            <p className="period-chip">{t('home.shiftsRange', { from: trends.from, to: trends.to })}</p>
          </header>
          <div className="panels">
            <section aria-label={t('home.shiftsList')} className="panel wide-2">
              {quiet && <p className="note">{t('home.quiet', { n: QUIET })}</p>}
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
              <p className="caption">{t('home.shiftsCaption')}</p>
            </section>
          </div>
        </section>
      )}

      {guides.length > 0 && (
      <section id="guides" aria-label={t('nav.guides')} className="source">
        <header><h2>{t('nav.guides')}</h2><a className="see-all" href="#/guides">{t('home.allGuides')}</a></header>
        <ul className="guide-list">
          {guides.slice(0, 2).map((g) => (
            <li key={g.slug} className="panel">
              <a href={`#/guides/${g.slug}`}>{g.title}</a>
              <p>{g.summary}</p>
            </li>
          ))}
        </ul>
      </section>
      )}
      </div>
    </div>
  );
}
