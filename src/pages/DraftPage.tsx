import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { HeroIcon } from '../components/Art';
import { useI18n, type Key } from '../i18n';
import { PRE_BANS, PROTECTED_SLOT, botBan, botPick, botPreBans, mulberry32, pickSides, scoreDraft, type Rarity, type Side } from '../lib/draft';
import { loadHeroes, loadIndex, loadRta, normalize } from '../lib/data';
import { MIN_PLAYED, rtaRows, type RtaRow } from '../lib/rta';

const MIN_POOL = 20; // heroes with data needed for a draft to make sense
const STYLE: Record<Rarity, Key> = { meta: 'draft.styleMeta', mainstream: 'draft.styleMainstream', offmeta: 'draft.styleOffmeta', rare: 'draft.styleRare' };

type Phase = 'setup' | 'preban' | 'draft' | 'ban' | 'result';
type Pick = { code: string; side: Side };
// 'you' is you against the bot, or Team A when you analyse (Team A picks first); 'bot' is the bot or Team B.
// stage: in the analysis, which team is choosing its pre-bans (0 = A, 1 = B) or its ban (0 = A bans a hero of B, 1 = B bans a hero of A)
type Game = { analysis: boolean; phase: Phase; youFirst: boolean; stage: 0 | 1; youPre: string[]; botPre: string[]; picks: Pick[]; selected: string[]; youBan?: string; botBan?: string };
const NEW_GAME: Game = { analysis: false, phase: 'setup', youFirst: true, stage: 0, youPre: [], botPre: [], picks: [], selected: [] };

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

/**
 * Practice the RTA draft against a bot that plays like the top players of the sample, and get a score (see lib/draft.ts); or analyse a draft by
 * choosing everything for both teams. The third pick of each team is protected from the ban, like in the game.
 */
