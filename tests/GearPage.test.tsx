import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { ArtifactPage, SetPage } from '../src/pages/GearPage';
import { loadGear, loadIndex } from '../src/lib/data';
import type { Gear } from '../src/shared/types';

vi.mock('../src/lib/data', async (orig) => ({ ...(await orig<typeof import('../src/lib/data')>()), loadIndex: vi.fn(), loadGear: vi.fn() }));
beforeEach(() => vi.mocked(loadIndex).mockResolvedValue({ periods: ['2026-10-22'] }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });

const gear: Gear = {
  key: '2026-10-22',
  artifacts: {
    efw21: {
      code: 'efw21', name: "A Little Queen's Huge Crown", job: 'warrior', grade: 5,
      attack: 21, health: 32, maxAttack: 273, maxHealth: 416,
      description: 'Increases damage by @ on a Single Attack, and by an additional @@ against a barrier.',
      values: [{ level1: '8.0%', max: '16.0%' }, { level1: '4.0%', max: '9.0%' }],
      heroes: [{ code: 'c1', name: 'Abigail', share: 61.5 }, { code: 'c2', name: 'Aki', share: 12.25 }],
    },
    efk23: {
      code: 'efk23', name: 'A Precious Connection', job: 'knight', grade: 4, attack: 1, health: 2, maxAttack: 3, maxHealth: 4,
      description: 'Increases Health by 10%.', values: [], heroes: [],
    },
  },
  sets: {
    set_att: { code: 'set_att', name: 'Attack Set', effect: 'Attack increases by 45%.', heroes: [{ code: 'c1', name: 'Abigail', share: 30 }] },
  },
};

describe('ArtifactPage', () => {
  it('shows the artifact: stars, class, base and max stats, and the effect at both levels', async () => {
    vi.mocked(loadGear).mockResolvedValue(gear);
    render(<ArtifactPage code="efw21" />);
    expect(await screen.findByRole('heading', { level: 1, name: "A Little Queen's Huge Crown" })).toBeTruthy();
    expect(loadGear).toHaveBeenCalledWith('2026-10-22');
    expect(screen.getByText(/5★/)).toBeTruthy();
    expect(screen.getByText(/Warrior exclusive/)).toBeTruthy();
    const table = screen.getByRole('table', { name: 'Artifact stats' });
    expect(within(table).getAllByRole('columnheader').map((c) => c.textContent)).toEqual(['', 'Level 1', 'Max level']);
    const rows = within(table).getAllByRole('row').slice(1).map((r) => within(r).getAllByRole('cell').map((c) => c.textContent));
    expect(rows).toEqual([['21', '273'], ['32', '416']]);
    expect(within(table).getAllByRole('rowheader').map((c) => c.textContent)).toEqual(['Attack', 'Health']);
    const effect = screen.getByRole('region', { name: 'Effect' });
    expect(within(effect).getByText(/Level 1:.*Increases damage by 8\.0% on a Single Attack, and by an additional 4\.0% against a barrier\./)).toBeTruthy();
    expect(within(effect).getByText(/Max level:.*Increases damage by 16\.0% on a Single Attack, and by an additional 9\.0% against a barrier\./)).toBeTruthy();
  });

  it('shows one effect text when nothing varies with the level', async () => {
    vi.mocked(loadGear).mockResolvedValue(gear);
    render(<ArtifactPage code="efk23" />);
    const effect = await screen.findByRole('region', { name: 'Effect' });
    expect(within(effect).getByText('Increases Health by 10%.')).toBeTruthy();
    expect(within(effect).queryByText(/Level 1:/)).toBeNull();
    expect(screen.queryByRole('region', { name: 'Worn most by' })).toBeNull(); // nobody in the data: no empty block
  });

  it('lists who wears it most, linking to each hero', async () => {
    vi.mocked(loadGear).mockResolvedValue(gear);
    render(<ArtifactPage code="efw21" />);
    const panel = await screen.findByRole('region', { name: 'Worn most by' });
    const rows = within(panel).getAllByRole('listitem');
    expect(rows[0].textContent).toContain('Abigail');
    expect(rows[0].textContent).toContain('61.5%');
    expect(within(rows[0]).getByRole('link', { name: 'Abigail' }).getAttribute('href')).toBe('#/hero/c1');
    expect(rows[1].textContent).toContain('12.25%');
  });

  it('says so for an unknown artifact, with a way back', async () => {
    vi.mocked(loadGear).mockResolvedValue(gear);
    render(<ArtifactPage code="nope" />);
    expect(await screen.findByText('Unknown artifact')).toBeTruthy();
    expect(screen.getByRole('link', { name: /All heroes/ }).getAttribute('href')).toBe('#/');
  });

  it('says how to collect when there is no gear data', async () => {
    vi.mocked(loadGear).mockResolvedValue(null);
    render(<ArtifactPage code="efw21" />);
    expect(await screen.findByText(/No gear data/)).toBeTruthy();
    expect(screen.getByText(/npm run collect/)).toBeTruthy();
  });

  it('shows an explicit error when loading fails', async () => {
    vi.mocked(loadGear).mockRejectedValue(new Error('boom'));
    render(<ArtifactPage code="efw21" />);
    expect(await screen.findByText(/Failed to load: .*boom/)).toBeTruthy();
  });
});

describe('SetPage', () => {
  it('shows the set, its effect and who wears it most', async () => {
    vi.mocked(loadGear).mockResolvedValue(gear);
    render(<SetPage code="set_att" />);
    expect(await screen.findByRole('heading', { level: 1, name: 'Attack Set' })).toBeTruthy();
    expect(screen.getByText('Attack increases by 45%.')).toBeTruthy();
    const rows = within(screen.getByRole('region', { name: 'Worn most by' })).getAllByRole('listitem');
    expect(within(rows[0]).getByRole('link', { name: 'Abigail' }).getAttribute('href')).toBe('#/hero/c1');
  });
  it('says so for an unknown set', async () => {
    vi.mocked(loadGear).mockResolvedValue(gear);
    render(<SetPage code="nope" />);
    expect(await screen.findByText('Unknown set')).toBeTruthy();
  });
});
