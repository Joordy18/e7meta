import type { RtaStats } from '../shared/types';

export const MIN_PLAYED = 20; // below this many games a win rate says nothing

export type RtaRow = { code: string; pick: number; win: number | null; ban: number; preban: number; first: number; played: number }; // rates in %

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Rates of every hero in the sample, best picked first. Pick, ban, pre-ban and first pick are shares of all battles;
 * the win rate is over the games the hero was played (null when it never was). Heroes with fewer than `minPlayed` games
 * are left out, except those that are only ever pre-banned (they have no games, but their pre-ban rate matters).
 */
export function rtaRows(stats: RtaStats, minPlayed = MIN_PLAYED): RtaRow[] {
  const rate = (n: number) => round1((n / stats.battles) * 100);
  return Object.entries(stats.heroes)
    .filter(([, c]) => c.played >= minPlayed || (c.pick === 0 && c.preban >= minPlayed))
    .map(([code, c]) => ({
      code, pick: rate(c.pick), win: c.played > 0 ? round1((c.win / c.played) * 100) : null,
      ban: rate(c.ban), preban: rate(c.preban), first: rate(c.first), played: c.played,
    }))
    .sort((a, b) => b.pick - a.pick || b.preban - a.preban || a.code.localeCompare(b.code));
}

export const heroRta = (stats: RtaStats, code: string, minPlayed = MIN_PLAYED): RtaRow | undefined =>
  rtaRows(stats, minPlayed).find((r) => r.code === code);
