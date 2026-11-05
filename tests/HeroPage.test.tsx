import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import HeroPage from '../src/pages/HeroPage';
import App from '../src/App';
import { NotFoundError, loadHero, loadIndex, loadHeroes, loadModes } from '../src/lib/data';
import { mapDetail, mapSetNames, mapShares } from '../scripts/collect/map';
import type { HeroSnapshot } from '../src/shared/types';

vi.mock('../src/lib/data', async (orig) => ({
  ...(await orig<typeof import('../src/lib/data')>()),
  loadIndex: vi.fn(), loadHero: vi.fn(), loadHeroes: vi.fn(), loadModes: vi.fn(),
}));
beforeEach(() => {
  vi.mocked(loadIndex).mockResolvedValue({ periods: ['2026-10-29', '2026-10-22'] });
  vi.mocked(loadModes).mockResolvedValue(null);
});
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
    expect(screen.getByRole('link', { name: '← All heroes' }).getAttribute('href')).toBe('#/');

    const equip = region('Source: gear ranking');
    expect(within(equip).getByText('2026-10-22 to 2026-10-28')).toBeTruthy();
    const sets = within(equip).getByRole('region', { name: 'Sets' });
    expect(within(sets).getAllByRole('meter')).toHaveLength(10);
    expect(within(within(sets).getAllByRole('meter')[0]).getByText('23.86%')).toBeTruthy();
    const arts = within(equip).getByRole('region', { name: 'Artifacts' });
    expect(within(arts).getAllByRole('meter')[0].textContent).toContain('77.81%');
    expect(within(arts).getAllByRole('meter')[0].getAttribute('title')).toBeTruthy();

    const hunts = region('Source: hunts');
    expect(within(hunts).getByText('2026-10-29 to 2026-11-04')).toBeTruthy();
    const combos = within(hunts).getAllByRole('meter').filter((m) => m.textContent?.includes('+'));
    expect(combos).toHaveLength(2);
    expect(combos[0].textContent).toContain('39.2%');
    expect(within(hunts).getByText('91.5%')).toBeTruthy();
  });

  it('draws 8 labelled histograms of 10 buckets with min/max axis labels', async () => {
    vi.mocked(loadHero).mockResolvedValue(snapshot);
    render(<HeroPage code="c1176" />);
    const attack = await screen.findByRole('group', { name: 'Attack' });
    expect(within(attack).getAllByRole('meter')).toHaveLength(10);
    expect(within(attack).getByText('1200')).toBeTruthy();
    expect(within(attack).getByText('5200')).toBeTruthy();
    const labels = ['Attack', 'Defense', 'Health', 'Speed', 'Crit chance', 'Crit damage', 'Effectiveness', 'Effect resistance'];
    expect(screen.getAllByRole('group').map((g) => g.getAttribute('aria-label'))).toEqual(labels);
    expect(screen.getByText(/10 equal buckets between min and max \(estimate\)/)).toBeTruthy();
  });

  it('lists what to aim for per stat: typical range, median and where the top 25% / 10% start', async () => {
    vi.mocked(loadHero).mockResolvedValue(snapshot);
    render(<HeroPage code="c1176" />);
    const table = await screen.findByRole('table', { name: 'Stat targets' });
    expect(within(table).getAllByRole('columnheader').map((c) => c.textContent)).toEqual(['Stat', 'Typical', 'Median', 'Top 25% from', 'Top 10% from']);
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows.map((r) => within(r).getByRole('rowheader').textContent)).toEqual(
      ['Attack', 'Defense', 'Health', 'Speed', 'Crit chance', 'Crit damage', 'Effectiveness', 'Effect resistance']);
    const crit = within(rows[4]).getAllByRole('cell').map((c) => c.textContent!);
    expect(crit[0]).toMatch(/^\d+–\d+%$/); // a range, with the unit on percentage stats
    expect(crit[2]).toMatch(/^\d+%\+$/); // a lower bound: "from here up"
    const health = within(rows[2]).getAllByRole('cell').map((c) => c.textContent!);
    expect(health[0]).toMatch(/^[\d,]+–[\d,]+$/); // thousands separated, no unit
  });

  it('omits the hunts block when detail is missing but renders the rest', async () => {
    vi.mocked(loadHero).mockResolvedValue({ ...snapshot, detail: undefined });
    render(<HeroPage code="c1176" />);
    expect(await screen.findByText('23.86%')).toBeTruthy();
    expect(screen.queryByText(/Source: hunts/)).toBeNull();
    expect(screen.queryAllByRole('group')).toHaveLength(0);
  });

  it('reloads the hero when the period changes', async () => {
    vi.mocked(loadHero).mockResolvedValue(snapshot);
    render(<HeroPage code="c1176" />);
    const select = await screen.findByLabelText('Period');
    expect(within(select).getAllByRole('option').map((o) => o.textContent)).toEqual(['2026-10-29', '2026-10-22']);
    fireEvent.change(select, { target: { value: '2026-10-22' } });
    await waitFor(() => expect(loadHero).toHaveBeenLastCalledWith('2026-10-22', 'c1176'));
  });

  it('shows an explicit error when loading fails', async () => {
    vi.mocked(loadHero).mockRejectedValue(new Error('boom'));
    render(<HeroPage code="c1176" />);
    expect(await screen.findByText(/Failed to load: .*boom/)).toBeTruthy();
  });

  it('says there is no data for this hero on this period, selector stays usable', async () => {
    vi.mocked(loadHero).mockRejectedValueOnce(new NotFoundError('2026-10-29/hero/c1176.json')).mockResolvedValueOnce(snapshot);
    render(<HeroPage code="c1176" />);
    expect(await screen.findByText('No data for this hero in this period')).toBeTruthy();
    expect(screen.queryByText(/Erreur de chargement/)).toBeNull();
    fireEvent.change(screen.getByLabelText('Period'), { target: { value: '2026-10-22' } });
    expect(await screen.findByRole('heading', { name: 'Setsuka' })).toBeTruthy();
  });

  it('shows "No data" in blocks whose list is empty', async () => {
    const empty = { ...snapshot, sets: [], artifacts: [], detail: { ...snapshot.detail!, combos: [], artifacts: [] } };
    vi.mocked(loadHero).mockResolvedValue(empty);
    render(<HeroPage code="c1176" />);
    await screen.findByRole('heading', { name: 'Setsuka' });
    for (const name of ['Sets', 'Artifacts', 'Set combinations', 'Artifacts (hunts)']) {
      expect(within(region(name)).getByText('No data')).toBeTruthy();
    }
  });

  it('still renders a snapshot from before combos carried set codes (older periods stay readable)', async () => {
    const legacy = { ...snapshot, detail: { ...snapshot.detail!, combos: snapshot.detail!.combos.map(({ sets, share }) => ({ sets, share })) } };
    vi.mocked(loadHero).mockResolvedValue(legacy as unknown as typeof snapshot);
    render(<HeroPage code="c1176" />);
    expect(await screen.findByRole('heading', { name: 'Setsuka' })).toBeTruthy();
    expect(within(region('Set combinations')).getAllByRole('meter')[0].textContent).toContain('39.2%');
  });

  it('shows where the hero is used in other game modes, best first, with its rank', async () => {
    vi.mocked(loadHero).mockResolvedValue(snapshot);
    vi.mocked(loadModes).mockResolvedValue({ key: 'k', lists: [
      { id: 'a', mode: 'abyss', title: 'Abyss, floor 120', heroes: [{ code: 'x', name: 'X', share: 70 }, { code: 'c1176', name: 'Setsuka', share: 20.5 }] },
      { id: 'b', mode: 'hunts', title: 'Golem Hunt, Hell', heroes: [{ code: 'c1176', name: 'Setsuka', share: 45 }] },
    ] });
    render(<HeroPage code="c1176" />);
    const panel = await screen.findByRole('region', { name: 'Other game modes' });
    const rows = within(panel).getAllByRole('meter');
    expect(rows.map((r) => r.textContent)).toEqual(['#1 Golem Hunt, Hell45%', '#2 Abyss, floor 12020.5%']);
    expect(loadModes).toHaveBeenCalledWith('2026-10-29');
  });

  it('leaves out the other-modes block when the hero is in no list or there is no mode data', async () => {
    vi.mocked(loadHero).mockResolvedValue(snapshot);
    render(<HeroPage code="c1176" />);
    await screen.findByRole('heading', { name: 'Setsuka' });
    expect(screen.queryByRole('region', { name: 'Other game modes' })).toBeNull();
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
    fireEvent.change(await screen.findByLabelText('Period'), { target: { value: '2026-10-22' } });
    expect(await screen.findByRole('heading', { name: 'Nouveau' })).toBeTruthy();
    await act(async () => { resolveOld(snapshot); });
    expect(screen.queryByRole('heading', { name: 'Setsuka' })).toBeNull();
  });
});

describe('App header', () => {
  it('labels the latest period as the ranking week', async () => {
    location.hash = '';
    vi.mocked(loadHeroes).mockResolvedValue([]);
    render(<App />);
    expect(await screen.findByText(/Data: week of 2026-10-29/)).toBeTruthy();
    expect(screen.queryByText(/Dernier instantané/)).toBeNull();
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
    expect(await screen.findByText(/0 heroes/)).toBeTruthy();
    cleanup();
    await at('#/hero/c1/extra');
    expect(await screen.findByText(/0 heroes/)).toBeTruthy();
    expect(loadHero).not.toHaveBeenCalled();
  });
});
