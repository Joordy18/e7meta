import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import DraftPage from '../src/pages/DraftPage';
import { I18nProvider } from '../src/i18n';
import { fr } from '../src/i18n/fr';
import { loadHeroes, loadIndex, loadNames, loadRta, loadRtaPairs } from '../src/lib/data';
import type { RtaHeroPairs, RtaStats } from '../src/shared/types';

vi.mock('../src/lib/data', async (orig) => ({
  ...(await orig<typeof import('../src/lib/data')>()),
  loadIndex: vi.fn(), loadHeroes: vi.fn(), loadRta: vi.fn(), loadNames: vi.fn(), loadRtaPairs: vi.fn(),
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
  vi.mocked(loadRtaPairs).mockResolvedValue(null);
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
    const targets = within(screen.getByTestId('draft-grid')).getAllByRole('button') as HTMLButtonElement[];
    expect(targets).toHaveLength(5); // the opponent's team only
    expect(targets.filter((b) => b.disabled)).toHaveLength(1); // its third pick is protected
    fireEvent.click(targets[0]);
    expect(confirm.disabled).toBe(false);
    fireEvent.click(confirm);

    const result = await screen.findByRole('region', { name: 'Result' });
    expect(within(result).getByText('Draft score')).toBeTruthy();
    expect(within(result).getByText(/^\d+ \/ 100$/)).toBeTruthy();
    expect(within(result).getByText(/Your ban, .*is #\d of the 4 heroes you could ban/)).toBeTruthy();
    expect(within(result).getAllByText(/Your pre-ban .*is #\d+ of all heroes/)).toHaveLength(2);
    expect(within(result).getByText(/The bot banned .*from your team\./)).toBeTruthy();
    expect(within(within(result).getByRole('table')).getAllByRole('row')).toHaveLength(11); // the header and ten heroes
    expect(within(result).getByText(/adds a fifth of the points of the partnerships and matchups/)).toBeTruthy();
    expect(within(result).queryByText('Partnerships (points)')).toBeNull(); // no pair data: nothing about them
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

describe('the protected third pick', () => {
  const tip = 'Protected: the third pick of a team cannot be banned';

  it('is marked on the third slot of each team', async () => {
    await start('I pick first');
    for (const label of ['Your team', 'Opponent']) {
      const slots = within(screen.getByRole('region', { name: label })).getAllByRole('listitem');
      expect(slots).toHaveLength(5);
      expect(within(slots[2]).getByRole('img', { name: tip })).toBeTruthy();
      expect(within(screen.getByRole('region', { name: label })).getAllByRole('img', { name: tip })).toHaveLength(1);
    }
  });

  it('cannot be chosen for the ban: the third hero of the opponent is shown protected and cannot be clicked', async () => {
    await playAll(true);
    const grid = within(screen.getByTestId('draft-grid')).getAllByRole('listitem');
    const third = team('Opponent')[2].textContent;
    const protectedOne = within(grid[2]).getByRole('button') as HTMLButtonElement;
    expect(protectedOne.textContent).toBe(third);
    expect(protectedOne.disabled).toBe(true);
    expect(within(grid[2]).getByRole('img', { name: tip })).toBeTruthy();
    fireEvent.click(protectedOne);
    expect((screen.getByRole('button', { name: 'Confirm ban' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('is never banned by the bot', async () => {
    for (let game = 0; game < 4; game++) {
      vi.spyOn(Math, 'random').mockReturnValue(0.13 + game * 0.2);
      await playAll(game % 2 === 0);
      const mine = team('Your team').map((li) => li.textContent);
      const protectedHero = mine[2];
      fireEvent.click(within(screen.getByTestId('draft-grid')).getAllByRole('button')[0]);
      fireEvent.click(screen.getByRole('button', { name: 'Confirm ban' }));
      const rows = within(await screen.findByRole('region', { name: 'Result' })).getAllByRole('row').slice(1);
      expect(rows.find((r) => r.textContent?.includes(protectedHero!))?.textContent).not.toContain('Banned');
      expect(rows.filter((r) => r.textContent?.includes('Banned'))).toHaveLength(2); // one ban each, none on the protected heroes
      cleanup();
    }
  });
});

describe('icons for the pre-bans and the bans', () => {
  it('shows the pre-bans as pictures named for the screen reader, not as written names', async () => {
    await start('I pick first');
    const [a, b] = free();
    const names = [a.textContent!, b.textContent!];
    fireEvent.click(a); fireEvent.click(b);
    fireEvent.click(screen.getByRole('button', { name: 'Confirm pre-bans' }));
    await screen.findByText('Your pick 1 of 5');
    const row = screen.getByTestId('draft-prebans');
    expect(within(row).getAllByRole('img')).toHaveLength(4); // two of yours, two of the bot's
    for (const n of names) {
      expect(within(row).getByRole('img', { name: n })).toBeTruthy();
      expect(row.textContent).not.toContain(n);
    }
  });

  it('marks the banned heroes on their slot, and writes the feedback with pictures', async () => {
    await playAll(true);
    const target = within(screen.getByTestId('draft-grid')).getAllByRole('button')[0];
    const bannedName = target.textContent!;
    fireEvent.click(target);
    fireEvent.click(screen.getByRole('button', { name: 'Confirm ban' }));
    const result = await screen.findByRole('region', { name: 'Result' });
    const line = within(result).getByText(/Your ban, .*is #\d of the 4 heroes/);
    expect(within(line).getByRole('img', { name: bannedName })).toBeTruthy();
    expect(line.textContent).not.toContain(bannedName);
    const sum = result.querySelector('.draft-bansum')!;
    expect(within(sum as HTMLElement).getAllByRole('img').length).toBe(6); // four pre-bans and two bans
  });
});

describe('analysing a draft: both sides by hand', () => {
  const analysis = async () => { render(<DraftPage />); fireEvent.click(await screen.findByRole('button', { name: 'Draft both sides by hand' })); };

  it('is offered next to the game against the bot', async () => {
    render(<DraftPage />);
    expect(await screen.findByRole('region', { name: 'Play against the bot' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Analyze a draft' })).toBeTruthy();
  });

  it('asks for the pre-bans of Team A, then those of Team B, which may remove the same hero as Team A (both sides did in 42% of the recorded battles)', async () => {
    await analysis();
    expect(screen.getByText('Team A: choose 2 pre-bans')).toBeTruthy();
    const [a, b] = free();
    fireEvent.click(a); fireEvent.click(b);
    fireEvent.click(screen.getByRole('button', { name: 'Confirm pre-bans' }));
    expect(screen.getByText('Team B: choose 2 pre-bans')).toBeTruthy();
    for (const el of [a, b]) expect((within(grid()).getByRole('button', { name: el.textContent! }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(a); fireEvent.click(free()[3]);
    fireEvent.click(screen.getByRole('button', { name: 'Confirm pre-bans' }));
    expect(await screen.findByText('Team A: pick 1 of 5')).toBeTruthy();
    expect(within(screen.getByTestId('draft-prebans')).getAllByRole('img')).toHaveLength(4);
  });

  it('lets you pick for both teams in the order of the draft, A B B A A B B A A B, with Team A marked as picking first', async () => {
    await analysis();
    fireEvent.click(free()[0]); fireEvent.click(free()[1]); fireEvent.click(screen.getByRole('button', { name: 'Confirm pre-bans' }));
    fireEvent.click(free()[0]); fireEvent.click(free()[1]); fireEvent.click(screen.getByRole('button', { name: 'Confirm pre-bans' }));
    expect(within(screen.getByRole('region', { name: 'Team A' })).getByText('picks first')).toBeTruthy();
    const order = ['A', 'B', 'B', 'A', 'A', 'B', 'B', 'A', 'A', 'B'];
    const counts = { A: 0, B: 0 };
    for (const side of order) {
      counts[side as 'A' | 'B']++;
      await screen.findByText(`Team ${side}: pick ${counts[side as 'A' | 'B']} of 5`);
      fireEvent.click(free()[0]);
    }
    expect(team('Team A')).toHaveLength(5);
    expect(team('Team B')).toHaveLength(5);
    expect(await screen.findByText('Team A: ban one hero of the other team')).toBeTruthy();
  });

  it('goes through the two bans, each on the other team and never on its protected third pick, then analyses both sides', async () => {
    await analysis();
    fireEvent.click(free()[0]); fireEvent.click(free()[1]); fireEvent.click(screen.getByRole('button', { name: 'Confirm pre-bans' }));
    fireEvent.click(free()[0]); fireEvent.click(free()[1]); fireEvent.click(screen.getByRole('button', { name: 'Confirm pre-bans' }));
    for (let i = 0; i < 10; i++) fireEvent.click(free()[0]);
    await screen.findByText('Team A: ban one hero of the other team');
    let buttons = within(grid()).getAllByRole('button') as HTMLButtonElement[];
    expect(buttons.map((b) => b.textContent)).toEqual(team('Team B').map((li) => li.textContent)); // Team B's heroes
    expect(buttons[2].disabled).toBe(true);
    fireEvent.click(buttons[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Confirm ban' }));
    await screen.findByText('Team B: ban one hero of the other team');
    buttons = within(grid()).getAllByRole('button') as HTMLButtonElement[];
    expect(buttons.map((b) => b.textContent)).toEqual(team('Team A').map((li) => li.textContent));
    expect(buttons[2].disabled).toBe(true);
    fireEvent.click(buttons[1]);
    fireEvent.click(screen.getByRole('button', { name: 'Confirm ban' }));

    const result = await screen.findByRole('region', { name: 'Result' });
    expect(within(result).getByRole('heading', { name: 'Team A' })).toBeTruthy();
    expect(within(result).getByRole('heading', { name: 'Team B' })).toBeTruthy();
    expect(within(result).getByText(/Team A's ban, .*is #\d of the 4 heroes it could ban/)).toBeTruthy();
    expect(within(result).getByText(/Team B's ban, .*is #\d of the 4 heroes it could ban/)).toBeTruthy();
    expect(within(result).getAllByText(/Team [AB]'s pre-ban .*is #\d+ of all heroes/)).toHaveLength(4);
    expect(within(result).queryByText(/The bot banned/)).toBeNull();
    expect(within(within(result).getByRole('table')).getAllByRole('row')).toHaveLength(11);
  });

  it('goes back one step with Undo, in the analysis only', async () => {
    await analysis();
    fireEvent.click(free()[0]); fireEvent.click(free()[1]); fireEvent.click(screen.getByRole('button', { name: 'Confirm pre-bans' }));
    fireEvent.click(free()[0]); fireEvent.click(free()[1]); fireEvent.click(screen.getByRole('button', { name: 'Confirm pre-bans' }));
    fireEvent.click(free()[0]);
    fireEvent.click(free()[0]);
    expect(team('Team A')).toHaveLength(1);
    expect(team('Team B')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(team('Team B')).toHaveLength(0);
    expect(screen.getByText('Team B: pick 1 of 5')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(team('Team A')).toHaveLength(0);
    expect(screen.getByText('Team A: pick 1 of 5')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Undo' })); // back to Team B's pre-bans
    expect(screen.getByText('Team B: choose 2 pre-bans')).toBeTruthy();
  });

  it('has no Undo against the bot, where the bot\'s choices cannot be taken back', async () => {
    await start('I pick first');
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();
  });
});

describe('partnerships and matchups in the score', () => {
  // every hero wins more with every other one, and the lower code beats the higher one: whoever is picked, there are pairs to show
  const everyone = (): Record<string, RtaHeroPairs> => Object.fromEntries(codes.map((c) => [c, {
    with: codes.filter((o) => o !== c).map((o) => ({ code: o, n: 50, win: 60, edge: 6 })),
    over: codes.filter((o) => o > c).map((o) => ({ code: o, n: 50, win: 54, edge: 4 })), // the lower code beats the higher one
    under: codes.filter((o) => o < c).map((o) => ({ code: o, n: 50, win: 46, edge: -4 })),
  }]));

  it('shows the partnerships of each team, the strongest pairs with the heroes as pictures, and the net of the matchups', async () => {
    vi.mocked(loadRtaPairs).mockResolvedValue({ code: 's', updated: 'x', battles: 1000, minGames: 30, heroes: everyone() });
    await playAll(true);
    fireEvent.click(within(screen.getByTestId('draft-grid')).getAllByRole('button').find((b) => !(b as HTMLButtonElement).disabled)!);
    fireEvent.click(screen.getByRole('button', { name: 'Confirm ban' }));
    const result = await screen.findByRole('region', { name: 'Result' });
    expect(within(result).getAllByText('Partnerships (points)')).toHaveLength(2); // one per team
    expect(within(result).getAllByText(/win more together than expected|wins more than expected against/).length).toBeGreaterThan(0);
    expect(within(result).getByText(/^Matchups across the two teams/).textContent).toMatch(/[+-]?\d+(\.\d+)? points\.$/);
  });

  it('plays on without the pair file', async () => {
    vi.mocked(loadRtaPairs).mockRejectedValue(new Error('offline'));
    await playAll(true);
    expect(screen.getByRole('button', { name: 'Confirm ban' })).toBeTruthy();
  });
});
