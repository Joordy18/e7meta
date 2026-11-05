import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import HeroList from '../src/pages/HeroList';
import { loadHeroes, loadIndex } from '../src/lib/data';

vi.mock('../src/lib/data', async (orig) => ({ ...(await orig<typeof import('../src/lib/data')>()), loadIndex: vi.fn(), loadHeroes: vi.fn() }));
afterEach(cleanup);

describe('HeroList', () => {
  it('tells how to collect when there is no data', async () => {
    vi.mocked(loadIndex).mockResolvedValue(null);
    render(<HeroList />);
    expect(await screen.findByText(/Aucune donnée/)).toBeTruthy();
    expect(screen.getByText(/npm run collect/)).toBeTruthy();
  });

  it('links every hero and narrows with the search box', async () => {
    vi.mocked(loadIndex).mockResolvedValue({ periods: ['2026-11-02'] });
    vi.mocked(loadHeroes).mockResolvedValue([
      { code: 'c1', name: 'Abigaëlle', grade: 5, job: 'warrior', element: 'fire' },
      { code: 'c2', name: 'Aki', grade: 4, job: 'mage', element: 'wind' },
    ]);
    render(<HeroList />);
    const link = (await screen.findByText('Abigaëlle')).closest('a')!;
    expect(link.getAttribute('href')).toBe('#/hero/c1');
    expect(screen.getAllByRole('link')).toHaveLength(2);
    expect(loadHeroes).toHaveBeenCalledWith('2026-11-02');
    fireEvent.change(screen.getByPlaceholderText('Rechercher un héros'), { target: { value: 'abigaelle' } });
    expect(screen.getAllByRole('link')).toHaveLength(1);
    expect(screen.queryByText('Aki')).toBeNull();
  });

  it('sorts by the top set share and shows that share', async () => {
    vi.mocked(loadIndex).mockResolvedValue({ periods: ['2026-11-02'] });
    vi.mocked(loadHeroes).mockResolvedValue([
      { code: 'c1', name: 'Abigaëlle', grade: 5, job: 'warrior', element: 'fire', topSet: 12.5, topArtifact: 80 },
      { code: 'c2', name: 'Aki', grade: 4, job: 'mage', element: 'wind', topSet: 55.25, topArtifact: 30 },
    ]);
    render(<HeroList />);
    await screen.findByText('Abigaëlle');
    expect(screen.getAllByRole('link').map((a) => a.textContent)).toEqual(['Abigaëlle', 'Aki']);
    fireEvent.change(screen.getByLabelText('Trier par'), { target: { value: 'topSet' } });
    expect(screen.getAllByRole('link').map((a) => a.textContent)).toEqual(['Aki', 'Abigaëlle']);
    expect(screen.getByText(/55,25 %/)).toBeTruthy();
  });
});
