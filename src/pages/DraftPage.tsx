import { useEffect, useMemo, useRef, useState } from 'react';
import { HeroIcon } from '../components/Art';
import { useI18n, type Key } from '../i18n';
import { PRE_BANS, botBan, botPick, botPreBans, mulberry32, pickSides, scoreDraft, type Rarity, type Side } from '../lib/draft';
import { loadHeroes, loadIndex, loadRta, normalize } from '../lib/data';
import { MIN_PLAYED, rtaRows, type RtaRow } from '../lib/rta';

const MIN_POOL = 20; // heroes with data needed for a draft to make sense
const STYLE: Record<Rarity, Key> = { meta: 'draft.styleMeta', mainstream: 'draft.styleMainstream', offmeta: 'draft.styleOffmeta', rare: 'draft.styleRare' };

type Phase = 'setup' | 'preban' | 'draft' | 'ban' | 'result';
type Pick = { code: string; side: Side };
type Game = { phase: Phase; youFirst: boolean; youPre: string[]; botPre: string[]; picks: Pick[]; selected: string[]; youBan?: string; botBan?: string };
const NEW_GAME: Game = { phase: 'setup', youFirst: true, youPre: [], botPre: [], picks: [], selected: [] };

type Data = { pool: RtaRow[]; names: Map<string, string> };
type Load = { status: 'loading' } | { status: 'none' } | { status: 'few' } | { status: 'error'; message: string } | ({ status: 'ok' } & Data);

/** Plays the bot's turns in a row until it is yours again (or the ten picks are done). */
function botTurns(pool: RtaRow[], g: Game, picks: Pick[], rng: () => number): Pick[] {
  const sides = pickSides(g.youFirst);
  const out = [...picks];
  const gone = new Set([...g.youPre, ...g.botPre, ...out.map((p) => p.code)]);
  while (out.length < 10 && sides[out.length] === 'bot') {
    const code = botPick(pool, gone, rng);
    out.push({ code, side: 'bot' });
    gone.add(code);
  }
  return out;
}

