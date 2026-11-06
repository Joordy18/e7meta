import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import HomePage from '../src/pages/HomePage';
import { loadArenaIndex, loadArenaSeason, loadHeroes, loadIndex, loadModes, loadTrends, loadFeed } from '../src/lib/data';
import { guides } from '../src/lib/guides';
import type { ArenaSeason, ArenaTier, DraftRow, Feed, ModeList, Modes, PreBanRow, Trends } from '../src/shared/types';

vi.mock('../src/lib/data', async (orig) => ({
  ...(await orig<typeof import('../src/lib/data')>()),
  loadIndex: vi.fn(), loadModes: vi.fn(), loadHeroes: vi.fn(), loadTrends: vi.fn(), loadFeed: vi.fn(), loadArenaIndex: vi.fn(), loadArenaSeason: vi.fn(),
}));
afterEach(() => { cleanup(); vi.resetAllMocks(); });

const list = (id: string, mode: ModeList['mode'], heroes: [string, number][]): ModeList => ({
  id, mode, group: 'g', variant: 'v', title: id, heroes: heroes.map(([code, share]) => ({ code, name: code.toUpperCase(), share })),
});
const cur: Modes = { key: 'k2', lists: [list('h1', 'hunts', [['a', 60], ['b', 30]]), list('h2', 'hunts', [['a', 40]]), list('ab', 'abyss', [['z', 90]]), list('ex', 'expedition', [['y', 44]])] };
const prevSame: Modes = { ...cur };
const prevOther: Modes = { key: 'k1', lists: [list('h1', 'hunts', [['a', 20]]), list('h2', 'hunts', [['a', 20]])] };

const tiers: ArenaTier[] = ['champion', 'warlord', 'emperor', 'legend'];
const by = <T,>(f: () => T[]) => Object.fromEntries(tiers.map((t) => [t, f()])) as Record<ArenaTier, T[]>;
const season = (id: string, name: string, pick: DraftRow[]): ArenaSeason => ({
  id, title: 't', season: name, published: '2026-08-07', url: `https://page.onstove.com/epicseven/global/view/${id}`, leagues: [], cutoffs: [],
  preBan: by<PreBanRow>(() => [{ hero: 'Notos', rate: 71 }]), firstPick: by<DraftRow>(() => []), pick: by(() => pick),
});
const summer = season('2', 'Summer 2026', [{ hero: 'Ann', rate: 61, ban: 14, win: 47 }, { hero: 'Newbie', rate: 50, ban: 9, win: 55 }]);
const spring = season('1', 'Spring 2026', [{ hero: 'Ann', rate: 58.5, ban: 1, win: 1 }]);
const arenaIndex = { seasons: [summer, spring].map((s) => ({ id: s.id, season: s.season, published: s.published, title: s.title, url: s.url })) };

const trends = (moves: [number, number][]): Trends => ({
  from: '2026-10-22', to: '2026-10-29',
  builds: moves.map(([before, after], i) => ({ hero: 'a', name: 'Ann', kind: i % 2 === 0 ? 'artifact' : 'set', code: i % 2 === 0 ? 'x' : 's1', item: i % 2 === 0 ? 'Lethal Whispers' : 'Speed Set', before, after })),
});

const feed: Feed = {
  updated: '2026-11-06',
  releases: [
    { kind: 'hero', code: 'c7016', name: 'Bunny Girl Mafia Yufine', since: '2026-10-29', grade: 5, job: 'knight', element: 'ice' },
    { kind: 'artifact', code: 'efk99', name: 'New Blade', since: '2026-10-29', grade: 5, job: 'knight' },
    { kind: 'artifact', name: "A Boss's Dignity", job: 'knight', announced: { date: '2026-10-28', url: 'https://page.onstove.com/epicseven/global/view/9' } },
    { kind: 'hero', code: 'c2187', name: 'Moro', grade: 5, job: 'assassin', element: 'light', announced: { date: '2026-10-28', url: 'https://page.onstove.com/epicseven/global/view/9' } },
  ],
  posts: [
    { id: '1', board: 'patch', title: '11/5 (Thu) Patch Information', date: '2026-11-05', url: 'https://page.onstove.com/epicseven/global/view/1', image: 'https://image.onstove.com/a.png' },
    { id: '4', board: 'patch', title: 'Older patch', date: '2026-10-30', url: 'https://page.onstove.com/epicseven/global/view/4', image: 'https://image.onstove.com/b.png' },
    { id: '2', board: 'notice', title: 'Known Issues', date: '2026-10-29', url: 'https://page.onstove.com/epicseven/global/view/2' },
    { id: '3', board: 'dev', title: '11/19 (Thu) Balance Adjustment Preview', date: '2026-11-06', url: 'https://page.onstove.com/epicseven/global/view/3' },
  ],
};

