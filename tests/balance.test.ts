import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseBalance, parseBalanceLocal, refreshFeed } from '../scripts/collect/feed';
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

// The same preview in another language: the post has the same layout; the fixture's texts are given a language mark and the (Before) / (After) marks of Korean
const localize = (h: string, lang: string, intro = '') =>
  intro + h.replace(/>([^<>]*[^<>\s][^<>]*)</g, (_, t: string) => {
    if (!t.replace(/&nbsp;/g, '').trim()) return `>${t}<`; // a blank paragraph stays blank
    const s = t.replace('(Before)', '(전)').replace('(After)', '(후)');
    return /^\d+(-\d+)*\.\s/.test(s.trim()) ? `>${s}<` : `>${lang} ${s}<`;
  });

describe('parseBalanceLocal', () => {
  const en = parseBalance(html, '2026-11-06')!;

  it('gives, for each change in the same order, the skills, the summary and the before / after texts of the post in the other language', () => {
    const local = parseBalanceLocal(html, localize(html, 'KO'), '2026-11-06')!;
    expect(local).toHaveLength(en.changes.length);
    const ray = local[0];
    expect(ray.skills).toEqual(['KO Cloud of Death', 'KO Constellation']); // the awakened version folds into its skill, as in English
    expect(ray.details!.map((d) => d.skill)).toEqual(['KO Cloud of Death', 'KO Cloud of Death (Awakened)', 'KO Constellation']);
    expect(ray.details![2]).toMatchObject({ before: 'KO Cancer', after: 'KO Scorpio' });
    expect(ray.summary).toMatch(/^KO Death Dealer Ray is a Hero/);
    expect(local[1].details!.find((d) => d.skill === 'KO Touch of Darkness')!.tags).toEqual({ before: [], after: ['KO Damage Dealt Decreased', 'KO Additional Damage Dealt Increased'] });
    expect(local.map((c) => c.details?.length ?? 0)).toEqual(en.changes.map((c) => c.details?.length ?? 0));
  });

  it('lines the post up on its first numbered section, whatever the length of its introduction', () => {
    const local = parseBalanceLocal(html, localize(html, 'JA', '<p>one more paragraph of introduction</p>'), '2026-11-06')!;
    expect(local[0].details![0].skill).toBe('JA Cloud of Death');
  });

  it('is null when the post is not laid out like the English one', () => {
    const shorter = html.replace(/<tr[\s>][\s\S]*?<\/tr>/g, (row) => (row.includes('Constellation (Before)') ? '' : row)); // a skill table less
    expect(parseBalanceLocal(html, localize(shorter, 'KO'), '2026-11-06')).toBeNull();
  });
});

describe('refreshFeed: the preview in the other languages', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'e7-bal-'));
    mkdirSync(join(dir, '2026-10-29'), { recursive: true });
    writeFileSync(join(dir, 'index.json'), JSON.stringify({ periods: ['2026-10-29'] }));
    writeFileSync(join(dir, '2026-10-29', 'heroes.json'), JSON.stringify([]));
    writeFileSync(join(dir, '2026-10-29', 'gear.json'), JSON.stringify({ key: 'k', artifacts: {} }));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));
  const read = () => JSON.parse(readFileSync(join(dir, 'feed.json'), 'utf8'));
  const env = (value: unknown) => ({ code: 0, message: 'ok', value });
  const at = Date.parse('2026-11-06T01:00:00Z');

  // the English board, and for each language its board with the title its preview has, plus an older preview and a post-patch notice that must not be taken
  const BOARDS: Record<string, { id: string; title: string }[]> = {
    '987': [{ id: '14618757', title: '11/19 (Thu) Balance Adjustment Preview' }],
    '1816': [{ id: '700', title: 'バランス調整（11/19予定）' }, { id: '699', title: 'バランス調整（9/17予定）' }, { id: '698', title: '4/1(水) バランス調整事後のお知らせ' }],
    '999': [{ id: '800', title: '11/19(목) 밸런스 조정 사전 안내' }, { id: '799', title: '09/17(목) 밸런스 조정 사전 안내' }],
    '1004': [{ id: '900', title: '【11/19(週四)平衡調整事前說明】' }],
  };
  function fake(o: { broken?: string } = {}) {
    const asked: string[] = [];
    const client = {
      async get(path: string, params: Record<string, string>) {
        if (path === 'v3.0/article') {
          asked.push(params.article_id);
          if (params.article_id === o.broken) return env({ content: '<p>Hello</p>' }); // not laid out like the English one
          const lang = { '700': 'JA', '800': 'KO', '900': 'ZH' }[params.article_id];
          return lang ? env({ content: localize(html, lang) }) : post;
        }
        const board = /BOARD\/(\d+)\//.exec(path)![1];
        return env({ list: (BOARDS[board] ?? [{ id: board, title: `news ${board}` }]).map((p) => ({ article_id: p.id, title: p.title, create_datetime: at })) });
      },
    };
    return { client: client as unknown as ReturnType<typeof createClient>, asked };
  }

  it('stores the official texts of the Japanese, Korean and Taiwanese posts of the same patch day, with their own link', async () => {
    const { client, asked } = fake();
    await refreshFeed({ outDir: dir, client });
    const l10n = read().balance.l10n;
    expect(Object.keys(l10n)).toEqual(['ja', 'ko', 'zh']);
    expect(l10n.ja).toMatchObject({ title: 'バランス調整（11/19予定）', url: 'https://page.onstove.com/epicseven/jp/view/700' });
    expect(l10n.ko.url).toBe('https://page.onstove.com/epicseven/kr/view/800');
    expect(l10n.zh.url).toBe('https://page.onstove.com/epicseven/tw/view/900');
    expect(l10n.ko.changes).toHaveLength(7);
    expect(l10n.ja.changes[0].skills[0]).toBe('JA Cloud of Death');
    expect(asked).toEqual(['14618757', '700', '800', '900']); // the older previews and the notice after a patch are not read
  });

  it('leaves a language out when its post is not laid out like the English one, and keeps the others', async () => {
    const logs: string[] = [];
    await refreshFeed({ outDir: dir, client: fake({ broken: '800' }).client, log: (m) => logs.push(m) });
    expect(Object.keys(read().balance.l10n)).toEqual(['ja', 'zh']);
    expect(logs.some((m) => /ko balance preview 800/.test(m))).toBe(true);
  });

  it('keeps the texts found earlier for the same preview when a board cannot be read now', async () => {
    await refreshFeed({ outDir: dir, client: fake().client });
    const down = fake().client;
    const get = down.get.bind(down);
    (down as unknown as { get: typeof get }).get = async (path, params) => { if (/BOARD\/999\//.test(path)) throw new Error('down'); return get(path, params); };
    await refreshFeed({ outDir: dir, client: down });
    expect(Object.keys(read().balance.l10n)).toEqual(['ja', 'ko', 'zh']);
  });
});
