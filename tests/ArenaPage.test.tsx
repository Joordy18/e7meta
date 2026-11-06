import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import ArenaPage from '../src/pages/ArenaPage';
import { I18nProvider } from '../src/i18n';
import { fr } from '../src/i18n/fr';
import { loadArenaIndex, loadArenaSeason, loadHeroes, loadIndex, loadNames, loadRta } from '../src/lib/data';
import type { ArenaIndex, ArenaSeason, ArenaTier, DraftRow, PreBanRow, RtaStats } from '../src/shared/types';

vi.mock('../src/lib/data', async (orig) => ({
  ...(await orig<typeof import('../src/lib/data')>()),
  loadIndex: vi.fn(), loadHeroes: vi.fn(), loadArenaIndex: vi.fn(), loadArenaSeason: vi.fn(), loadRta: vi.fn(), loadNames: vi.fn(),
}));
afterEach(() => { cleanup(); localStorage.clear(); vi.resetAllMocks(); });

const tiers: ArenaTier[] = ['champion', 'warlord', 'emperor', 'legend'];
const by = <T,>(f: (t: ArenaTier) => T[]) => Object.fromEntries(tiers.map((t) => [t, f(t)])) as Record<ArenaTier, T[]>;
const draft = (t: ArenaTier): DraftRow[] => [
  { hero: `${t} Star`, rate: 61.5, ban: 12, win: 53.2 }, { hero: 'Unknown Hero', rate: 40, ban: 5, win: 47.1 },
];
const season = (id: string, name: string, published: string): ArenaSeason => ({
  id, title: `World Arena ${name} Season Infographic`, season: name, published, url: `https://page.onstove.com/epicseven/global/view/${id}`,
  preBan: by<PreBanRow>((t) => [{ hero: `${t} Star`, rate: 70.1 }]),
  firstPick: by<DraftRow>((t) => [{ hero: `${t} Star`, rate: 28.4, ban: 16, win: 51.1 }]),
  pick: by<DraftRow>(draft),
  leagues: [{ league: 'Legend', avgWinRate: 62.1, players: 31 }, { league: 'Emperor', avgWinRate: 51.7, players: 336 }],
  cutoffs: [{ league: 'Legend', points: 3475 }, { league: 'Emperor', points: 3152 }],
});
const summer = season('2', 'Summer 2026', '2026-08-07');
const spring = season('1', 'Spring 2026', '2026-04-03');
const index: ArenaIndex = { seasons: [summer, spring].map((s) => ({ id: s.id, season: s.season, published: s.published, title: s.title, url: s.url })) };

beforeEach(() => {
  vi.mocked(loadArenaIndex).mockResolvedValue(index);
  vi.mocked(loadArenaSeason).mockImplementation(async (id) => (id === '2' ? summer : spring));
  vi.mocked(loadRta).mockResolvedValue(null);
  vi.mocked(loadIndex).mockResolvedValue({ periods: ['2026-10-22'] });
  vi.mocked(loadHeroes).mockResolvedValue([{ code: 'c9', name: 'champion Star', grade: 5, job: 'mage', element: 'fire' }]);
});

const rows = () => within(screen.getByRole('table', { name: 'Draft rates' })).getAllByRole('row').slice(1);

