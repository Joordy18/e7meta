import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import HeroPage from '../src/pages/HeroPage';
import { I18nProvider } from '../src/i18n';
import { fr } from '../src/i18n/fr';
import App from '../src/App';
import { NotFoundError, loadArenaIndex, loadArenaSeason, loadHero, loadIndex, loadHeroes, loadModes, loadNames, loadRta, loadSkills, loadTeams } from '../src/lib/data';
import { mapDetail, mapSetNames, mapShares } from '../scripts/collect/map';
import type { HeroSnapshot, RtaStats, SkillsFile } from '../src/shared/types';

vi.mock('../src/lib/data', async (orig) => ({
  ...(await orig<typeof import('../src/lib/data')>()),
  loadIndex: vi.fn(), loadHero: vi.fn(), loadHeroes: vi.fn(), loadModes: vi.fn(), loadTeams: vi.fn(), loadArenaIndex: vi.fn(), loadArenaSeason: vi.fn(), loadSkills: vi.fn(), loadRta: vi.fn(), loadNames: vi.fn(),
}));
beforeEach(() => {
  vi.mocked(loadIndex).mockResolvedValue({ periods: ['2026-10-29', '2026-10-22'] });
  vi.mocked(loadModes).mockResolvedValue(null);
  vi.mocked(loadTeams).mockResolvedValue(null);
  vi.mocked(loadHeroes).mockResolvedValue([]);
  vi.mocked(loadArenaIndex).mockResolvedValue(null);
  vi.mocked(loadSkills).mockResolvedValue(null);
  vi.mocked(loadRta).mockResolvedValue(null);
});
afterEach(() => { cleanup(); localStorage.clear(); vi.resetAllMocks(); location.hash = ''; });

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

describe('HeroPage in French', () => {
  it('translates the headings, the build, the skills and the tables, not the hero data', async () => {
    localStorage.setItem('e7.lang', 'fr');
    vi.mocked(loadHero).mockResolvedValue(snapshot);
    render(<I18nProvider><HeroPage code="c1176" /></I18nProvider>);
    expect(await screen.findByRole('heading', { name: 'Setsuka' })).toBeTruthy();
    expect(screen.getByRole('link', { name: fr['common.allHeroes'] })).toBeTruthy();
    expect(screen.getByRole('region', { name: fr['loadout.build'] })).toBeTruthy();
    expect(screen.getByRole('region', { name: fr['hero.gearSource'] })).toBeTruthy();
    expect(screen.getByRole('table', { name: fr['hero.statTargets'] })).toBeTruthy();
    expect(screen.getByRole('img', { name: fr['element.fire'] })).toBeTruthy();
    expect(screen.getByRole('img', { name: fr['job.assassin'] })).toBeTruthy();
    expect(screen.getByRole('navigation', { name: fr['pageNav.label'] })).toBeTruthy();
  });
  it('shows the names of the hero, its sets and its artifacts in French', async () => {
    localStorage.setItem('e7.lang', 'fr');
    vi.mocked(loadHero).mockResolvedValue(snapshot);
    vi.mocked(loadNames).mockResolvedValue({
      lang: 'fr', updated: 'x', heroes: { c1176: 'Setsuka FR' },
      artifacts: { [snapshot.artifacts[0].code]: 'Artefact FR' }, sets: { [snapshot.sets[0].code]: 'Set FR' },
    });
    render(<I18nProvider><HeroPage code="c1176" /></I18nProvider>);
    expect(await screen.findByRole('heading', { level: 1, name: 'Setsuka FR' })).toBeTruthy();
    const gear = screen.getByRole('region', { name: fr['hero.gearSource'] });
    await waitFor(() => expect(within(gear).getByText('Set FR')).toBeTruthy());
    expect(within(gear).getByRole('link', { name: 'Artefact FR' })).toBeTruthy();
  });

  it('says in French when the hero has no data', async () => {
    localStorage.setItem('e7.lang', 'fr');
    vi.mocked(loadHero).mockRejectedValue(new NotFoundError('2026-10-29/hero/c1176.json'));
    render(<I18nProvider><HeroPage code="c1176" /></I18nProvider>);
    expect(await screen.findByText(fr['hero.noHeroData'])).toBeTruthy();
  });
});

