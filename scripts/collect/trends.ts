import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { BuildShift, HeroSnapshot, Trends } from '../../src/shared/types';

const MIN_SHARE = 5; // an item under 5% in both weeks is noise
const MIN_MOVE = 0.5; // points: a smaller change is not a shift
const KEEP = 20;
const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * The biggest changes, in points, in how many players wear each set or artifact of a hero between two weeks.
 * Heroes that exist (or have data) in only one of the weeks are left out; an item missing from a week counts as 0% there.
 */
export function buildShifts(prev: HeroSnapshot[], cur: HeroSnapshot[], n: number): BuildShift[] {
  const before = new Map(prev.map((h) => [h.hero.code, h]));
  const out: BuildShift[] = [];
  for (const h of cur) {
    const p = before.get(h.hero.code);
    const empty = (x: HeroSnapshot) => x.sets.length === 0 && x.artifacts.length === 0; // no data that week: new release, not a shift
    if (!p || empty(p) || empty(h)) continue;
    for (const [kind, list] of [['set', 'sets'], ['artifact', 'artifacts']] as const) {
      const a = new Map(p[list].map((e) => [e.code, e]));
      const b = new Map(h[list].map((e) => [e.code, e]));
      for (const code of new Set([...a.keys(), ...b.keys()])) {
        const x = a.get(code)?.share ?? 0;
        const y = b.get(code)?.share ?? 0;
        if (Math.max(x, y) < MIN_SHARE || Math.abs(y - x) < MIN_MOVE) continue;
        const item = (b.get(code) ?? a.get(code))!.name;
        out.push({ hero: h.hero.code, name: h.hero.name, kind, code, item, before: round2(x), after: round2(y) });
      }
    }
  }
  const size = (s: BuildShift) => Math.abs(s.after - s.before);
  return out.sort((p, q) => size(q) - size(p) || p.hero.localeCompare(q.hero) || p.code.localeCompare(q.code)).slice(0, n);
}

const readJson = async <T>(p: string): Promise<T | undefined> => {
  try { return JSON.parse(await readFile(p, 'utf8')) as T; } catch { return undefined; }
};

/**
 * Writes trends.json: the build shifts between the latest week and the one before. Computed from the files already on disk
 * (no API call); redone only when a newer week appears. 'skipped' when it is up to date or there are fewer than two weeks.
 */
export async function refreshTrends(opts: { outDir: string; log?: (m: string) => void }): Promise<'written' | 'skipped'> {
  const { outDir, log = () => {} } = opts;
  const periods = (await readJson<{ periods: string[] }>(join(outDir, 'index.json')))?.periods ?? [];
  if (periods.length < 2) return 'skipped';
  const [to, from] = periods;
  const path = join(outDir, 'trends.json');
  const existing = await readJson<Trends>(path);
  if (existing?.to === to && existing.from === from) return 'skipped';

  const codes = ((await readJson<{ code: string }[]>(join(outDir, to, 'heroes.json'))) ?? []).map((h) => h.code);
  const prev: HeroSnapshot[] = [];
  const cur: HeroSnapshot[] = [];
  for (const code of codes) {
    const a = await readJson<HeroSnapshot>(join(outDir, from, 'hero', `${code}.json`));
    const b = await readJson<HeroSnapshot>(join(outDir, to, 'hero', `${code}.json`));
    if (a && b) { prev.push(a); cur.push(b); }
  }
  const builds = buildShifts(prev, cur, KEEP);
  await mkdir(outDir, { recursive: true });
  await writeFile(path, JSON.stringify({ from, to, builds } satisfies Trends));
  log(`trends: ${builds.length} shifts between ${from} and ${to}`);
  return 'written';
}

// shortcut: argv[1] compare only works for `tsx scripts/collect/trends.ts`; fine for npm run trends
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(await refreshTrends({ outDir: 'public/data', log: console.log }));
}
