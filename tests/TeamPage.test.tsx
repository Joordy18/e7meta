import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import TeamPage from '../src/pages/TeamPage';
import { loadHeroes, loadIndex, loadRta, loadRtaTable } from '../src/lib/data';
import type { RtaStats, RtaTable } from '../src/shared/types';

vi.mock('../src/lib/data', async (orig) => ({
  ...(await orig<typeof import('../src/lib/data')>()),
  loadIndex: vi.fn(), loadHeroes: vi.fn(), loadRta: vi.fn(), loadRtaTable: vi.fn(),
}));

const codes = ['ha', 'hb', 'hc', 'hx'];
const heroes = codes.map((code) => ({ code, name: `Hero ${code.toUpperCase()}`, grade: 5, job: 'mage', element: 'fire' }));
const stats: RtaStats = {
  season: 'Fall 2026', code: 's', updated: 'x', players: 10, battles: 1000,
  heroes: Object.fromEntries(codes.map((c) => [c, { pick: 300, played: 300, win: 156, first: 10, ban: 20, preban: 30 }])), // 52% each
};
const table: RtaTable = {
  code: 's', updated: 'x', battles: 1000, minGames: 30,
  heroes: {
    ha: { with: [['hb', 100, 60, 5, 1], ['hc', 90, 52, 3, 0]], versus: [['hx', 80, 40, -6, 1]] },
    hb: { with: [['ha', 100, 60, 5, 1]], versus: [] },
    hc: { with: [], versus: [] },
    hx: { with: [], versus: [['ha', 80, 60, 6, 1]] },
  },
};

beforeEach(() => {
  history.replaceState(null, '', '#/tools/team');
  vi.mocked(loadIndex).mockResolvedValue({ periods: ['2026-10-29'] });
  vi.mocked(loadHeroes).mockResolvedValue(heroes);
  vi.mocked(loadRta).mockResolvedValue(stats);
  vi.mocked(loadRtaTable).mockResolvedValue(table);
});
afterEach(() => { cleanup(); vi.resetAllMocks(); history.replaceState(null, '', '#/'); });

const grid = () => screen.getByRole('list', { name: 'Heroes' });
const pickFromGrid = async (name: string) => fireEvent.click(within(await screen.findByRole('list', { name: 'Heroes' })).getByRole('button', { name }));

describe('TeamPage', () => {
  it('asks for a hero first, then ranks the partners of the team and names who to watch out for', async () => {
    render(<TeamPage />);
    expect(await screen.findByText('Pick at least one hero for your team to see suggestions.')).toBeTruthy();
    await pickFromGrid('Hero HA');
    const partners = await screen.findByRole('region', { name: 'Best partners' });
    const rows = within(partners).getAllByRole('listitem').map((li) => li.textContent);
    expect(rows[0]).toContain('Hero HB'); // 52 - 50 + 5
    expect(rows[0]).toContain('+7');
    expect(rows.some((r) => r?.includes('Hero HA'))).toBe(false); // already in the team
    const watch = screen.getByRole('region', { name: 'Heroes to watch out for' });
    expect(within(watch).getAllByRole('listitem')[0].textContent).toContain('Hero HX'); // it beats HA
  });

  it('adds heroes to the opponents when asked, uses them in the ranking, and takes a hero out with a click', async () => {
    render(<TeamPage />);
    await pickFromGrid('Hero HA');
    fireEvent.click(await screen.findByRole('button', { name: 'Opponents (optional)' }));
    await pickFromGrid('Hero HX');
    expect(await screen.findByText(/Your team against the opponents: -6 points/)).toBeTruthy();
    expect(within(screen.getByRole('region', { name: 'Opponents (optional)' })).getByRole('button', { name: 'Remove Hero HX' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Remove Hero HX' }));
    await waitFor(() => expect(screen.queryByText(/Your team against the opponents/)).toBeNull());
  });

  it('keeps the team in the address and reads it back from there', async () => {
    render(<TeamPage />);
    await pickFromGrid('Hero HA');
    await pickFromGrid('Hero HB');
    await waitFor(() => expect(location.hash).toBe('#/tools/team?me=ha,hb'));
    cleanup();
    render(<TeamPage />);
    const mine = await screen.findByRole('region', { name: 'Your team' });
    expect(within(mine).getByRole('button', { name: 'Remove Hero HA' })).toBeTruthy();
    expect(within(mine).getByRole('button', { name: 'Remove Hero HB' })).toBeTruthy();
    expect(grid()).toBeTruthy();
  });

  it('drops what is not a hero code in the address, and says so when there is no pair data', async () => {
    history.replaceState(null, '', '#/tools/team?me=ha,%3Cscript%3E,hb');
    render(<TeamPage />);
    const mine = await screen.findByRole('region', { name: 'Your team' });
    expect(within(mine).getAllByRole('button')).toHaveLength(2);
    cleanup();
    vi.mocked(loadRtaTable).mockResolvedValue(null);
    render(<TeamPage />);
    expect(await screen.findByText(/No RTA data yet/)).toBeTruthy();
  });
});
