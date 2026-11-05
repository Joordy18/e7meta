import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { collectArena, listInfographics, parseArena } from '../scripts/collect/arena';
import type { createClient } from '../scripts/collect/api';

const fx = (n: string) => JSON.parse(readFileSync(`tests/fixtures/${n}.json`, 'utf8'));
const article = fx('arena-article'); // World Arena Spring 2026, tables only
const html: string = article.value.content;

describe('parseArena', () => {
  const s = parseArena(html);

  it('reads pre-ban rates for the four league tiers, best first', () => {
    expect(s.preBan.champion[0]).toEqual({ hero: 'Lady of the Scales', rate: 63.6 });
    expect(s.preBan.warlord[0]).toEqual({ hero: 'Lady of the Scales', rate: 66 });
    expect(s.preBan.emperor[0]).toEqual({ hero: 'Lady of the Scales', rate: 69 });
    expect(s.preBan.legend[0]).toEqual({ hero: 'Lady of the Scales', rate: 71.3 });
    for (const tier of Object.values(s.preBan)) expect(tier).toHaveLength(20);
  });

  it('reads first pick with its ban and win rates, for each tier', () => {
    expect(s.firstPick.champion[0]).toEqual({ hero: 'Boss Arunka', rate: 26, ban: 16.5, win: 48.2 });
    expect(s.firstPick.legend[0]).toEqual({ hero: 'School Nurse Yulha', rate: 28.4, ban: 16, win: 51.1 });
    for (const tier of Object.values(s.firstPick)) expect(tier).toHaveLength(20);
  });

  it('reads pick with its ban and win rates, for each tier', () => {
    expect(s.pick.champion[0]).toEqual({ hero: 'Genesis Ras', rate: 67.1, ban: 13.2, win: 51.8 });
    expect(s.pick.legend[0]).toEqual({ hero: 'Genesis Ras', rate: 63.3, ban: 8.1, win: 51.2 });
    for (const tier of Object.values(s.pick)) expect(tier).toHaveLength(20);
  });

  it('reads the global win rate and player count of each top league', () => {
    expect(s.leagues).toEqual([
      { league: 'Legend', avgWinRate: 62.1, players: 31 },
      { league: 'Emperor', avgWinRate: 51.7, players: 336 },
      { league: 'Warlord', avgWinRate: 50, players: 827 },
    ]);
  });

  it('reads the cutoffs', () => {
    expect(s.cutoffs).toEqual([
      { league: 'Legend', points: 3475 }, { league: 'Emperor', points: 3152 }, { league: 'Warlord', points: 2629 },
    ]);
  });

  it('refuses a page whose tables it does not recognise, instead of publishing nothing useful', () => {
    expect(() => parseArena('<p>No tables here</p>')).toThrow(/layout/);
    expect(() => parseArena('<table><tr><td>Pursuit Season</td><td>Spring 2025 Season</td></tr></table>')).toThrow(/layout/);
  });
});

describe('listInfographics', () => {
  const list = listInfographics(fx('arena-list'));
  it('keeps the season infographics, newest first, with season name, date and the post link', () => {
    expect(list[0]).toEqual({
      id: '14228552', title: 'World Arena Summer 2026 Season Infographic', season: 'Summer 2026', published: '2026-08-07',
      url: 'https://page.onstove.com/epicseven/global/view/14228552',
    });
    expect(list.map((x) => x.season)).toEqual(['Summer 2026', 'Spring 2026', 'Fall 2025']);
  });
  it('leaves out other posts and the older layouts (before Fall 2025)', () => {
    expect(list.some((x) => /Improvements|Matchmaking|Victory/.test(x.title))).toBe(false);
    expect(list.some((x) => /2025 Season/.test(x.season) && x.season !== 'Fall 2025')).toBe(false);
  });
});

describe('collectArena', () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'e7-arena-')); });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  const read = (...p: string[]) => JSON.parse(readFileSync(join(dir, ...p), 'utf8'));
  function fake(o: { failArticle?: string; failList?: boolean } = {}) {
    const calls: { path: string; params: Record<string, string> }[] = [];
    const meta = new Map(fx('arena-list').value.list.map((a: { article_id: string }) => [a.article_id, a]));
    const client = {
      async get(path: string, params: Record<string, string>) {
        calls.push({ path, params });
        if (path.includes('article_group')) {
          if (o.failList) throw new Error('list down');
          return fx('arena-list');
        }
        if (params.article_id === o.failArticle) throw new Error('article down');
        const m = meta.get(params.article_id) as { article_id: string; title: string; create_datetime: number };
        return { ...article, value: { ...article.value, article_id: m.article_id, title: m.title, create_datetime: m.create_datetime } };
      },
    };
    return { client: client as unknown as ReturnType<typeof createClient>, calls };
  }
  const articleCalls = (calls: { path: string; params: Record<string, string> }[]) => calls.filter((c) => !c.path.includes('article_group'));

  it('writes one file per season and an index, newest first', async () => {
    const { client } = fake();
    expect(await collectArena({ outDir: dir, client })).toBe('written');
    expect(read('arena', 'index.json').seasons.map((s: { season: string }) => s.season)).toEqual(['Summer 2026', 'Spring 2026', 'Fall 2025']);
    const s = read('arena', '12903188.json');
    expect(s).toMatchObject({ id: '12903188', season: 'Spring 2026', published: '2026-04-03' });
    expect(s.pick.champion[0].hero).toBe('Genesis Ras');
  });

  it('fetches only the seasons it does not have yet', async () => {
    await collectArena({ outDir: dir, client: fake().client });
    const again = fake();
    expect(await collectArena({ outDir: dir, client: again.client })).toBe('skipped');
    expect(articleCalls(again.calls)).toHaveLength(0);
  });

  it('keeps the other seasons when one article fails, and retries it next time', async () => {
    const logs: string[] = [];
    expect(await collectArena({ outDir: dir, client: fake({ failArticle: '12903188' }).client, log: (m) => logs.push(m) })).toBe('written');
    expect(existsSync(join(dir, 'arena', '12903188.json'))).toBe(false);
    expect(read('arena', 'index.json').seasons.map((s: { season: string }) => s.season)).toEqual(['Summer 2026', 'Fall 2025']);
    expect(logs.some((m) => /12903188/.test(m))).toBe(true);
    const retry = fake();
    await collectArena({ outDir: dir, client: retry.client });
    expect(articleCalls(retry.calls).map((c) => c.params.article_id)).toEqual(['12903188']);
  });

  it('fails without touching anything when the list cannot be fetched', async () => {
    expect(await collectArena({ outDir: dir, client: fake({ failList: true }).client })).toBe('failed');
    expect(existsSync(join(dir, 'arena'))).toBe(false);
  });
});
