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
/** Types in a box and clicks the choice, as a person does. */
const pick = (box: HTMLElement, typed: string, choice: string) => {
  fireEvent.focus(box);
  fireEvent.change(box, { target: { value: typed } });
  fireEvent.click(screen.getByRole('option', { name: choice }));
};
const setButton = (name: RegExp) => screen.getByRole('button', { name }) as HTMLButtonElement;

describe('BuildPage', () => {
  it('asks for a hero, finds one by typing (also by its English name), offers only the artifacts of its class and the universal ones, and shows the card', async () => {
    render(<BuildPage />);
    expect(await screen.findByText('Pick a hero to start your build.')).toBeTruthy();
    expect((artifacts() as HTMLInputElement).disabled).toBe(true);
    const box = await hero();
    fireEvent.focus(box);
    fireEvent.change(box, { target: { value: 'zzz' } });
    expect(screen.getByText('No match')).toBeTruthy();
    pick(box, 'mage', 'Mage One');
    expect((box as HTMLInputElement).value).toBe('Mage One');
    fireEvent.focus(artifacts());
    expect(within(screen.getByRole('listbox', { name: 'Artifact' })).getAllByRole('option').map((o) => o.textContent)).toEqual(['No artifact', 'Any Charm', 'Mage Staff']);
    fireEvent.change(artifacts(), { target: { value: 'staff' } });
    expect(within(screen.getByRole('listbox', { name: 'Artifact' })).getAllByRole('option').map((o) => o.textContent)).toEqual(['Mage Staff']);
    fireEvent.click(screen.getByRole('option', { name: 'Mage Staff' }));
    fireEvent.click(setButton(/^Speed Set/));
    fireEvent.click(setButton(/^Critical Set/));
    fireEvent.change(screen.getByRole('textbox', { name: /^Note/ }), { target: { value: 'Speed 190+' } });
    const card = screen.getByRole('article', { name: 'Your build' });
    expect(within(card).getByRole('link', { name: 'Mage One' }).getAttribute('href')).toBe('#/hero/c1');
    expect(within(card).getByText('Speed Set + Critical Set')).toBeTruthy();
    expect(within(card).getByText('Mage Staff')).toBeTruthy();
    expect(within(card).getByText('Speed 190+')).toBeTruthy();
  });

  it('keeps the build in the address, and a link shows the same card', async () => {
    render(<BuildPage />);
    pick(await hero(), 'knight', 'Knight Two');
    fireEvent.click(setButton(/^Speed Set/));
    await waitFor(() => expect(location.hash).toBe('#/tools/build?h=c2&s=set_speed'));
    cleanup();
    history.replaceState(null, '', '#/tools/build?h=c1&s=set_cri,set_speed&a=a3&n=Hello%20there');
    render(<BuildPage />);
    const card = await screen.findByRole('article', { name: 'Your build' });
    expect(within(card).getByText('Speed Set + Critical Set')).toBeTruthy();
    expect(within(card).getByText('Any Charm')).toBeTruthy();
    expect(within(card).getByText('Hello there')).toBeTruthy();
  });

  it('stops at six pieces, greys out what no longer fits, takes a two-piece set twice, and removes a set from the chosen ones', async () => {
    render(<BuildPage />);
    pick(await hero(), 'mage', 'Mage One');
    fireEvent.click(setButton(/^Speed Set/));
    expect(setButton(/^Speed Set/).disabled).toBe(true); // a second four-piece set does not fit
    expect(setButton(/^Att Set/).disabled).toBe(true);
    expect(setButton(/^Critical Set/).disabled).toBe(false);
    expect(screen.getByText('4 of 6 pieces')).toBeTruthy();
    fireEvent.click(setButton(/^Critical Set/));
    expect(screen.getByText('6 of 6 pieces')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /^(Speed|Critical|Att|Max Hp) Set/ }).every((b) => (b as HTMLButtonElement).disabled)).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Remove Speed Set' }));
    expect(screen.getByText('2 of 6 pieces')).toBeTruthy();
    fireEvent.click(setButton(/^Max Hp Set/));
    fireEvent.click(setButton(/^Max Hp Set/));
    expect(screen.getByText('6 of 6 pieces')).toBeTruthy();
    expect(within(screen.getByRole('article', { name: 'Your build' })).getByText('Critical Set + Max Hp Set ×2')).toBeTruthy();
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