export default function DraftPage() {
  const { t, rich, name, locale } = useI18n();
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [game, setGame] = useState<Game>(NEW_GAME);
  const [history, setHistory] = useState<Game[]>([]); // the analysis can go back
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
  const mine = game.picks.filter((p) => p.side === 'you').map((p) => p.code); // in pick order
  const theirs = game.picks.filter((p) => p.side === 'bot').map((p) => p.code);
  const teamLabel = (side: Side) => t(game.analysis ? (side === 'you' ? 'draft.teamA' : 'draft.teamB') : side === 'you' ? 'draft.yourTeam' : 'draft.botTeam');

  const go = (next: Game, remember = true) => {
    if (game.analysis && remember) setHistory([...history, game]);
    setGame(next);
  };
  const undo = () => { setGame(history[history.length - 1]); setHistory(history.slice(0, -1)); };
  const start = (analysis: boolean, youFirst: boolean) => {
    rng.current = mulberry32(Math.floor(Math.random() * 2 ** 31));
    setSearch('');
    setHistory([]);
    setGame({ ...NEW_GAME, analysis, phase: 'preban', youFirst });
  };
  const toggle = (code: string) => setGame((g) => {
    if (g.phase === 'preban') {
      const on = g.selected.includes(code);
      return on ? { ...g, selected: g.selected.filter((c) => c !== code) } : g.selected.length < PRE_BANS ? { ...g, selected: [...g.selected, code] } : g;
    }
    return { ...g, selected: g.selected[0] === code ? [] : [code] }; // the ban: one hero
  });
  const confirmPreBans = () => {
    if (game.analysis) {
      go(game.stage === 0 ? { ...game, youPre: game.selected, selected: [], stage: 1 } : { ...game, botPre: game.selected, selected: [], stage: 0, phase: 'draft' });
      return;
    }
    const next = { ...game, youPre: game.selected, botPre: botPreBans(pool, rng.current), selected: [] };
    const picks = botTurns(pool, next, [], rng.current);
    setGame({ ...next, picks, phase: picks.length === 10 ? 'ban' : 'draft' });
  };
  const pick = (code: string) => {
    if (game.phase !== 'draft' || unavailable.has(code)) return;
    const side = pickSides(game.youFirst)[game.picks.length];
    if (game.analysis) {
      const picks = [...game.picks, { code, side }];
      go({ ...game, picks, phase: picks.length === 10 ? 'ban' : 'draft', stage: 0 });
      return;
    }
    if (side !== 'you') return;
    const picks = botTurns(pool, game, [...game.picks, { code, side }], rng.current);
    setGame({ ...game, picks, phase: picks.length === 10 ? 'ban' : 'draft' });
  };
  const confirmBan = () => {
    if (game.analysis && game.stage === 0) go({ ...game, youBan: game.selected[0], selected: [], stage: 1 });
    else if (game.analysis) go({ ...game, botBan: game.selected[0], selected: [], phase: 'result' });
    else setGame({ ...game, youBan: game.selected[0], botBan: botBan(pool, mine), selected: [], phase: 'result' });
  };

  const q = normalize(search.trim());
  const filtered = (rows: RtaRow[]) => rows.filter((r) => !q || normalize(shown(r.code)).includes(q));
  const stateOf = (code: string) => (game.phase !== 'preban' && (game.youPre.includes(code) || game.botPre.includes(code)) ? 'prebanned' : mine.includes(code) ? 'you' : theirs.includes(code) ? 'bot' : 'free');
  const tip = (r: RtaRow) => `${t('hero.pick')}: ${r.pick}% · ${t('hero.winRate')}: ${r.win === null ? '—' : `${r.win}%`}`;
  const icon = (code: string) => <HeroIcon code={code} name={shown(code)} />; // a picture with the name for the reader of the screen, not written
  const icons = (codes: string[], side: Side) => <span className="draft-icons" data-side={side}>{codes.map((c) => <span key={c}>{icon(c)}</span>)}</span>;
  // pictures, not characters: a slot must hold the name of its hero and nothing else as text
  const shield = (
    <span className="shield" role="img" aria-label={t('draft.protectedTip')} title={t('draft.protectedTip')}>
      <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M12 2 20 5v6c0 5-3.4 9.3-8 11-4.6-1.7-8-6-8-11V5z" fill="currentColor" /></svg>
    </span>
  );
  const crossed = (
    <span className="ban-mark" role="img" aria-label={t('draft.banned')} title={t('draft.banned')}>
      <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M5 5l14 14M19 5 5 19" stroke="currentColor" strokeWidth="3" strokeLinecap="round" fill="none" /></svg>
    </span>
  );

  const Slots = ({ codes, side, banned }: { codes: string[]; side: Side; banned?: string }) => (
    <section aria-label={teamLabel(side)} className="panel draft-team" data-side={side}>
      <h3>{teamLabel(side)}{game.analysis && side === 'you' && <small className="chip">{t('draft.firstTag')}</small>}</h3>
      <ol>
        {Array.from({ length: 5 }, (_, i) => (
          <li key={i} className={codes[i] ? 'filled' : 'empty'} data-banned={codes[i] && codes[i] === banned ? 'true' : undefined}>
            {i === PROTECTED_SLOT && shield}
            {codes[i] && <><HeroIcon code={codes[i]} name={shown(codes[i])} decorative /><span>{shown(codes[i])}</span></>}
            {codes[i] && codes[i] === banned && crossed}
          </li>
        ))}
      </ol>
    </section>
  );
  const heroButton = (r: RtaRow, opts: { disabled?: boolean; pressed?: boolean; protectedHero?: boolean; onClick: () => void }) => (
    <li key={r.code}>
      <button type="button" className="draft-hero" data-state={stateOf(r.code)} disabled={opts.disabled} aria-pressed={opts.pressed} title={tip(r)} onClick={opts.onClick}>
        {opts.protectedHero && shield}
        <HeroIcon code={r.code} name={shown(r.code)} decorative /><span>{shown(r.code)}</span>
      </button>
    </li>
  );

  if (game.phase === 'setup') {
    return (
      <div>
        {head}
        <div className="draft-modes">
          <section aria-label={t('draft.modeBot')} className="panel draft-setup">
            <h2>{t('draft.modeBot')}</h2>
            <h3>{t('draft.setupTitle')}</h3>
            <div className="draft-choice">
              <button type="button" className="tab" onClick={() => start(false, true)}>{t('draft.youFirst')}</button>
              <button type="button" className="tab" onClick={() => start(false, false)}>{t('draft.youSecond')}</button>
            </div>
            <p className="caption">{t('draft.setupHelp')}</p>
          </section>
          <section aria-label={t('draft.modeAnalysis')} className="panel draft-setup">
            <h2>{t('draft.modeAnalysis')}</h2>
            <div className="draft-choice">
              <button type="button" className="tab" onClick={() => start(true, true)}>{t('draft.analysisButton')}</button>
            </div>
            <p className="caption">{t('draft.analysisHelp')}</p>
          </section>
        </div>
      </div>
    );
  }

  const undoButton = game.analysis && history.length > 0 && <button type="button" className="tab" onClick={undo}>{t('draft.undo')}</button>;

  if (game.phase === 'result') {
    const youTeam = teamLabel('you');
    const botTeam = teamLabel('bot');
    const s = scoreDraft(pool, { you: mine, bot: theirs, youBan: game.youBan!, botBan: game.botBan!, youPreBans: game.youPre, botPreBans: game.botPre });
    const verdict: Key = s.score >= 65 ? 'draft.verdictStrong' : s.score >= 55 ? 'draft.verdictGood' : s.score >= 45 ? 'draft.verdictEven' : 'draft.verdictRisky';
    const side = (label: string, x: typeof s.you) => (
      <div className="draft-side">
        <h3>{label}</h3>
        <dl>
          <dt>{t('draft.avgWin')}</dt><dd>{x.avgWin === null ? '—' : `${x.avgWin.toLocaleString(locale)}%`}</dd>
          <dt>{t('draft.typicalPick')}</dt><dd>{x.typicalPick.toLocaleString(locale)}% · {t(STYLE[x.style])}</dd>
        </dl>
      </div>
    );
    const lines: ReactNode[] = [];
    if (game.analysis) {
      for (const [team, ban, rank] of [[youTeam, game.youBan!, s.banRank], [botTeam, game.botBan!, s.botBanRank]] as const) {
        if (rank !== null) lines.push(<li key={`ban-${team}`}>{rich('draft.banFeedbackTeam', { team, hero: icon(ban), rank, n: s.bannable })}</li>);
      }
      for (const [team, ranks] of [[youTeam, s.preBanRanks], [botTeam, s.botPreBanRanks]] as const) {
        for (const p of ranks) lines.push(<li key={`pre-${team}-${p.code}`}>{rich('draft.preBanFeedbackTeam', { team, hero: icon(p.code), rank: p.rank })}</li>);
      }
    } else {
      if (s.banRank !== null) lines.push(<li key="ban">{rich('draft.banFeedback', { hero: icon(game.youBan!), rank: s.banRank, n: s.bannable })}</li>);
      for (const p of s.preBanRanks) lines.push(<li key={`pre-${p.code}`}>{rich('draft.preBanFeedback', { hero: icon(p.code), rank: p.rank })}</li>);
      lines.push(<li key="bot">{rich('draft.botBanned', { hero: icon(game.botBan!) })}</li>);
    }
    return (
      <div>
        {head}
        <section aria-label={t('draft.result')} className="panel draft-result">
          <h2>{t('draft.result')}</h2>
          <p className="draft-score"><small>{t('draft.score')}</small><strong>{t('draft.scoreValue', { n: s.score })}</strong><span>{t(verdict)}</span></p>
          <p className="draft-bansum">
            <strong>{t('hero.preBan')}</strong> {icons(game.youPre, 'you')} {icons(game.botPre, 'bot')}
            <strong>{t('draft.bans')}</strong> {icons([game.botBan!], 'you')} {icons([game.youBan!], 'bot')}
          </p>
          <div className="draft-sides">{side(youTeam, s.you)}{side(botTeam, s.bot)}</div>
          <h3>{t('draft.feedback')}</h3>
          <ul className="notes">{lines}</ul>
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
                    <td>{teamLabel(p.side)}{banned ? ` · ${t('draft.banned')}` : ''}</td>
                    <td>{r ? `${r.pick}%` : '—'}</td>
                    <td>{r?.win != null ? `${r.win}%` : '—'}</td>
                    <td>{r ? t(STYLE[r.pick >= 20 ? 'meta' : r.pick >= 8 ? 'mainstream' : r.pick >= 2 ? 'offmeta' : 'rare']) : ''}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="caption">{t('draft.note')}</p>
          <button type="button" className="tab" onClick={() => { setHistory([]); setGame(NEW_GAME); }}>{t('draft.again')}</button>
          {undoButton}
        </section>
      </div>
    );
  }

  const turn = pickSides(game.youFirst)[game.picks.length];
  const picked = (side: Side) => game.picks.filter((p) => p.side === side).length;
  const myTurn = game.phase === 'draft' && (game.analysis || turn === 'you');
  const banTeam = game.stage === 0 ? theirs : mine; // the team whose heroes can be banned now
  const prompt = game.phase === 'preban'
    ? game.analysis ? t('draft.prebanTeam', { team: teamLabel(game.stage === 0 ? 'you' : 'bot'), n: PRE_BANS }) : t('draft.prebanTitle', { n: PRE_BANS })
    : game.phase === 'draft'
      ? game.analysis ? t('draft.pickTeam', { team: teamLabel(turn), n: picked(turn) + 1 }) : t('draft.pickPrompt', { n: mine.length + 1 })
      : game.analysis ? t('draft.banTeam', { team: teamLabel(game.stage === 0 ? 'you' : 'bot') }) : t('draft.banPrompt');
  return (
    <div>
      {head}
      <div className="draft-teams">
        <Slots codes={mine} side="you" banned={game.botBan} />
        <Slots codes={theirs} side="bot" banned={game.youBan} />
      </div>
      {(game.youPre.length > 0 || game.botPre.length > 0) && (
        <p className="draft-prebans" data-testid="draft-prebans"><strong>{t('hero.preBan')}</strong> {icons(game.youPre, 'you')} {icons(game.botPre, 'bot')}</p>
      )}
      <p className="draft-prompt" role="status">{prompt}</p>
      <div className="draft-actions">
        {game.phase === 'preban' && <button type="button" className="tab" disabled={game.selected.length < PRE_BANS} onClick={confirmPreBans}>{t('draft.prebanConfirm')}</button>}
        {game.phase === 'ban' && <button type="button" className="tab" disabled={game.selected.length < 1} onClick={confirmBan}>{t('draft.banConfirm')}</button>}
        {undoButton}
      </div>
      {game.phase !== 'ban' && (
        <div className="toolbar">
          <input type="search" aria-label={t('heroList.search')} placeholder={t('heroList.search')} value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      )}
      <ul className="draft-grid" data-testid="draft-grid" aria-label={t('draft.pool')}>
        {game.phase === 'ban'
          ? banTeam.map((c, i) => ({ r: byCode.get(c), i })).filter((x): x is { r: RtaRow; i: number } => !!x.r).map(({ r, i }) => heroButton(r, {
            pressed: game.selected.includes(r.code), disabled: i === PROTECTED_SLOT, protectedHero: i === PROTECTED_SLOT, onClick: () => toggle(r.code),
          }))
          : filtered(pool).map((r) => heroButton(r, game.phase === 'preban'
            ? { pressed: game.selected.includes(r.code), onClick: () => toggle(r.code) }
            : { disabled: !myTurn || unavailable.has(r.code), onClick: () => pick(r.code) }))}
      </ul>
    </div>
  );
}
