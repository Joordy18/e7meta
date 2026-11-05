import { normalize } from './data';
import type { ArenaSeason, ArenaTier } from '../shared/types';

export const TIERS: [ArenaTier, string][] = [['champion', 'Champion+'], ['warlord', 'Warlord+'], ['emperor', 'Emperor+'], ['legend', 'Legend+']];

export type ArenaStat = { rank: number; rate: number; ban?: number; win?: number }; // rank = place in the season's top 20 of that table
export type HeroArenaRow = { tier: ArenaTier; pick?: ArenaStat; firstPick?: ArenaStat; preBan?: ArenaStat };

/**
 * What a season's infographic says about one hero, per league tier. Only the top 20 of each table is published,
 * so a tier (or the whole result) is missing when the hero is not in it. Heroes are matched by name.
 */
export function heroArena(season: ArenaSeason, name: string): HeroArenaRow[] {
  const key = normalize(name);
  const find = <T extends { hero: string }>(rows: T[]) => {
    const i = rows.findIndex((r) => normalize(r.hero) === key);
    return i < 0 ? undefined : { rank: i + 1, row: rows[i] };
  };
  const out: HeroArenaRow[] = [];
  for (const [tier] of TIERS) {
    const pick = find(season.pick[tier]);
    const firstPick = find(season.firstPick[tier]);
    const preBan = find(season.preBan[tier]);
    if (!pick && !firstPick && !preBan) continue;
    out.push({
      tier,
      ...(pick ? { pick: { rank: pick.rank, rate: pick.row.rate, ban: pick.row.ban, win: pick.row.win } } : {}),
      ...(firstPick ? { firstPick: { rank: firstPick.rank, rate: firstPick.row.rate, ban: firstPick.row.ban, win: firstPick.row.win } } : {}),
      ...(preBan ? { preBan: { rank: preBan.rank, rate: preBan.row.rate } } : {}),
    });
  }
  return out;
}
