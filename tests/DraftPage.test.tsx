import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import DraftPage from '../src/pages/DraftPage';
import { I18nProvider } from '../src/i18n';
import { fr } from '../src/i18n/fr';
import { loadHeroes, loadIndex, loadNames, loadRta } from '../src/lib/data';
import type { RtaStats } from '../src/shared/types';

vi.mock('../src/lib/data', async (orig) => ({
  ...(await orig<typeof import('../src/lib/data')>()),
  loadIndex: vi.fn(), loadHeroes: vi.fn(), loadRta: vi.fn(), loadNames: vi.fn(),
}));

const codes = Array.from({ length: 24 }, (_, i) => `h${String(i + 1).padStart(2, '0')}`);
const heroes = codes.map((code, i) => ({ code, name: `Hero ${String(i + 1).padStart(2, '0')}`, grade: 5, job: 'mage', element: 'fire' }));
const stats = (n = 24): RtaStats => ({
  season: 'Fall 2026', code: 's', updated: 'x', players: 10, battles: 1000,
  heroes: Object.fromEntries(codes.slice(0, n).map((c, i) => [c, { pick: 500 - i * 15, played: 400 - i * 10, win: (400 - i * 10) * (0.5 + (i % 5) / 100), first: 10, ban: 20, preban: 300 - i * 10 }])),
});

beforeEach(() => {
  vi.spyOn(Math, 'random').mockReturnValue(0.5);
  vi.mocked(loadIndex).mockResolvedValue({ periods: ['2026-10-29'] });
  vi.mocked(loadHeroes).mockResolvedValue(heroes);
  vi.mocked(loadRta).mockResolvedValue(stats());
  vi.mocked(loadNames).mockResolvedValue(null);
});
afterEach(() => { cleanup(); localStorage.clear(); vi.restoreAllMocks(); vi.resetAllMocks(); });

const grid = () => screen.getByTestId('draft-grid');
const free = () => within(grid()).getAllByRole('button').filter((b) => !(b as HTMLButtonElement).disabled);
const team = (name: string) => within(screen.getByRole('region', { name })).queryAllByRole('listitem').filter((li) => li.textContent?.trim());
const start = async (button: string) => { render(<DraftPage />); fireEvent.click(await screen.findByRole('button', { name: button })); };

/** Plays a whole draft: two pre-bans, the five picks, the ban. */
async function playAll(first: boolean) {
  await start(first ? 'I pick first' : 'I pick second');
  fireEvent.click(free()[0]);
  fireEvent.click(free()[1]);
  fireEvent.click(screen.getByRole('button', { name: 'Confirm pre-bans' }));
  for (let n = 1; n <= 5; n++) {
    await screen.findByText(`Your pick ${n} of 5`);
    fireEvent.click(free()[0]);
  }
  await screen.findByText("Ban one hero of the opponent's team");
}

