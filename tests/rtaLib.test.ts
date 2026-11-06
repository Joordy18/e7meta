import { describe, expect, it } from 'vitest';
import { heroRta, rtaRows } from '../src/lib/rta';
import type { RtaStats } from '../src/shared/types';

const stats: RtaStats = {
  season: 'Fall 2026', code: 'pvp_rta_ss21', updated: '2026-11-06', players: 100, battles: 200,
  heroes: {
    a: { pick: 100, played: 80, win: 44, first: 20, ban: 20, preban: 30 },
    b: { pick: 150, played: 150, win: 60, first: 50, ban: 0, preban: 0 },
    rare: { pick: 3, played: 3, win: 3, first: 0, ban: 0, preban: 0 },
    banned: { pick: 0, played: 0, win: 0, first: 0, ban: 0, preban: 120 },
  },
};

describe('rtaRows', () => {
  const rows = rtaRows(stats, 20);
  it('turns the counts into rates of all battles, the win rate being over the games actually played, best picked first', () => {
    expect(rows.map((r) => r.code)).toEqual(['b', 'a', 'banned']);
    expect(rows[1]).toEqual({ code: 'a', pick: 50, win: 55, ban: 10, preban: 15, first: 10, played: 80 });
    expect(rows[0]).toMatchObject({ pick: 75, win: 40, first: 25 });
  });
  it('leaves out heroes with too few games to trust their win rate, but keeps the ones that are only pre-banned', () => {
    expect(rows.find((r) => r.code === 'rare')).toBeUndefined();
    expect(rows.find((r) => r.code === 'banned')).toMatchObject({ pick: 0, preban: 60 });
    expect(rows.find((r) => r.code === 'banned')!.win).toBeNull();
  });
  it('rounds to one decimal', () => {
    const r = rtaRows({ ...stats, battles: 300 }, 20).find((x) => x.code === 'a')!;
    expect(r.pick).toBe(33.3);
  });
});

describe('heroRta', () => {
  it('gives the row of one hero, or nothing when it is unknown or too rare', () => {
    expect(heroRta(stats, 'a', 20)?.win).toBe(55);
    expect(heroRta(stats, 'rare', 20)).toBeUndefined();
    expect(heroRta(stats, 'nope', 20)).toBeUndefined();
  });
});
