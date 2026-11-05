import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createClient } from './api';
import { fetchModes } from './modes';
import { fetchTeams } from './teams';
import { mapDetail, mapHeroList, mapPeriod, mapSetNames, mapShares } from './map';
import type { HeroSnapshot, HeroSummary, Index, Modes, Period, Teams } from '../../src/shared/types';

type Client = ReturnType<typeof createClient>;
const LANG = 'en'; // the product is in English; names in the data come in this language
const WEARING = 'wearing-status/';
const MAX_FAILURE_RATE = 0.05;
const MAX_PAGES = 20; // 392 heroes = 8 pages of 50; guards against an API that ignores current_page

const exists = (p: string) => readFile(p).then(() => true, () => false);
const writeJson = async (p: string, data: unknown) => {
  await mkdir(join(p, '..'), { recursive: true });
  await writeFile(p, JSON.stringify(data));
};

/** Period folders on disk (YYYY-MM-DD holding a heroes.json), used to rebuild a missing or corrupt index. */
async function periodsOnDisk(outDir: string): Promise<string[]> {
  const dirs = await readdir(outDir, { withFileTypes: true }).catch(() => []);
  const found: string[] = [];
  for (const d of dirs) {
    if (d.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(d.name) && (await exists(join(outDir, d.name, 'heroes.json')))) found.push(d.name);
  }
  return found;
}

/** Periods listed by index.json; a missing or unreadable file lists none (unreadable is logged). */
async function readIndex(path: string, log: (m: string) => void): Promise<{ periods: string[]; valid: boolean }> {
  if (!(await exists(path))) return { periods: [], valid: false };
  try {
    const periods = JSON.parse(await readFile(path, 'utf8'))?.periods;
    if (Array.isArray(periods) && periods.every((p) => typeof p === 'string')) return { periods, valid: true };
  } catch { /* falls through to the warning */ }
  log(`warning: ${path} is unreadable, rebuilding it from the period folders on disk`);
  return { periods: [], valid: false };
}

async function fetchHeroList(client: Client, log: (m: string) => void): Promise<HeroSummary[]> {
  const byCode = new Map<string, HeroSummary>();
  for (let page = 1; page <= MAX_PAGES; page++) {
    const raw = await client.get(`${WEARING}hero-list`, {
      world_code: 'world_global', lang_code: LANG, current_page: String(page), is_paging: 'N',
    });
    const heroes = mapHeroList(raw);
    if (heroes.length === 0) break;
    const before = byCode.size;
    for (const h of heroes) byCode.set(h.code, h);
    if (byCode.size === before) {
      log(`hero-list page ${page} added no new hero, stopping`);
      break;
    }
    if (page === MAX_PAGES) log(`hero-list page cap ${MAX_PAGES} reached, stopping`);
  }
  return [...byCode.values()];
}

/**
 * modes.json and teams.json live in the period folder. Each is refetched when missing or fetched for an older hunt
 * period (or when forced); teams are built from the modes, so fresh modes always mean fresh teams.
 */
async function refreshModes(client: Client, snapDir: string, huntPeriod: Period, log: (m: string) => void, force: boolean) {
  const modesPath = join(snapDir, 'modes.json');
  const teamsPath = join(snapDir, 'teams.json');
  const readJson = async <T>(p: string): Promise<T | undefined> => {
    try { return JSON.parse(await readFile(p, 'utf8')) as T; } catch { return undefined; } // missing or unreadable: fetch it
  };
  let modes = force ? undefined : await readJson<Modes>(modesPath);
  let fresh = false;
  if (modes?.key !== huntPeriod.start) {
    modes = await fetchModes(client, huntPeriod, log);
    if (!modes) return;
    await writeJson(modesPath, modes);
    fresh = true;
  }
  const teams = force || fresh ? undefined : await readJson<Teams>(teamsPath);
  if (teams?.key === modes.key) return;
  const fetched = await fetchTeams(client, modes, log);
  if (fetched) await writeJson(teamsPath, fetched);
}

