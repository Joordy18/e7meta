import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import ModesPage, { ModePage } from '../src/pages/ModesPage';
import { loadHeroes, loadIndex, loadLimited, loadModes, loadTeams } from '../src/lib/data';
import { findGuide } from '../src/lib/guides';
import type { ModeList, Modes, Teams } from '../src/shared/types';

vi.mock('../src/lib/data', async (orig) => ({
  ...(await orig<typeof import('../src/lib/data')>()),
  loadIndex: vi.fn(), loadModes: vi.fn(), loadTeams: vi.fn(), loadHeroes: vi.fn(), loadLimited: vi.fn(),
}));
vi.mock('../src/lib/guides', () => ({ findGuide: vi.fn(), guides: [] }));
beforeEach(() => {
  vi.mocked(loadIndex).mockResolvedValue({ periods: ['2026-10-22'] });
  vi.mocked(loadTeams).mockResolvedValue(null);
  vi.mocked(loadHeroes).mockResolvedValue([]);
  vi.mocked(loadLimited).mockResolvedValue(null);
  vi.mocked(findGuide).mockReturnValue(undefined);
});
afterEach(() => { cleanup(); vi.resetAllMocks(); });

const heroes = (n: number, from = 90) => Array.from({ length: n }, (_, i) => ({ code: `c${i}`, name: `Hero ${i}`, share: from - i }));
const hunt = { start: '2026-10-29', end: '2026-11-04' };
const L = (id: string, mode: ModeList['mode'], group: string, variant: string, hs = heroes(3), period?: ModeList['period']): ModeList =>
  ({ id, mode, group, variant, title: `${group}, ${variant}`, heroes: hs, ...(period ? { period } : {}) });
const modes: Modes = {
  key: '2026-10-29',
  lists: [
    L('hunt-1-13', 'hunts', 'Wyvern Hunt', 'Hell', heroes(30), hunt), L('hunt-1-11', 'hunts', 'Wyvern Hunt', 'Hard', heroes(3), hunt),
    L('hunt-2-13', 'hunts', 'Golem Hunt', 'Hell', [{ code: 'g', name: 'Golem Slayer', share: 55.5 }], hunt),
    L('abyss-120', 'abyss', 'Abyss', 'Floor 120', [{ code: 'f', name: 'Fenne', share: 72.32 }], { start: '2026-08-07', end: '2026-11-04' }),
    L('abyss-110', 'abyss', 'Abyss', 'Floor 110', [{ code: 'f', name: 'Fenne', share: 55 }]),
    L('challenge-20', 'challenge', 'Abyss Challenge', 'Floor 20', [{ code: 'tam', name: 'Tamarinne', share: 64.79 }]),
    L('challenge-19', 'challenge', 'Abyss Challenge', 'Floor 19', [{ code: 'tam', name: 'Tamarinne', share: 60 }]),
    L('expedition-2-1', 'expedition', 'Snag Lich Expedition', 'Level 1', [{ code: 'b', name: 'Brieg', share: 50.86 }]),
  ],
  rift: { title: 'Nightmare of the Oceans', description: 'Only Earth elemental Heroes are allowed in this Rift.', start: '2026-01-08', end: '2026-08-27', elements: ['wind'] },
};

