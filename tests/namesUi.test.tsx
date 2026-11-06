import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import HeroList from '../src/pages/HeroList';
import { ArtifactPage } from '../src/pages/GearPage';
import { ModePage } from '../src/pages/ModesPage';
import Search from '../src/components/Search';
import { I18nProvider } from '../src/i18n';
import { loadGear, loadHeroes, loadIndex, loadModes, loadNames, loadTeams } from '../src/lib/data';
import type { NamesFile } from '../src/shared/types';

vi.mock('../src/lib/guides', async () => (await import('./sampleGuides')).guidesModule());
vi.mock('../src/lib/data', async (orig) => ({
  ...(await orig<typeof import('../src/lib/data')>()),
  loadIndex: vi.fn(), loadHeroes: vi.fn(), loadGear: vi.fn(), loadModes: vi.fn(), loadTeams: vi.fn(), loadNames: vi.fn(),
}));

const names: NamesFile = {
  lang: 'fr', updated: 'x',
  heroes: { c1: 'Zoé', c2: 'Zed', c3: 'Noa' },
  artifacts: { efk1: 'Lame du soleil' },
  sets: {},
};
const heroes = [
  { code: 'c1', name: 'Abigail', grade: 5, job: 'mage', element: 'fire' },
  { code: 'c2', name: 'Bob', grade: 5, job: 'knight', element: 'ice' },
  { code: 'c3', name: 'Cleo', grade: 4, job: 'ranger', element: 'dark' },
];
const gear = {
  key: 'k',
  artifacts: { efk1: { code: 'efk1', name: 'Sun Blade', job: 'knight', grade: 5, attack: 1, health: 1, maxAttack: 2, maxHealth: 2, description: 'Does things.', values: [], heroes: [{ code: 'c1', name: 'Abigail', share: 40 }] } },
};
const modes = { key: 'k', lists: [{ id: 'hunt-1-13', mode: 'hunts' as const, group: 'Wyvern Hunt', variant: 'Hell', title: 'Wyvern Hunt, Hell', heroes: [{ code: 'c1', name: 'Abigail', share: 50 }, { code: 'c3', name: 'Cleo', share: 20 }] }] };
const teams = { key: 'k', lists: { 'hunt-1-13': { c1: [{ share: 12, heroes: ['c1', 'c2'] }] } } };

beforeEach(() => {
  localStorage.setItem('e7.lang', 'fr');
  vi.mocked(loadNames).mockResolvedValue(names);
  vi.mocked(loadIndex).mockResolvedValue({ periods: ['2026-10-29'] });
  vi.mocked(loadHeroes).mockResolvedValue(heroes);
  vi.mocked(loadGear).mockResolvedValue(gear);
  vi.mocked(loadModes).mockResolvedValue(modes);
  vi.mocked(loadTeams).mockResolvedValue(teams);
});
afterEach(() => { cleanup(); localStorage.clear(); vi.resetAllMocks(); });

const inFrench = (ui: React.ReactElement) => render(<I18nProvider>{ui}</I18nProvider>);

describe('hero list', () => {
  it('shows and sorts the heroes by their name in the language, and finds them by either name', async () => {
    inFrench(<HeroList />);
    await waitFor(() => expect(screen.getByRole('link', { name: 'Zoé' })).toBeTruthy());
    const order = () => screen.getAllByRole('link').map((a) => a.textContent);
    expect(order()).toEqual(['Noa', 'Zed', 'Zoé']); // sorted by the names shown, not by the English ones
    expect(screen.getByRole('link', { name: 'Zoé' }).getAttribute('href')).toBe('#/hero/c1');
    const box = screen.getByRole('searchbox');
    fireEvent.change(box, { target: { value: 'abigail' } }); // the English name still finds her
    expect(order()).toEqual(['Zoé']);
    fireEvent.change(box, { target: { value: 'zoe' } }); // so does the French one, without the accent
    expect(order()).toEqual(['Zoé']);
  });
});

describe('search box', () => {
  it('lists heroes and artifacts by their name in the language, and still finds them by the English one', async () => {
    inFrench(<Search />);
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    const input = await screen.findByRole('combobox');
    await waitFor(() => expect(loadHeroes).toHaveBeenCalled());
    fireEvent.change(input, { target: { value: 'zoe' } });
    await waitFor(() => expect(screen.getAllByRole('option').some((o) => o.textContent?.includes('Zoé'))).toBe(true));
    fireEvent.change(input, { target: { value: 'abigail' } });
    await waitFor(() => expect(screen.getAllByRole('option')[0].textContent).toContain('Zoé'));
    fireEvent.change(input, { target: { value: 'sun blade' } });
    await waitFor(() => expect(screen.getAllByRole('option')[0].textContent).toContain('Lame du soleil'));
  });
});

describe('artifact page', () => {
  it('names the artifact and the heroes wearing it in the language', async () => {
    inFrench(<ArtifactPage code="efk1" />);
    expect(await screen.findByRole('heading', { level: 1, name: 'Lame du soleil' })).toBeTruthy();
    await waitFor(() => expect(screen.getByRole('link', { name: 'Zoé' }).getAttribute('href')).toBe('#/hero/c1'));
  });
});

describe('mode page', () => {
  it('names the heroes of the rankings and of the teams in the language', async () => {
    inFrench(<ModePage id="hunt-1-13" />);
    const top = await screen.findByRole('region', { name: 'Meilleurs héros' });
    await waitFor(() => expect(within(top).getByRole('link', { name: 'Zoé' })).toBeTruthy());
    expect(within(top).getByRole('link', { name: 'Noa' })).toBeTruthy();
    const teamsPanel = screen.getByRole('region', { name: 'Meilleures équipes' });
    expect(within(teamsPanel).getByRole('link', { name: 'Zoé' })).toBeTruthy();
    expect(within(teamsPanel).getByRole('link', { name: 'Zed' })).toBeTruthy();
  });
});
