import { describe, expect, it } from 'vitest';
import { tierList } from '../src/lib/tiers';
import type { ModeList, Modes } from '../src/shared/types';

const list = (id: string, mode: ModeList['mode'], heroes: [string, number][]): ModeList => ({
  id, mode, group: 'g', variant: 'v', title: id, heroes: heroes.map(([code, share]) => ({ code, name: code.toUpperCase(), share })),
});
const modes: Modes = {
  key: 'k',
  lists: [
    list('h1', 'hunts', [['a', 60], ['b', 30], ['c', 6], ['d', 1]]), list('h2', 'hunts', [['a', 40], ['b', 20]]),
    list('ab', 'abyss', [['z', 90], ['a', 10]]), list('ex', 'expedition', [['y', 44], ['a', 20]]),
  ],
};
const codes = (rows: ReturnType<typeof tierList>) => rows.map((r) => [r.tier, r.heroes.map((h) => h.code)]);

describe('tierList', () => {
  it('puts a hero in the tier of its average share compared with the most used hero of the mode', () => {
    // hunts, averaged over its 2 rankings: a 50, b 25, c 3, d 0.5; the leader is 50
    expect(codes(tierList(modes, 'hunts'))).toEqual([['S', ['a', 'b']], ['C', ['c']], ['D', ['d']]]);
  });

  it('gives each hero its average share, best first inside a tier, with the name of the data', () => {
    const [s] = tierList(modes, 'hunts');
    expect(s.heroes).toEqual([{ code: 'a', name: 'A', share: 50 }, { code: 'b', name: 'B', share: 25 }]);
  });

  it('draws the tier boundaries at half, a quarter, a tenth and 3% of the leader', () => {
    const edge: Modes = { key: 'k', lists: [list('x', 'hunts', [['top', 100], ['s', 50], ['a', 49], ['a2', 25], ['b', 24], ['b2', 10], ['c', 9], ['c2', 3], ['d', 2.9]])] };
    expect(codes(tierList(edge, 'hunts'))).toEqual([['S', ['top', 's']], ['A', ['a', 'a2']], ['B', ['b', 'b2']], ['C', ['c', 'c2']], ['D', ['d']]]);
  });

  it('for all PvE, averages the three modes, a mode that lacks the hero counting as 0', () => {
    // hunts a 50 b 25 c 3 d 0.5; abyss z 90 a 10 (average over its single ranking); expedition y 44 a 20
    // all: a (50+10+20)/3 = 26.67, z 30, y 14.67, b 8.33, c 1, d 0.17; the leader is z with 30
    expect(codes(tierList(modes, 'all'))).toEqual([['S', ['z', 'a']], ['A', ['y', 'b']], ['C', ['c']], ['D', ['d']]]);
  });

  it('is empty when the mode has no ranking, and leaves out empty tiers', () => {
    expect(tierList({ key: 'k', lists: [] }, 'all')).toEqual([]);
    expect(tierList(modes, 'expedition').map((r) => r.tier)).toEqual(['S', 'A']); // y 44 and a 20: a is 45% of the leader
  });
});
