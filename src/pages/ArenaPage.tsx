import { useEffect, useState } from 'react';
import { HeroIcon } from '../components/Art';
import PageNav from '../components/PageNav';
import { useI18n, type Key } from '../i18n';
import { TIERS } from '../lib/arena';
import { loadArenaIndex, loadArenaSeason, loadHeroes, loadIndex, loadRta, normalize } from '../lib/data';
import { rtaRows, type RtaRow } from '../lib/rta';
import type { ArenaIndex, ArenaSeason, ArenaTier, RtaStats } from '../shared/types';

const METRICS = [['pick', 'arena.metricPick'], ['firstPick', 'arena.metricFirstPick'], ['preBan', 'arena.metricPreBan']] as const;
type Metric = (typeof METRICS)[number][0];
const METRIC_COLUMN: Record<Metric, Key> = { pick: 'arena.colPick', firstPick: 'arena.colFirstPick', preBan: 'arena.colPreBan' };
const pct = (n: number) => `${n}%`;

const SAMPLE_SORTS = [['pick', 'arena.sortPick'], ['win', 'arena.sortWin'], ['ban', 'arena.sortBan'], ['preban', 'arena.sortPreban']] as const;
type SampleSort = (typeof SAMPLE_SORTS)[number][0];
const SAMPLE_SHOWN = 30;

type Load = { status: 'loading' } | { status: 'none' } | { status: 'error'; message: string } | { status: 'ok'; index: ArenaIndex };

