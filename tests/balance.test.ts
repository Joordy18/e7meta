import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseBalance, refreshFeed } from '../scripts/collect/feed';
import type { createClient } from '../scripts/collect/api';

const post = JSON.parse(readFileSync('tests/fixtures/balance-post.json', 'utf8'));
const html: string = post.value.content;

describe('parseBalance', () => {
  const b = parseBalance(html, '2026-11-06')!;

  it('reads the patch day from the post text, and every hero of the target table in order with its grade', () => {
    expect(b.date).toBe('2026-11-19');
    expect(b.changes.map((c) => [c.kind, c.grade, c.name])).toEqual([
      ['hero', 5, 'Death Dealer Ray'], ['hero', 5, 'Requiem Roana'], ['hero', 5, 'Eternal Wanderer Ludwig'], ['hero', 5, 'Hellion Lua'],
      ['hero', 5, 'Summertime Iseria'], ['hero', 5, 'Guard Captain Krau'], ['hero', 4, 'Victorika'],
    ]);
  });

  it('lists the skills each hero changes, once each (awakened and enhanced versions fold into the skill)', () => {
    const by = (name: string) => b.changes.find((c) => c.name === name)!;
    expect(by('Death Dealer Ray').skills).toEqual(['Cloud of Death', 'Constellation']);
    expect(by('Guard Captain Krau').skills).toEqual(['Crimson Flame', 'Scorching Flare']);
    expect(by('Hellion Lua').skills).toEqual(['Lua Squad', "Lua's Challenge"]);
  });

  it('keeps the developers\' own explanation of each hero, cut to a few sentences', () => {
    const ray = b.changes.find((c) => c.name === 'Death Dealer Ray')!;
    expect(ray.summary).toMatch(/^Death Dealer Ray is a Hero who subdues enemies with Venom and Sleep/);
    expect(ray.summary!.length).toBeLessThanOrEqual(300);
    const vic = b.changes.find((c) => c.name === 'Victorika')!;
    expect(vic.summary).toMatch(/^Victorika's offensive capabilities and survivability will both be strengthened/);
    expect(vic.summary).not.toMatch(/That concludes|Thank you/); // the closing words of the post are not a hero's
  });

  it('puts the patch in the next year when the post is from December and the patch in January', () => {
    const text = '<p>The following balance adjustments are scheduled to take place on January 8.</p><p>Hero</p><tr><td>5 ★ Moonlight Zed</td></tr>';
    expect(parseBalance(text, '2026-12-26')!.date).toBe('2027-01-08');
  });

  it('reads artifacts too, listed as "★ 5 Name"', () => {
    const text = '<p>scheduled to take place on July 16.</p><p>Hero</p><tr><td>Grade</td><td>Name</td></tr><tr><td>5 ★ Moonlight Dark Corvus</td></tr>'
      + '<p>Artifact</p><tr><td>Grade</td><td>Name</td></tr><tr><td>★ 5 Elegiac Candle</td></tr><p>1-1. Hero Balance Adjustments</p><p>Dark Corvus</p>'
      + '<tr><td>Dark Pulse (Before)</td><td>Dark Pulse (After)</td></tr><p>Corvus gets stronger.</p><p>1-2. Artifact Balance Adjustments</p><p>Elegiac Candle</p><p>The candle heals more.</p>';
    const r = parseBalance(text, '2026-07-03')!;
    expect(r.changes.map((c) => [c.kind, c.name])).toEqual([['hero', 'Dark Corvus'], ['artifact', 'Elegiac Candle']]);
    expect(r.changes[1].summary).toBe('The candle heals more.');
    expect(r.changes[0].summary).toBe('Corvus gets stronger.');
  });

  it('is null when the post has no target table', () => {
    expect(parseBalance('<p>Hello Heirs</p>', '2026-11-06')).toBeNull();
  });
});

describe('refreshFeed: balance changes', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'e7-bal-'));
    mkdirSync(join(dir, '2026-10-29'), { recursive: true });
    writeFileSync(join(dir, 'index.json'), JSON.stringify({ periods: ['2026-10-29'] }));
    writeFileSync(join(dir, '2026-10-29', 'heroes.json'), JSON.stringify([{ code: 'c1', name: 'Death Dealer Ray', grade: 5, job: 'mage', element: 'dark' }]));
    writeFileSync(join(dir, '2026-10-29', 'gear.json'), JSON.stringify({ key: 'k', artifacts: {} }));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));
  const read = () => JSON.parse(readFileSync(join(dir, 'feed.json'), 'utf8'));
  const env = (value: unknown) => ({ code: 0, message: 'ok', value });

  function fake(o: { noPreview?: boolean; failArticle?: boolean } = {}) {
    const articles: string[] = [];
    const client = {
      async get(path: string, params: Record<string, string>) {
        if (path === 'v3.0/article') {
          articles.push(params.article_id);
          if (o.failArticle) throw new Error('article down');
          return post;
        }
        const board = /BOARD\/(\d+)\//.exec(path)![1];
        const list = board === '987' && !o.noPreview
          ? [{ article_id: '14618757', title: '11/19 (Thu) Balance Adjustment Preview', create_datetime: Date.parse('2026-11-06T01:00:00Z') },
            { article_id: '1', title: 'Old news', create_datetime: Date.parse('2026-05-01T01:00:00Z') }]
          : [{ article_id: board, title: `news ${board}`, create_datetime: Date.parse('2026-11-05T10:00:00Z') }];
        return env({ list });
      },
    };
    return { client: client as unknown as ReturnType<typeof createClient>, articles };
  }

  it('reads the latest balance preview of the developer notes and stores the changes with the post and the patch day', async () => {
    const { client, articles } = fake();
    await refreshFeed({ outDir: dir, client });
    expect(articles).toEqual(['14618757']);
    const bal = read().balance;
    expect(bal).toMatchObject({ id: '14618757', title: '11/19 (Thu) Balance Adjustment Preview', url: 'https://page.onstove.com/epicseven/global/view/14618757', posted: '2026-11-06', date: '2026-11-19' });
    expect(bal.changes).toHaveLength(7);
  });

  it('gives each hero its code, class and element when the data knows the name', async () => {
    await refreshFeed({ outDir: dir, client: fake().client });
    const ray = read().balance.changes.find((c: { name: string }) => c.name === 'Death Dealer Ray');
    expect(ray).toMatchObject({ code: 'c1', job: 'mage', element: 'dark', grade: 5 });
    expect(read().balance.changes.find((c: { name: string }) => c.name === 'Victorika')).not.toHaveProperty('code');
  });

  it('has no balance block without a preview post, and keeps the previous one when the post cannot be read', async () => {
    await refreshFeed({ outDir: dir, client: fake({ noPreview: true }).client });
    expect(read()).not.toHaveProperty('balance');
    await refreshFeed({ outDir: dir, client: fake().client });
    const logs: string[] = [];
    await refreshFeed({ outDir: dir, client: fake({ failArticle: true }).client, log: (m) => logs.push(m) });
    expect(read().balance.changes).toHaveLength(7);
    expect(logs.some((m) => /balance preview/.test(m))).toBe(true);
  });
});

