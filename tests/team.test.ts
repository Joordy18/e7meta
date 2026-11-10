import { describe, expect, it } from 'vitest';
import { suggest, summary, threats, versusLink, withLink, type Table } from '../src/lib/team';
import type { RtaRow } from '../src/lib/rta';

const row = (code: string, win: number | null): RtaRow => ({ code, pick: 10, win, ban: 0, preban: 0, first: 0, played: 100 });
// rows: [other hero, games, win %, edge, clear]
const table: Table = {
  a: { with: [['b', 100, 60, 4, 1], ['c', 90, 52, 3, 0]], versus: [['x', 80, 40, -6, 1]] },
  b: { with: [['a', 100, 60, 6, 1]], versus: [] },
  c: { with: [], versus: [] },
  x: { with: [], versus: [['a', 80, 60, 5, 1]] }, // x beats a by 5 here; a's own record says it loses 6 to x
};
const pool = [row('a', 52), row('b', 50), row('c', 55), row('x', 51)];

describe('withLink / versusLink', () => {
  it('takes the mean of both records, and ignores a gap that is not clearly past chance', () => {
    expect(withLink(table, 'a', 'b')).toEqual({ code: 'b', edge: 5, games: 100 });
    expect(withLink(table, 'b', 'a')?.edge).toBe(5);
    expect(withLink(table, 'a', 'c')).toBeNull(); // clear = 0
    expect(withLink(table, 'c', 'b')).toBeNull();
  });
  it('is the gain of the first hero against the second, seen from either record', () => {
    expect(versusLink(table, 'a', 'x')?.edge).toBe(-5.5); // a's record -6, x's record +5 means -5 for a
    expect(versusLink(table, 'x', 'a')?.edge).toBe(5.5);
    expect(versusLink(table, 'a', 'c')).toBeNull();
  });
});

describe('suggest', () => {
  it('adds the points of partnerships and matchups to the win rate over 50, and leaves chosen heroes out', () => {
    const s = suggest(pool, table, ['a'], []);
    expect(s.map((x) => x.code)).toEqual(['b', 'c', 'x']); // b: 0 + 5, c: +5 (its pair is not clear), x: +1
    expect(s[0]).toMatchObject({ code: 'b', score: 5, win: 50 });
    expect(s[0].withs).toEqual([{ code: 'a', edge: 5, games: 100 }]);
    const versus = suggest(pool, table, ['a'], ['x']);
    expect(versus.find((x) => x.code === 'b')?.vs).toEqual([]);
    expect(versus.some((x) => x.code === 'x')).toBe(false);
  });
  it('counts a matchup against the opponents', () => {
    const s = suggest(pool, table, [], ['a']);
    expect(s.find((x) => x.code === 'x')).toMatchObject({ score: 6.5, vs: [{ code: 'a', edge: 5.5, games: 80 }] }); // 51 - 50 + 5.5
  });
});

describe('threats and summary', () => {
  it('lists the heroes that beat the team, worst first', () => {
    expect(threats(pool, table, ['a']).map((x) => [x.code, x.score])).toEqual([['x', 5.5]]);
    expect(threats(pool, table, ['x'])).toEqual([]);
  });
  it('adds up the partnerships inside the team and the matchups against the opponents', () => {
    expect(summary(table, ['a', 'b'], ['x'])).toEqual({ synergy: 5, matchup: -5.5 });
    expect(summary(table, ['c'], [])).toEqual({ synergy: null, matchup: null });
  });
});