export async function collect(opts: {
  outDir: string; client: Client; force?: boolean; modesOnly?: boolean; log?: (m: string) => void;
}): Promise<'written' | 'skipped' | 'failed'> {
  const { outDir, client, force = false, modesOnly = false, log = () => {} } = opts;
  const wearingParams = { world_code: 'world_global', lang_code: LANG, current_page: '1', is_paging: 'N' };
  const period = mapPeriod(await client.get(`${WEARING}last-update-time`, {}));
  const huntPeriod = mapPeriod(await client.get('hunt/last-update-time', {}));
  const snapDir = join(outDir, period.start);
  const indexPath = join(outDir, 'index.json');
  if (modesOnly) {
    if (!(await exists(join(snapDir, 'heroes.json')))) {
      log(`no snapshot for period ${period.start}: run a full collect first`);
      return 'failed';
    }
    await refreshModes(client, snapDir, huntPeriod, log, true);
    return 'written';
  }
  const prev = await readIndex(indexPath, log);
  // heroes.json is written before the index: a period only counts as collected once the index lists it too
  if (!force && prev.periods.includes(period.start) && (await exists(join(snapDir, 'heroes.json')))) {
    log(`period ${period.start} already collected`);
    await refreshModes(client, snapDir, huntPeriod, log, false);
    return 'skipped';
  }

  const heroes = await fetchHeroList(client, log);
  log(`${heroes.length} heroes, period ${period.start}, hunt period ${huntPeriod.start}`);

  let setNames: Record<string, string> | undefined;
  // buffered: nothing touches disk until the failure gate passes, so a failed (even forced) run leaves the published snapshot intact
  const done: HeroSnapshot[] = [];
  let failed = 0;
  let noDetail = 0;
  for (const [i, hero] of heroes.entries()) {
    try {
      const params = { ...wearingParams, hero_code: hero.code };
      const equipRaw = await client.get(`${WEARING}hero-equip-ranking`, params);
      const artifactRaw = await client.get(`${WEARING}hero-artifact-ranking`, params);
      if (!setNames) {
        const names = mapSetNames(equipRaw);
        if (Object.keys(names).length > 0) setNames = names; // an empty ranking must not freeze an empty map
      }
      const sets = mapShares(equipRaw, 'set');
      const artifacts = mapShares(artifactRaw, 'artifact');
      const snap: HeroSnapshot = {
        hero: { ...hero, topSet: sets[0]?.share, topArtifact: artifacts[0]?.share }, period, sets, artifacts,
      };
      try {
        const detailRaw = await client.get('hunt/hero-detail-for-game', {
          world_code: 'world_global', stage: '1', lang_code: LANG, hero_code: hero.code,
          strategy_type: '0', boss_type: '1',
        });
        const detail = mapDetail(detailRaw, huntPeriod, setNames ?? {});
        if (detail) snap.detail = detail;
        else {
          noDetail++;
          log(`no detail for ${hero.code}`);
        }
      } catch (e) {
        noDetail++;
        log(`unexpected detail error for ${hero.code}: ${(e as Error).message}`);
      }
      done.push(snap);
    } catch (e) {
      failed++;
      log(`hero ${hero.code} failed: ${(e as Error).message}`);
    }
    if ((i + 1) % 25 === 0) log(`${i + 1}/${heroes.length} heroes`);
  }

  if (heroes.length === 0 || failed / heroes.length > MAX_FAILURE_RATE) {
    log(`${failed}/${heroes.length} heroes failed, snapshot not published`);
    return 'failed';
  }

  if (noDetail / heroes.length > 0.5) {
    log(`warning: ${noDetail}/${heroes.length} heroes without detail, the hunt schema may have changed`);
  }

  for (const snap of done) await writeJson(join(snapDir, 'hero', `${snap.hero.code}.json`), snap);
  await writeJson(join(snapDir, 'heroes.json'), done.map((s) => s.hero));
  const known = prev.valid ? prev.periods : await periodsOnDisk(outDir);
  const periods = [...new Set([period.start, ...known])].sort().reverse();
  await writeJson(indexPath, { periods } satisfies Index);
  await refreshModes(client, snapDir, huntPeriod, log, true);
  return 'written';
}

// shortcut: argv[1] compare only works for `tsx scripts/collect/collect.ts`; fine for npm run collect
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await collect({
    outDir: 'public/data',
    client: createClient(),
    force: process.argv.includes('--force'),
    modesOnly: process.argv.includes('--modes'),
    log: console.log,
  });
  console.log(result);
  if (result === 'failed') process.exitCode = 1;
}
