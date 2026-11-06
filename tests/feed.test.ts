import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findReleases, listPosts, parseAnnouncements, refreshFeed } from '../scripts/collect/feed';
import type { createClient } from '../scripts/collect/api';
import type { Release } from '../src/shared/types';

const post = (id: number, title: string, iso: string, thumb?: string) => ({ article_id: String(id), title, create_datetime: Date.parse(iso), ...(thumb ? { media_thumbnail_url: thumb } : {}) });
const update = JSON.parse(readFileSync('tests/fixtures/update-post.json', 'utf8')); // real paragraphs of the 8.7 update post
const envelope = (list: unknown[]) => ({ code: 0, message: 'ok', value: { list } });

describe('listPosts', () => {
  const raw = envelope([post(3, 'Third', '2026-11-05T10:00:00Z'), post(2, 'Second', '2026-11-01T10:00:00Z'), post(1, 'First', '2026-10-01T10:00:00Z')]);
  it('maps the board list to posts with a date and a link, keeping the order and cutting to n', () => {
    expect(listPosts(raw, 'patch', 2)).toEqual([
      { id: '3', board: 'patch', title: 'Third', date: '2026-11-05', url: 'https://page.onstove.com/epicseven/global/view/3' },
      { id: '2', board: 'patch', title: 'Second', date: '2026-11-01', url: 'https://page.onstove.com/epicseven/global/view/2' },
    ]);
  });
  it('keeps the official banner of a post as an https link, and has no image field when the post has none', () => {
    const r = listPosts(envelope([post(5, 'With', '2026-11-05T10:00:00Z', '//image.onstove.com/850x0//cdn/a.png'), post(4, 'Without', '2026-11-04T10:00:00Z')]), 'event', 5);
    expect(r[0].image).toBe('https://image.onstove.com/850x0//cdn/a.png');
    expect(r[1]).not.toHaveProperty('image');
  });
  it('throws on a bad envelope', () => expect(() => listPosts({ code: 1 }, 'patch', 2)).toThrow());
});

describe('parseAnnouncements', () => {
  it('reads the new heroes and artifacts an update post announces, in order', () => {
    expect(parseAnnouncements(update.value.content)).toEqual([
      { kind: 'hero', name: 'Bunny Girl Great Detective Moro' },
      { kind: 'hero', name: 'Bunny Girl Mafia Yufine' },
      { kind: 'artifact', name: "A Boss's Dignity", job: 'knight' },
    ]);
  });
  it('reads the class of an exclusive artifact from the text under its heading, and none when the post does not say', () => {
    const exclusive = (job: string) => `<p>1. New 5 ★ Artifact, X</p><p>■ The ${job}-exclusive 5 ★ Artifact, X, will be added.</p>`;
    expect(parseAnnouncements(exclusive('Thief'))[0].job).toBe('assassin');
    expect(parseAnnouncements(exclusive('Soul Weaver'))[0].job).toBe('manauser');
    expect(parseAnnouncements('<p>1. New 5 ★ Artifact, Land</p><p>■ A 5 ★ Artifact, Land, will be added.</p>')[0]).not.toHaveProperty('job');
    expect(parseAnnouncements('<p>1. New 5 ★ Artifact, A</p><p>The Mage-exclusive</p><p>2. New 5 ★ Artifact, B</p><p>plain</p>')[1]).not.toHaveProperty('job'); // a class under another heading is not borrowed
  });
  it('ignores other paragraphs, including ones that only mention new heroes', () => {
    const html = '<p>* New Moonlight Heroes will not be released during this period.</p><p><span>1. New 4</span><span>★</span><span> Hero, Plain Name</span></p><p>Meet the new 5 ★ Hero, Not A Heading</p>';
    expect(parseAnnouncements(html)).toEqual([{ kind: 'hero', name: 'Plain Name' }]);
  });
  it('is empty without announcements', () => expect(parseAnnouncements('<p>Bug fixes</p>')).toEqual([]));
});

describe('findReleases', () => {
  const hero = (code: string, name = code, more = {}) => ({ code, name, ...more });
  const art = (...codes: string[]) => Object.fromEntries(codes.map((c) => [c, { code: c, name: `Art ${c}`, job: 'mage', grade: 5 }]));
  it('lists the heroes and artifacts that the latest week has and the previous one has not, stamped with the week, with grade, class and element', () => {
    expect(findReleases({ heroes: [hero('a'), hero('b', 'Bee')], artifacts: art('x') }, { heroes: [hero('a'), hero('b', 'Bee'), hero('c', 'Cee', { grade: 5, job: 'knight', element: 'ice' })], artifacts: art('x', 'y') }, '2026-10-29')).toEqual([
      { kind: 'hero', code: 'c', name: 'Cee', since: '2026-10-29', grade: 5, job: 'knight', element: 'ice' },
      { kind: 'artifact', code: 'y', name: 'Art y', since: '2026-10-29', grade: 5, job: 'mage' },
    ]);
  });
  it('is empty when nothing appeared', () => expect(findReleases({ heroes: [hero('a')], artifacts: {} }, { heroes: [hero('a')], artifacts: {} }, 'p')).toEqual([]));
});

