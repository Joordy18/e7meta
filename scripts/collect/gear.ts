import { createClient } from './api';
import { mapArtifactList, mapModeList } from './map';
import type { ArtifactInfo, Gear } from '../../src/shared/types';

type Client = ReturnType<typeof createClient>;

const MAX_PAGES = 20; // 268 artifacts = 6 pages of 50; guards against an API that ignores current_page
const HEROES_PER_ARTIFACT = 10;
const base = { world_code: 'world_global', lang_code: 'en', is_paging: 'N' };
const catalog = { ...base, is_paging: 'Y' }; // with N the game drops one artifact at a page boundary (267 of 268)

/**
 * Every artifact with its stats, effect and the heroes wearing it most.
 * A failing hero lookup leaves that artifact's hero list empty (logged); a failing catalog means no gear.json (undefined).
 */
export async function fetchGear(client: Client, key: string, log: (m: string) => void): Promise<Gear | undefined> {
  const W = 'wearing-status/';
  const artifacts: Record<string, ArtifactInfo> = {};
  try {
    for (let page = 1; page <= MAX_PAGES; page++) {
      const found = mapArtifactList(await client.get(`${W}artifact-list`, { ...catalog, current_page: String(page) }));
      const fresh = found.filter((a) => !artifacts[a.code]);
      if (fresh.length === 0) break;
      for (const a of fresh) artifacts[a.code] = { ...a, heroes: [] };
    }
  } catch (e) {
    log(`gear: catalog failed: ${(e as Error).message}`);
    return undefined;
  }
  let failed = 0;
  for (const a of Object.values(artifacts)) {
    try {
      const raw = await client.get(`${W}artifact-hero-ranking`, { ...base, current_page: '1', artifact_code: a.code });
      a.heroes = mapModeList(raw, 'specific_gravity').slice(0, HEROES_PER_ARTIFACT);
    } catch (e) {
      if (++failed <= 3) log(`gear: heroes of ${a.code} failed: ${(e as Error).message}`);
    }
  }
  log(`gear: ${Object.keys(artifacts).length} artifacts${failed ? `, ${failed} hero lookups failed` : ''}`);
  if (Object.keys(artifacts).length === 0) {
    log('gear: empty catalog, gear.json not written');
    return undefined;
  }
  return { key, artifacts, ...(failed ? { failed } : {}) };
}
