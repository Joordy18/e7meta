import { HeroFace, Icon } from './Art';
import { formatValue } from './Bars';
import { artifactIcon, setIcon, skillIcon } from '../lib/images';
import { epic7dbUrl } from '../lib/links';
import Markdown from '../lib/markdown';
import { STATS, lowerBound, statTarget } from '../lib/statTargets';
import { elementLabel, jobLabel } from '../pages/HeroList';
import type { HeroSnapshot, SkillInfo, StatKey } from '../shared/types';

const AIM: StatKey[] = ['speed', 'critChance', 'critDamage', 'health'];
const LABEL = new Map(STATS);

function Identity({ hero }: { hero: HeroSnapshot['hero'] }) {
  return (
    <section aria-label="Hero" className="panel identity">
      <HeroFace code={hero.code} name={hero.name} className="face portrait" />
      <h1>{hero.name}</h1>
      <p className="tags">
        {hero.grade}★ <span className="el" data-el={hero.element} aria-hidden /> {elementLabel(hero.element)}, {jobLabel(hero.job)}
      </p>
    </section>
  );
}

/** What most players run on this hero, at a glance. The sources and periods behind each figure are listed in the sections below. */
function Build({ hero }: { hero: HeroSnapshot }) {
  const combo = hero.detail?.combos[0];
  const set = combo
    ? { icons: (combo.codes ?? []).map(setIcon), label: combo.sets.join(' + '), share: combo.share }
    : hero.sets[0] && { icons: [setIcon(hero.sets[0].code)], label: hero.sets[0].name, share: hero.sets[0].share };
  const ex = hero.exclusive?.[0];
  const aim = hero.detail
    ? AIM.flatMap((k) => {
        const t = statTarget(k, hero.detail!.stats[k]);
        const v = t && lowerBound(k, t.top25);
        return v && v !== 'Any' ? [{ k, v }] : [];
      })
    : [];
  return (
    <section aria-label="Recommended build" className="panel build">
      <h3>Recommended build</h3>
      {set && (
        <div className="build-row">
          <span className="build-label">Sets</span>
          <span className="build-set">
            {set.icons.map((src, i) => <Icon key={i} src={src} />)}
            <strong>{set.label}</strong>
            <em>{formatValue(set.share)}</em>
          </span>
        </div>
      )}
      {hero.artifacts.length > 0 && (
        <div className="build-row">
          <span className="build-label">Artifacts</span>
          <span className="art-tiles">
            {hero.artifacts.slice(0, 3).map((a) => (
              <a key={a.code} href={`#/artifact/${a.code}`} className="art-tile" title={a.effect}>
                <Icon src={artifactIcon(a.code)} className="art-icon" />
                <span>{a.name}</span>
                <em>{formatValue(a.share)}</em>
              </a>
            ))}
          </span>
        </div>
      )}
      {ex && (
        <div className="build-row">
          <span className="build-label">Exclusive equipment</span>
          <span className="build-set">
            <Icon src={skillIcon(hero.hero.code, ex.skill)} />
            <strong>{hero.skills?.[ex.skill - 1] ?? `Skill ${ex.skill}`}, option {ex.option}</strong>
            <em>{formatValue(ex.share)}</em>
          </span>
        </div>
      )}
      {aim.length > 0 && (
        <div className="build-row">
          <span className="build-label">Aim for</span>
          <ul className="aim" aria-label="Stats to aim for">
            {aim.map(({ k, v }) => <li key={k} title="The best-equipped quarter of players starts here">{LABEL.get(k)} <strong>{v}</strong></li>)}
          </ul>
        </div>
      )}
    </section>
  );
}

function SkillDetails({ skill, name, code, n }: { skill: SkillInfo; name: string; code: string; n: number }) {
  return (
    <details className="skill">
      <summary>
        <Icon src={skillIcon(code, n)} className="skill-icon" />
        <span className="skill-n">Skill {n}</span>
        <strong>{name}</strong>
        {skill.cooldown && <span className="chip">{skill.cooldown}</span>}
        {skill.soulGain !== undefined && <span className="chip">+{skill.soulGain} soul{skill.soulGain === 1 ? '' : 's'}</span>}
      </summary>
      <div className="skill-body">
        <Markdown source={skill.description} />
        {skill.effects.length > 0 && (
          <ul className="effects">{skill.effects.map((e) => <li key={e.name}><span title={e.text}>{e.name}</span></li>)}</ul>
        )}
        {skill.soulburn && <p className="soulburn"><strong>Soulburn</strong> {skill.soulburn}</p>}
        {skill.upgrades.length > 0 && (
          <>
            <h4>Enhancements</h4>
            <ol className="upgrades">{skill.upgrades.map((u) => <li key={u.level}><b>{u.level}</b>{u.text}</li>)}</ol>
          </>
        )}
      </div>
    </details>
  );
}

function Skills({ hero, data }: { hero: HeroSnapshot; data?: SkillInfo[] }) {
  const count = Math.max(hero.skills?.length ?? 0, data?.length ?? 0);
  if (count === 0) return null;
  const nameOf = (i: number) => hero.skills?.[i] ?? data?.[i]?.name ?? `Skill ${i + 1}`; // the game's own spelling wins
  const range = Array.from({ length: count }, (_, i) => i);
  return (
    <section aria-label="Skills" className="panel skills-panel">
      <h3>Skills</h3>
      {data ? (
        <div className="skill-list">
          {range.map((i) => (data[i] ? <SkillDetails key={i} skill={data[i]} name={nameOf(i)} code={hero.hero.code} n={i + 1} /> : null))}
        </div>
      ) : (
        <ul className="skills">
          {range.map((i) => (
            <li key={i}>
              <Icon src={skillIcon(hero.hero.code, i + 1)} className="skill-icon" />
              <span className="skill-n">Skill {i + 1}</span>
              <strong>{nameOf(i)}</strong>
            </li>
          ))}
        </ul>
      )}
      <p className="caption">
        {data ? 'Skill text from' : 'The game\'s guide gives the names only. Descriptions on'}{' '}
        <a href={epic7dbUrl(hero.hero.name)} target="_blank" rel="noopener noreferrer">epic7db.com</a>, a fan site.
      </p>
    </section>
  );
}

/** The top of a hero page: who it is, the build most players run, and what its skills do. */
export default function Loadout({ hero, skills }: { hero: HeroSnapshot; skills?: SkillInfo[] }) {
  return (
    <div className="loadout">
      <Identity hero={hero.hero} />
      <Build hero={hero} />
      <Skills hero={hero} data={skills} />
    </div>
  );
}