function setup(o: { prev?: Modes; trends?: Trends | null; arena?: boolean; feed?: Feed | null } = {}) {
  vi.mocked(loadFeed).mockResolvedValue(o.feed === undefined ? null : o.feed);
  vi.mocked(loadIndex).mockResolvedValue({ periods: ['2026-10-29', '2026-10-22'] });
  vi.mocked(loadModes).mockImplementation(async (p) => (p === '2026-10-29' ? cur : (o.prev ?? prevSame)));
  vi.mocked(loadHeroes).mockResolvedValue([{ code: 'a', name: 'A', grade: 5, job: 'mage', element: 'fire' }]);
  vi.mocked(loadTrends).mockResolvedValue(o.trends === undefined ? null : o.trends);
  if (o.arena === false) vi.mocked(loadArenaIndex).mockResolvedValue(null);
  else {
    vi.mocked(loadArenaIndex).mockResolvedValue(arenaIndex);
    vi.mocked(loadArenaSeason).mockImplementation(async (id) => (id === '2' ? summer : spring));
  }
}

describe('HomePage: PvE', () => {
  it('shows the heroes used most in hunts, abyss and expeditions, as an average over the rankings of each mode', async () => {
    setup();
    render(<HomePage />);
    const pve = await screen.findByRole('region', { name: 'Most used in PvE' });
    const hunts = within(pve).getByRole('region', { name: 'Hunts' });
    const rows = within(hunts).getAllByRole('listitem');
    expect(rows[0].textContent).toContain('A');
    expect(rows[0].textContent).toContain('50%'); // (60 + 40) / 2
    expect(rows[1].textContent).toContain('15%'); // b is in one of two rankings: 30 / 2
    expect(within(within(pve).getByRole('region', { name: 'Abyss' })).getAllByRole('listitem')[0].textContent).toContain('90%');
    expect(within(within(pve).getByRole('region', { name: 'Expeditions' })).getAllByRole('listitem')[0].textContent).toContain('44%');
    expect(within(rows[0]).getByRole('link', { name: 'A' }).getAttribute('href')).toBe('#/hero/a');
  });

  it('shows the change in points when the previous week holds different mode data', async () => {
    setup({ prev: prevOther });
    render(<HomePage />);
    const hunts = within(await screen.findByRole('region', { name: 'Most used in PvE' })).getByRole('region', { name: 'Hunts' });
    expect(within(hunts).getAllByRole('listitem')[0].textContent).toContain('+30'); // 50 now, 20 before
  });

  it('says the change will come with another week when the two weeks hold the same mode data', async () => {
    setup();
    render(<HomePage />);
    const pve = await screen.findByRole('region', { name: 'Most used in PvE' });
    expect(within(pve).getByText(/appears once another week/i)).toBeTruthy();
    expect(within(pve).queryByText(/\+\d/)).toBeNull();
  });
});

describe('HomePage: World Arena', () => {
  it('shows the most picked heroes of the latest season with win rate and the change against the previous season', async () => {
    setup();
    render(<HomePage />);
    const rta = await screen.findByRole('region', { name: 'World Arena (RTA)' });
    expect(within(rta).getByText('Summer 2026')).toBeTruthy();
    const rows = within(within(rta).getByRole('region', { name: 'Most picked' })).getAllByRole('listitem');
    expect(rows[0].textContent).toContain('Ann');
    expect(rows[0].textContent).toContain('61%');
    expect(rows[0].textContent).toContain('47% win');
    expect(rows[0].textContent).toContain('+2.5');
    expect(rows[1].textContent).toContain('new');
    expect(within(rows[0]).queryByRole('link')).toBeNull(); // linked only when the name is a known hero (see the next test)
  });

  it('links a hero when its name matches a known hero, and shows the most pre-banned of the top league', async () => {
    setup();
    vi.mocked(loadHeroes).mockResolvedValue([{ code: 'c9', name: 'Ann', grade: 5, job: 'mage', element: 'fire' }]);
    render(<HomePage />);
    const rta = await screen.findByRole('region', { name: 'World Arena (RTA)' });
    expect(within(within(rta).getByRole('region', { name: 'Most picked' })).getByRole('link', { name: 'Ann' }).getAttribute('href')).toBe('#/hero/c9');
    expect(within(within(rta).getByRole('region', { name: 'Most pre-banned' })).getAllByRole('listitem')[0].textContent).toContain('Notos');
    expect(within(rta).getByRole('link', { name: /official infographic/ }).getAttribute('href')).toBe(summer.url);
  });

  it('is left out when there is no arena data', async () => {
    setup({ arena: false });
    render(<HomePage />);
    await screen.findByRole('region', { name: 'Most used in PvE' });
    expect(screen.queryByRole('region', { name: 'World Arena (RTA)' })).toBeNull();
  });
});