describe('refreshFeed', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'e7-feed-'));
    const week = (p: string, heroes: string[], gear: string[]) => {
      mkdirSync(join(dir, p), { recursive: true });
      writeFileSync(join(dir, p, 'heroes.json'), JSON.stringify(heroes.map((c) => ({ code: c, name: c.toUpperCase() }))));
      writeFileSync(join(dir, p, 'gear.json'), JSON.stringify({ key: 'k', artifacts: Object.fromEntries(gear.map((c) => [c, { code: c, name: c }])) }));
    };
    week('2026-10-22', ['a'], ['x']);
    week('2026-10-29', ['a', 'b'], ['x', 'y']);
    writeFileSync(join(dir, 'index.json'), JSON.stringify({ periods: ['2026-10-29', '2026-10-22'] }));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));
  const read = () => JSON.parse(readFileSync(join(dir, 'feed.json'), 'utf8'));

  function fake(o: { fail?: string[]; failArticle?: boolean; updates?: boolean } = {}) {
    const calls: string[] = [];
    const articles: string[] = [];
    const client = {
      async get(path: string, params: Record<string, string>) {
        if (path === 'v3.0/article') {
          articles.push(params.article_id);
          if (o.failArticle) throw new Error('article down');
          return update;
        }
        const board = /BOARD\/(\d+)\//.exec(path)![1];
        calls.push(board);
        if ((o.fail ?? []).includes(board)) throw new Error('down');
        const posts = [post(Number(board) * 10, `news ${board}`, '2026-11-05T10:00:00Z')];
        if (board === '986' && o.updates) posts.push(post(1, '10/29 (Thu) Version 8.7 1st Update Content', '2026-10-28T09:00:00Z'), post(2, '10/8 (Thu) Update Content', '2026-10-07T09:00:00Z'), post(3, '9/24 (Thu) Update Content', '2026-09-23T09:00:00Z'));
        return envelope(posts);
      },
    };
    return { client: client as unknown as ReturnType<typeof createClient>, calls, articles };
  }

  it('writes the posts of the four boards and the releases of the latest week', async () => {
    const { client, calls } = fake();
    expect(await refreshFeed({ outDir: dir, client, now: () => '2026-11-06' })).toBe('written');
    expect(calls).toEqual(['985', '986', '987', '988']); // sequential, one call per board
    const feed = read();
    expect(feed.updated).toBe('2026-11-06');
    expect(feed.posts.map((p: { board: string }) => p.board)).toEqual(['notice', 'patch', 'dev', 'event']);
    expect(feed.releases).toEqual([
      { kind: 'hero', code: 'b', name: 'B', since: '2026-10-29' },
      { kind: 'artifact', code: 'y', name: 'y', since: '2026-10-29' },
    ]);
  });

  it('keeps the releases already recorded and adds the new ones on top, without duplicates', async () => {
    const old: Release = { kind: 'hero', code: 'old', name: 'Old', since: '2026-10-01' };
    const dup: Release = { kind: 'hero', code: 'b', name: 'B', since: '2026-10-29' };
    writeFileSync(join(dir, 'feed.json'), JSON.stringify({ updated: 'x', posts: [], releases: [dup, old] }));
    await refreshFeed({ outDir: dir, client: fake().client });
    expect(read().releases.map((r: Release) => r.code)).toEqual(['y', 'b', 'old']); // new ones on top, the recorded ones as they were
    expect(read().releases.filter((r: Release) => r.code === 'b')).toHaveLength(1);
  });

  it('keeps the previous posts of a board that fails to load', async () => {
    await refreshFeed({ outDir: dir, client: fake().client });
    const logs: string[] = [];
    await refreshFeed({ outDir: dir, client: fake({ fail: ['986'] }).client, log: (m) => logs.push(m) });
    expect(read().posts.map((p: { board: string }) => p.board)).toContain('patch');
    expect(logs.some((m) => /986/.test(m))).toBe(true);
  });

  it('fails without writing when no board loads and there is no previous feed', async () => {
    expect(await refreshFeed({ outDir: dir, client: fake({ fail: ['985', '986', '987', '988'] }).client })).toBe('failed');
    expect(existsSync(join(dir, 'feed.json'))).toBe(false);
  });

  it('still writes the releases with a single week of data (no previous week to compare)', async () => {
    writeFileSync(join(dir, 'index.json'), JSON.stringify({ periods: ['2026-10-29'] }));
    await refreshFeed({ outDir: dir, client: fake().client });
    expect(read().releases).toEqual([]);
  });

  describe('announcements', () => {
    const dirHero = (code: string, name: string) => {
      const p = join(dir, '2026-10-29', 'heroes.json');
      writeFileSync(p, JSON.stringify([...JSON.parse(readFileSync(p, 'utf8')), { code, name }]));
    };

    it('adds what the latest update posts announce, before the game data lists it, with the date and the post link', async () => {
      const { client, articles } = fake({ updates: true });
      await refreshFeed({ outDir: dir, client });
      expect(articles).toEqual(['1', '2']); // the two newest update posts only
      const r = read().releases as Release[];
      const boss = r.find((x) => x.name === "A Boss's Dignity")!;
      expect(boss).toEqual({ kind: 'artifact', name: "A Boss's Dignity", job: 'knight', announced: { date: '2026-10-28', url: 'https://page.onstove.com/epicseven/global/view/1' } });
      expect(r.find((x) => x.name === 'Bunny Girl Great Detective Moro')).toMatchObject({ kind: 'hero', announced: { date: '2026-10-28' } });
    });

    it('gives an announced release its code and week once the data lists it, without a second entry', async () => {
      dirHero('c7016', 'Bunny Girl Mafia Yufine');
      await refreshFeed({ outDir: dir, client: fake({ updates: true }).client });
      const yufine = (read().releases as Release[]).filter((x) => x.name === 'Bunny Girl Mafia Yufine');
      expect(yufine).toEqual([{ kind: 'hero', code: 'c7016', name: 'Bunny Girl Mafia Yufine', since: '2026-10-29', announced: { date: '2026-10-28', url: 'https://page.onstove.com/epicseven/global/view/1' } }]);
    });

    it('copies grade, class and element from the data when an announced hero is listed', async () => {
      const p = join(dir, '2026-10-29', 'heroes.json');
      writeFileSync(p, JSON.stringify([...JSON.parse(readFileSync(p, 'utf8')), { code: 'c7016', name: 'Bunny Girl Mafia Yufine', grade: 5, job: 'knight', element: 'ice' }]));
      await refreshFeed({ outDir: dir, client: fake({ updates: true }).client });
      expect((read().releases as Release[]).find((x) => x.name === 'Bunny Girl Mafia Yufine')).toMatchObject({ grade: 5, job: 'knight', element: 'ice' });
    });

    it('fills in the code of an entry recorded as announced only when a later run finds it in the data', async () => {
      await refreshFeed({ outDir: dir, client: fake({ updates: true }).client });
      expect((read().releases as Release[]).find((x) => x.name === 'Bunny Girl Mafia Yufine')).not.toHaveProperty('code');
      dirHero('c7016', 'Bunny Girl Mafia Yufine');
      await refreshFeed({ outDir: dir, client: fake({ updates: true }).client });
      const all = (read().releases as Release[]).filter((x) => x.name === 'Bunny Girl Mafia Yufine');
      expect(all).toHaveLength(1);
      expect(all[0]).toMatchObject({ code: 'c7016', since: '2026-10-29' });
    });

    it('takes the code of an old announced item from the data without claiming it appeared that week, and lists newest first', async () => {
      dirHero('c1191', 'Bunny Girl Mafia Yufine'); // present in both weeks below: not a diff result
      const p = join(dir, '2026-10-22', 'heroes.json');
      writeFileSync(p, JSON.stringify([...JSON.parse(readFileSync(p, 'utf8')), { code: 'c1191', name: 'Bunny Girl Mafia Yufine' }]));
      await refreshFeed({ outDir: dir, client: fake({ updates: true }).client });
      const r = read().releases as Release[];
      expect(r.find((x) => x.name === 'Bunny Girl Mafia Yufine')).toMatchObject({ code: 'c1191' });
      expect(r.find((x) => x.name === 'Bunny Girl Mafia Yufine')).not.toHaveProperty('since');
      const dates = r.map((x) => x.announced?.date ?? x.since!);
      expect(dates).toEqual([...dates].sort().reverse());
    });

    it('still writes the feed when an update post cannot be read', async () => {
      const logs: string[] = [];
      expect(await refreshFeed({ outDir: dir, client: fake({ updates: true, failArticle: true }).client, log: (m) => logs.push(m) })).toBe('written');
      expect(logs.some((m) => /update post/.test(m))).toBe(true);
      expect((read().releases as Release[]).map((r) => r.code)).toEqual(['b', 'y']);
    });
  });
});
