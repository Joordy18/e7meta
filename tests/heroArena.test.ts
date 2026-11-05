import { describe, expect, it } from 'vitest';
import { heroArena } from '../src/lib/arena';
import type { ArenaSeason, ArenaTier, DraftRow, PreBanRow } from '../src/shared/types';

const empty = <T,>() => ({ champion: [] as T[], warlord: [] as T[], emperor: [] as T[], legend: [] as T[] }) as Record<ArenaTier, T[]>;
const season: ArenaSeason = {
  id: '1', title: 't', season: 'Summer 2026', published: '2026-08-07', url: 'u', leagues: [], cutoffs: [],
  preBan: { ...empty<PreBanRow>(), legend: [{ hero: 'Notos', rate: 71 }, { hero: 'Genesis Ras', rate: 40 }] },
  firstPick: { ...empty<DraftRow>(), champion: [{ hero: 'Boss Arunka', rate: 26, ban: 16.5, win: 48.2 }, { hero: 'Genesis Ras', rate: 20, ban: 10, win: 50 }] },
  pick: {
    ...empty<DraftRow>(),
    champion: [{ hero: 'Boss Arunka', rate: 61, ban: 13.8, win: 46.8 }, { hero: 'Genesis Ras', rate: 40, ban: 9, win: 51.8 }],
    legend: [{ hero: 'Genesis Ras', rate: 63.3, ban: 8.1, win: 51.2 }],
  },
};

describe('heroArena', () => {
  it('gathers a hero\'s pick, first pick and pre-ban figures per league tier, with the rank in each table', () => {
    expect(heroArena(season, 'Genesis Ras')).toEqual([
      { tier: 'champion', pick: { rank: 2, rate: 40, ban: 9, win: 51.8 }, firstPick: { rank: 2, rate: 20, ban: 10, win: 50 } },
      { tier: 'legend', pick: { rank: 1, rate: 63.3, ban: 8.1, win: 51.2 }, preBan: { rank: 2, rate: 40 } },
    ]);
  });
  it('lists only the tiers where the hero shows up, in league order', () => {
    expect(heroArena(season, 'Notos')).toEqual([{ tier: 'legend', preBan: { rank: 1, rate: 71 } }]);
  });
  it('ignores accents and case in the name', () => {
    expect(heroArena(season, 'boss ARUNKA').map((r) => r.tier)).toEqual(['champion']);
  });
  it('is empty for a hero in none of the top-20 tables', () => expect(heroArena(season, 'Nobody')).toEqual([]));
});
