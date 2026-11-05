import { createClient } from './api';
import { mapModeList, mapPeriod, mapRift } from './map';
import type { ModeList, Modes, Period } from '../../src/shared/types';

type Client = ReturnType<typeof createClient>;

// Ids come from the official guide's own pages (hunt: ?dungeon=&stage=, expedition: ?bosstype=, abyss: ?floor=).
const HUNT_BOSSES: [number, string][] = [[1, 'Wyvern'], [2, 'Golem'], [3, 'Banshee'], [4, 'Azimanak'], [5, 'Caides']];
const HUNT_STAGES: [number, string][] = [[13, 'Hell'], [11, 'Hard'], [9, 'Normal']];
const ABYSS_FLOORS = [120, 110, 100, 90, 80, 70, 60, 50, 40, 30, 20, 10];
const EXPEDITION_BOSSES: [number, string][] = [[1, 'Pherus'], [2, 'Snag Lich'], [3, 'Symaqus'], [4, 'Gigantes'], [5, 'Moroi']];
const EXPEDITION_LEVELS = [1, 2, 3];

const base = { world_code: 'world_global', lang_code: 'en' };

/**
 * Hero success-rate rankings for hunts, abyss and expeditions, plus the Rift season.
 * A list that fails is skipped (and logged): other modes must never block the hero snapshot.
 * Returns undefined when no list could be fetched.
 */
export async function fetchModes(client: Client, huntPeriod: Period, log: (m: string) => void): Promise<Modes | undefined> {
  const periodOf = async (path: string): Promise<Period | undefined> => {
    try { return mapPeriod(await client.get(path, { world_code: 'world_global' })); } catch (e) {
      log(`modes: no period for ${path}: ${(e as Error).message}`);
      return undefined;
    }
  };
  const abyssPeriod = await periodOf('abyss/last-update-time');
  const expeditionPeriod = await periodOf('expedition/last-update-time');

  const lists: ModeList[] = [];
  let failed = 0;
  const add = async (
    id: string, mode: ModeList['mode'], group: string, variant: string, title: string, period: Period | undefined,
    path: string, params: Record<string, string>, field: 'specific_gravity' | 'success_rate',
  ) => {
    try {
      const heroes = mapModeList(await client.get(path, { ...base, ...params }), field);
      lists.push({ id, mode, title, group, variant, ...(period ? { period } : {}), heroes });
    } catch (e) {
      failed++;
      log(`modes: ${id} failed: ${(e as Error).message}`);
    }
  };

  for (const [dungeon, boss] of HUNT_BOSSES) {
    for (const [stage, diff] of HUNT_STAGES) {
      await add(`hunt-${dungeon}-${stage}`, 'hunts', `${boss} Hunt`, diff, `${boss} Hunt, ${diff}`, huntPeriod,
        'hunt/hero-ranking/all', { dungeon: String(dungeon), stage: String(stage) }, 'specific_gravity');
    }
  }
  for (const floor of ABYSS_FLOORS) {
    await add(`abyss-${floor}`, 'abyss', 'Abyss', `Floor ${floor}`, `Abyss, floor ${floor}`, abyssPeriod,
      'abyss/hero-ranking/all', { floor: String(floor) }, 'specific_gravity');
  }
  for (const [boss, name] of EXPEDITION_BOSSES) {
    for (const level of EXPEDITION_LEVELS) {
      await add(`expedition-${boss}-${level}`, 'expedition', `${name} Expedition`, `Level ${level}`, `${name} Expedition, level ${level}`, expeditionPeriod,
        'expedition/ranking/all', { boss_type: String(boss), boss_level: String(level) }, 'success_rate');
    }
  }

  let rift: Modes['rift'];
  try { rift = mapRift(await client.get('crack/info', base)); } catch (e) { log(`modes: rift info failed: ${(e as Error).message}`); }

  if (lists.length === 0) {
    log('modes: nothing fetched, modes.json not written');
    return undefined;
  }
  log(`modes: ${lists.length} lists${failed ? `, ${failed} failed` : ''}`);
  return { key: huntPeriod.start, lists, ...(rift ? { rift } : {}) };
}
