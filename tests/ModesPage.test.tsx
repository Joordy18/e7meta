import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import ModesPage from '../src/pages/ModesPage';
import { loadIndex, loadModes } from '../src/lib/data';
import type { Modes } from '../src/shared/types';

vi.mock('../src/lib/data', async (orig) => ({ ...(await orig<typeof import('../src/lib/data')>()), loadIndex: vi.fn(), loadModes: vi.fn() }));
beforeEach(() => vi.mocked(loadIndex).mockResolvedValue({ periods: ['2026-10-22'] }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });

const heroes = (n: number, from = 90) => Array.from({ length: n }, (_, i) => ({ code: `c${i}`, name: `Hero ${i}`, share: from - i }));
const modes: Modes = {
  key: '2026-10-29',
  lists: [
    { id: 'hunt-1-13', mode: 'hunts', title: 'Wyvern Hunt, Hell', period: { start: '2026-10-29', end: '2026-11-04' }, heroes: heroes(30) },
    { id: 'hunt-2-13', mode: 'hunts', title: 'Golem Hunt, Hell', period: { start: '2026-10-29', end: '2026-11-04' }, heroes: [{ code: 'g', name: 'Golem Slayer', share: 55.5 }] },
    { id: 'abyss-120', mode: 'abyss', title: 'Abyss, floor 120', period: { start: '2026-08-07', end: '2026-11-04' }, heroes: [{ code: 'f', name: 'Fenne', share: 72.32 }] },
    { id: 'expedition-1-1', mode: 'expedition', title: 'Pherus Expedition, level 1', heroes: [{ code: 'b', name: 'Brieg', share: 50.86 }] },
  ],
  rift: { title: 'Nightmare of the Oceans', description: 'Only Earth elemental Heroes are allowed in this Rift.', start: '2026-01-08', end: '2026-08-27', elements: ['wind'] },
};

describe('ModesPage', () => {
  it('opens on the first hunt with its period and ranked heroes', async () => {
    vi.mocked(loadModes).mockResolvedValue(modes);
    render(<ModesPage />);
    expect(await screen.findByText('2026-10-29 to 2026-11-04')).toBeTruthy();
    expect(loadModes).toHaveBeenCalledWith('2026-10-22');
    const rows = screen.getAllByRole('listitem');
    expect(rows[0].textContent).toContain('Hero 0');
    expect(rows[0].textContent).toContain('90%');
    expect(within(rows[0]).getByText('1')).toBeTruthy(); // rank
    expect(within(rows[0]).getByRole('link', { name: 'Hero 0' }).getAttribute('href')).toBe('#/hero/c0');
  });

  it('shows 25 heroes, then the rest on demand', async () => {
    vi.mocked(loadModes).mockResolvedValue(modes);
    render(<ModesPage />);
    await screen.findByText('Hero 0');
    expect(screen.getAllByRole('listitem')).toHaveLength(25);
    fireEvent.click(screen.getByRole('button', { name: 'Show more' }));
    expect(screen.getAllByRole('listitem')).toHaveLength(30);
    expect(screen.queryByRole('button', { name: 'Show more' })).toBeNull();
  });

  it('switches mode and content', async () => {
    vi.mocked(loadModes).mockResolvedValue(modes);
    render(<ModesPage />);
    await screen.findByText('Hero 0');
    fireEvent.click(screen.getByRole('button', { name: 'Abyss' }));
    expect(await screen.findByText('Fenne')).toBeTruthy();
    expect(screen.getByText('2026-08-07 to 2026-11-04')).toBeTruthy();
    expect(screen.queryByText('Hero 0')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Hunts' }));
    fireEvent.change(screen.getByLabelText('Content'), { target: { value: 'hunt-2-13' } });
    expect(await screen.findByText('Golem Slayer')).toBeTruthy();
    expect(screen.getByText('55.5%')).toBeTruthy();
  });

  it('shows no period for a list the API gave none for', async () => {
    vi.mocked(loadModes).mockResolvedValue(modes);
    render(<ModesPage />);
    await screen.findByText('Hero 0');
    fireEvent.click(screen.getByRole('button', { name: 'Expeditions' }));
    expect(await screen.findByText('Brieg')).toBeTruthy();
    expect(screen.queryByText(/^\d{4}-\d\d-\d\d to \d{4}-\d\d-\d\d$/)).toBeNull(); // the Rift caption has extra words, so it is not matched
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
