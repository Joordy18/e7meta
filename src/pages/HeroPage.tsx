import { useEffect, useState } from 'react';
import Bars from '../components/Bars';
import { NotFoundError, loadHero, loadIndex } from '../lib/data';
import { STAT_RANGES } from '../shared/stats';
import type { HeroSnapshot, Period, StatKey } from '../shared/types';

const STATS: [StatKey, string][] = [
  ['attack', 'Attaque'], ['defense', 'Défense'], ['health', 'Vitalité'], ['speed', 'Vitesse'],
  ['critChance', 'Chance de critique'], ['critDamage', 'Dégâts critiques'], ['effectiveness', 'Efficacité'],
  ['effectResistance', 'Résistance à l\'effet'],
];
const range = (p: Period) => `du ${p.start} au ${p.end}`;
const top = <T,>(xs: T[], n: number) => xs.slice(0, n);

type State = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ok'; hero: HeroSnapshot };

function Histogram({ stat, label, counts }: { stat: StatKey; label: string; counts: number[] }) {
  const max = Math.max(...counts, 1);
  const [lo, hi] = STAT_RANGES[stat];
  return (
    <div role="group" aria-label={label} style={{ marginBottom: 12 }}>
      <strong>{label}</strong>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 60 }}>
        {counts.map((c, i) => (
          <div key={i} role="meter" aria-label={`${label}, tranche ${i + 1}`} aria-valuenow={c} aria-valuemin={0} aria-valuemax={max}
            title={String(c)} style={{ flex: 1, height: `${(c / max) * 100}%`, minHeight: 1, background: '#8ab4f8' }} />
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>{lo}</span><span>{hi}</span></div>
    </div>
  );
}

export default function HeroPage({ code }: { code: string }) {
  const [periods, setPeriods] = useState<string[]>([]);
  const [period, setPeriod] = useState('');
  const [state, setState] = useState<State>({ status: 'loading' });

  useEffect(() => {
    let live = true;
    loadIndex()
      .then((i) => {
        if (!live) return;
        if (!i || i.periods.length === 0) setState({ status: 'error', message: 'Aucune donnée, lance npm run collect' });
        else { setPeriods(i.periods); setPeriod(i.periods[0]); }
      })
      .catch((e: unknown) => live && setState({ status: 'error', message: `Erreur de chargement : ${String(e)}` }));
    return () => { live = false; };
  }, []);

  useEffect(() => {
    if (!period) return;
    let live = true;
    setState({ status: 'loading' });
    loadHero(period, code)
      .then((hero) => live && setState({ status: 'ok', hero }))
      .catch((e: unknown) => live && setState({
        status: 'error',
        message: e instanceof NotFoundError ? 'Pas de données pour ce héros sur cette période' : `Erreur de chargement : ${String(e)}`,
      }));
    return () => { live = false; };
  }, [period, code]);

  const h = state.status === 'ok' ? state.hero : undefined;
  return (
    <div>
      <p><a href="#/">← Retour à la liste</a></p>
      {periods.length > 0 && (
        <label>Période{' '}
          <select value={period} onChange={(e) => setPeriod(e.target.value)}>
            {periods.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>
      )}
      {state.status === 'loading' && <p>Chargement…</p>}
      {state.status === 'error' && <p>{state.message}</p>}
      {h && (
        <>
          <h1>{h.hero.name}</h1>
          <section aria-label="Source : classement d'équipement">
            <h2>Source : classement d'équipement</h2>
            <p>{range(h.period)}</p>
            <section aria-label="Sets">
              <h3>Sets</h3>
              <Bars items={top(h.sets, 10).map((s) => ({ label: s.name, value: s.share }))} />
            </section>
            <section aria-label="Artéfacts">
              <h3>Artéfacts</h3>
              <Bars items={top(h.artifacts, 10).map((a) => ({ label: a.name, value: a.share, title: a.effect }))} />
            </section>
          </section>
          {h.detail && (
            <section aria-label="Source : chasses">
              <h2>Source : chasses</h2>
              <p>{range(h.detail.period)}</p>
              <section aria-label="Combinaisons de sets">
                <h3>Combinaisons de sets</h3>
                <Bars items={top(h.detail.combos, 3).map((c) => ({ label: c.sets.join(' + '), value: c.share }))} />
              </section>
              <section aria-label="Artéfacts (chasses)">
                <h3>Artéfacts (chasses)</h3>
                <Bars items={top(h.detail.artifacts, 10).map((a) => ({ label: a.name, value: a.share }))} />
              </section>
              <section aria-label="Stats">
                <h3>Stats</h3>
                <p><small>répartition en 10 tranches entre min et max (estimation)</small></p>
                {STATS.map(([k, label]) => <Histogram key={k} stat={k} label={label} counts={h.detail!.stats[k]} />)}
              </section>
            </section>
          )}
        </>
      )}
    </div>
  );
}
