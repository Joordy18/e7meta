import { createClient } from './api';
import { mapTeams } from './map';
import type { Modes, Team, Teams } from '../../src/shared/types';

type Client = ReturnType<typeof createClient>;

const TOP_HEROES = 15; // heroes per mode list whose teams are fetched: the ones most used there
const TEAMS_PER_HERO = 5;

/** Where a mode list id (hunt-2-13, abyss-120, challenge-20, expedition-5-3) is asked for its teams. */
function request(id: string): { path: string; params: Record<string, string>; field: 'specific_gravity' | 'success_rate' } | undefined {
  let m = /^hunt-(\d+)-(\d+)$/.exec(id);
  if (m) return { path: 'hunt/hero-team-ranking', params: { dungeon: m[1], stage: m[2] }, field: 'specific_gravity' };
  m = /^abyss-(\d+)$/.exec(id);
  if (m) return { path: 'abyss/hero-team-ranking', params: { floor: m[1] }, field: 'specific_gravity' };
  m = /^challenge-(\d+)$/.exec(id);
  if (m) return { path: 'abyss-challenge/hero-team-ranking', params: { floor: m[1] }, field: 'specific_gravity' };
  m = /^expedition-(\d+)-(\d+)$/.exec(id);
  if (m) return { path: 'expedition/team-ranking', params: { boss_type: m[1], boss_level: m[2] }, field: 'success_rate' };
  return undefined;
}

/**
 * The best teams for the top heroes of every mode list. A call that fails is skipped (and logged):
 * team rankings must never block the rest. Returns undefined when nothing could be fetched.
 */
export async function fetchTeams(client: Client, modes: Modes, log: (m: string) => void): Promise<Teams | undefined> {
  const lists: Teams['lists'] = {};
  let calls = 0;
  let failed = 0;
  for (const list of modes.lists) {
    const req = request(list.id);
    if (!req) continue;
    for (const hero of list.heroes.slice(0, TOP_HEROES)) {
      calls++;
      try {
        const raw = await client.get(req.path, {
          world_code: 'world_global', lang_code: 'en', current_page: '1', is_paging: 'N', ...req.params, hero_code: hero.code,
        });
        const teams: Team[] = mapTeams(raw, req.field).slice(0, TEAMS_PER_HERO);
        if (teams.length > 0) (lists[list.id] ??= {})[hero.code] = teams;
      } catch (e) {
        failed++;
        if (failed <= 3) log(`teams: ${list.id} ${hero.code} failed: ${(e as Error).message}`);
      }
    }
  }
  if (Object.keys(lists).length === 0) {
    log(`teams: nothing fetched (${failed}/${calls} calls failed), teams.json not written`);
    return undefined;
  }
  log(`teams: ${calls - failed}/${calls} calls ok`);
  return { key: modes.key, lists };
}
