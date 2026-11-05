import { useEffect, useState, type ReactNode } from 'react';
import { HeroIcon } from '../components/Art';
import { formatValue } from '../components/Bars';
import { loadHeroes, loadIndex, loadModes, loadTeams } from '../lib/data';
import { findGuide } from '../lib/guides';
import { bossIcon } from '../lib/images';
import { bestTeams, groupModes, guideSlug } from '../lib/modes';
import type { ModeList, Modes, Team, Teams } from '../shared/types';

const PAGE = 25;
const SECTIONS: [ModeList['mode'], string][] = [['hunts', 'Hunts'], ['abyss', 'Abyss'], ['expedition', 'Expeditions']];
const VARIANT_LABEL: Record<ModeList['mode'], string> = { hunts: 'Difficulty', abyss: 'Floor', expedition: 'Level' };

type Loaded = { modes: Modes; teams: Teams | null; names: Map<string, string> };
type State = { status: 'loading' } | { status: 'none' } | { status: 'error'; message: string } | ({ status: 'ok' } & Loaded);

/** Modes of the latest period. Teams and hero names are extras: if they fail, the page still works without them. */
function useModes(): State {
  const [state, setState] = useState<State>({ status: 'loading' });
  useEffect(() => {
    let live = true;
    (async () => {
      const index = await loadIndex();
      const period = index && index.periods.length > 0 ? index.periods[0] : null;
      const modes = period ? await loadModes(period) : null;
      if (!period || !modes) return live && setState({ status: 'none' });
      const [teams, heroes] = await Promise.all([loadTeams(period).catch(() => null), loadHeroes(period).catch(() => [])]);
      if (live) setState({ status: 'ok', modes, teams, names: new Map(heroes.map((h) => [h.code, h.name])) });
    })().catch((e: unknown) => live && setState({ status: 'error', message: String(e) }));
    return () => { live = false; };
  }, []);
  return state;
}

function Status({ state }: { state: State }) {
  if (state.status === 'loading') return <p className="note">Loading…</p>;
  if (state.status === 'error') return <p className="note error">Failed to load: {state.message}</p>;
  if (state.status === 'none') return <p className="note">No mode data for this period yet. Run <code>npm run collect</code></p>;
  return null;
}

function Rift({ rift }: { rift: NonNullable<Modes['rift']> }) {
  const ended = rift.end < new Date().toISOString().slice(0, 10);
  return (
    <section aria-label="Rift" className="panel rift">
      <h3>{rift.title}</h3>
      <p>{rift.description}</p>
      <p className="caption">
        {rift.start} to {rift.end}. {ended ? 'Season ended.' : 'Season in progress.'}
      </p>
    </section>
  );
}

function TopHeroes({ list }: { list: ModeList }) {
  return (
    <span className="top-icons">
      {list.heroes.slice(0, 3).map((h) => <HeroIcon key={h.code} code={h.code} name={h.name} />)}
    </span>
  );
}

export default function ModesPage() {
  const state = useModes();
  if (state.status !== 'ok') return <Status state={state} />;
  const groups = groupModes(state.modes);
  return (
    <div>
      <h1 className="page-title">Game modes</h1>
      <p className="lede">Pick a boss, a floor or a level to see its best teams and the heroes used most, from the game's own success-rate rankings.</p>
      {SECTIONS.map(([mode, label]) => {
        const items = groups.filter((g) => g.mode === mode);
        if (items.length === 0) return null;
        return (
          <section key={mode} aria-label={label} className="mode-section">
            <h2>{label}</h2>
            {mode === 'abyss' ? (
              <div className="floors">
                {items[0].lists.map((l) => (
                  <a key={l.id} href={`#/modes/${l.id}`} className="floor">
                    <span>{l.variant}</span>
                    {l.heroes[0] && <HeroIcon code={l.heroes[0].code} name={l.heroes[0].name} />}
                  </a>
                ))}
              </div>
            ) : (
              <div className="boss-grid">
                {items.map((g) => (
                  <article key={g.group} aria-label={g.group} className="mode-card">
                    {mode === 'expedition' && <img className="boss" src={bossIcon(Number(g.lists[0].id.split('-')[1]))} alt="" loading="lazy" />}
                    <h3>{g.group}</h3>
                    <TopHeroes list={g.lists[0]} />
                    <div className="chips">
                      {g.lists.map((l) => <a key={l.id} href={`#/modes/${l.id}`}>{l.variant}</a>)}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        );
      })}
      {state.modes.rift && <Rift rift={state.modes.rift} />}
    </div>
  );
}

export function TeamRow({ team, names, caption }: { team: Team; names: Map<string, string>; caption?: ReactNode }) {
  return (
    <li className="team-row">
      {caption && <span className="team-caption">{caption}</span>}
      <span className="team-members">
        {team.heroes.map((code) => (
          <a key={code} href={`#/hero/${code}`} className="member">
            <HeroIcon code={code} name={names.get(code) ?? code} decorative />
            <span>{names.get(code) ?? code}</span>
          </a>
        ))}
      </span>
      <strong>{formatValue(team.share)}</strong>
    </li>
  );
}

export function ModePage({ id }: { id: string }) {
  const state = useModes();
  const [limit, setLimit] = useState(PAGE);
  useEffect(() => setLimit(PAGE), [id]);
  if (state.status !== 'ok') return <Status state={state} />;

  const list = state.modes.lists.find((l) => l.id === id);
  if (!list) {
    return (
      <div>
        <a className="back" href="#/modes">← All modes</a>
        <p className="note">Unknown game mode</p>
      </div>
    );
  }
  const siblings = state.modes.lists.filter((l) => l.group === list.group);
  const teams = bestTeams(state.teams, list.id, 8);
  const guide = findGuide(guideSlug(list));
  return (
    <div>
      <a className="back" href="#/modes">← All modes</a>
      <h1 className="page-title mode-title">{list.group}</h1>
      <div className="toolbar">
        <nav aria-label={VARIANT_LABEL[list.mode]} className="chips">
          {siblings.map((l) => (
            <a key={l.id} href={`#/modes/${l.id}`} aria-current={l.id === list.id ? 'page' : undefined}>{l.variant}</a>
          ))}
        </nav>
        {list.period && <span className="period-chip">{list.period.start} to {list.period.end}</span>}
        {guide
          ? <a className="guide-link" href={`#/guides/${guide.slug}`}>Strategy guide: {guide.title}</a>
          : <span className="count">No strategy guide yet</span>}
      </div>
      <div className="panels">
        {teams.length > 0 && (
          <section aria-label="Best teams" className="panel">
            <h3>Best teams</h3>
            <ol className="teams">{teams.map((t) => <TeamRow key={t.heroes.join()} team={t} names={state.names} />)}</ol>
          </section>
        )}
        <section aria-label="Top heroes" className="panel">
          <h3>Top heroes</h3>
          <ol className="ranking">
            {list.heroes.slice(0, limit).map((h, i) => (
              <li key={h.code} className="rank-row">
                <span className="rank-n">{i + 1}</span>
                <HeroIcon code={h.code} name={h.name} decorative />
                <a href={`#/hero/${h.code}`}>{h.name}</a>
                <span className="rank-bar" aria-hidden><span style={{ width: `${Math.min(100, h.share)}%` }} /></span>
                <strong>{formatValue(h.share)}</strong>
              </li>
            ))}
          </ol>
          {limit < list.heroes.length && (
            <button type="button" className="more" onClick={() => setLimit(limit + PAGE)}>Show more</button>
          )}
        </section>
      </div>
    </div>
  );
}
