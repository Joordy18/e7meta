import { describe, expect, it, vi } from 'vitest';
import { buildSearchItems, searchItems, type SearchItem } from '../src/lib/search';
import type { Gear, HeroSummary, ModeList, Modes } from '../src/shared/types';

vi.mock('../src/lib/guides', async () => (await import('./sampleGuides')).guidesModule());

const item = (kind: SearchItem['kind'], label: string, href = '#/x'): SearchItem => ({ kind, label, href });

describe('searchItems', () => {
  const items = [
    item('hero', 'Setsuka'), item('hero', 'Abyssal Yufine'), item('hero', 'Bunny Girl Mafia Yufine'), item('hero', 'Ras'),
    item('artifact', 'Sword of Setting Sun'), item('mode', 'Abyss'), item('guide', 'How to read the build stats'), item('page', 'Heroes'),
  ];
  const labels = (q: string, n = 10) => searchItems(items, q, n).map((i) => i.label);

  it('finds by part of a name, ignoring case and accents', () => {
    expect(labels('yufine')).toEqual(['Abyssal Yufine', 'Bunny Girl Mafia Yufine']);
    expect(labels('SETSU')).toEqual(['Setsuka']);
    expect(searchItems([item('hero', 'Abigaëlle')], 'abigaelle', 5)).toHaveLength(1);
  });
  it('ranks names that start with the text first, then words that start with it, then the rest', () => {
    const heroes = [item('hero', 'Sunset'), item('hero', 'Dark Setter'), item('hero', 'Setsuka')];
    expect(searchItems(heroes, 'set', 5).map((i) => i.label)).toEqual(['Setsuka', 'Dark Setter', 'Sunset']);
    expect(labels('ab')).toEqual(['Abyssal Yufine', 'Abyss']); // equal rank: the hero before the mode
  });
  it('wants every word of the query to match, in any order', () => {
    expect(labels('yufine mafia')).toEqual(['Bunny Girl Mafia Yufine']);
    expect(labels('mafia xyz')).toEqual([]);
  });
  it('puts heroes before artifacts, modes, guides and pages on an equal match, and cuts to the limit', () => {
    expect(labels('s', 3)).toHaveLength(3);
    const same = searchItems([item('guide', 'Setting'), item('hero', 'Setting'), item('artifact', 'Setting')], 'setting', 5).map((i) => i.kind);
    expect(same).toEqual(['hero', 'artifact', 'guide']);
  });
  it('returns nothing for an empty query', () => {
    expect(searchItems(items, '   ', 5)).toEqual([]);
  });
});

describe('buildSearchItems', () => {
  const heroes: HeroSummary[] = [{ code: 'c1', name: 'Alpha', grade: 5, job: 'mage', element: 'fire' }];
  const gear: Gear = { key: 'k', artifacts: { efk1: { code: 'efk1', name: 'Blade', job: 'knight', grade: 5, attack: 1, health: 1, maxAttack: 1, maxHealth: 1, description: '', values: [], heroes: [] } } };
  const list = (id: string, group: string, mode: ModeList['mode']): ModeList => ({ id, mode, group, variant: 'v', title: id, heroes: [] });
  const modes: Modes = { key: 'k', lists: [list('hunt-1-13', 'Golem Hunt', 'hunts'), list('hunt-1-11', 'Golem Hunt', 'hunts'), list('abyss-120', 'Abyss', 'abyss')] };

  it('makes one entry per hero, artifact, mode (the first list of the group), guide and page, each with a link', () => {
    const all = buildSearchItems({ heroes, gear, modes });
    expect(all.find((i) => i.kind === 'hero')).toMatchObject({ label: 'Alpha', href: '#/hero/c1', code: 'c1' });
    expect(all.find((i) => i.kind === 'artifact')).toMatchObject({ label: 'Blade', href: '#/artifact/efk1', code: 'efk1' });
    expect(all.filter((i) => i.kind === 'mode').map((i) => [i.label, i.href])).toEqual([['Golem Hunt', '#/modes/hunt-1-13'], ['Abyss', '#/modes/abyss-120']]);
    expect(all.filter((i) => i.kind === 'page').map((i) => i.label)).toEqual(['Home', 'Heroes', 'Modes', 'Tier list', 'RTA', 'Tools', 'Draft simulator', 'Team builder', 'Guides', 'About and FAQ']);
    expect(all.filter((i) => i.kind === 'guide').length).toBeGreaterThan(0);
    expect(all.filter((i) => i.kind === 'guide')[0].href).toMatch(/^#\/guides\//);
  });
  it('names the pages in the language when given them', () => {
    const all = buildSearchItems({}, undefined, [['Accueil', '#/'], ['Tier list', '#/tiers']]);
    expect(all.filter((i) => i.kind === 'page').map((i) => [i.label, i.href])).toEqual([['Accueil', '#/'], ['Tier list', '#/tiers']]);
  });
  it('still offers pages and guides when the data is missing', () => {
    const all = buildSearchItems({});
    expect(all.some((i) => i.kind === 'page')).toBe(true);
    expect(all.some((i) => i.kind === 'hero')).toBe(false);
  });
});
