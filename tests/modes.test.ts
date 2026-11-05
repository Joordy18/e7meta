import { describe, expect, it } from 'vitest';
import { bestTeams, groupModes, guideSlug, heroTeams } from '../src/lib/modes';
import type { ModeList, Modes, Teams } from '../src/shared/types';

const list = (id: string, mode: ModeList['mode'], group: string, variant: string): ModeList => ({
  id, mode, group, variant, title: `${group}, ${variant}`, heroes: [],
});
const modes: Modes = {
  key: 'k',
  lists: [
    list('hunt-2-13', 'hunts', 'Golem Hunt', 'Hell'), list('hunt-2-11', 'hunts', 'Golem Hunt', 'Hard'),
    list('abyss-120', 'abyss', 'Abyss', 'Floor 120'), list('abyss-110', 'abyss', 'Abyss', 'Floor 110'),
    list('expedition-2-1', 'expedition', 'Snag Lich Expedition', 'Level 1'),
  ],
};
const teams: Teams = {
  key: 'k',
  lists: {
    'hunt-2-13': {
      a: [{ share: 8, heroes: ['a', 'b', 'c', 'd'] }, { share: 2, heroes: ['a', 'b', 'c', 'e'] }],
      b: [{ share: 8, heroes: ['b', 'a', 'd', 'c'] }, { share: 5, heroes: ['b', 'x', 'y', 'z'] }], // same team as a's first, other order
      c: [{ share: 8, heroes: ['c', 'a', 'b', 'd'] }],
    },
    'abyss-120': { a: [{ share: 19, heroes: ['a', 'p', 'q', 'r'] }] },
  },
};

describe('bestTeams', () => {
  it('merges the teams of every hero of the list, a team counted once whatever the order, best first', () => {
    expect(bestTeams(teams, 'hunt-2-13', 10)).toEqual([
      { share: 8, heroes: ['a', 'b', 'c', 'd'] },
      { share: 5, heroes: ['b', 'x', 'y', 'z'] },
      { share: 2, heroes: ['a', 'b', 'c', 'e'] },
    ]);
  });
  it('cuts to n', () => expect(bestTeams(teams, 'hunt-2-13', 2)).toHaveLength(2));
  it('is empty for a list without teams, or without any team data', () => {
    expect(bestTeams(teams, 'hunt-2-11', 5)).toEqual([]);
    expect(bestTeams(null, 'hunt-2-13', 5)).toEqual([]);
  });
});

describe('heroTeams', () => {
  it('lists the best teams of a hero across every mode, with the mode title, best first', () => {
    expect(heroTeams(teams, modes, 'a', 3)).toEqual([
      { listId: 'abyss-120', title: 'Abyss, Floor 120', team: { share: 19, heroes: ['a', 'p', 'q', 'r'] } },
      { listId: 'hunt-2-13', title: 'Golem Hunt, Hell', team: { share: 8, heroes: ['a', 'b', 'c', 'd'] } },
      { listId: 'hunt-2-13', title: 'Golem Hunt, Hell', team: { share: 2, heroes: ['a', 'b', 'c', 'e'] } },
    ]);
  });
  it('is empty for a hero without teams', () => expect(heroTeams(teams, modes, 'nobody', 3)).toEqual([]));
});

describe('guideSlug', () => {
  it('turns a boss or mode into the file name of its guide', () => {
    expect(guideSlug({ mode: 'hunts', group: 'Golem Hunt' })).toBe('golem-hunt');
    expect(guideSlug({ mode: 'expedition', group: 'Snag Lich Expedition' })).toBe('snag-lich-expedition');
    expect(guideSlug({ mode: 'abyss', group: 'Abyss' })).toBe('abyss');
  });
});

describe('groupModes', () => {
  it('groups lists by boss or mode, keeping the order of the data', () => {
    const g = groupModes(modes);
    expect(g.map((x) => [x.mode, x.group, x.lists.map((l) => l.id)])).toEqual([
      ['hunts', 'Golem Hunt', ['hunt-2-13', 'hunt-2-11']],
      ['abyss', 'Abyss', ['abyss-120', 'abyss-110']],
      ['expedition', 'Snag Lich Expedition', ['expedition-2-1']],
    ]);
  });
});