/** Practice the RTA draft against a bot that plays like the top players of the sample, and get a score (see lib/draft.ts). */
export default function DraftPage() {
  const { t, rich, name, locale } = useI18n();
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [game, setGame] = useState<Game>(NEW_GAME);
  const [search, setSearch] = useState('');
  const rng = useRef<() => number>(mulberry32(1));

  useEffect(() => {
    let live = true;
    (async () => {
      const stats = await loadRta();
      if (!stats) return live && setLoad({ status: 'none' });
      const period = (await loadIndex())?.periods[0];
      const heroes = period ? await loadHeroes(period) : [];
      const names = new Map(heroes.map((h) => [h.code, h.name]));
      const pool = rtaRows(stats).filter((r) => r.played >= MIN_PLAYED && names.has(r.code));
      if (live) setLoad(pool.length < MIN_POOL ? { status: 'few' } : { status: 'ok', pool, names });
    })().catch((e: unknown) => live && setLoad({ status: 'error', message: String(e) }));
    return () => { live = false; };
  }, []);

  const shown = (code: string) => (load.status === 'ok' ? name.hero(code, load.names.get(code) ?? code) : code);
  const unavailable = useMemo(() => new Set([...game.youPre, ...game.botPre, ...game.picks.map((p) => p.code)]), [game]);

  if (load.status === 'loading') return <p className="note">{t('common.loading')}</p>;
  if (load.status === 'error') return <p className="note error">{t('common.failed', { message: load.message })}</p>;
  const head = (
    <>
      <h1 className="page-title">{t('tools.draftTitle')}</h1>
      <p className="lede">{t('draft.lede')}</p>
    </>
  );
  if (load.status === 'none') return <div>{head}<p className="note">{rich('draft.noData', { cmd: <code>npm run rta</code> })}</p></div>;
  if (load.status === 'few') return <div>{head}<p className="note">{t('draft.tooFew')}</p></div>;
  const { pool } = load;
  const byCode = new Map(pool.map((r) => [r.code, r]));
  const mine = game.picks.filter((p) => p.side === 'you').map((p) => p.code);
  const theirs = game.picks.filter((p) => p.side === 'bot').map((p) => p.code);

  const start = (youFirst: boolean) => {
    rng.current = mulberry32(Math.floor(Math.random() * 2 ** 31));
    setSearch('');
    setGame({ ...NEW_GAME, phase: 'preban', youFirst });
  };
  const toggle = (code: string) => setGame((g) => {
    if (g.phase === 'preban') {
      const on = g.selected.includes(code);
      return on ? { ...g, selected: g.selected.filter((c) => c !== code) } : g.selected.length < PRE_BANS ? { ...g, selected: [...g.selected, code] } : g;
    }
    return { ...g, selected: g.selected[0] === code ? [] : [code] }; // the ban: one hero
  });
  const confirmPreBans = () => setGame((g) => {
    const next = { ...g, youPre: g.selected, botPre: botPreBans(pool, g.selected, rng.current), selected: [] };
    const picks = botTurns(pool, next, [], rng.current);
    return { ...next, picks, phase: picks.length === 10 ? 'ban' : 'draft' };
  });
  const pick = (code: string) => setGame((g) => {
    if (g.phase !== 'draft' || pickSides(g.youFirst)[g.picks.length] !== 'you' || new Set([...g.youPre, ...g.botPre, ...g.picks.map((p) => p.code)]).has(code)) return g;
    const picks = botTurns(pool, g, [...g.picks, { code, side: 'you' }], rng.current);
    return { ...g, picks, phase: picks.length === 10 ? 'ban' : 'draft' };
  });
  const confirmBan = () => setGame((g) => {
    const youTeam = g.picks.filter((p) => p.side === 'you').map((p) => p.code);
    return { ...g, youBan: g.selected[0], botBan: botBan(pool, youTeam), selected: [], phase: 'result' };
  });

  const q = normalize(search.trim());
  const filtered = (rows: RtaRow[]) => rows.filter((r) => !q || normalize(shown(r.code)).includes(q));
  const stateOf = (code: string) => (game.youPre.includes(code) || game.botPre.includes(code) ? 'prebanned' : mine.includes(code) ? 'you' : theirs.includes(code) ? 'bot' : 'free');
  const tip = (r: RtaRow) => `${t('hero.pick')}: ${r.pick}% · ${t('hero.winRate')}: ${r.win === null ? '—' : `${r.win}%`}`;

  const Slots = ({ codes, label }: { codes: string[]; label: string }) => (
    <section aria-label={label} className="panel draft-team">
      <h3>{label}</h3>
      <ol>
        {Array.from({ length: 5 }, (_, i) => (
          <li key={i} className={codes[i] ? 'filled' : 'empty'}>
            {codes[i] && <><HeroIcon code={codes[i]} name={shown(codes[i])} decorative /><span>{shown(codes[i])}</span></>}
          </li>
        ))}
      </ol>
    </section>
  );
  const heroButton = (r: RtaRow, opts: { disabled?: boolean; pressed?: boolean; onClick: () => void }) => (
    <li key={r.code}>
      <button type="button" className="draft-hero" data-state={stateOf(r.code)} disabled={opts.disabled} aria-pressed={opts.pressed} title={tip(r)} onClick={opts.onClick}>
        <HeroIcon code={r.code} name={shown(r.code)} decorative /><span>{shown(r.code)}</span>
      </button>
    </li>
  );

  if (game.phase === 'setup') {
    return (
      <div>
        {head}
        <section aria-label={t('draft.setupTitle')} className="panel draft-setup">
          <h2>{t('draft.setupTitle')}</h2>
          <div className="draft-choice">
            <button type="button" className="tab" onClick={() => start(true)}>{t('draft.youFirst')}</button>
            <button type="button" className="tab" onClick={() => start(false)}>{t('draft.youSecond')}</button>
          </div>
          <p className="caption">{t('draft.setupHelp')}</p>
        </section>
      </div>
    );
  }

  if (game.phase === 'result') {
    const s = scoreDraft(pool, { you: mine, bot: theirs, youBan: game.youBan!, botBan: game.botBan!, youPreBans: game.youPre });
    const verdict: Key = s.score >= 65 ? 'draft.verdictStrong' : s.score >= 55 ? 'draft.verdictGood' : s.score >= 45 ? 'draft.verdictEven' : 'draft.verdictRisky';
    const side = (label: Key, x: typeof s.you) => (
      <div className="draft-side">
        <h3>{t(label)}</h3>
        <dl>
          <dt>{t('draft.avgWin')}</dt><dd>{x.avgWin === null ? '—' : `${x.avgWin.toLocaleString(locale)}%`}</dd>
          <dt>{t('draft.typicalPick')}</dt><dd>{x.typicalPick.toLocaleString(locale)}% · {t(STYLE[x.style])}</dd>
        </dl>
      </div>
    );
    return (
      <div>
        {head}
        <section aria-label={t('draft.result')} className="panel draft-result">
          <h2>{t('draft.result')}</h2>
          <p className="draft-score"><small>{t('draft.score')}</small><strong>{t('draft.scoreValue', { n: s.score })}</strong><span>{t(verdict)}</span></p>
          <div className="draft-sides">{side('draft.you', s.you)}{side('draft.botTeam', s.bot)}</div>
          <h3>{t('draft.feedback')}</h3>
          <ul className="notes">
            {s.banRank !== null && <li>{t('draft.banFeedback', { hero: shown(game.youBan!), rank: s.banRank })}</li>}
            {s.preBanRanks.map((p) => <li key={p.code}>{t('draft.preBanFeedback', { hero: shown(p.code), rank: p.rank })}</li>)}
            <li>{t('draft.botBanned', { hero: shown(game.botBan!) })}</li>
          </ul>
          <table className="targets draft">
            <thead><tr><th>#</th><th>{t('arena.colHero')}</th><th /><th>{t('hero.pick')}</th><th>{t('hero.winRate')}</th><th /></tr></thead>
            <tbody>
              {game.picks.map((p, i) => {
                const r = byCode.get(p.code);
                const banned = p.code === game.youBan || p.code === game.botBan;
                return (
                  <tr key={p.code}>
                    <td>{i + 1}</td>
                    <td><span className="hero-cell"><HeroIcon code={p.code} name={shown(p.code)} decorative />{shown(p.code)}</span></td>
                    <td>{p.side === 'you' ? t('draft.you') : t('draft.botTeam')}{banned ? ` · ${t('draft.banned')}` : ''}</td>
                    <td>{r ? `${r.pick}%` : '—'}</td>
                    <td>{r?.win != null ? `${r.win}%` : '—'}</td>
                    <td>{r ? t(STYLE[r.pick >= 20 ? 'meta' : r.pick >= 8 ? 'mainstream' : r.pick >= 2 ? 'offmeta' : 'rare']) : ''}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="caption">{t('draft.note')}</p>
          <button type="button" className="tab" onClick={() => setGame(NEW_GAME)}>{t('draft.again')}</button>
        </section>
      </div>
    );
  }

  const myTurn = game.phase === 'draft' && pickSides(game.youFirst)[game.picks.length] === 'you';
  return (
    <div>
      {head}
      <div className="draft-teams">
        <Slots codes={mine} label={t('draft.yourTeam')} />
        <Slots codes={theirs} label={t('draft.botTeam')} />
      </div>
      {game.youPre.length > 0 && (
        <p className="draft-prebans">
          <strong>{t('hero.preBan')}:</strong> {[...game.youPre, ...game.botPre].map((c) => shown(c)).join(' · ')}
        </p>
      )}
      <p className="draft-prompt" role="status">
        {game.phase === 'preban' && t('draft.prebanTitle', { n: PRE_BANS })}
        {game.phase === 'draft' && t('draft.pickPrompt', { n: mine.length + 1 })}
        {game.phase === 'ban' && t('draft.banPrompt')}
      </p>
      {game.phase === 'preban' && (
        <button type="button" className="tab" disabled={game.selected.length < PRE_BANS} onClick={confirmPreBans}>{t('draft.prebanConfirm')}</button>
      )}
      {game.phase === 'ban' && (
        <button type="button" className="tab" disabled={game.selected.length < 1} onClick={confirmBan}>{t('draft.banConfirm')}</button>
      )}
      {game.phase !== 'ban' && (
        <div className="toolbar">
          <input type="search" aria-label={t('heroList.search')} placeholder={t('heroList.search')} value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      )}
      <ul className="draft-grid" data-testid="draft-grid" aria-label={t('draft.pool')}>
        {game.phase === 'ban'
          ? theirs.map((c) => byCode.get(c)).filter((r): r is RtaRow => !!r).map((r) => heroButton(r, { pressed: game.selected.includes(r.code), onClick: () => toggle(r.code) }))
          : filtered(pool).map((r) => heroButton(r, game.phase === 'preban'
            ? { pressed: game.selected.includes(r.code), onClick: () => toggle(r.code) }
            : { disabled: !myTurn || unavailable.has(r.code), onClick: () => pick(r.code) }))}
      </ul>
    </div>
  );
}
