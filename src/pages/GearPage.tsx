import { useEffect, useState } from 'react';
import { HeroIcon, Icon } from '../components/Art';
import { formatValue } from '../components/Bars';
import { loadGear, loadIndex } from '../lib/data';
import { describeArtifact } from '../lib/gear';
import { artifactIcon } from '../lib/images';
import type { Gear, ModeEntry } from '../shared/types';
import { JobIcon } from '../components/Art';
import { useI18n, useLabels } from '../i18n';

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
  const { t } = useI18n();
  if (heroes.length === 0) return null;
  return (
    <section aria-label={t('gear.wornMost')} className="panel">
      <h3>{t('gear.wornMost')}</h3>
      <p className="caption">{t('gear.wornCaption')}</p>
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
  const { t, rich } = useI18n();
  return (
    <div>
      <a className="back" href="#/heroes">{t('common.allHeroes')}</a>
      {state.status === 'loading' && <p className="note">{t('common.loading')}</p>}
      {state.status === 'error' && <p className="note error">{t('common.failed', { message: state.message })}</p>}
      {state.status === 'none' && <p className="note">{rich('gear.none', { cmd: <code>npm run collect</code> })}</p>}
      {state.status === 'ok' && (missing ? <p className="note">{missing}</p> : children)}
    </div>
  );
}

export function ArtifactPage({ code }: { code: string }) {
  const { t } = useI18n();
  const labels = useLabels();
  const state = useGear();
  const a = state.status === 'ok' ? state.gear.artifacts[code] : undefined;
  const varies = !!a && a.values.length > 0 && a.description.includes('@');
  return (
    <Frame state={state} missing={state.status === 'ok' && !a ? t('gear.unknown') : null}>
      {a && (
        <>
          <div className="hero-head">
            <Icon src={artifactIcon(a.code)} className="gear-icon" />
            <div>
              <h1>{a.name}</h1>
              <p className="tags">{a.grade}★ <JobIcon job={a.job} /> {t('gear.exclusive', { job: labels.job(a.job) })}</p>
            </div>
          </div>
          <div className="panels">
            <section aria-label={t('gear.stats')} className="panel">
              <h3>{t('gear.stats')}</h3>
              <table className="targets" aria-label={t('gear.artifactStats')}>
                <thead><tr><th /><th>{t('gear.level1')}</th><th>{t('gear.maxLevel')}</th></tr></thead>
                <tbody>
                  <tr><th scope="row">{t('stat.attack')}</th><td>{a.attack}</td><td>{a.maxAttack}</td></tr>
                  <tr><th scope="row">{t('stat.health')}</th><td>{a.health}</td><td>{a.maxHealth}</td></tr>
                </tbody>
              </table>
            </section>
            <section aria-label={t('gear.effect')} className="panel">
              <h3>{t('gear.effect')}</h3>
              {varies ? (
                <>
                  <p>{t('gear.level1Text', { text: describeArtifact(a.description, a.values, 'level1', t('gear.valueUnpublished')) })}</p>
                  <p>{t('gear.maxText', { text: describeArtifact(a.description, a.values, 'max', t('gear.valueUnpublished')) })}</p>
                </>
              ) : <p>{describeArtifact(a.description, a.values, 'max', t('gear.valueUnpublished'))}</p>}
            </section>
            <Wearers heroes={a.heroes} />
          </div>
        </>
      )}
    </Frame>
  );
}