describe('ModesPage (the picker)', () => {
  it('shows every boss and mode as a card with its top heroes and one link per difficulty, floor or level', async () => {
    vi.mocked(loadModes).mockResolvedValue(modes);
    render(<ModesPage />);
    const hunts = await screen.findByRole('region', { name: 'Hunts' });
    const wyvern = within(hunts).getByRole('article', { name: 'Wyvern Hunt' });
    expect(loadModes).toHaveBeenCalledWith('2026-10-22');
    expect(within(wyvern).getByRole('link', { name: 'Hell' }).getAttribute('href')).toBe('#/modes/hunt-1-13');
    expect(within(wyvern).getByRole('link', { name: 'Hard' }).getAttribute('href')).toBe('#/modes/hunt-1-11');
    // the first list of the group (the hardest) gives its three best heroes
    expect(within(wyvern).getAllByRole('img').map((i) => i.getAttribute('aria-label'))).toEqual(['Hero 0', 'Hero 1', 'Hero 2']);
    expect(within(hunts).getByRole('article', { name: 'Golem Hunt' })).toBeTruthy();
  });

  it('shows the Challenge Mode of the abyss as its own grid of floors, apart from the normal abyss', async () => {
    vi.mocked(loadModes).mockResolvedValue(modes);
    render(<ModesPage />);
    const challenge = await screen.findByRole('region', { name: 'Abyss Challenge' });
    expect(within(challenge).getByRole('link', { name: /Floor 20/ }).getAttribute('href')).toBe('#/modes/challenge-20');
    expect(within(challenge).getAllByRole('link')).toHaveLength(2);
    expect(within(screen.getByRole('region', { name: 'Abyss' })).queryByRole('link', { name: /Floor 20/ })).toBeNull();
  });

  it('opens a Challenge floor as a page of its own, with the floors of the mode as chips', async () => {
    vi.mocked(loadModes).mockResolvedValue(modes);
    render(<ModePage id="challenge-20" />);
    expect(await screen.findByRole('heading', { name: 'Abyss Challenge' })).toBeTruthy();
    const chips = screen.getByRole('navigation', { name: 'Floor' });
    expect(within(chips).getAllByRole('link').map((a) => a.textContent)).toEqual(['Floor 20', 'Floor 19']);
  });

  it('shows the abyss as a grid of floors, each with its best hero', async () => {
    vi.mocked(loadModes).mockResolvedValue(modes);
    render(<ModesPage />);
    const abyss = await screen.findByRole('region', { name: 'Abyss' });
    const f120 = within(abyss).getByRole('link', { name: /Floor 120/ });
    expect(f120.getAttribute('href')).toBe('#/modes/abyss-120');
    expect(within(f120).getByRole('img', { name: 'Fenne' })).toBeTruthy();
    expect(within(abyss).getByRole('link', { name: /Floor 110/ }).getAttribute('href')).toBe('#/modes/abyss-110');
  });

  it('gives expedition bosses their official icon', async () => {
    vi.mocked(loadModes).mockResolvedValue(modes);
    render(<ModesPage />);
    const exp = await screen.findByRole('region', { name: 'Expeditions' });
    const lich = within(exp).getByRole('article', { name: 'Snag Lich Expedition' });
    expect(lich.querySelector('img.boss')!.getAttribute('src')).toContain('boss02.png');
    expect(within(lich).getByRole('link', { name: 'Level 1' }).getAttribute('href')).toBe('#/modes/expedition-2-1');
  });

  it('describes the Rift season and says it has ended', async () => {
    vi.mocked(loadModes).mockResolvedValue(modes);
    render(<ModesPage />);
    const rift = await screen.findByRole('region', { name: 'Rift' });
    expect(within(rift).getByText('Nightmare of the Oceans')).toBeTruthy();
    expect(within(rift).getByText(/Only Earth elemental Heroes/)).toBeTruthy();
    expect(within(rift).getByText(/2026-01-08 to 2026-08-27/)).toBeTruthy();
    expect(within(rift).getByText(/Season ended/)).toBeTruthy();
  });

  it('says how to collect when the period has no mode data', async () => {
    vi.mocked(loadModes).mockResolvedValue(null);
    render(<ModesPage />);
    expect(await screen.findByText(/No mode data/)).toBeTruthy();
    expect(screen.getByText(/npm run collect/)).toBeTruthy();
  });

  it('shows an explicit error when loading fails', async () => {
    vi.mocked(loadModes).mockRejectedValue(new Error('boom'));
    render(<ModesPage />);
    expect(await screen.findByText(/Failed to load: .*boom/)).toBeTruthy();
  });
});

