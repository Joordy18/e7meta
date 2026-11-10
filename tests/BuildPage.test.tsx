import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import BuildPage from '../src/pages/BuildPage';
import { loadGear, loadHeroes, loadIndex, loadRtaBuilds } from '../src/lib/data';

vi.mock('../src/lib/data', async (orig) => ({
  ...(await orig<typeof import('../src/lib/data')>()),
  loadIndex: vi.fn(), loadHeroes: vi.fn(), loadGear: vi.fn(), loadRtaBuilds: vi.fn(),
}));

const heroes = [
  { code: 'c1', name: 'Mage One', grade: 5, job: 'mage', element: 'fire' },
  { code: 'c2', name: 'Knight Two', grade: 5, job: 'knight', element: 'ice' },
];
const art = (code: string, name: string, job: string) => ({ code, name, job, grade: 5, attack: 1, health: 1, maxAttack: 1, maxHealth: 1, description: `${name} effect`, values: [], heroes: [] });
const gear = { key: 'k', artifacts: { a1: art('a1', 'Mage Staff', 'mage'), a2: art('a2', 'Knight Sword', 'knight'), a3: art('a3', 'Any Charm', 'NN') } };

beforeEach(() => {
  history.replaceState(null, '', '#/tools/build');
  vi.mocked(loadIndex).mockResolvedValue({ periods: ['2026-10-29'] });
  vi.mocked(loadHeroes).mockResolvedValue(heroes);
  vi.mocked(loadGear).mockResolvedValue(gear);
  vi.mocked(loadRtaBuilds).mockResolvedValue({ code: 's', updated: 'x', heroes: {}, setNames: { set_speed: 'Speed Set', set_cri: 'Critical Set' }, artifactNames: {} });
});
afterEach(() => { cleanup(); vi.resetAllMocks(); history.replaceState(null, '', '#/'); });

const hero = () => screen.findByRole('combobox', { name: 'Hero' });
const artifacts = () => screen.getByRole('combobox', { name: 'Artifact' });

describe('BuildPage', () => {
  it('asks for a hero, offers only the artifacts of its class and the universal ones, and shows the card', async () => {
    render(<BuildPage />);
    expect(await screen.findByText('Pick a hero to start your build.')).toBeTruthy();
    expect((artifacts() as HTMLSelectElement).disabled).toBe(true);
    fireEvent.change(await hero(), { target: { value: 'c1' } });
    expect(within(artifacts()).getAllByRole('option').map((o) => o.textContent)).toEqual(['No artifact', 'Any Charm', 'Mage Staff']);
    fireEvent.change(artifacts(), { target: { value: 'a1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Speed Set' }));
    fireEvent.click(screen.getByRole('button', { name: 'Critical Set' }));
    fireEvent.change(screen.getByRole('textbox', { name: /^Note/ }), { target: { value: 'Speed 190+' } });
    const card = screen.getByRole('article', { name: 'Your build' });
    expect(within(card).getByRole('link', { name: 'Mage One' }).getAttribute('href')).toBe('#/hero/c1');
    expect(within(card).getByText('Speed Set + Critical Set')).toBeTruthy();
    expect(within(card).getByText('Mage Staff')).toBeTruthy();
    expect(within(card).getByText('Speed 190+')).toBeTruthy();
  });

  it('keeps the build in the address, and a link shows the same card', async () => {
    render(<BuildPage />);
    fireEvent.change(await hero(), { target: { value: 'c2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Speed Set' }));
    await waitFor(() => expect(location.hash).toBe('#/tools/build?h=c2&s=set_speed'));
    cleanup();
    history.replaceState(null, '', '#/tools/build?h=c1&s=set_cri,set_speed&a=a3&n=Hello%20there');
    render(<BuildPage />);
    const card = await screen.findByRole('article', { name: 'Your build' });
    expect(within(card).getByText('Critical Set + Speed Set')).toBeTruthy();
    expect(within(card).getByText('Any Charm')).toBeTruthy();
    expect(within(card).getByText('Hello there')).toBeTruthy();
  });

  it('takes at most three sets, removes a set when it is clicked again, and starts over', async () => {
    render(<BuildPage />);
    fireEvent.change(await hero(), { target: { value: 'c1' } });
    for (const n of ['Speed Set', 'Critical Set', 'Att Set', 'Max Hp Set']) {
      const b = screen.queryByRole('button', { name: n });
      if (b) fireEvent.click(b);
    }
    expect(screen.getAllByRole('button', { pressed: true })).toHaveLength(3); // the fourth click was ignored
    fireEvent.click(screen.getByRole('button', { name: /^Speed Set/  }));
    expect(screen.getAllByRole('button', { pressed: true })).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Start over' }));
    await waitFor(() => expect(location.hash).toBe('#/tools/build'));
    expect(screen.getByText('Pick a hero to start your build.')).toBeTruthy();
  });

  it('does not trust an address: a hero that does not exist shows no card', async () => {
    history.replaceState(null, '', '#/tools/build?h=nope&s=set_speed');
    render(<BuildPage />);
    expect(await screen.findByText('Pick a hero to start your build.')).toBeTruthy();
  });
});
