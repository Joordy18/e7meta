import { normalize } from './data';
import type { ArenaSeason, ArenaTier, DraftRow, ModeList, Modes, PreBanRow } from '../shared/types';

const round2 = (n: number) => Math.round(n * 100) / 100;

export type Leader = { code: string; name: string; share: number; delta?: number };

/** Average share of each hero over the rankings of a mode (a ranking that lacks the hero counts as 0). */
export function modeAverages(modes: Modes, mode: ModeList['mode']) {
  const lists = modes.lists.filter((l) => l.mode === mode);
  const sums = new Map<string, { name: string; sum: number }>();
  for (const l of lists) {
    for (const h of l.heroes) {
      if (!h.name) continue; // data collected before nameless entries were dropped
      const e = sums.get(h.code) ?? { name: h.name, sum: 0 };
      e.sum += h.share;
      sums.set(h.code, e);
    }
  }
  return new Map([...sums].map(([code, e]) => [code, { name: e.name, share: e.sum / lists.length }]));
}

/**
 * The heroes used most in a mode: the average of their share over its rankings, best first. With a previous week,
 * `delta` is the change in points (only pass one that holds different data, or every change is 0).
 */
export function pveLeaders(modes: Modes, mode: ModeList['mode'], n: number, prev?: Modes): Leader[] {
  const now = modeAverages(modes, mode);
  const before = prev ? modeAverages(prev, mode) : undefined;
  return [...now]
    .map(([code, e]) => ({
      code, name: e.name, share: round2(e.share),
      ...(before ? { delta: round2(e.share - (before.get(code)?.share ?? 0)) } : {}),
    }))
    .sort((a, b) => b.share - a.share || a.code.localeCompare(b.code))
    .slice(0, n);
}

export type ArenaLeader = DraftRow & { delta?: number; isNew?: boolean };

/** The most picked heroes of a league tier; `delta` is the change in pick rate against the previous season, `isNew` when it was not in that top 20. */
export function arenaLeaders(season: ArenaSeason, prev: ArenaSeason | undefined, tier: ArenaTier, n: number): ArenaLeader[] {
  const before = prev ? new Map(prev.pick[tier].map((r) => [normalize(r.hero), r.rate])) : undefined;
  return season.pick[tier].slice(0, n).map((r) => {
    if (!before) return { ...r };
    const old = before.get(normalize(r.hero));
    return old === undefined ? { ...r, isNew: true } : { ...r, delta: round2(r.rate - old) };
  });
}

export const preBanLeaders = (season: ArenaSeason, tier: ArenaTier, n: number): PreBanRow[] => season.preBan[tier].slice(0, n);