describe('ModePage (one boss, floor or level)', () => {
  const teams: Teams = {
    key: '2026-10-29',
    lists: { 'hunt-1-13': {
      c0: [{ share: 8.08, heroes: ['c0', 'c1', 'c2', 'c3'] }, { share: 2.5, heroes: ['c0', 'c1', 'c2', 'c4'] }],
      c1: [{ share: 8.08, heroes: ['c1', 'c0', 'c3', 'c2'] }],
    } },
  };
  const names = ['c0', 'c1', 'c2', 'c3', 'c4'].map((code, i) => ({ code, name: `Hero ${i}`, grade: 5, job: 'mage', element: 'fire' }));

  it('shows the boss, its difficulties, the period and the ranking', async () => {
    vi.mocked(loadModes).mockResolvedValue(modes);
    render(<ModePage id="hunt-1-13" />);
    expect(await screen.findByRole('heading', { level: 1, name: 'Wyvern Hunt' })).toBeTruthy();
    expect(screen.getByText('2026-10-29 to 2026-11-04')).toBeTruthy();
    const tabs = screen.getByRole('navigation', { name: 'Difficulty' });
    expect(within(tabs).getByRole('link', { name: 'Hell' }).getAttribute('aria-current')).toBe('page');
    expect(within(tabs).getByRole('link', { name: 'Hard' }).getAttribute('href')).toBe('#/modes/hunt-1-11');
    const rows = within(screen.getByRole('region', { name: 'Top heroes' })).getAllByRole('listitem');
    expect(rows[0].textContent).toContain('Hero 0');
    expect(rows[0].textContent).toContain('90%');
    expect(within(rows[0]).getByRole('link', { name: 'Hero 0' }).getAttribute('href')).toBe('#/hero/c0');
    expect(screen.getByRole('link', { name: /All modes/ }).getAttribute('href')).toBe('#/modes');
  });

  it('shows 25 heroes, then the rest on demand', async () => {
    vi.mocked(loadModes).mockResolvedValue(modes);
    render(<ModePage id="hunt-1-13" />);
    await screen.findByText('Hero 0');
    const panel = screen.getByRole('region', { name: 'Top heroes' });
    expect(within(panel).getAllByRole('listitem')).toHaveLength(25);
    fireEvent.click(screen.getByRole('button', { name: 'Show more' }));
    expect(within(panel).getAllByRole('listitem')).toHaveLength(30);
    expect(screen.queryByRole('button', { name: 'Show more' })).toBeNull();
  });

  it('lists the best teams once each, with member names and links, best first', async () => {
    vi.mocked(loadModes).mockResolvedValue(modes);
    vi.mocked(loadTeams).mockResolvedValue(teams);
    vi.mocked(loadHeroes).mockResolvedValue(names);
    render(<ModePage id="hunt-1-13" />);
    const panel = await screen.findByRole('region', { name: 'Best teams' });
    const rows = within(panel).getAllByRole('listitem');
    expect(rows).toHaveLength(2); // the 8.08% team appears for two heroes but counts once
    expect(rows[0].textContent).toContain('8.08%');
    expect(within(rows[0]).getAllByRole('link').map((a) => a.textContent)).toEqual(['Hero 0', 'Hero 1', 'Hero 2', 'Hero 3']);
    expect(within(rows[0]).getAllByRole('link')[1].getAttribute('href')).toBe('#/hero/c1');
    expect(rows[1].textContent).toContain('2.5%');
  });

  it('has no team block when there is no team data', async () => {
    vi.mocked(loadModes).mockResolvedValue(modes);
    render(<ModePage id="hunt-1-13" />);
    await screen.findByText('Hero 0');
    expect(screen.queryByRole('region', { name: 'Best teams' })).toBeNull();
  });

  it('links the strategy guide when one exists for this boss, and says there is none otherwise', async () => {
    vi.mocked(loadModes).mockResolvedValue(modes);
    vi.mocked(findGuide).mockImplementation((slug) => (slug === 'wyvern-hunt'
      ? { slug, title: 'Wyvern Hunt guide', summary: 's', date: '2026-11-05', body: 'b' } : undefined));
    render(<ModePage id="hunt-1-13" />);
    expect(await screen.findByRole('link', { name: /Strategy guide/ })).toBeTruthy();
    expect(screen.getByRole('link', { name: /Strategy guide/ }).getAttribute('href')).toBe('#/guides/wyvern-hunt');
    cleanup();
    render(<ModePage id="hunt-2-13" />);
    await screen.findByRole('heading', { level: 1, name: 'Golem Hunt' });
    expect(screen.queryByRole('link', { name: /Strategy guide/ })).toBeNull();
    expect(screen.getByText(/No strategy guide yet/)).toBeTruthy();
  });

  it('says so for an unknown mode', async () => {
    vi.mocked(loadModes).mockResolvedValue(modes);
    render(<ModePage id="nope" />);
    expect(await screen.findByText('Unknown game mode')).toBeTruthy();
    expect(screen.getByRole('link', { name: /All modes/ })).toBeTruthy();
  });
});

describe('ModesPage (limited-time modes)', () => {
  it('puts the Rift and the seasonal and event modes in their own category, each saying the game has no hero statistics for it', async () => {
    vi.mocked(loadModes).mockResolvedValue(modes);
    render(<ModesPage />);
    const block = await screen.findByRole('region', { name: 'Limited-time modes' });
    expect(within(block).getByRole('region', { name: 'Rift' })).toBeTruthy();
    for (const title of ['Otherworld Breach', 'Strategic Archive', 'Automaton Tower', 'Trial of the Constellations']) {
      expect(within(block).getByRole('article', { name: title }).textContent).toContain('No official hero statistics.');
    }
    expect(within(block).getByRole('article', { name: 'Strategic Archive' }).textContent).toContain('Seasonal tab');
    expect(within(block).getByRole('article', { name: 'Otherworld Breach' }).textContent).toContain('Event');
    expect(within(block).getAllByText('No official post about this mode found.')).toHaveLength(5); // no file: nothing found anywhere, the Rift included
  });

  it('lists the latest official posts of a mode with their dates, as links to the community page of the game', async () => {
    vi.mocked(loadModes).mockResolvedValue(modes);
    vi.mocked(loadLimited).mockResolvedValue({ updated: '2026-11-06', modes: {
      'otherworld-breach': [{ id: '8', board: 'event', title: 'Otherworld Breach Season 3 Full Buff Event', date: '2026-06-03', url: 'https://page.onstove.com/epicseven/global/view/8' }],
    } });
    render(<ModesPage />);
    const card = await screen.findByRole('article', { name: 'Otherworld Breach' });
    expect(within(card).getByRole('link', { name: 'Otherworld Breach Season 3 Full Buff Event' }).getAttribute('href')).toBe('https://page.onstove.com/epicseven/global/view/8');
    expect(card.textContent).toContain('2026-06-03');
    expect(within(card).queryByText('No official post about this mode found.')).toBeNull();
  });

  it('keeps the boss cards and the category when the file is unreadable', async () => {
    vi.mocked(loadModes).mockResolvedValue(modes);
    vi.mocked(loadLimited).mockRejectedValue(new Error('offline'));
    render(<ModesPage />);
    expect(await screen.findByRole('article', { name: 'Wyvern Hunt' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Limited-time modes' })).toBeTruthy();
  });
});
