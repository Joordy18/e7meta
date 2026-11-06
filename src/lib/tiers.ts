import { modeAverages } from './home';
import type { ModeList, Modes } from '../shared/types';

export type TierLetter = 'S' | 'A' | 'B' | 'C' | 'D';
export type TierRow = { tier: TierLetter; heroes: { code: string; name: string; share: number }[] };

/** A hero is in the first tier whose limit its share reaches, as a part of the share of the most used hero of the mode. */
export const TIER_RULES: [TierLetter, number][] = [['S', 0.5], ['A', 0.25], ['B', 0.1], ['C', 0.03], ['D', 0]];
const MODES: ModeList['mode'][] = ['hunts', 'abyss', 'expedition'];
const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * The heroes of a mode (or of all the PvE: the mean of the three modes, a mode without the hero counting as 0) grouped by tier, best tier first,
 * best hero first inside a tier. A tier with nobody in it is left out.
 */
export function tierList(modes: Modes, mode: ModeList['mode'] | 'all'): TierRow[] {
  const present = MODES.filter((m) => modes.lists.some((l) => l.mode === m));
  const wanted = mode === 'all' ? present : present.filter((m) => m === mode);
  if (wanted.length === 0) return [];
  const sums = new Map<string, { name: string; sum: number }>();
  for (const m of wanted) {
    for (const [code, e] of modeAverages(modes, m)) {
      const cur = sums.get(code) ?? { name: e.name, sum: 0 };
      cur.sum += e.share;
      sums.set(code, cur);
    }
  }
  const shares = [...sums].map(([code, e]) => ({ code, name: e.name, share: e.sum / wanted.length }));
  const top = Math.max(...shares.map((h) => h.share));
  if (!(top > 0)) return [];
  const rows: TierRow[] = TIER_RULES.map(([tier]) => ({ tier, heroes: [] }));
  for (const h of shares.sort((a, b) => b.share - a.share || a.code.localeCompare(b.code))) {
    const at = TIER_RULES.findIndex(([, limit]) => h.share / top >= limit);
    rows[at].heroes.push({ code: h.code, name: h.name, share: round2(h.share) });
  }
  return rows.filter((r) => r.heroes.length > 0);
}