describe('DraftPage', () => {
  it('says so when there is no RTA data, or too few heroes with data', async () => {
    vi.mocked(loadRta).mockResolvedValue(null);
    const { unmount } = render(<DraftPage />);
    expect(await screen.findByText(/No RTA data yet/)).toBeTruthy();
    expect(screen.getByText(/npm run rta/)).toBeTruthy();
    unmount();
    vi.mocked(loadRta).mockResolvedValue(stats(6));
    render(<DraftPage />);
    expect(await screen.findByText('Not enough heroes with data to simulate a draft yet.')).toBeTruthy();
  });

  it('asks who picks first, then for two pre-bans that must be chosen before they can be confirmed', async () => {
    await start('I pick first');
    expect(screen.getByText('Pre-bans: choose 2 heroes that nobody can pick')).toBeTruthy();
    const confirm = screen.getByRole('button', { name: 'Confirm pre-bans' }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    fireEvent.click(free()[0]);
    expect(confirm.disabled).toBe(true);
    fireEvent.click(free()[1]);
    expect(confirm.disabled).toBe(false);
    fireEvent.click(free()[2]); // a third one is not taken: the choice stays at two
    expect(within(grid()).getAllByRole('button', { pressed: true })).toHaveLength(2);
  });

  it('plays the draft in turn when you pick first: you, then the bot twice, and so on, with no hero twice and none pre-banned', async () => {
    await start('I pick first');
    const [a, b] = free();
    const preBanned = [a.textContent, b.textContent];
    fireEvent.click(a); fireEvent.click(b);
    fireEvent.click(screen.getByRole('button', { name: 'Confirm pre-bans' }));
    await screen.findByText('Your pick 1 of 5');
    expect(team('Opponent')).toHaveLength(0); // you pick first
    const mine = free()[0];
    const first = mine.textContent;
    fireEvent.click(mine);
    await screen.findByText('Your pick 2 of 5');
    expect(team('Your team')).toHaveLength(1);
    expect(team('Opponent')).toHaveLength(2); // turns 2 and 3 are the bot's
    for (const n of [2, 3, 4, 5]) { await screen.findByText(`Your pick ${n} of 5`); fireEvent.click(free()[0]); }
    await screen.findByText("Ban one hero of the opponent's team");
    const names = [...team('Your team'), ...team('Opponent')].map((li) => li.textContent);
    expect(names).toHaveLength(10);
    expect(new Set(names).size).toBe(10);
    for (const p of preBanned) expect(names).not.toContain(p);
    expect(team('Your team')[0].textContent).toBe(first);
  });

  it('lets the bot pick first when you pick second', async () => {
    await start('I pick second');
    fireEvent.click(free()[0]); fireEvent.click(free()[1]);
    fireEvent.click(screen.getByRole('button', { name: 'Confirm pre-bans' }));
    await screen.findByText('Your pick 1 of 5');
    expect(team('Opponent')).toHaveLength(1);
    expect(team('Your team')).toHaveLength(0);
  });

  it('does not let you take a hero that is pre-banned or already picked', async () => {
    await start('I pick first');
    const [a, b] = free();
    fireEvent.click(a); fireEvent.click(b);
    fireEvent.click(screen.getByRole('button', { name: 'Confirm pre-bans' }));
    await screen.findByText('Your pick 1 of 5');
    for (const el of [a, b]) expect((within(grid()).getByRole('button', { name: el.textContent! }) as HTMLButtonElement).disabled).toBe(true);
    const mine = free()[0];
    fireEvent.click(mine);
    await screen.findByText('Your pick 2 of 5');
    expect((within(grid()).getByRole('button', { name: mine.textContent! }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('ends with a ban of one of the opponent\'s five heroes, then shows the score, the feedback and a table of the ten heroes', async () => {
    await playAll(true);
    const confirm = screen.getByRole('button', { name: 'Confirm ban' }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    const targets = within(screen.getByTestId('draft-grid')).getAllByRole('button');
    expect(targets).toHaveLength(5); // the opponent's team only
    fireEvent.click(targets[0]);
    expect(confirm.disabled).toBe(false);
    fireEvent.click(confirm);

    const result = await screen.findByRole('region', { name: 'Result' });
    expect(within(result).getByText('Draft score')).toBeTruthy();
    expect(within(result).getByText(/^\d+ \/ 100$/)).toBeTruthy();
    expect(within(result).getByText(/Your ban, .*, is #\d of the opponent's 5 heroes/)).toBeTruthy();
    expect(within(result).getAllByText(/Your pre-ban .* is #\d+ of all heroes/)).toHaveLength(2);
    expect(within(result).getByText(/The bot banned .* from your team\./)).toBeTruthy();
    expect(within(within(result).getByRole('table')).getAllByRole('row')).toHaveLength(11); // the header and ten heroes
    expect(within(result).getByText(/does not count synergies or counters yet/)).toBeTruthy();
  });

  it('starts over with Play again', async () => {
    await playAll(false);
    fireEvent.click(within(screen.getByTestId('draft-grid')).getAllByRole('button')[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Confirm ban' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Play again' }));
    expect(await screen.findByRole('button', { name: 'I pick first' })).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Result' })).toBeNull();
  });

  it('finds a hero with the search box', async () => {
    await start('I pick first');
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'hero 07' } });
    expect(within(grid()).getAllByRole('button').map((b) => b.textContent)).toEqual(['Hero 07']);
  });

  it('is in the language chosen, with the names of the heroes in it', async () => {
    localStorage.setItem('e7.lang', 'fr');
    vi.mocked(loadNames).mockResolvedValue({ lang: 'fr', updated: 'x', heroes: { h01: 'Héros Un' }, artifacts: {}, sets: {} });
    render(<I18nProvider><DraftPage /></I18nProvider>);
    fireEvent.click(await screen.findByRole('button', { name: fr['draft.youFirst'] }));
    expect(screen.getByText(fr['draft.prebanTitle'].replace('{n}', '2'))).toBeTruthy();
    await waitFor(() => expect(within(grid()).getByRole('button', { name: 'Héros Un' })).toBeTruthy());
  });
});