describe('HomePage: build shifts', () => {
  it('lists the biggest moves of a hero\'s sets and artifacts between the two weeks, linking artifacts and heroes', async () => {
    setup({ trends: trends([[50, 30], [10, 20]]) });
    render(<HomePage />);
    const sec = await screen.findByRole('region', { name: 'Build shifts' });
    const rows = within(sec).getAllByRole('listitem');
    expect(rows[0].textContent).toContain('Ann');
    expect(rows[0].textContent).toContain('Lethal Whispers');
    expect(rows[0].textContent).toContain('50% → 30%');
    expect(within(rows[0]).getByRole('link', { name: 'Ann' }).getAttribute('href')).toBe('#/hero/a');
    expect(within(rows[0]).getByRole('link', { name: 'Lethal Whispers' }).getAttribute('href')).toBe('#/artifact/x');
    expect(within(rows[1]).queryByRole('link', { name: 'Speed Set' })).toBeNull(); // sets have no page
    expect(within(sec).getByText('2026-10-22 to 2026-10-29')).toBeTruthy();
    expect(within(sec).queryByText(/quiet week/i)).toBeNull();
  });

  it('says it was a quiet week when nothing moved by 3 points or more', async () => {
    setup({ trends: trends([[50, 49], [10, 11.5]]) });
    render(<HomePage />);
    expect(await screen.findByText(/quiet week/i)).toBeTruthy();
  });

  it('is left out without a trends file', async () => {
    setup({ trends: null });
    render(<HomePage />);
    await screen.findByRole('region', { name: 'Most used in PvE' });
    expect(screen.queryByRole('region', { name: 'Build shifts' })).toBeNull();
  });
});

