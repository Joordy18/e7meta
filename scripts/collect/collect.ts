import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createClient } from './api';
import { mapDetail, mapHeroList, mapPeriod, mapSetNames, mapShares } from './map';
import type { HeroSnapshot, HeroSummary, Index } from '../../src/shared/types';

type Client = ReturnType<typeof createClient>;
const WEARING = 'wearing-status/';
const MAX_FAILURE_RATE = 0.05;

const exists = (p: string) => readFile(p).then(() => true, () => false);
const writeJson = async (p: string, data: unknown) => {
  await mkdir(join(p, '..'), { recursive: true });
  await writeFile(p, JSON.stringify(data));
};

async function fetchHeroList(client: Client): Promise<HeroSummary[]> {
  const byCode = new Map<string, HeroSummary>();
  for (let page = 1; ; page++) {
    const raw = await client.get(`${WEARING}hero-list`, {
      world_code: 'world_global', lang_code: 'fr', current_page: String(page), is_paging: 'N',
    });
    const heroes = mapHeroList(raw);
    if (heroes.length === 0) return [...byCode.values()];
    for (const h of heroes) byCode.set(h.code, h);
  }
}

export async function collect(opts: {
  outDir: string; client: Client; force?: boolean; log?: (m: string) => void;
}): Promise<'written' | 'skipped' | 'failed'> {
  const { outDir, client, force = false, log = () => {} } = opts;
  const wearingParams = { world_code: 'world_global', lang_code: 'fr', current_page: '1', is_paging: 'N' };
  const period = mapPeriod(await client.get(`${WEARING}last-update-time`, {}));
  const huntPeriod = mapPeriod(await client.get('hunt/last-update-time', {}));
  const snapDir = join(outDir, period.start);
  if (!force && (await exists(join(snapDir, 'heroes.json')))) {
    log(`period ${period.start} already collected`);
    return 'skipped';
  }

  const heroes = await fetchHeroList(client);
  log(`${heroes.length} heroes, period ${period.start}, hunt period ${huntPeriod.start}`);

  let setNames: Record<string, string> | undefined;
  const done: HeroSummary[] = [];
  let failed = 0;
  for (const [i, hero] of heroes.entries()) {
    try {
      const params = { ...wearingParams, hero_code: hero.code };
      const equipRaw = await client.get(`${WEARING}hero-equip-ranking`, params);
      const artifactRaw = await client.get(`${WEARING}hero-artifact-ranking`, params);
      setNames ??= mapSetNames(equipRaw);
      const snap: HeroSnapshot = {
        hero, period, sets: mapShares(equipRaw, 'set'), artifacts: mapShares(artifactRaw, 'artifact'),
      };
      try {
        const detailRaw = await client.get('hunt/hero-detail-for-game', {
          world_code: 'world_global', stage: '1', lang_code: 'fr', hero_code: hero.code,
          strategy_type: '0', boss_type: '1',
        });
        const detail = mapDetail(detailRaw, huntPeriod, setNames);
        if (detail) snap.detail = detail;
      } catch (e) {
        log(`no detail for ${hero.code}: ${(e as Error).message}`);
      }
      await writeJson(join(snapDir, 'hero', `${hero.code}.json`), snap);
      done.push(hero);
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

  await writeJson(join(snapDir, 'heroes.json'), done);
  const indexPath = join(outDir, 'index.json');
  const prev: Index = (await exists(indexPath)) ? JSON.parse(await readFile(indexPath, 'utf8')) : { periods: [] };
  const periods = [...new Set([period.start, ...prev.periods])].sort().reverse();
  await writeJson(indexPath, { periods } satisfies Index);
  return 'written';
}

// shortcut: argv[1] compare only works for `tsx scripts/collect/collect.ts`; fine for npm run collect
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await collect({
    outDir: 'public/data',
    client: createClient(),
    force: process.argv.includes('--force'),
    log: console.log,
  });
  console.log(result);
  if (result === 'failed') process.exitCode = 1;
}