describe('HeroPage', () => {
  it('shows both sources with their own period and formatted shares', async () => {
    vi.mocked(loadHero).mockResolvedValue(snapshot);
    render(<HeroPage code="c1176" />);
    expect(await screen.findByRole('heading', { name: 'Setsuka' })).toBeTruthy();
    expect(loadHero).toHaveBeenCalledWith('2026-10-29', 'c1176');
    expect(screen.getByRole('link', { name: '← All heroes' }).getAttribute('href')).toBe('#/heroes');

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
    const eff = within(rows[6]).getAllByRole('cell').map((c) => c.textContent!);
    expect(eff[2]).toBe('Any'); // most players sit at the minimum: no threshold to chase
    const health = within(rows[2]).getAllByRole('cell').map((c) => c.textContent!);
    expect(health[0]).toMatch(/^[\d,]+–[\d,]+$/); // thousands separated, no unit
  });

  it('omits the hunts block when detail is missing but renders the rest', async () => {
    vi.mocked(loadHero).mockResolvedValue({ ...snapshot, detail: undefined });
    render(<HeroPage code="c1176" />);
    expect(within(await screen.findByRole('region', { name: 'Sets' })).getByText('23.86%')).toBeTruthy();
    expect(screen.queryByText(/Source: hunts/)).toBeNull();
    expect(screen.queryAllByRole('group')).toHaveLength(0);
  });

  it('loads the latest week only and has no period menu', async () => {
    vi.mocked(loadHero).mockResolvedValue(snapshot);
    render(<HeroPage code="c1176" />);
    await screen.findByRole('heading', { name: 'Setsuka' });
    expect(loadHero).toHaveBeenCalledTimes(1);
    expect(loadHero).toHaveBeenCalledWith('2026-10-29', 'c1176');
    expect(screen.queryByLabelText('Period')).toBeNull();
  });

  it('shows an explicit error when loading fails', async () => {
    vi.mocked(loadHero).mockRejectedValue(new Error('boom'));
    render(<HeroPage code="c1176" />);
    expect(await screen.findByText(/Failed to load: .*boom/)).toBeTruthy();
  });

  it('says there is no data for this hero when its file is missing', async () => {
    vi.mocked(loadHero).mockRejectedValue(new NotFoundError('2026-10-29/hero/c1176.json'));
    render(<HeroPage code="c1176" />);
    expect(await screen.findByText('No data for this hero in this period')).toBeTruthy();
    expect(screen.queryByText(/Erreur de chargement/)).toBeNull();
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
      { id: 'a', mode: 'abyss', title: 'Abyss, floor 120', group: 'Abyss', variant: 'Floor 120', heroes: [{ code: 'x', name: 'X', share: 70 }, { code: 'c1176', name: 'Setsuka', share: 20.5 }] },
      { id: 'b', mode: 'hunts', title: 'Golem Hunt, Hell', group: 'Golem Hunt', variant: 'Hell', heroes: [{ code: 'c1176', name: 'Setsuka', share: 45 }] },
    ] });
    render(<HeroPage code="c1176" />);
    const panel = await screen.findByRole('region', { name: 'Other game modes' });
    const rows = within(panel).getAllByRole('meter');
    expect(rows.map((r) => r.textContent)).toEqual(['#1 Golem Hunt, Hell45%', '#2 Abyss, floor 12020.5%']);
    expect(loadModes).toHaveBeenCalledWith('2026-10-29');
  });

  const skillsFile: SkillsFile = {
    version: 2, fetchedAt: '2026-11-06', source: 'epic7db.com', exclusive: {},
    heroes: { c1176: [
      { name: 'Horizontal Slash', soulGain: 1, effects: [{ name: 'Dual Attack', text: 'Chance to attack after an ally.' }],
        description: 'Attack the enemy with a sword. Damage grows with the **caster\'s max HP**.', soulburn: 'Increases damage dealt. (-10 souls)',
        upgrades: [{ level: 1, text: '+5% damage dealt' }, { level: 2, text: '+5% damage dealt' }] },
      { name: 'Surpressed Desire', cooldown: 'Passive', effects: [], description: 'Increases **Evasion** of all allies by 30%.', upgrades: [] },
      { name: 'Rouge Aroma', cooldown: '3 Turns', effects: [], description: 'Attacks all enemies.', upgrades: [{ level: 1, text: '+10% damage dealt' }] },
    ] },
  };

  it('puts the recommended build up front: most used set combination, top artifacts and the stats to aim for', async () => {
    vi.mocked(loadHero).mockResolvedValue(snapshot);
    render(<HeroPage code="c1176" />);
    const build = await screen.findByRole('region', { name: 'Recommended build' });
    expect(within(build).getByText(snapshot.detail!.combos[0].sets.join(' + '))).toBeTruthy();
    expect(within(build).getByText('39.2%')).toBeTruthy();
    const arts = within(build).getAllByRole('link');
    expect(arts.slice(0, 3).map((a) => a.getAttribute('href'))).toEqual(snapshot.artifacts.slice(0, 3).map((a) => `#/artifact/${a.code}`));
    expect(within(build).getByText('77.81%')).toBeTruthy();
    const aim = within(build).getByRole('list', { name: 'Stats to aim for' });
    expect(within(aim).getAllByRole('listitem').map((li) => li.textContent)).toEqual(expect.arrayContaining([expect.stringMatching(/^Speed \d+\+$/)]));
  });

  it('falls back to the top set of the gear ranking when there is no hunt data', async () => {
    vi.mocked(loadHero).mockResolvedValue({ ...snapshot, detail: undefined });
    render(<HeroPage code="c1176" />);
    const build = await screen.findByRole('region', { name: 'Recommended build' });
    expect(within(build).getByText(snapshot.sets[0].name)).toBeTruthy();
    expect(within(build).getByText('23.86%')).toBeTruthy();
    expect(within(build).queryByRole('list', { name: 'Stats to aim for' })).toBeNull();
  });

  it('shows the most used exclusive equipment upgrade in the build', async () => {
    vi.mocked(loadHero).mockResolvedValue({ ...snapshot, skills: ['Ambush', 'Blood Banquet', 'Scarlet Garden'], exclusive: [{ skill: 3, option: 2, share: 58.47 }] });
    render(<HeroPage code="c1176" />);
    const build = await screen.findByRole('region', { name: 'Recommended build' });
    expect(within(build).getByText(/Scarlet Garden, option 2/)).toBeTruthy();
    expect(within(build).getByText('58.47%')).toBeTruthy();
  });

  it('lists the three skills with icon, cooldown and soul gain, each opening on its description, effects, soulburn and enhancements', async () => {
    vi.mocked(loadHero).mockResolvedValue({ ...snapshot, skills: ['Horizontal Slash', 'Suppressed Desire', 'Rouge Aroma'] });
    vi.mocked(loadSkills).mockResolvedValue(skillsFile);
    render(<HeroPage code="c1176" />);
    const panel = await screen.findByRole('region', { name: 'Skills' });
    const items = within(panel).getAllByRole('group'); // one <details> per skill
    expect(items).toHaveLength(3);
    expect(items[1].querySelector('img')!.getAttribute('src')).toContain('sk_c1176_2.png');
    // the game's own name wins over the fan site's spelling
    expect(within(items[1]).getByText('Suppressed Desire')).toBeTruthy();
    expect(within(items[1]).getByText('Passive')).toBeTruthy();
    expect(within(items[0]).getByText('+1 soul')).toBeTruthy();
    expect(within(items[0]).getByText('Attack the enemy with a sword.', { exact: false })).toBeTruthy();
    expect(within(items[0]).getByText("caster's max HP").tagName).toBe('STRONG');
    expect(within(items[0]).getByText('Dual Attack').getAttribute('title')).toBe('Chance to attack after an ally.');
    expect(within(items[0]).getByText('Increases damage dealt. (-10 souls)', { exact: false })).toBeTruthy();
    expect(within(items[0]).getAllByText('+5% damage dealt')).toHaveLength(2);
    expect(within(items[2]).getByText('3 Turns')).toBeTruthy();
    expect(within(panel).queryByText(/Skill text from/)).toBeNull(); // no source line under the list
    expect(within(panel).queryByRole('link', { name: /epic7db/ })).toBeNull();
  });

  it('shows just the skill names, and points to the fan site for the text, when the skill data is missing', async () => {
    vi.mocked(loadHero).mockResolvedValue({ ...snapshot, skills: ['Horizontal Slash', 'Suppressed Desire', 'Rouge Aroma'] });
    render(<HeroPage code="c1176" />);
    const panel = await screen.findByRole('region', { name: 'Skills' });
    expect(within(panel).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Skill 1Horizontal Slash', 'Skill 2Suppressed Desire', 'Skill 3Rouge Aroma']);
    expect(within(panel).getByRole('link', { name: /epic7db\.com/ }).getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('leaves out the skills block when there are no skills at all', async () => {
    vi.mocked(loadHero).mockResolvedValue(snapshot);
    render(<HeroPage code="c1176" />);
    await screen.findByRole('heading', { name: 'Setsuka' });
    expect(screen.queryByRole('region', { name: 'Skills' })).toBeNull();
  });

  const ee = {
    name: 'Blooming Rose', stat: { name: 'Effectiveness', min: '8%', max: '16%' },
    options: [
      { skill: 'Ambush', text: 'Increases damage dealt by Ambush by 20%.' },
      { skill: 'Scarlet Garden', text: 'Decreases Defense of the enemy for 2 turns when using Scarlet Garden.', recommended: true },
      { skill: 'Scarlet Garden', text: 'Decreases cooldown of Scarlet Garden by 1 turn.' },
    ],
  };
  const usage3 = [{ skill: 3, option: 2, share: 58.47 }, { skill: 3, option: 3, share: 20.83 }, { skill: 1, option: 1, share: 20.7 }];
  const withEE = { ...snapshot, skills: ['Ambush', 'Blood Banquet', 'Scarlet Garden'], exclusive: usage3 };

  it('describes the exclusive equipment: its name, its stat bonus, and what each upgrade option does, most used first', async () => {
    vi.mocked(loadHero).mockResolvedValue(withEE);
    vi.mocked(loadSkills).mockResolvedValue({ ...skillsFile, exclusive: { c1176: ee } });
    render(<HeroPage code="c1176" />);
    const panel = await screen.findByRole('region', { name: 'Exclusive equipment' });
    expect(within(panel).getByText('Blooming Rose')).toBeTruthy();
    expect(within(panel).getByText('Effectiveness 8% to 16%')).toBeTruthy();
    const rows = within(panel).getAllByRole('listitem');
    expect(rows.map((r) => r.textContent)).toEqual([
      expect.stringContaining('Decreases Defense of the enemy for 2 turns when using Scarlet Garden.'),
      expect.stringContaining('Decreases cooldown of Scarlet Garden by 1 turn.'),
      expect.stringContaining('Increases damage dealt by Ambush by 20%.'),
    ]);
    expect(rows[0].textContent).toContain('58.47%');
    expect(rows[0].textContent).toContain('Most used');
    expect(rows[2].querySelector('img')!.getAttribute('src')).toContain('sk_c1176_1.png'); // option 1 improves skill 1
    expect(within(panel).queryByText(/does not describe the options/)).toBeNull();
  });

  it('still describes the options when the fan site gives no name for the exclusive equipment', async () => {
    vi.mocked(loadHero).mockResolvedValue(withEE);
    vi.mocked(loadSkills).mockResolvedValue({ ...skillsFile, exclusive: { c1176: { ...ee, name: '' } } });
    render(<HeroPage code="c1176" />);
    const panel = await screen.findByRole('region', { name: 'Exclusive equipment' });
    expect(within(panel).getByRole('region', { name: 'Upgrade options' })).toBeTruthy();
    expect(within(panel).getByText('Effectiveness 8% to 16%')).toBeTruthy();
    expect(within(panel).getAllByRole('listitem')).toHaveLength(3);
  });

  it('falls back to the usage bars (skill and option number) when the text of the exclusive equipment is not available', async () => {
    vi.mocked(loadHero).mockResolvedValue(withEE);
    render(<HeroPage code="c1176" />);
    const panel = await screen.findByRole('region', { name: 'Exclusive equipment' });
    expect(within(panel).getAllByRole('meter').map((m) => m.textContent)).toEqual([
      'Scarlet Garden, option 258.47%', 'Scarlet Garden, option 320.83%', 'Ambush, option 120.7%',
    ]);
    expect(within(panel).queryByText(/does not describe the options/)).toBeNull();
  });

  it('puts the most used upgrade, with its effect, in the recommended build', async () => {
    vi.mocked(loadHero).mockResolvedValue(withEE);
    vi.mocked(loadSkills).mockResolvedValue({ ...skillsFile, exclusive: { c1176: ee } });
    render(<HeroPage code="c1176" />);
    const build = await screen.findByRole('region', { name: 'Recommended build' });
    expect(within(build).getByText('Blooming Rose')).toBeTruthy();
    expect(within(build).getByText(/Decreases Defense of the enemy/)).toBeTruthy();
    expect(within(build).getByText('58.47%')).toBeTruthy();
  });

  it('leaves out the exclusive equipment block for a hero without one', async () => {
    vi.mocked(loadHero).mockResolvedValue({ ...snapshot, skills: ['A', 'B', 'C'] });
    render(<HeroPage code="c1176" />);
    await screen.findByRole('region', { name: 'Skills' });
    expect(screen.queryByRole('region', { name: 'Exclusive equipment' })).toBeNull();
  });

  it('links artifacts to their pages, but not the sets of a build', async () => {
    vi.mocked(loadHero).mockResolvedValue(snapshot);
    render(<HeroPage code="c1176" />);
    const equip = await screen.findByRole('region', { name: 'Source: gear ranking' });
    expect(within(within(equip).getByRole('region', { name: 'Sets' })).queryAllByRole('link')).toHaveLength(0);
    expect(within(within(equip).getByRole('region', { name: 'Artifacts' })).getAllByRole('link')[0].getAttribute('href')).toBe('#/artifact/efa29');
    const hunts = screen.getByRole('region', { name: 'Source: hunts' });
    expect(within(hunts).getAllByRole('link').some((a) => a.getAttribute('href') === '#/artifact/efa29')).toBe(true);
  });

  it('shows who the hero is most often played with, from the best PvE teams', async () => {
    vi.mocked(loadHero).mockResolvedValue(snapshot);
    vi.mocked(loadModes).mockResolvedValue({ key: 'k', lists: [
      { id: 'hunt-2-13', mode: 'hunts', title: 'Golem Hunt, Hell', group: 'Golem Hunt', variant: 'Hell', heroes: [{ code: 'c1176', name: 'Setsuka', share: 45 }] },
    ] });
    vi.mocked(loadTeams).mockResolvedValue({ key: 'k', lists: { 'hunt-2-13': {
      c1176: [{ share: 8, heroes: ['c1176', 'a', 'b', 'c'] }, { share: 3, heroes: ['c1176', 'a', 'd', 'e'] }],
    } } });
    vi.mocked(loadHeroes).mockResolvedValue(['c1176:Setsuka', 'a:Ann', 'b:Bo', 'c:Cy', 'd:Di', 'e:Ed']
      .map((x) => ({ code: x.split(':')[0], name: x.split(':')[1], grade: 5, job: 'mage', element: 'fire' })));
    render(<HeroPage code="c1176" />);
    const panel = await screen.findByRole('region', { name: 'Often played with' });
    const rows = within(panel).getAllByRole('listitem');
    expect(rows[0].textContent).toContain('Ann');
    expect(rows[0].textContent).toContain('2 of 2 teams');
    expect(within(rows[0]).getByRole('link', { name: 'Ann' }).getAttribute('href')).toBe('#/hero/a');
    expect(rows[1].textContent).toContain('1 of 2 teams');
  });

  it('links each mode a hero is used in to that mode', async () => {
    vi.mocked(loadHero).mockResolvedValue(snapshot);
    vi.mocked(loadModes).mockResolvedValue({ key: 'k', lists: [
      { id: 'hunt-2-13', mode: 'hunts', title: 'Golem Hunt, Hell', group: 'Golem Hunt', variant: 'Hell', heroes: [{ code: 'c1176', name: 'Setsuka', share: 45 }] },
    ] });
    render(<HeroPage code="c1176" />);
    const panel = await screen.findByRole('region', { name: 'Other game modes' });
    expect(within(panel).getByRole('link', { name: /Golem Hunt, Hell/ }).getAttribute('href')).toBe('#/modes/hunt-2-13');
  });

  it('shows the best teams the hero plays in, across modes, with member names and the mode they come from', async () => {
    vi.mocked(loadHero).mockResolvedValue(snapshot);
    vi.mocked(loadModes).mockResolvedValue({ key: 'k', lists: [
      { id: 'abyss-120', mode: 'abyss', title: 'Abyss, Floor 120', group: 'Abyss', variant: 'Floor 120', heroes: [{ code: 'c1176', name: 'Setsuka', share: 20 }] },
      { id: 'hunt-2-13', mode: 'hunts', title: 'Golem Hunt, Hell', group: 'Golem Hunt', variant: 'Hell', heroes: [{ code: 'c1176', name: 'Setsuka', share: 45 }] },
    ] });
    vi.mocked(loadTeams).mockResolvedValue({ key: 'k', lists: {
      'hunt-2-13': { c1176: [{ share: 8.08, heroes: ['c1176', 'a', 'b', 'c'] }] },
      'abyss-120': { c1176: [{ share: 19.09, heroes: ['c1176', 'd', 'e', 'f'] }] },
    } });
    vi.mocked(loadHeroes).mockResolvedValue(['c1176:Setsuka', 'a:Ann', 'b:Bo', 'c:Cy', 'd:Di', 'e:Ed', 'f:Fay']
      .map((x) => ({ code: x.split(':')[0], name: x.split(':')[1], grade: 5, job: 'mage', element: 'fire' })));
    render(<HeroPage code="c1176" />);
    const panel = await screen.findByRole('region', { name: 'Best PvE teams with Setsuka' });
    const rows = within(panel).getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain('19.09%'); // best first, whatever the mode
    expect(within(rows[0]).getByRole('link', { name: 'Abyss, Floor 120' }).getAttribute('href')).toBe('#/modes/abyss-120');
    expect(within(rows[0]).getAllByRole('link').slice(1).map((a) => a.textContent)).toEqual(['Setsuka', 'Di', 'Ed', 'Fay']);
    expect(loadTeams).toHaveBeenCalledWith('2026-10-29');
  });

  const arenaSeason = (extra: Record<string, unknown> = {}) => ({
    id: '9', title: 't', season: 'Summer 2026', published: '2026-08-07', url: 'https://page.onstove.com/epicseven/global/view/9', leagues: [], cutoffs: [],
    preBan: { champion: [], warlord: [], emperor: [], legend: [{ hero: 'Setsuka', rate: 71 }] },
    firstPick: { champion: [], warlord: [], emperor: [], legend: [] },
    pick: { champion: [{ hero: 'x', rate: 1, ban: 1, win: 1 }, { hero: 'Setsuka', rate: 47.4, ban: 12, win: 52.8 }], warlord: [], emperor: [], legend: [] },
    ...extra,
  });
  const arenaIndex = { seasons: [{ id: '9', season: 'Summer 2026', published: '2026-08-07', title: 't', url: 'https://page.onstove.com/epicseven/global/view/9' }] };

  it('shows the hero\'s World Arena (RTA) figures of the latest season, per league tier', async () => {
    vi.mocked(loadHero).mockResolvedValue(snapshot);
    vi.mocked(loadArenaIndex).mockResolvedValue(arenaIndex);
    vi.mocked(loadArenaSeason).mockResolvedValue(arenaSeason() as never);
    render(<HeroPage code="c1176" />);
    const panel = await screen.findByRole('region', { name: 'World Arena (RTA)' });
    expect(loadArenaSeason).toHaveBeenCalledWith('9');
    expect(within(panel).getByText('Summer 2026')).toBeTruthy();
    const table = within(panel).getByRole('table', { name: 'RTA stats' });
    expect(within(table).getAllByRole('columnheader').map((c) => c.textContent)).toEqual(['League', 'Pick', 'Win rate', 'First pick', 'Pre-ban']);
    const rows = within(table).getAllByRole('row').slice(1).map((r) => [within(r).getByRole('rowheader').textContent, ...within(r).getAllByRole('cell').map((c) => c.textContent)]);
    expect(rows).toEqual([
      ['Champion+', '47.4% (#2)', '52.8%', '—', '—'],
      ['Legend+', '—', '—', '—', '71% (#1)'],
    ]);
    expect(within(panel).getByRole('link', { name: /official infographic/ }).getAttribute('href')).toBe('https://page.onstove.com/epicseven/global/view/9');
  });

  describe('RTA among the top players', () => {
    const rta = (heroes: RtaStats['heroes']): RtaStats => ({ season: 'Fall 2026', code: 'pvp_rta_ss21', updated: '2026-11-06', players: 100, battles: 1000, since: '2026-10-20', until: '2026-11-03', heroes });

    it('shows the pick, win, ban, pre-ban and first pick rates of the hero in the sample, even when it is not in the infographic', async () => {
      vi.mocked(loadHero).mockResolvedValue(snapshot);
      vi.mocked(loadRta).mockResolvedValue(rta({ c1176: { pick: 250, played: 200, win: 110, first: 40, ban: 50, preban: 30 } }));
      render(<HeroPage code="c1176" />);
      const block = await screen.findByRole('region', { name: 'RTA, top players' });
      const cells = within(within(block).getByRole('table', { name: 'RTA, top players' })).getAllByRole('cell').map((c) => c.textContent);
      expect(cells).toEqual(['25%', '55%', '5%', '3%', '4%']);
      expect(block.textContent).toContain('Fall 2026');
      expect(block.textContent).toContain('2026-10-20 to 2026-11-03');
      expect(screen.queryByRole('region', { name: 'World Arena (RTA)' })).toBeNull();
    });

    it('is left out when the hero has too few games, or without a sample', async () => {
      vi.mocked(loadHero).mockResolvedValue(snapshot);
      vi.mocked(loadRta).mockResolvedValue(rta({ c1176: { pick: 4, played: 4, win: 4, first: 0, ban: 0, preban: 0 } }));
      render(<HeroPage code="c1176" />);
      await screen.findByRole('heading', { name: 'Setsuka' });
      expect(screen.queryByRole('region', { name: 'RTA, top players' })).toBeNull();
    });

    it('is left out when the sample cannot be loaded', async () => {
      vi.mocked(loadHero).mockResolvedValue(snapshot);
      vi.mocked(loadRta).mockRejectedValue(new Error('down'));
      render(<HeroPage code="c1176" />);
      await screen.findByRole('heading', { name: 'Setsuka' });
      expect(screen.queryByRole('region', { name: 'RTA, top players' })).toBeNull();
    });
  });

  it('leaves out the World Arena block when the hero is in none of the top-20 tables', async () => {
    vi.mocked(loadHero).mockResolvedValue({ ...snapshot, hero: { ...snapshot.hero, name: 'Somebody Else' } });
    vi.mocked(loadArenaIndex).mockResolvedValue(arenaIndex);
    vi.mocked(loadArenaSeason).mockResolvedValue(arenaSeason() as never);
    render(<HeroPage code="c1176" />);
    await screen.findByRole('heading', { name: 'Somebody Else' });
    await waitFor(() => expect(loadArenaSeason).toHaveBeenCalled());
    expect(screen.queryByRole('region', { name: 'World Arena (RTA)' })).toBeNull();
  });

  it('leaves out the World Arena block when there is no arena data or it cannot be loaded', async () => {
    vi.mocked(loadHero).mockResolvedValue(snapshot);
    render(<HeroPage code="c1176" />);
    await screen.findByRole('heading', { name: 'Setsuka' });
    expect(screen.queryByRole('region', { name: 'World Arena (RTA)' })).toBeNull();
    cleanup();
    vi.mocked(loadArenaIndex).mockRejectedValue(new Error('down'));
    render(<HeroPage code="c1176" />);
    await screen.findByRole('heading', { name: 'Setsuka' });
    expect(screen.queryByRole('region', { name: 'World Arena (RTA)' })).toBeNull();
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

  it('ignores a stale response after a quick change of hero', async () => {
    let resolveOld!: (h: HeroSnapshot) => void;
    const old = new Promise<HeroSnapshot>((r) => { resolveOld = r; });
    vi.mocked(loadHero).mockReturnValueOnce(old).mockResolvedValueOnce({ ...snapshot, hero: { ...snapshot.hero, name: 'Nouveau' } });
    const { rerender } = render(<HeroPage code="c1176" />);
    await waitFor(() => expect(loadHero).toHaveBeenCalledTimes(1));
    rerender(<HeroPage code="c9999" />);
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
  it('falls to the home page for an empty or nested code', async () => {
    await at('#/hero/');
    expect(await screen.findByRole('heading', { name: 'Meta of the week' })).toBeTruthy();
    cleanup();
    await at('#/hero/c1/extra');
    expect(await screen.findByRole('heading', { name: 'Meta of the week' })).toBeTruthy();
    expect(loadHero).not.toHaveBeenCalled();
  });
});
