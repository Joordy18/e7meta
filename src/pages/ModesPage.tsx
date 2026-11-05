import { useEffect, useState } from 'react';
import { HeroFace } from '../components/Art';
import { formatValue } from '../components/Bars';
import { loadIndex, loadModes } from '../lib/data';
import type { ModeList, Modes } from '../shared/types';

const MODE_TABS: [ModeList['mode'], string][] = [['hunts', 'Hunts'], ['abyss', 'Abyss'], ['expedition', 'Expeditions']];
const PAGE = 25;

type State = { status: 'loading' } | { status: 'none' } | { status: 'error'; message: string } | { status: 'ok'; modes: Modes };

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

export default function ModesPage() {
  const [state, setState] = useState<State>({ status: 'loading' });
  const [mode, setMode] = useState<ModeList['mode']>('hunts');
  const [listId, setListId] = useState('');
  const [limit, setLimit] = useState(PAGE);

  useEffect(() => {
    let live = true;
    (async () => {
      const index = await loadIndex();
      const modes = index && index.periods.length > 0 ? await loadModes(index.periods[0]) : null;
      if (!live) return;
      setState(modes ? { status: 'ok', modes } : { status: 'none' });
    })().catch((e: unknown) => live && setState({ status: 'error', message: String(e) }));
    return () => { live = false; };
  }, []);

  if (state.status === 'loading') return <p className="note">Loading…</p>;
  if (state.status === 'error') return <p className="note error">Failed to load: {state.message}</p>;
  if (state.status === 'none') return <p className="note">No mode data for this period yet. Run <code>npm run collect</code></p>;

  const { modes } = state;
  const lists = modes.lists.filter((l) => l.mode === mode);
  const list = lists.find((l) => l.id === listId) ?? lists[0];
  const pick = (m: ModeList['mode']) => { setMode(m); setListId(''); setLimit(PAGE); };

  return (
    <div>
      <h1 className="page-title">Game modes</h1>
      <p className="lede">How often each hero is used in successful teams, from the game's own success-rate rankings.</p>
      <div className="toolbar">
        {MODE_TABS.map(([m, label]) => (
          <button key={m} type="button" className="tab" aria-pressed={m === mode} onClick={() => pick(m)}>{label}</button>
        ))}
        <select aria-label="Content" value={list?.id ?? ''} onChange={(e) => { setListId(e.target.value); setLimit(PAGE); }}>
          {lists.map((l) => <option key={l.id} value={l.id}>{l.title}</option>)}
        </select>
        {list?.period && <span className="period-chip">{list.period.start} to {list.period.end}</span>}
      </div>
      {list && (
        <>
          <ol className="ranking">
            {list.heroes.slice(0, limit).map((h, i) => (
              <li key={h.code} className="rank-row">
                <span className="rank-n">{i + 1}</span>
                <HeroFace code={h.code} name={h.name} className="face small" />
                <a href={`#/hero/${h.code}`}>{h.name}</a>
                <span className="rank-bar" aria-hidden><span style={{ width: `${Math.min(100, h.share)}%` }} /></span>
                <strong>{formatValue(h.share)}</strong>
              </li>
            ))}
          </ol>
          {limit < list.heroes.length && (
            <button type="button" className="more" onClick={() => setLimit(limit + PAGE)}>Show more</button>
          )}
        </>
      )}
      {modes.rift && <Rift rift={modes.rift} />}
    </div>
  );
}
