import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import TiersPage from '../src/pages/TiersPage';
import { I18nProvider } from '../src/i18n';
import { fr } from '../src/i18n/fr';
import { loadIndex, loadModes, loadNames } from '../src/lib/data';
import type { ModeList, Modes } from '../src/shared/types';

vi.mock('../src/lib/data', async (orig) => ({
  ...(await orig<typeof import('../src/lib/data')>()),
  loadIndex: vi.fn(), loadModes: vi.fn(), loadNames: vi.fn(),
}));

const list = (id: string, mode: ModeList['mode'], heroes: [string, number][]): ModeList => ({
  id, mode, group: 'g', variant: 'v', title: id, heroes: heroes.map(([code, share]) => ({ code, name: code.toUpperCase(), share })),
});
const modes: Modes = {
  key: 'k',
  lists: [list('h1', 'hunts', [['a', 60], ['b', 30], ['c', 6]]), list('ab', 'abyss', [['z', 90], ['a', 10]]), list('ex', 'expedition', [['y', 44]])],
};

beforeEach(() => {
  vi.mocked(loadIndex).mockResolvedValue({ periods: ['2026-10-29'] });
  vi.mocked(loadModes).mockResolvedValue(modes);
  vi.mocked(loadNames).mockResolvedValue(null);
});
afterEach(() => { cleanup(); localStorage.clear(); vi.resetAllMocks(); });

describe('TiersPage', () => {
  it('shows the tiers of all PvE at first, each hero linking to its page', async () => {
    render(<TiersPage />);
    expect(await screen.findByRole('heading', { level: 1, name: 'PvE tier list' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'All PvE' }).getAttribute('aria-pressed')).toBe('true');
    const s = screen.getByRole('region', { name: 'Tier S' });
    expect(within(s).getAllByRole('link').map((l) => l.textContent)).toEqual(['Z', 'A']); // z (90 over one ranking, averaged with 0 elsewhere) leads
    expect(within(s).getByRole('link', { name: 'Z' }).getAttribute('href')).toBe('#/hero/z');
    expect(within(s).getByRole('link', { name: 'Z' }).getAttribute('title')).toBe('30% average share');
  });

  it('switches to one mode', async () => {
    render(<TiersPage />);
    await screen.findByRole('region', { name: 'Tier S' });
    fireEvent.click(screen.getByRole('button', { name: 'Hunts' }));
    expect(screen.getByRole('button', { name: 'Hunts' }).getAttribute('aria-pressed')).toBe('true');
    const s = screen.getByRole('region', { name: 'Tier S' });
    expect(within(s).getAllByRole('link').map((l) => l.textContent)).toEqual(['A', 'B']);
    expect(screen.queryByRole('link', { name: 'Z' })).toBeNull(); // not in the hunts
  });

  it('explains how a tier is made', async () => {
    render(<TiersPage />);
    await screen.findByRole('region', { name: 'Tier S' });
    expect(screen.getByText(/most used hero of the mode/)).toBeTruthy();
  });

  it('says so when there is no mode data', async () => {
    vi.mocked(loadModes).mockResolvedValue(null);
    render(<TiersPage />);
    expect(await screen.findByText(/No mode data/)).toBeTruthy();
    expect(screen.getByText(/npm run collect/)).toBeTruthy();
  });

  it('is in the language chosen, with the names of the heroes in it', async () => {
    localStorage.setItem('e7.lang', 'fr');
    vi.mocked(loadNames).mockResolvedValue({ lang: 'fr', updated: 'x', heroes: { z: 'Zoé' }, artifacts: {}, sets: {} });
    render(<I18nProvider><TiersPage /></I18nProvider>);
    expect(await screen.findByRole('heading', { level: 1, name: fr['tiers.title'] })).toBeTruthy();
    expect(screen.getByRole('button', { name: fr['tiers.all'] })).toBeTruthy();
    await waitFor(() => expect(screen.getByRole('link', { name: 'Zoé' }).getAttribute('href')).toBe('#/hero/z'));
    expect(screen.getByRole('region', { name: fr['tiers.tier'].replace('{tier}', 'S') })).toBeTruthy();
  });
});
