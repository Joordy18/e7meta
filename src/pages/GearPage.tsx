import { useEffect, useState } from 'react';
import { HeroIcon, Icon } from '../components/Art';
import { formatValue } from '../components/Bars';
import { loadGear, loadIndex } from '../lib/data';
import { describeArtifact } from '../lib/gear';
import { artifactIcon } from '../lib/images';
import type { Gear, ModeEntry } from '../shared/types';
import { jobLabel } from './HeroList';

type State = { status: 'loading' } | { status: 'none' } | { status: 'error'; message: string } | { status: 'ok'; gear: Gear };

function useGear(): State {
  const [state, setState] = useState<State>({ status: 'loading' });
  useEffect(() => {
    let live = true;
    (async () => {
      const index = await loadIndex();
      const gear = index && index.periods.length > 0 ? await loadGear(index.periods[0]) : null;
      if (live) setState(gear ? { status: 'ok', gear } : { status: 'none' });
    })().catch((e: unknown) => live && setState({ status: 'error', message: String(e) }));
    return () => { live = false; };
  }, []);
  return state;
}

function Wearers({ heroes }: { heroes: ModeEntry[] }) {
  if (heroes.length === 0) return null;
  return (
    <section aria-label="Worn most by" className="panel">
      <h3>Worn most by</h3>
      <p className="caption">Heroes wearing it most, as ranked by the game.</p>
      <ol className="ranking">
        {heroes.map((h, i) => (
          <li key={h.code} className="rank-row">
            <span className="rank-n">{i + 1}</span>
            <HeroIcon code={h.code} name={h.name} decorative />
            <a href={`#/hero/${h.code}`}>{h.name}</a>
            <span className="rank-bar" aria-hidden><span style={{ width: `${Math.min(100, h.share)}%` }} /></span>
            <strong>{formatValue(h.share)}</strong>
          </li>
        ))}
      </ol>
    </section>
  );
}

function Frame({ state, missing, children }: { state: State; missing: string | null; children: React.ReactNode }) {
  return (
    <div>
      <a className="back" href="#/">← All heroes</a>
      {state.status === 'loading' && <p className="note">Loading…</p>}
      {state.status === 'error' && <p className="note error">Failed to load: {state.message}</p>}
      {state.status === 'none' && <p className="note">No gear data for this period yet. Run <code>npm run collect</code></p>}
      {state.status === 'ok' && (missing ? <p className="note">{missing}</p> : children)}
    </div>
  );
}

export function ArtifactPage({ code }: { code: string }) {
  const state = useGear();
  const a = state.status === 'ok' ? state.gear.artifacts[code] : undefined;
  const varies = !!a && a.values.length > 0 && a.description.includes('@');
  return (
    <Frame state={state} missing={state.status === 'ok' && !a ? 'Unknown artifact' : null}>
      {a && (
        <>
          <div className="hero-head">
            <Icon src={artifactIcon(a.code)} className="gear-icon" />
            <div>
              <h1>{a.name}</h1>
              <p className="tags">{a.grade}★ {jobLabel(a.job)} exclusive</p>
            </div>
          </div>
          <div className="panels">
            <section aria-label="Stats" className="panel">
              <h3>Stats</h3>
              <table className="targets" aria-label="Artifact stats">
                <thead><tr><th /><th>Level 1</th><th>Max level</th></tr></thead>
                <tbody>
                  <tr><th scope="row">Attack</th><td>{a.attack}</td><td>{a.maxAttack}</td></tr>
                  <tr><th scope="row">Health</th><td>{a.health}</td><td>{a.maxHealth}</td></tr>
                </tbody>
              </table>
            </section>
            <section aria-label="Effect" className="panel">
              <h3>Effect</h3>
              {varies ? (
                <>
                  <p>Level 1: {describeArtifact(a.description, a.values, 'level1')}</p>
                  <p>Max level: {describeArtifact(a.description, a.values, 'max')}</p>
                </>
              ) : <p>{describeArtifact(a.description, a.values, 'max')}</p>}
            </section>
            <Wearers heroes={a.heroes} />
          </div>
        </>
      )}
    </Frame>
  );
}
