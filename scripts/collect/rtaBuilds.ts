import { mkdir, readdir, readFile } from 'node:fs/promises';
import { writeFileAtomic } from './atomic';
import { join } from 'node:path';
import type { Battle } from './rtaStore';
import type { RtaBuilds, RtaHeroBuilds } from '../../src/shared/types';

const TOP = 5; // most worn combinations / artifacts kept per hero
const MIN_BUILDS = 20; // a hero seen with a build fewer times than this has no list

/**
 * The game lists a set once per two pieces ("set_speed" twice and "set_immune" once = 4 + 2). The combination is the distinct sets,
 * the one with the most pieces first (equal pieces: by code), which tells a 4 + 2 from a 2 + 4.
 */
function combo(sets: string[]): string[] {
  const pieces = new Map<string, number>();
  for (const s of sets) pieces.set(s, (pieces.get(s) ?? 0) + 2);
  return [...pieces].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([code]) => code);
}

const top = <T extends { n: number }>(counts: Map<string, number>, make: (key: string, n: number) => T): T[] =>
  [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, TOP).map(([key, n]) => make(key, n));

/** For each hero, the set combinations and the artifacts it was seen with in the battles (both sides count). */
export function buildStats(battles: Battle[], minBuilds = MIN_BUILDS): Record<string, RtaHeroBuilds> {
  const by = new Map<string, { sets: Map<string, number>; setsN: number; arts: Map<string, number>; artsN: number }>();
  for (const b of battles) {
    for (const d of b.decks) {
      for (const h of d.heroes) {
        if (!h.sets?.length && !h.artifact) continue;
        const e = by.get(h.code) ?? { sets: new Map(), setsN: 0, arts: new Map(), artsN: 0 };
        by.set(h.code, e);
        if (h.sets?.length) {
          const key = combo(h.sets).join(',');
          e.sets.set(key, (e.sets.get(key) ?? 0) + 1);
          e.setsN++;
        }
        if (h.artifact) { e.arts.set(h.artifact, (e.arts.get(h.artifact) ?? 0) + 1); e.artsN++; }
      }
    }
  }
  const out: Record<string, RtaHeroBuilds> = {};
  for (const [code, e] of [...by].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (Math.max(e.setsN, e.artsN) < minBuilds) continue;
    out[code] = {
      sets: { n: e.setsN, combos: top(e.sets, (key, n) => ({ sets: key.split(','), n })) },
      artifacts: { n: e.artsN, top: top(e.arts, (code2, n) => ({ code: code2, n })) },
    };
  }
  return out;
}

const readJson = async <T>(p: string): Promise<T | undefined> => { try { return JSON.parse(await readFile(p, 'utf8')) as T; } catch { return undefined; } };

/** English names of the codes the builds mention: artifacts from gear.json, sets from the set lists of the hero snapshots of the latest week. */
async function namesOf(outDir: string, artifacts: Set<string>, sets: Set<string>) {
  const period = (await readJson<{ periods: string[] }>(join(outDir, 'index.json')))?.periods[0];
  const artifactNames: Record<string, string> = {};
  const setNames: Record<string, string> = {};
  if (!period) return { artifactNames, setNames };
  const gear = await readJson<{ artifacts: Record<string, { name: string }> }>(join(outDir, period, 'gear.json'));
  for (const code of artifacts) if (gear?.artifacts[code]) artifactNames[code] = gear.artifacts[code].name;
  const files = await readdir(join(outDir, period, 'hero')).catch(() => [] as string[]);
  for (const f of files) {
    if (Object.keys(setNames).length >= sets.size) break; // every code found
    const snap = await readJson<{ sets?: { code: string; name: string }[] }>(join(outDir, period, 'hero', f));
    for (const s of snap?.sets ?? []) if (sets.has(s.code)) setNames[s.code] = s.name;
  }
  return { artifactNames, setNames };
}

/** Writes rta/builds.json: the builds of each hero seen in the accumulated battles, with the names needed to show them. */
export async function writeBuilds(opts: { outDir: string; season: string; battles: Battle[]; now: () => string; minBuilds?: number }): Promise<void> {
  const { outDir, season, battles, now, minBuilds } = opts;
  const heroes = buildStats(battles, minBuilds);
  const artifacts = new Set<string>();
  const sets = new Set<string>();
  for (const h of Object.values(heroes)) {
    for (const a of h.artifacts.top) artifacts.add(a.code);
    for (const c of h.sets.combos) for (const s of c.sets) sets.add(s);
  }
  const { artifactNames, setNames } = await namesOf(outDir, artifacts, sets);
  const builds: RtaBuilds = { code: season, updated: now(), heroes, setNames, artifactNames };
  await mkdir(join(outDir, 'rta'), { recursive: true });
  await writeFileAtomic(join(outDir, 'rta', 'builds.json'), JSON.stringify(builds));
}
