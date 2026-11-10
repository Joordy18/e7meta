import { useEffect, useState } from 'react';
import { HeroIcon } from '../components/Art';
import { useI18n } from '../i18n';
import { loadHeroes, loadIndex, loadRta, loadRtaTable, normalize } from '../lib/data';
import { MIN_PLAYED, rtaRows, type RtaRow } from '../lib/rta';
import { MAX_TEAM, suggest, summary, threats, type Suggestion, type Table } from '../lib/team';

type Load = { status: 'loading' } | { status: 'none' } | { status: 'error'; message: string } | { status: 'ok'; pool: RtaRow[]; table: Table; names: Map<string, string> };
type Side = 'me' | 'foe';

/** The heroes of `?me=a,b&foe=c` in the address (the page keeps them there, so the address shares a team); anything that is not a hero code is dropped. */
const fromAddress = (key: Side): string[] => {
  const raw = new URLSearchParams(location.hash.split('?')[1] ?? '').get(key) ?? '';
  return [...new Set(raw.split(',').filter((c) => /^[a-z0-9_]{1,32}$/i.test(c)))].slice(0, MAX_TEAM);
};

/**
 * Team builder for the RTA: pick up to five heroes (and, if you want, the opponent's) and see who fits best next to them, who beats them, and how the two
 * teams compare, from the partnerships and matchups of rta/table.json (see lib/team.ts).
 */
