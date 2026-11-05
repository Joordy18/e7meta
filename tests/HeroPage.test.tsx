import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import HeroPage from '../src/pages/HeroPage';
import App from '../src/App';
import { loadHero, loadIndex, loadHeroes } from '../src/lib/data';
import { mapDetail, mapSetNames, mapShares } from '../scripts/collect/map';
import type { HeroSnapshot } from '../src/shared/types';

vi.mock('../src/lib/data', async (orig) => ({
  ...(await orig<typeof import('../src/lib/data')>()),
  loadIndex: vi.fn(), loadHero: vi.fn(), loadHeroes: vi.fn(),
}));
beforeEach(() => vi.mocked(loadIndex).mockResolvedValue({ periods: ['2026-10-29', '2026-10-22'] }));
afterEach(() => { cleanup(); vi.resetAllMocks(); location.hash = ''; });

const fx = (n: string) => JSON.parse(readFileSync(`tests/fixtures/${n}.json`, 'utf8'));
const period = { start: '2026-10-22', end: '2026-10-28' };
const detailPeriod = { start: '2026-10-29', end: '2026-11-04' };
const snapshot: HeroSnapshot = {
  hero: { code: 'c1176', name: 'Setsuka', grade: 5, job: 'assassin', element: 'fire' },
  period,
  sets: mapShares(fx('hero-equip-ranking'), 'set'),
  artifacts: mapShares(fx('hero-artifact-ranking'), 'artifact'),
  detail: mapDetail(fx('hero-detail'), detailPeriod, mapSetNames(fx('hero-equip-ranking'))),
};
const region = (name: string) => screen.getByRole('region', { name });

describe('HeroPage', () => {
  it('shows both sources with their own period and formatted shares', async () => {
    vi.mocked(loadHero).mockResolvedValue(snapshot);
    render(<HeroPage code="c1176" />);
    expect(await screen.findByRole('heading', { name: 'Setsuka' })).toBeTruthy();
    expect(loadHero).toHaveBeenCalledWith('2026-10-29', 'c1176');
    expect(screen.getByRole('link', { name: '← Retour à la liste' }).getAttribute('href')).toBe('#/');

    const equip = region("Source : classement d'équipement");
    expect(within(equip).getByText('du 2026-10-22 au 2026-10-28')).toBeTruthy();
    const sets = within(equip).getByRole('region', { name: 'Sets' });
    expect(within(sets).getAllByRole('meter')).toHaveLength(10);
    expect(within(within(sets).getAllByRole('meter')[0]).getByText('23,86 %')).toBeTruthy();
    const arts = within(equip).getByRole('region', { name: 'Artéfacts' });
    expect(within(arts).getAllByRole('meter')[0].textContent).toContain('77,81 %');
    expect(within(arts).getAllByRole('meter')[0].getAttribute('title')).toBeTruthy();

    const hunts = region('Source : chasses');
    expect(within(hunts).getByText('du 2026-10-29 au 2026-11-04')).toBeTruthy();
    const combos = within(hunts).getAllByRole('meter').filter((m) => m.textContent?.includes('+'));
    expect(combos).toHaveLength(2);
    expect(combos[0].textContent).toContain('39,2 %');
    expect(within(hunts).getByText('91,5 %')).toBeTruthy();
  });

  it('draws 8 labelled histograms of 10 buckets with min/max axis labels', async () => {
    vi.mocked(loadHero).mockResolvedValue(snapshot);
    render(<HeroPage code="c1176" />);
    const attack = await screen.findByRole('group', { name: 'Attaque' });
    expect(within(attack).getAllByRole('meter')).toHaveLength(10);
    expect(within(attack).getByText('1200')).toBeTruthy();
    expect(within(attack).getByText('5200')).toBeTruthy();
    const labels = ['Attaque', 'Défense', 'Vitalité', 'Vitesse', 'Chance de critique', 'Dégâts critiques', 'Efficacité', 'Résistance à l\'effet'];
    expect(screen.getAllByRole('group').map((g) => g.getAttribute('aria-label'))).toEqual(labels);
    expect(screen.getByText(/répartition en 10 tranches entre min et max \(estimation\)/)).toBeTruthy();
  });

  it('omits the hunts block when detail is missing but renders the rest', async () => {
    vi.mocked(loadHero).mockResolvedValue({ ...snapshot, detail: undefined });
    render(<HeroPage code="c1176" />);
    expect(await screen.findByText('23,86 %')).toBeTruthy();
    expect(screen.queryByText(/Source : chasses/)).toBeNull();
    expect(screen.queryAllByRole('group')).toHaveLength(0);
  });

  it('reloads the hero when the period changes', async () => {
    vi.mocked(loadHero).mockResolvedValue(snapshot);
    render(<HeroPage code="c1176" />);
    const select = await screen.findByLabelText('Période');
    expect(within(select).getAllByRole('option').map((o) => o.textContent)).toEqual(['2026-10-29', '2026-10-22']);
    fireEvent.change(select, { target: { value: '2026-10-22' } });
    await waitFor(() => expect(loadHero).toHaveBeenLastCalledWith('2026-10-22', 'c1176'));
  });

  it('shows an explicit error when loading fails', async () => {
    vi.mocked(loadHero).mockRejectedValue(new Error('boom'));
    render(<HeroPage code="c1176" />);
    expect(await screen.findByText(/Erreur de chargement : .*boom/)).toBeTruthy();
  });

  it('tells how to collect when there is no index', async () => {
    vi.mocked(loadIndex).mockResolvedValue(null);
    render(<HeroPage code="c1176" />);
    expect(await screen.findByText(/npm run collect/)).toBeTruthy();
  });

  it('ignores a stale response after a quick period change', async () => {
    let resolveOld!: (h: HeroSnapshot) => void;
    const old = new Promise<HeroSnapshot>((r) => { resolveOld = r; });
    vi.mocked(loadHero).mockReturnValueOnce(old).mockResolvedValueOnce({ ...snapshot, hero: { ...snapshot.hero, name: 'Nouveau' } });
    render(<HeroPage code="c1176" />);
    fireEvent.change(await screen.findByLabelText('Période'), { target: { value: '2026-10-22' } });
    expect(await screen.findByRole('heading', { name: 'Nouveau' })).toBeTruthy();
    await act(async () => { resolveOld(snapshot); });
    expect(screen.queryByRole('heading', { name: 'Setsuka' })).toBeNull();
  });
});

describe('App hero route', () => {
  const at = async (hash: string) => {
    location.hash = hash;
    vi.mocked(loadHero).mockResolvedValue(snapshot);
    vi.mocked(loadHeroes).mockResolvedValue([]);
    render(<App />);
  };
  it('parses #/hero/<code>', async () => {
    await at('#/hero/c1176');
    expect(await screen.findByRole('heading', { name: 'Setsuka' })).toBeTruthy();
    expect(loadHero).toHaveBeenCalledWith('2026-10-29', 'c1176');
  });
  it('survives a malformed escape by using the raw code', async () => {
    await at('#/hero/%');
    await waitFor(() => expect(loadHero).toHaveBeenCalledWith('2026-10-29', '%'));
  });
  it('falls to the list for an empty or nested code', async () => {
    await at('#/hero/');
    expect(await screen.findByText(/0 héros/)).toBeTruthy();
    cleanup();
    await at('#/hero/c1/extra');
    expect(await screen.findByText(/0 héros/)).toBeTruthy();
    expect(loadHero).not.toHaveBeenCalled();
  });
});
