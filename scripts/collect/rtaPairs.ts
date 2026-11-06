import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Battle } from './rtaStore';
import type { RtaHeroPairs, RtaPairs, RtaPairEntry } from '../../src/shared/types';

const MIN_GAMES = 30; // a pair seen fewer times than this is never listed
const MIN_Z = 1.64; // and it must beat what its two heroes predict by more than chance would (one side, 95%)
const TOP = 5;

type Count = { n: number; w: number };
const bump = (m: Map<string, Count>, key: string, won: boolean) => {
  const c = m.get(key) ?? { n: 0, w: 0 };
  c.n++;
  if (won) c.w++;
  m.set(key, c);
};

/**
 * For each hero, the heroes it works well with (same team), wins against and loses against (opposite team) in the accumulated battles.
 * A pair is judged against what its heroes predict alone, not against 50%, so a strong hero is not credited to everyone who plays with it:
 * with a partner, expected = winA + winB - 50; against an opponent, expected = winA - (winB - 50). Heroes banned after the draft do not play and are left out.
 * Listed when seen at least MIN_GAMES times and further from the expectation than MIN_Z standard errors; the best TOP of each list, by that distance.
 */
export function buildPairs(battles: Battle[], minGames = MIN_GAMES): Record<string, RtaHeroPairs> {
  const solo = new Map<string, Count>();
  const together = new Map<string, Count>();
  const versus = new Map<string, Count>();
  for (const b of battles) {
    b.decks.forEach((d, i) => {
      const mine = d.heroes.filter((h) => !h.ban).map((h) => h.code);
      const theirs = b.decks[1 - i].heroes.filter((h) => !h.ban).map((h) => h.code);
      for (const x of mine) {
        bump(solo, x, d.won);
        for (const y of mine) if (x !== y) bump(together, `${x}|${y}`, d.won);
        for (const y of theirs) bump(versus, `${x}|${y}`, d.won);
      }
    });
  }
  const rate = (code: string) => { const c = solo.get(code)!; return c.w / c.n; };
  const out: Record<string, { with: [RtaPairEntry, number][]; over: [RtaPairEntry, number][]; under: [RtaPairEntry, number][] }> = {};
  const judge = (counts: Map<string, Count>, expected: (a: number, b: number) => number, add: (x: string, e: RtaPairEntry, z: number) => void) => {
    for (const [key, c] of counts) {
      if (c.n < minGames) continue;
      const [x, y] = key.split('|');
      const exp = Math.min(0.95, Math.max(0.05, expected(rate(x), rate(y))));
      const win = c.w / c.n;
      const z = (win - exp) / Math.sqrt((exp * (1 - exp)) / c.n);
      add(x, { code: y, n: c.n, win: Math.round(win * 1000) / 10, edge: Math.round((win - exp) * 1000) / 10 }, z);
    }
  };
  const at = (x: string) => (out[x] ??= { with: [], over: [], under: [] });
  judge(together, (a, b) => a + b - 0.5, (x, e, z) => { if (z >= MIN_Z) at(x).with.push([e, z]); });
  judge(versus, (a, b) => a - (b - 0.5), (x, e, z) => { if (z >= MIN_Z) at(x).over.push([e, z]); else if (z <= -MIN_Z) at(x).under.push([e, z]); });
  const best = (list: [RtaPairEntry, number][], sign: 1 | -1) =>
    list.sort((a, b) => sign * (b[1] - a[1]) || a[0].code.localeCompare(b[0].code)).slice(0, TOP).map(([e]) => e);
  const result: Record<string, RtaHeroPairs> = {};
  for (const [x, l] of Object.entries(out).sort((a, b) => a[0].localeCompare(b[0]))) {
    result[x] = { with: best(l.with, 1), over: best(l.over, 1), under: best(l.under, -1) };
  }
  return result;
}

/** Writes rta/pairs.json: the partners and the matchups of each hero, with the day range of the battles counted. */
export async function writePairs(opts: { outDir: string; season: string; battles: Battle[]; now: () => string }): Promise<void> {
  const { outDir, season, battles, now } = opts;
  const pairs: RtaPairs = { code: season, updated: now(), battles: battles.length, minGames: MIN_GAMES, heroes: buildPairs(battles) };
  await mkdir(join(outDir, 'rta'), { recursive: true });
  await writeFile(join(outDir, 'rta', 'pairs.json'), JSON.stringify(pairs));
}