export default function TeamPage() {
  const { t, rich, name, locale } = useI18n();
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [me, setMe] = useState(() => fromAddress('me'));
  const [foe, setFoe] = useState(() => fromAddress('foe'));
  const [side, setSide] = useState<Side>('me');
  const [search, setSearch] = useState('');

  useEffect(() => {
    let live = true;
    (async () => {
      const [stats, table] = await Promise.all([loadRta(), loadRtaTable().catch(() => null)]);
      if (!stats || !table) return live && setLoad({ status: 'none' });
      const period = (await loadIndex())?.periods[0];
      const names = new Map((period ? await loadHeroes(period) : []).map((h) => [h.code, h.name]));
      const pool = rtaRows(stats).filter((r) => r.played >= MIN_PLAYED && names.has(r.code));
      if (live) setLoad({ status: 'ok', pool, table: table.heroes, names });
    })().catch((e: unknown) => live && setLoad({ status: 'error', message: String(e) }));
    return () => { live = false; };
  }, []);
  useEffect(() => { // the team stays in the address without a new history entry
    const q = [me.length > 0 && `me=${me.join(',')}`, foe.length > 0 && `foe=${foe.join(',')}`].filter(Boolean).join('&');
    history.replaceState(null, '', `#/tools/team${q ? `?${q}` : ''}`);
  }, [me, foe]);

  const head = (
    <>
      <h1 className="page-title">{t('tools.teamTitle')}</h1>
      <p className="lede">{t('team.lede')}</p>
    </>
  );
  if (load.status === 'loading') return <p className="note">{t('common.loading')}</p>;
  if (load.status === 'error') return <p className="note error">{t('common.failed', { message: load.message })}</p>;
  if (load.status === 'none') return <div>{head}<p className="note">{rich('draft.noData', { cmd: <code>npm run rta</code> })}</p></div>;
  const { pool, table, names } = load;

  const shown = (code: string) => name.hero(code, names.get(code) ?? code);
  const fmt = (n: number) => n.toLocaleString(locale, { signDisplay: 'exceptZero', maximumFractionDigits: 1 });
  const toggle = (code: string) => {
    if (me.includes(code)) setMe(me.filter((c) => c !== code));
    else if (foe.includes(code)) setFoe(foe.filter((c) => c !== code));
    else if (side === 'me' && me.length < MAX_TEAM) setMe([...me, code]);
    else if (side === 'foe' && foe.length < MAX_TEAM) setFoe([...foe, code]);
  };
  const q = normalize(search.trim());

  const slots = (label: string, codes: string[], which: Side) => (
    <section aria-label={label} className="panel draft-team" data-side={which === 'me' ? 'you' : 'bot'}>
      <h3>{label}</h3>
      <ol>
        {Array.from({ length: MAX_TEAM }, (_, i) => (
          <li key={i} className={codes[i] ? 'filled' : 'empty'}>
            {codes[i] && (
              <button type="button" className="slot-btn" aria-label={t('team.remove', { hero: shown(codes[i]) })} onClick={() => toggle(codes[i])}>
                <HeroIcon code={codes[i]} name={shown(codes[i])} decorative /><span>{shown(codes[i])}</span>
              </button>
            )}
          </li>
        ))}
      </ol>
    </section>
  );

  const chips = (s: Suggestion) => (
    <span className="chips">
      {s.withs.map((l) => {
        const tip = t('team.withTip', { edge: fmt(l.edge), hero: shown(l.code), games: l.games });
        return <span key={`w${l.code}`} className="chip" data-sign={l.edge > 0 ? '+' : '-'} role="img" aria-label={tip} title={tip}><HeroIcon code={l.code} name={shown(l.code)} decorative />{fmt(l.edge)}</span>;
      })}
      {s.vs.map((l) => {
        const tip = t('team.vsTip', { edge: fmt(l.edge), hero: shown(l.code), games: l.games });
        return <span key={`v${l.code}`} className="chip vs" data-sign={l.edge > 0 ? '+' : '-'} role="img" aria-label={tip} title={tip}><HeroIcon code={l.code} name={shown(l.code)} decorative />{fmt(l.edge)}</span>;
      })}
    </span>
  );
  const list = (rows: Suggestion[], title: string, note: string) => (
    <section className="panel team-list" aria-label={title}>
      <h3>{title}</h3>
      <p className="caption">{note}</p>
      <ol>
        {rows.map((s) => (
          <li key={s.code}>
            <button type="button" className="hero-cell" onClick={() => toggle(s.code)}><HeroIcon code={s.code} name={shown(s.code)} decorative />{shown(s.code)}</button>
            <strong>{fmt(s.score)}</strong>
            <small>{t('hero.winRate')}: {s.win === null ? '—' : `${s.win}%`}</small>
            {chips(s)}
          </li>
        ))}
      </ol>
    </section>
  );

  const sums = summary(table, me, foe);
  const partners = me.length < MAX_TEAM && me.length + foe.length > 0 ? suggest(pool, table, me, foe).slice(0, 10) : [];
  const watch = me.length > 0 ? threats(pool, table, me).slice(0, 6) : [];
  return (
    <div className="team">
      {head}
      <div className="draft-teams">{slots(t('team.mine'), me, 'me')}{slots(t('team.foes'), foe, 'foe')}</div>
      <div className="draft-choice" role="group" aria-label={t('team.addTo')}>
        <span>{t('team.addTo')}</span>
        <button type="button" className="tab" aria-pressed={side === 'me'} onClick={() => setSide('me')}>{t('team.mine')}</button>
        <button type="button" className="tab" aria-pressed={side === 'foe'} onClick={() => setSide('foe')}>{t('team.foes')}</button>
      </div>
      {(sums.synergy !== null || sums.matchup !== null) && (
        <ul className="notes">
          {sums.synergy !== null && <li>{t('team.synergy', { edge: fmt(sums.synergy) })}</li>}
          {sums.matchup !== null && <li>{t('team.matchup', { edge: fmt(sums.matchup) })}</li>}
        </ul>
      )}
      {me.length + foe.length === 0 && <p className="note">{t('team.pickFirst')}</p>}
      {me.length === MAX_TEAM && <p className="note">{t('team.full')}</p>}
      <div className="team-results">
        {partners.length > 0 && list(partners, t('team.partners'), t('team.partnersNote'))}
        {watch.length > 0 && list(watch, t('team.threats'), t('team.threatsNote'))}
      </div>
      <div className="toolbar">
        <input type="search" aria-label={t('heroList.search')} placeholder={t('heroList.search')} value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      <ul className="draft-grid" aria-label={t('draft.pool')}>
        {pool.filter((r) => !q || normalize(shown(r.code)).includes(q)).map((r) => (
          <li key={r.code}>
            <button type="button" className="draft-hero" data-state={me.includes(r.code) ? 'you' : foe.includes(r.code) ? 'bot' : 'free'} aria-pressed={me.includes(r.code) || foe.includes(r.code)} onClick={() => toggle(r.code)}>
              <HeroIcon code={r.code} name={shown(r.code)} decorative /><span>{shown(r.code)}</span>
            </button>
          </li>
        ))}
      </ul>
      <p className="caption">{t('team.note')} {t('team.share')}</p>
    </div>
  );
}