describe('parseBalance: exact changes', () => {
  const b = parseBalance(html, '2026-11-06')!;
  const by = (name: string) => b.changes.find((c) => c.name === name)!;

  it('keeps, for each changed skill, its text before and after the patch', () => {
    const ray = by('Death Dealer Ray').details!;
    expect(ray.map((d) => d.skill)).toEqual(['Cloud of Death', 'Cloud of Death (Awakened)', 'Constellation']);
    expect(ray[0].before).toBe('Releases a miasma of fatal poison, dispelling two buffs from all enemies and has a 100% chance to put them to sleep for 1 turn and inflict venom for 2 turns.');
    expect(ray[0].after).toBe('Releases a miasma of fatal poison, dispelling two buffs from all enemies and has a 100% chance to inflict two venom effects and sleep for 1 turn.');
    expect(ray[2]).toMatchObject({ skill: 'Constellation', before: 'Cancer', after: 'Scorpio' });
  });

  it('joins the paragraphs of a cell with a line break and decodes spaces', () => {
    const lament = by('Requiem Roana').details!.find((d) => d.skill === 'Eternal Lament')!;
    expect(lament.before).toBe('Attacks all enemies with a horde of illusions, dispelling one buff before increasing cooldowns by 1 turn and decreasing Combat Readiness by 30%.\nCannot trigger a critical hit or a heavy blow, but penetrates the target\'s Defense by 50%.');
    const awakened = by('Requiem Roana').details!.find((d) => d.skill === 'Eternal Lament (Awakened)')!;
    expect(awakened.after).toContain('a heavy blow, and penetrates'); // the non-breaking space of the post became a normal one
  });

  it('keeps the effect labels the developers add under a skill, on the side they belong to', () => {
    const touch = by('Requiem Roana').details!.find((d) => d.skill === 'Touch of Darkness')!;
    expect(touch.tags).toEqual({ before: [], after: ['Damage Dealt Decreased', 'Additional Damage Dealt Increased'] });
    const waltz = by('Victorika').details!.find((d) => d.skill === 'Maelstrom Waltz')!;
    expect(waltz.tags).toEqual({ before: ['Cooldown: 4 Turns'], after: ['Cooldown: 3 Turns'] });
    expect(by('Death Dealer Ray').details![0]).not.toHaveProperty('tags');
  });

  it('has the skills list and the details in the same order', () => {
    for (const c of b.changes) expect(c.details!.map((d) => d.skill.replace(/ \((Awakened|Skill Enhance)\)$/, '')).filter((s, i, a) => a.indexOf(s) === i)).toEqual(c.skills);
  });
});