export default function ArenaPage() {
  const { t, rich, name } = useI18n();
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

  if (load.status === 'loading') return <p className="note">{t('common.loading')}</p>;
  if (load.status === 'error') return <p className="note error">{t('common.failed', { message: load.message })}</p>;
  if (load.status === 'none') return <p className="note">{rich('arena.none', { cmd: <code>npm run arena</code> })}</p>;
  if (!season) return <p className="note">{t('common.loading')}</p>;

  const draft = metric === 'preBan' ? null : season[metric][tier];
  const preBan = metric === 'preBan' ? season.preBan[tier] : null;
  const list = (draft ?? preBan ?? []) as { hero: string; rate: number; ban?: number; win?: number }[];
  const cutoff = (league: string) => season.cutoffs.find((c) => c.league === league)?.points;

  return (
    <div className="with-rail">
      <PageNav items={[{ id: 'draft-rates', label: t('arena.draftRates') }, { id: 'leagues', label: t('arena.topLeagues') }, { id: 'meaning', label: t('arena.meaning') }, ...(rta ? [{ id: 'top-players', label: t('arena.sampleTitle') }] : [])]} />
      <div className="content">
      <h1 className="page-title">{t('arena.title', { season: season.season })}</h1>
      <p className="lede">{t('arena.lede')}</p>
      <div className="toolbar">
        <select aria-label={t('arena.season')} value={seasonId} onChange={(e) => setSeasonId(e.target.value)}>
          {load.index.seasons.map((s) => <option key={s.id} value={s.id}>{s.season}</option>)}
        </select>
        {TIERS.map(([tr, label]) => (
          <button key={tr} type="button" className="tab" aria-pressed={tr === tier} onClick={() => setTier(tr)}>{label}</button>
        ))}
        <span className="toolbar-gap" />
        {METRICS.map(([m, labelKey]) => (
          <button key={m} type="button" className="tab" aria-pressed={m === metric} onClick={() => setMetric(m)}>{t(labelKey)}</button>
        ))}
      </div>
      <div className="panels">
        <section id="draft-rates" aria-label={t('arena.draftRates')} className="panel wide-2">
          <table className="targets draft" aria-label={t('arena.draftRates')}>
            <thead>
              <tr>
                <th>#</th><th>{t('arena.colHero')}</th><th>{t(METRIC_COLUMN[metric])}</th>
                {metric !== 'preBan' && <><th>{t('arena.colBan')}</th><th>{t('arena.colWin')}</th></>}
              </tr>
            </thead>
            <tbody>
              {list.map((r, i) => {
                const code = codes.get(normalize(r.hero));
                return (
                  <tr key={r.hero}>
                    <td>{i + 1}</td>
                    <td><span className="hero-cell">
                      {code && <HeroIcon code={code} name={name.hero(code, r.hero)} decorative />}
                      {code ? <a href={`#/hero/${code}`}>{name.hero(code, r.hero)}</a> : r.hero}
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
        <section id="leagues" aria-label={t('arena.leagues')} className="panel">
          <h3>{t('arena.topLeagues')}</h3>
          <table className="targets" aria-label={t('arena.leagues')}>
            <thead><tr><th /><th>{t('arena.avgWin')}</th><th>{t('arena.players')}</th><th>{t('arena.cutoff')}</th></tr></thead>
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
            {rich('arena.source', { link: <a href={season.url} target="_blank" rel="noopener noreferrer">{t('home.officialInfographic')}</a>, date: season.published })}
          </p>
        </section>
        <section id="meaning" aria-label={t('arena.meaning')} className="panel">
          <h3>{t('arena.meaning')}</h3>
          <ul className="notes">
            <li><strong>{t('arena.metricPreBan')}</strong>: {t('arena.defPreBan')}</li>
            <li><strong>{t('arena.metricFirstPick')}</strong>: {t('arena.defFirstPick')}</li>
            <li><strong>{t('arena.metricPick')}</strong>: {t('arena.defPick')}</li>
            <li><strong>{t('arena.colBan')}</strong>: {t('arena.defBan')} <strong>{t('arena.colWin')}</strong>: {t('arena.defWin')}</li>
          </ul>
          <p className="caption">{t('arena.top20')}</p>
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
  const { t, locale, name: lookup } = useI18n();
  const key = (r: RtaRow) => (sort === 'win' ? r.win ?? -1 : r[sort]);
  const rows = rtaRows(rta).sort((a, b) => key(b) - key(a) || b.pick - a.pick);
  const shown = showAll ? rows : rows.slice(0, SAMPLE_SHOWN);
  return (
    <section id="top-players" aria-label={t('arena.sampleRegion')} className="source">
      <header>
        <h2>{t('arena.sampleTitle')}</h2>
        <p className="period-chip">{rta.season}</p>
      </header>
      <div className="toolbar">
        {SAMPLE_SORTS.map(([k, labelKey]) => (
          <button key={k} type="button" className="tab" aria-pressed={k === sort} onClick={() => setSort(k)}>{t(labelKey)}</button>
        ))}
      </div>
      <div className="panels">
        <section aria-label={t('arena.sampleTable')} className="panel wide-2">
          <table className="targets draft" aria-label={t('arena.sampleAria')}>
            <thead><tr><th>#</th><th>{t('arena.colHero')}</th><th>{t('hero.pick')}</th><th>{t('arena.colWin')}</th><th>{t('arena.colBan')}</th><th>{t('hero.preBan')}</th><th>{t('hero.firstPick')}</th></tr></thead>
            <tbody>
              {shown.map((r, i) => {
                const shown = lookup.hero(r.code, names.get(r.code) ?? r.code);
                return (
                  <tr key={r.code}>
                    <td>{i + 1}</td>
                    <td><span className="hero-cell">
                      <HeroIcon code={r.code} name={shown} decorative />
                      <a href={`#/hero/${r.code}`}>{shown}</a>
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
            <button type="button" className="tab" onClick={() => setShowAll(!showAll)}>{showAll ? t('arena.showFewer') : t('arena.showAll', { n: rows.length })}</button>
          )}
          <p className="caption">
            {t('arena.sampleCaption', { battles: rta.battles.toLocaleString(locale), players: rta.players, season: rta.season, date: rta.updated })}
          </p>
        </section>
      </div>
    </section>
  );
}