describe('ArenaPage', () => {
  it('opens on the latest season, Champion league and above, pick rates', async () => {
    render(<ArenaPage />);
    expect(await screen.findByRole('heading', { level: 1, name: /World Arena/ })).toBeTruthy();
    expect(loadArenaSeason).toHaveBeenCalledWith('2');
    expect(screen.getByRole('combobox', { name: 'Season' })).toHaveProperty('value', '2');
    expect(screen.getByRole('button', { name: 'Champion+' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Pick' }).getAttribute('aria-pressed')).toBe('true');
    const heads = within(screen.getByRole('table', { name: 'Draft rates' })).getAllByRole('columnheader').map((c) => c.textContent);
    expect(heads).toEqual(['#', 'Hero', 'Pick rate', 'Ban', 'Win rate']);
    const first = within(rows()[0]).getAllByRole('cell').map((c) => c.textContent);
    expect(first).toEqual(['1', 'champion Star', '61.5%', '12%', '53.2%']);
  });

  it('switches tier', async () => {
    render(<ArenaPage />);
    await screen.findByText('champion Star');
    fireEvent.click(screen.getByRole('button', { name: 'Legend+' }));
    expect(screen.getByText('legend Star')).toBeTruthy();
    expect(screen.queryByText('champion Star')).toBeNull();
    expect(screen.getByRole('button', { name: 'Legend+' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('switches to first pick, then to pre-ban (which has no ban or win columns)', async () => {
    render(<ArenaPage />);
    await screen.findByText('champion Star');
    fireEvent.click(screen.getByRole('button', { name: 'First pick' }));
    const first = within(rows()[0]).getAllByRole('cell').map((c) => c.textContent);
    expect(first).toEqual(['1', 'champion Star', '28.4%', '16%', '51.1%']);
    fireEvent.click(screen.getByRole('button', { name: 'Pre-ban' }));
    const heads = within(screen.getByRole('table', { name: 'Draft rates' })).getAllByRole('columnheader').map((c) => c.textContent);
    expect(heads).toEqual(['#', 'Hero', 'Pre-ban rate']);
    expect(within(rows()[0]).getAllByRole('cell').map((c) => c.textContent)).toEqual(['1', 'champion Star', '70.1%']);
  });

  it('loads another season from the selector', async () => {
    render(<ArenaPage />);
    await screen.findByText('champion Star');
    fireEvent.change(screen.getByRole('combobox', { name: 'Season' }), { target: { value: '1' } });
    expect(await screen.findByRole('heading', { level: 1, name: /Spring 2026/ })).toBeTruthy();
    expect(loadArenaSeason).toHaveBeenCalledWith('1');
  });

  it('links a hero to its page when the name matches a known hero, and leaves other names as text', async () => {
    render(<ArenaPage />);
    await screen.findByText('champion Star');
    expect(within(rows()[0]).getByRole('link', { name: 'champion Star' }).getAttribute('href')).toBe('#/hero/c9');
    expect(within(rows()[1]).queryByRole('link')).toBeNull();
    expect(within(rows()[1]).getByText('Unknown Hero')).toBeTruthy();
  });

  it('shows the league overview, the cutoffs and where the numbers come from', async () => {
    render(<ArenaPage />);
    await screen.findByText('champion Star');
    const leagues = screen.getByRole('table', { name: 'Leagues' });
    expect(within(leagues).getAllByRole('row').slice(1).map((r) => within(r).getAllByRole('cell').map((c) => c.textContent)))
      .toEqual([['62.1%', '31', '3475'], ['51.7%', '336', '3152']]);
    expect(within(leagues).getAllByRole('rowheader').map((c) => c.textContent)).toEqual(['Legend', 'Emperor']);
    const src = screen.getByRole('link', { name: /official infographic/ });
    expect(src.getAttribute('href')).toBe('https://page.onstove.com/epicseven/global/view/2');
    expect(src.getAttribute('rel')).toBe('noopener noreferrer');
    expect(screen.getByText(/2026-08-07/)).toBeTruthy();
  });

  it('explains pre-ban, first pick and pick', async () => {
    render(<ArenaPage />);
    await screen.findByText('champion Star');
    const notes = screen.getByRole('region', { name: 'What the numbers mean' });
    expect(within(notes).getByText(/Pre-ban/)).toBeTruthy();
    expect(within(notes).getByText(/First pick/)).toBeTruthy();
  });

  it('keeps working when hero names cannot be loaded', async () => {
    vi.mocked(loadHeroes).mockRejectedValue(new Error('no heroes'));
    render(<ArenaPage />);
    expect(await screen.findByText('champion Star')).toBeTruthy();
    expect(within(rows()[0]).queryByRole('link')).toBeNull();
  });

  it('says how to collect when there is no arena data', async () => {
    vi.mocked(loadArenaIndex).mockResolvedValue(null);
    render(<ArenaPage />);
    expect(await screen.findByText(/No World Arena data/)).toBeTruthy();
    expect(screen.getByText(/npm run arena/)).toBeTruthy();
  });

  it('shows an explicit error when loading fails', async () => {
    vi.mocked(loadArenaIndex).mockRejectedValue(new Error('boom'));
    render(<ArenaPage />);
    expect(await screen.findByText(/Failed to load: .*boom/)).toBeTruthy();
  });
});

describe('ArenaPage in French', () => {
  it('translates the title, the controls and the columns', async () => {
    localStorage.setItem('e7.lang', 'fr');
    render(<I18nProvider><ArenaPage /></I18nProvider>);
    expect(await screen.findByRole('heading', { level: 1, name: fr['arena.title'].replace('{season}', 'Summer 2026') })).toBeTruthy();
    expect(screen.getByRole('combobox', { name: fr['arena.season'] })).toBeTruthy();
    expect(screen.getByRole('button', { name: fr['arena.metricFirstPick'] })).toBeTruthy();
    const heads = within(screen.getByRole('table', { name: fr['arena.draftRates'] })).getAllByRole('columnheader').map((c) => c.textContent);
    expect(heads).toEqual(['#', fr['arena.colHero'], fr['arena.colPick'], fr['arena.colBan'], fr['arena.colWin']]);
  });
});

describe('ArenaPage: names in French', () => {
  it('names the heroes of the infographic and of the sample in French', async () => {
    localStorage.setItem('e7.lang', 'fr');
    vi.mocked(loadNames).mockResolvedValue({ lang: 'fr', updated: 'x', heroes: { c9: 'Étoile FR', c10: 'Autre FR' }, artifacts: {}, sets: {} });
    vi.mocked(loadHeroes).mockResolvedValue([
      { code: 'c9', name: 'champion Star', grade: 5, job: 'mage', element: 'fire' }, { code: 'c10', name: 'Beta', grade: 5, job: 'knight', element: 'ice' },
    ]);
    vi.mocked(loadRta).mockResolvedValue({ season: 'Fall 2026', code: 's', updated: 'x', players: 1, battles: 100, heroes: { c10: { pick: 50, played: 50, win: 25, first: 5, ban: 0, preban: 0 } } });
    render(<I18nProvider><ArenaPage /></I18nProvider>);
    const draft = await screen.findByRole('table', { name: fr['arena.draftRates'] });
    await waitFor(() => expect(within(draft).getByRole('link', { name: 'Étoile FR' }).getAttribute('href')).toBe('#/hero/c9'));
    const sample = await screen.findByRole('table', { name: fr['arena.sampleAria'] });
    expect(within(sample).getByRole('link', { name: 'Autre FR' }).getAttribute('href')).toBe('#/hero/c10');
  });
});

describe('ArenaPage: top players sample', () => {
  const rta: RtaStats = {
    season: 'Fall 2026', code: 'pvp_rta_ss21', updated: '2026-11-06', players: 100, battles: 1000, since: '2026-10-20', until: '2026-11-03',
    heroes: {
      c9: { pick: 600, played: 500, win: 300, first: 100, ban: 100, preban: 50 },
      c10: { pick: 200, played: 200, win: 80, first: 300, ban: 0, preban: 400 },
      c11: { pick: 5, played: 5, win: 5, first: 0, ban: 0, preban: 0 },
    },
  };
  const table = () => screen.findByRole('table', { name: 'Top players, all heroes' });

  it('lists every hero of the sample with pick, win, ban, pre-ban and first pick rates, and says how it was counted', async () => {
    vi.mocked(loadRta).mockResolvedValue(rta);
    vi.mocked(loadHeroes).mockResolvedValue([
      { code: 'c9', name: 'Alpha', grade: 5, job: 'mage', element: 'fire' }, { code: 'c10', name: 'Beta', grade: 5, job: 'knight', element: 'ice' },
    ]);
    render(<ArenaPage />);
    const t = await table();
    const heads = within(t).getAllByRole('columnheader').map((c) => c.textContent);
    expect(heads).toEqual(['#', 'Hero', 'Pick', 'Win rate', 'Ban', 'Pre-ban', 'First pick']);
    const first = within(within(t).getAllByRole('row')[1]).getAllByRole('cell').map((c) => c.textContent);
    expect(first).toEqual(['1', 'Alpha', '60%', '60%', '10%', '5%', '10%']); // 600 / 1000 picks, 300 / 500 wins
    expect(within(within(t).getAllByRole('row')[1]).getByRole('link', { name: 'Alpha' }).getAttribute('href')).toBe('#/hero/c9');
    expect(within(t).queryByText('c11')).toBeNull(); // 5 games: too few
    const sec = screen.getByRole('region', { name: 'Top players sample' });
    expect(sec.textContent).toContain('1,000 recent ranked battles');
    expect(sec.textContent).toContain('100 top players');
    expect(sec.textContent).toContain('Fall 2026');
    expect(sec.textContent).toContain('2026-10-20 to 2026-11-03'); // the days the accumulated battles were played
  });

  it('sorts by another column when asked', async () => {
    vi.mocked(loadRta).mockResolvedValue(rta);
    vi.mocked(loadHeroes).mockResolvedValue([
      { code: 'c9', name: 'Alpha', grade: 5, job: 'mage', element: 'fire' }, { code: 'c10', name: 'Beta', grade: 5, job: 'knight', element: 'ice' },
    ]);
    render(<ArenaPage />);
    const t = await table();
    expect(screen.getByRole('button', { name: 'By pick' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'By pre-ban' }));
    expect(within(within(t).getAllByRole('row')[1]).getAllByRole('cell')[1].textContent).toBe('Beta'); // 40% pre-banned against 5%
    expect(screen.getByRole('button', { name: 'By pre-ban' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'By win rate' }));
    expect(within(within(t).getAllByRole('row')[1]).getAllByRole('cell')[1].textContent).toBe('Alpha'); // 60% against 40%
  });

  it('is left out when the sample has not been collected', async () => {
    render(<ArenaPage />);
    await screen.findByRole('table', { name: 'Draft rates' });
    expect(screen.queryByRole('region', { name: 'Top players sample' })).toBeNull();
  });
});
