import { useEffect, useMemo, useState } from 'react';
import { HeroIcon } from '../components/Art';
import { useI18n, type Key } from '../i18n';
import { loadIndex, loadModes } from '../lib/data';
import { tierList } from '../lib/tiers';
import type { ModeList, Modes } from '../shared/types';

const TABS: ['all' | ModeList['mode'], Key][] = [['all', 'tiers.all'], ['hunts', 'modes.hunts'], ['abyss', 'modes.abyss'], ['expedition', 'modes.expeditions']];

type State = { status: 'loading' } | { status: 'none' } | { status: 'error'; message: string } | { status: 'ok'; modes: Modes };

/** Tier list of the PvE: heroes grouped by how much the game's own success-rate rankings feature them (see lib/tiers.ts). */
export default function TiersPage() {
  const { t, rich, name } = useI18n();
  const [state, setState] = useState<State>({ status: 'loading' });
  const [tab, setTab] = useState<(typeof TABS)[number][0]>('all');

  useEffect(() => {
    let live = true;
    (async () => {
      const period = (await loadIndex())?.periods[0];
      const modes = period ? await loadModes(period) : null;
      if (live) setState(modes ? { status: 'ok', modes } : { status: 'none' });
    })().catch((e: unknown) => live && setState({ status: 'error', message: String(e) }));
    return () => { live = false; };
  }, []);

  const rows = useMemo(() => (state.status === 'ok' ? tierList(state.modes, tab) : []), [state, tab]);

  if (state.status === 'loading') return <p className="note">{t('common.loading')}</p>;
  if (state.status === 'error') return <p className="note error">{t('common.failed', { message: state.message })}</p>;
  if (state.status === 'none') return <p className="note">{rich('modes.none', { cmd: <code>npm run collect</code> })}</p>;

  return (
    <div>
      <h1 className="page-title">{t('tiers.title')}</h1>
      <p className="lede">{t('tiers.lede')}</p>
      <div className="toolbar">
        <nav aria-label={t('tiers.modeLabel')} className="chips">
          {TABS.map(([id, label]) => (
            <button key={id} type="button" className="tab" aria-pressed={id === tab} onClick={() => setTab(id)}>{t(label)}</button>
          ))}
        </nav>
      </div>
      {rows.map((r) => (
        <section key={r.tier} aria-label={t('tiers.tier', { tier: r.tier })} className="tier-row">
          <h2 className="tier-badge" data-tier={r.tier}>{r.tier}</h2>
          <ul className="tier-heroes">
            {r.heroes.map((h) => {
              const shown = name.hero(h.code, h.name);
              return (
                <li key={h.code}>
                  <a className="tier-hero" href={`#/hero/${h.code}`} title={t('tiers.shareTitle', { n: h.share })}>
                    <HeroIcon code={h.code} name={shown} decorative />
                    <span>{shown}</span>
                  </a>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      <p className="caption">{t('tiers.how')}</p>
    </div>
  );
}
