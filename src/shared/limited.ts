/**
 * The modes that are only open for a period (a season or an event), which the game's own guide has no hero statistics for (except the Rift, whose ranking it
 * publishes but leaves empty between seasons). Their titles are the ones the game shows; `match` finds their official posts by title, `skip` drops shop notices.
 */
export type LimitedGroup = 'rift' | 'otherworld' | 'seasonal';
export type LimitedMode = { id: string; title: string; group: LimitedGroup; match: string; skip?: string };

export const LIMITED: LimitedMode[] = [
  { id: 'rift', title: 'Rift', group: 'rift', match: '(?<!tidal )\\brift\\b', skip: '\\b(pack|sale)\\b' }, // "Tidal Rift Elvira" is a hero
  { id: 'otherworld-breach', title: 'Otherworld Breach', group: 'otherworld', match: 'otherworld breach' },
  { id: 'strategic-archive', title: 'Strategic Archive', group: 'seasonal', match: 'strategic archive' },
  { id: 'automaton-tower', title: 'Automaton Tower', group: 'seasonal', match: 'automaton tower' },
  { id: 'trial-of-the-constellations', title: 'Trial of the Constellations', group: 'seasonal', match: 'trial of the constellations' },
];
