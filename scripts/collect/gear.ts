import { createClient } from './api';
import { mapArtifactList, mapModeList, mapSetList } from './map';
import type { ArtifactInfo, Gear, SetInfo } from '../../src/shared/types';

type Client = ReturnType<typeof createClient>;

const MAX_PAGES = 20; // 268 artifacts = 6 pages of 50; guards against an API that ignores current_page
const HEROES_PER_ITEM = 10;
const base = { world_code: 'world_global', lang_code: 'en', is_paging: 'N' };

/**
 * Every artifact and set with its stats, effect and the heroes wearing it most.
 * A failing hero lookup leaves that item's hero list empty (logged); a failing catalog means no gear.json (undefined).
 */
export async function fetchGear(client: Client, key: string, log: (m: string) => void): Promise<Gear | undefined> {
  const W = 'wearing-status/';
  const artifacts: Record<string, ArtifactInfo> = {};
  const sets: Record<string, SetInfo> = {};
  try {
    for (let page = 1; page <= MAX_PAGES; page++) {
      const found = mapArtifactList(await client.get(`${W}artifact-list`, { ...base, current_page: String(page) }));
      const fresh = found.filter((a) => !artifacts[a.code]);
      if (fresh.length === 0) break;
      for (const a of fresh) artifacts[a.code] = { ...a, heroes: [] };
    }
    for (const s of mapSetList(await client.get(`${W}equip-list`, { ...base, current_page: '1' }))) sets[s.code] = { ...s, heroes: [] };
  } catch (e) {
    log(`gear: catalog failed: ${(e as Error).message}`);
    return undefined;
  }
  let failed = 0;
  const heroesOf = async (path: string, params: Record<string, string>) => {
    try {
      return mapModeList(await client.get(path, { ...base, current_page: '1', ...params }), 'specific_gravity').slice(0, HEROES_PER_ITEM);
    } catch (e) {
      if (++failed <= 3) log(`gear: ${path} ${JSON.stringify(params)} failed: ${(e as Error).message}`);
      return [];
    }
  };
  for (const a of Object.values(artifacts)) a.heroes = await heroesOf(`${W}artifact-hero-ranking`, { artifact_code: a.code });
  for (const s of Object.values(sets)) s.heroes = await heroesOf(`${W}equip-hero-ranking`, { equip_code: s.code });
  log(`gear: ${Object.keys(artifacts).length} artifacts, ${Object.keys(sets).length} sets${failed ? `, ${failed} hero lookups failed` : ''}`);
  if (Object.keys(artifacts).length === 0) {
    log('gear: empty catalog, gear.json not written');
    return undefined;
  }
  return { key, artifacts, sets };
}
