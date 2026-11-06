import { describe, expect, it } from 'vitest';
import { arenaLeaders, preBanLeaders, pveLeaders } from '../src/lib/home';
import type { ArenaSeason, ArenaTier, DraftRow, ModeList, Modes, PreBanRow } from '../src/shared/types';

const list = (id: string, mode: ModeList['mode'], heroes: [string, number][]): ModeList => ({
  id, mode, group: 'g', variant: 'v', title: id, heroes: heroes.map(([code, share]) => ({ code, name: code.toUpperCase(), share })),
});
const modes = (key: string, lists: ModeList[]): Modes => ({ key, lists });

describe('pveLeaders', () => {
  const cur = modes('k2', [
    list('h1', 'hunts', [['a', 60], ['b', 30]]), list('h2', 'hunts', [['a', 40], ['c', 20]]),
    list('ab1', 'abyss', [['z', 90]]),
  ]);
  it('averages each hero\'s share over the rankings of the mode, a missing ranking counting as 0, best first', () => {
    expect(pveLeaders(cur, 'hunts', 10)).toEqual([
      { code: 'a', name: 'A', share: 50 }, { code: 'b', name: 'B', share: 15 }, { code: 'c', name: 'C', share: 10 },
    ]);
  });
  it('ignores an entry without a name', () => {
    const odd = modes('k', [{ ...list('h', 'hunts', []), heroes: [{ code: 'ghost', name: undefined as unknown as string, share: 80 }, { code: 'a', name: 'A', share: 20 }] }]);
    expect(pveLeaders(odd, 'hunts', 5).map((l) => l.code)).toEqual(['a']);
  });
  it('looks only at the rankings of that mode', () => {
    expect(pveLeaders(cur, 'abyss', 10).map((l) => l.code)).toEqual(['z']);
    expect(pveLeaders(cur, 'expedition', 10)).toEqual([]);
  });
  it('cuts to n', () => expect(pveLeaders(cur, 'hunts', 2).map((l) => l.code)).toEqual(['a', 'b']));
  it('adds the change in points against another week when given one', () => {
    const prev = modes('k1', [list('h1', 'hunts', [['a', 40], ['b', 50]]), list('h2', 'hunts', [['a', 20]])]);
    const r = pveLeaders(cur, 'hunts', 10, prev);
    expect(r.find((l) => l.code === 'a')!.delta).toBe(20); // 50 now, 30 before
    expect(r.find((l) => l.code === 'b')!.delta).toBe(-10); // 15 now, 25 before
    expect(r.find((l) => l.code === 'c')!.delta).toBe(10); // new
  });
  it('has no change field without a previous week', () => expect(pveLeaders(cur, 'hunts', 1)[0]).not.toHaveProperty('delta'));
});

describe('arena leaders', () => {
  const tiers: ArenaTier[] = ['champion', 'warlord', 'emperor', 'legend'];
  const by = <T,>(f: (t: ArenaTier) => T[]) => Object.fromEntries(tiers.map((t) => [t, f(t)])) as Record<ArenaTier, T[]>;
  const season = (pick: DraftRow[], preBan: PreBanRow[]): ArenaSeason => ({
    id: '1', title: 't', season: 's', published: 'p', url: 'u', leagues: [], cutoffs: [],
    preBan: by(() => preBan), firstPick: by(() => []), pick: by(() => pick),
  });
  const now = season(
    [{ hero: 'Ann', rate: 61, ban: 14, win: 47 }, { hero: 'Bo', rate: 50, ban: 9, win: 55 }, { hero: 'Cy', rate: 40, ban: 5, win: 51 }],
    [{ hero: 'Notos', rate: 71 }, { hero: 'Ann', rate: 40 }],
  );
  const before = season([{ hero: 'Ann', rate: 58.5, ban: 1, win: 1 }, { hero: 'Cy', rate: 45, ban: 1, win: 1 }], []);

  it('lists the most picked heroes of a league tier with pick, ban and win rates', () => {
    expect(arenaLeaders(now, undefined, 'champion', 2)).toEqual([
      { hero: 'Ann', rate: 61, ban: 14, win: 47 }, { hero: 'Bo', rate: 50, ban: 9, win: 55 },
    ]);
  });
  it('adds the change in pick rate against the previous season, or marks a hero that was not in its top 20 as new', () => {
    const r = arenaLeaders(now, before, 'champion', 3);
    expect(r[0]).toMatchObject({ hero: 'Ann', delta: 2.5 });
    expect(r[1]).toMatchObject({ hero: 'Bo', isNew: true });
    expect(r[1]).not.toHaveProperty('delta');
    expect(r[2]).toMatchObject({ hero: 'Cy', delta: -5 });
  });
  it('matches names ignoring case and accents', () => {
    const b2 = season([{ hero: 'ANN', rate: 50, ban: 0, win: 0 }], []);
    expect(arenaLeaders(now, b2, 'champion', 1)[0].delta).toBe(11);
  });
  it('lists the most pre-banned heroes of a tier', () => {
    expect(preBanLeaders(now, 'legend', 1)).toEqual([{ hero: 'Notos', rate: 71 }]);
  });
});