describe('HomePage: what is new', () => {
  it('lists the new heroes and the new artifacts in two columns, linking them to their pages', async () => {
    setup({ feed });
    render(<HomePage />);
    const news = await screen.findByRole('region', { name: 'New in the game' });
    const heroes = within(within(news).getByRole('region', { name: 'New heroes' })).getAllByRole('listitem');
    expect(heroes).toHaveLength(2);
    expect(heroes[0].textContent).toContain('2026-10-29');
    expect(within(heroes[0]).getByRole('link', { name: 'Bunny Girl Mafia Yufine' }).getAttribute('href')).toBe('#/hero/c7016');
    const artifacts = within(within(news).getByRole('region', { name: 'New artifacts' })).getAllByRole('listitem');
    expect(within(artifacts[0]).getByRole('link', { name: 'New Blade' }).getAttribute('href')).toBe('#/artifact/efk99');
  });

  it('shows the official icon of each new hero and artifact with its grade, element and class', async () => {
    setup({ feed });
    render(<HomePage />);
    const news = await screen.findByRole('region', { name: 'New in the game' });
    const hero = within(within(news).getByRole('region', { name: 'New heroes' })).getAllByRole('listitem')[0];
    expect(hero.querySelector('img')?.getAttribute('src')).toContain('c7016_s.png');
    expect(hero.textContent).toContain('5★');
    expect(within(hero).getByRole('img', { name: 'Ice' })).toBeTruthy(); // official icons, named for screen readers
    expect(within(hero).getByRole('img', { name: 'Knight' })).toBeTruthy();
    const moro = within(within(news).getByRole('region', { name: 'New heroes' })).getAllByRole('listitem')[1];
    expect(within(moro).getByRole('img', { name: 'Light' })).toBeTruthy();
    expect(within(moro).getByRole('img', { name: 'Thief' })).toBeTruthy(); // the game's "assassin" is called Thief in English
    const artifacts = within(within(news).getByRole('region', { name: 'New artifacts' })).getAllByRole('listitem');
    expect(artifacts[0].querySelector('img')?.getAttribute('src')).toContain('efk99_ico.png');
    expect(within(artifacts[0]).getByRole('img', { name: 'Knight' })).toBeTruthy();
    expect(artifacts[1].querySelector('img')).toBeNull(); // announced only: no code yet, so no icon, but the class is known
    expect(within(artifacts[1]).getByRole('img', { name: 'Knight' })).toBeTruthy();
  });

  it('shows an item the update posts announced before the game data lists it, linking to the official post', async () => {
    setup({ feed });
    render(<HomePage />);
    const news = await screen.findByRole('region', { name: 'New in the game' });
    const item = within(within(news).getByRole('region', { name: 'New artifacts' })).getAllByRole('listitem').find((li) => li.textContent?.includes("A Boss's Dignity"))!;
    const link = within(item).getByRole('link', { name: "A Boss's Dignity" });
    expect(link.getAttribute('href')).toBe('https://page.onstove.com/epicseven/global/view/9');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(item.textContent).toContain('announced 2026-10-28');
    // a hero that has both a page and an announcement links to its page and shows the announcement date
    const moro = within(within(news).getByRole('region', { name: 'New heroes' })).getByRole('link', { name: 'Moro' });
    expect(moro.getAttribute('href')).toBe('#/hero/c2187');
    expect(moro.closest('li')?.textContent).toContain('announced 2026-10-28');
  });

  it('says so in a column that has nothing new yet, while the other one shows its releases', async () => {
    setup({ feed: { ...feed, releases: [feed.releases[0]] } });
    render(<HomePage />);
    const news = await screen.findByRole('region', { name: 'New in the game' });
    expect(within(within(news).getByRole('region', { name: 'New artifacts' })).getByText(/nothing new yet/i)).toBeTruthy();
    expect(within(news).getByRole('link', { name: 'Bunny Girl Mafia Yufine' })).toBeTruthy();
  });

  it('shows the official posts by board, each linking to the post in a new tab, with its date', async () => {
    setup({ feed });
    render(<HomePage />);
    const patches = await screen.findByRole('region', { name: 'Patches' });
    const link = within(patches).getByRole('link', { name: '11/5 (Thu) Patch Information' });
    expect(link.getAttribute('href')).toBe('https://page.onstove.com/epicseven/global/view/1');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(patches.textContent).toContain('2026-11-05');
    expect(within(screen.getByRole('region', { name: 'Notices' })).getByText('Known Issues')).toBeTruthy();
    expect(within(screen.getByRole('region', { name: 'Developer notes' })).getByText(/Balance Adjustment Preview/)).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Events' })).toBeNull(); // no post on that board: no empty panel
  });

  it('shows the official banner of the latest post of a board only, inside the link to the post', async () => {
    setup({ feed });
    render(<HomePage />);
    const patches = await screen.findByRole('region', { name: 'Patches' });
    const imgs = patches.querySelectorAll('img');
    expect(imgs).toHaveLength(1); // the older patch has a banner too, but only the latest post of the board shows it
    expect(imgs[0].getAttribute('src')).toBe('https://image.onstove.com/a.png');
    expect(imgs[0].closest('a')?.getAttribute('href')).toBe('https://page.onstove.com/epicseven/global/view/1');
    expect(screen.getByRole('region', { name: 'Notices' }).querySelectorAll('img')).toHaveLength(0); // that post has no banner
  });

  it('leaves out the new-releases panel when nothing appeared', async () => {
    setup({ feed: { ...feed, releases: [] } });
    render(<HomePage />);
    await screen.findByRole('region', { name: 'Patches' });
    expect(screen.queryByRole('region', { name: 'New in the game' })).toBeNull();
  });

  it('is left out without a feed file', async () => {
    setup({ feed: null });
    render(<HomePage />);
    await screen.findByRole('region', { name: 'Most used in PvE' });
    expect(screen.queryByRole('region', { name: "What's new" })).toBeNull();
  });
});

describe('HomePage: the rest', () => {
  it('links the latest guides', async () => {
    setup();
    render(<HomePage />);
    const sec = await screen.findByRole('region', { name: 'Guides' });
    expect(within(sec).getByRole('link', { name: guides[0].title }).getAttribute('href')).toBe(`#/guides/${guides[0].slug}`);
  });

  it('says how to collect when there is no data at all', async () => {
    vi.mocked(loadIndex).mockResolvedValue(null);
    vi.mocked(loadArenaIndex).mockResolvedValue(null);
    render(<HomePage />);
    expect(await screen.findByText(/No data yet/)).toBeTruthy();
    expect(screen.getByText(/npm run collect/)).toBeTruthy();
  });

  it('keeps the PvE block when the arena or trends fail to load', async () => {
    setup();
    vi.mocked(loadArenaIndex).mockRejectedValue(new Error('down'));
    vi.mocked(loadTrends).mockRejectedValue(new Error('down'));
    vi.mocked(loadFeed).mockRejectedValue(new Error('down'));
    render(<HomePage />);
    expect(await screen.findByRole('region', { name: 'Most used in PvE' })).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'World Arena (RTA)' })).toBeNull();
  });
});

