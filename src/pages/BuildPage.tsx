import { useEffect, useState } from 'react';
import { ElementIcon, HeroFace, HeroIcon, Icon, JobIcon } from '../components/Art';
import { useI18n } from '../i18n';
import Picker from '../components/Picker';
import { EMPTY, MAX_PIECES, NOTE_MAX, SETS, SHARE_BASE, addSet, buildHash, parseBuild, piecesOf, piecesUsed, removeSet, setFallbackName, shareLink, type Build } from '../lib/build';
import { loadGear, loadHeroes, loadIndex, loadRtaBuilds } from '../lib/data';
import { artifactIcon, setIcon } from '../lib/images';
import type { ArtifactInfo, HeroSummary } from '../shared/types';

type Load = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ok'; heroes: HeroSummary[]; artifacts: ArtifactInfo[]; setNames: Record<string, string> };

/**
 * Build maker: choose a hero, up to three gear sets, an artifact and a note. The build is kept in the address (`#/tools/build?h=…&s=…&a=…&n=…`, see lib/build.ts),
 * so copying the address shares it: whoever opens it sees the same card, with nothing saved on a server.
 */
export default function BuildPage() {
  const { t, name, locale, lang } = useI18n();
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [b, setB] = useState<Build>(() => parseBuild(location.hash));
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let live = true;
    (async () => {
      const period = (await loadIndex())?.periods[0];
      if (!period) throw new Error('no data');
      const [heroes, gear, builds] = await Promise.all([loadHeroes(period), loadGear(period).catch(() => null), loadRtaBuilds().catch(() => null)]);
      if (live) setLoad({ status: 'ok', heroes, artifacts: Object.values(gear?.artifacts ?? {}), setNames: builds?.setNames ?? {} });
    })().catch((e: unknown) => live && setLoad({ status: 'error', message: String(e) }));
    return () => { live = false; };
  }, []);
  useEffect(() => { history.replaceState(null, '', buildHash(b)); }, [b]); // the build stays in the address without a new history entry

  const head = (
    <>
      <h1 className="page-title">{t('tools.buildTitle')}</h1>
      <p className="lede">{t('build.lede')}</p>
    </>
  );
  if (load.status === 'loading') return <p className="note">{t('common.loading')}</p>;
  if (load.status === 'error') return <p className="note error">{t('common.failed', { message: load.message })}</p>;
  const { heroes, artifacts, setNames } = load;

  const hero = heroes.find((h) => h.code === b.hero);
  const artifact = artifacts.find((a) => a.code === b.artifact);
  const heroName = (h: HeroSummary) => name.hero(h.code, h.name);
  const setName = (code: string) => name.set(code, setNames[code] ?? setFallbackName(code));
  // an artifact is for one class or for all (job "NN"); the one in a shared link stays offered even if it is not
  const options = artifacts.filter((a) => hero && (a.job === 'NN' || a.job === hero.job || a.code === b.artifact)).sort((x, y) => name.artifact(x.code, x.name).localeCompare(name.artifact(y.code, y.name), locale));
  const used = piecesUsed(b.sets);
  const worn = [...new Set(b.sets)].map((c) => [c, b.sets.filter((x) => x === c).length] as const); // a set taken twice is shown once, "x2"
  const copy = async () => {
    try { await navigator.clipboard.writeText(SHARE_BASE ? shareLink(SHARE_BASE, b, lang) : location.href); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* the address bar still holds the link */ }
  };

  return (
    <div className="build-maker">
      {head}
      {hero ? (
        <article className="panel build build-card" aria-label={t('build.card')}>
          <HeroFace code={hero.code} name={heroName(hero)} className="face portrait" />
          <div>
            <h2><a href={`#/hero/${hero.code}`}>{heroName(hero)}</a></h2>
            <p className="tags">{hero.grade}★ <ElementIcon element={hero.element} /> <JobIcon job={hero.job} /></p>
            {b.sets.length > 0 && (
              <div className="build-row">
                <span className="build-label">{t('loadout.sets')}</span>
                <span className="build-set">{worn.map(([c]) => <Icon key={c} src={setIcon(c)} />)}<strong>{worn.map(([c, n]) => setName(c) + (n > 1 ? ` ×${n}` : '')).join(' + ')}</strong></span>
              </div>
            )}
            {b.artifact && (
              <div className="build-row">
                <span className="build-label">{t('loadout.artifacts')}</span>
                <span className="art-tiles">
                  <a href={`#/artifact/${b.artifact}`} className="art-tile" title={artifact?.description}>
                    <Icon src={artifactIcon(b.artifact)} className="art-icon" />
                    <span>{artifact ? name.artifact(artifact.code, artifact.name) : b.artifact}</span>
                  </a>
                </span>
              </div>
            )}
            {b.note && <p className="build-note">{b.note}</p>}
            <button type="button" className="tab" onClick={copy}>{copied ? t('build.copied') : t('build.copy')}</button>
          </div>
        </article>
      ) : <p className="note">{t('build.empty')}</p>}

      <section className="panel build-editor">
        <div className="field">
          <span>{t('build.hero')}</span>
          <Picker
            label={t('build.hero')} value={hero ? b.hero : ''} placeholder={t('build.pickHero')} empty={t('build.noMatch')}
            options={[...heroes].sort((x, y) => heroName(x).localeCompare(heroName(y), locale)).map((h) => ({ value: h.code, label: heroName(h), alt: h.name, icon: <HeroIcon code={h.code} name={heroName(h)} decorative /> }))}
            onChange={(code) => setB({ ...b, hero: code, artifact: '' })}
          />
        </div>
        <div className="field" role="group" aria-label={t('build.sets')}>
          <span>{t('build.sets')}</span>
          <p className="caption">{t('build.setsHelp')}</p>
          <p className="caption" aria-live="polite">{t('build.pieces', { n: used })}</p>
          {worn.length > 0 && (
            <ul className="chips set-chosen">
              {b.sets.map((c, k) => (
                <li key={`${c}-${k}`}>
                  <button type="button" className="chosen" aria-label={t('build.remove', { name: setName(c) })} onClick={() => setB((cur) => ({ ...cur, sets: removeSet(cur.sets, c) }))}>
                    <Icon src={setIcon(c)} /><span>{setName(c)}</span><em>{piecesOf(c)}</em><span aria-hidden>×</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <ul className="set-grid">
            {SETS.map((code) => (
              <li key={code}>
                <button type="button" className="draft-hero" data-state="free" disabled={addSet(b.sets, code) === b.sets} onClick={() => setB((cur) => ({ ...cur, sets: addSet(cur.sets, code) }))}>
                  <Icon src={setIcon(code)} /><span>{setName(code)}</span><em className="order">{piecesOf(code)}</em>
                </button>
              </li>
            ))}
          </ul>
        </div>
        <div className="field">
          <span>{t('build.artifact')}</span>
          <Picker
            label={t('build.artifact')} value={b.artifact} placeholder={t('build.noArtifact')} none={t('build.noArtifact')} empty={t('build.noMatch')} disabled={!hero}
            options={options.map((a) => ({ value: a.code, label: name.artifact(a.code, a.name), alt: a.name, icon: <Icon src={artifactIcon(a.code)} className="hicon art" /> }))}
            onChange={(code) => setB({ ...b, artifact: code })}
          />
        </div>
        <label className="field">
          <span>{t('build.note')}</span>
          <textarea value={b.note} maxLength={NOTE_MAX} rows={3} placeholder={t('build.notePlaceholder')} onChange={(e) => setB({ ...b, note: e.target.value })} />
          <small>{b.note.length}/{NOTE_MAX}</small>
        </label>
        <p className="caption">{t('build.share')}</p>
        <button type="button" className="tab" onClick={() => setB(EMPTY)}>{t('build.reset')}</button>
      </section>
    </div>
  );
}
