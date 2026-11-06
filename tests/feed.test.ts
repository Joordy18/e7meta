import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findReleases, listPosts, refreshFeed } from '../scripts/collect/feed';
import type { createClient } from '../scripts/collect/api';
import type { Release } from '../src/shared/types';

const post = (id: number, title: string, iso: string, thumb?: string) => ({ article_id: String(id), title, create_datetime: Date.parse(iso), ...(thumb ? { media_thumbnail_url: thumb } : {}) });
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

describe('findReleases', () => {
  const hero = (code: string, name = code) => ({ code, name });
  const art = (...codes: string[]) => Object.fromEntries(codes.map((c) => [c, { code: c, name: `Art ${c}` }]));
  it('lists the heroes and artifacts that the latest week has and the previous one has not, stamped with the week', () => {
    expect(findReleases({ heroes: [hero('a'), hero('b', 'Bee')], artifacts: art('x') }, { heroes: [hero('a'), hero('b', 'Bee'), hero('c', 'Cee')], artifacts: art('x', 'y') }, '2026-10-29')).toEqual([
      { kind: 'hero', code: 'c', name: 'Cee', since: '2026-10-29' },
      { kind: 'artifact', code: 'y', name: 'Art y', since: '2026-10-29' },
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

  function fake(fail: string[] = []) {
    const calls: string[] = [];
    const client = {
      async get(path: string) {
        const board = /BOARD\/(\d+)\//.exec(path)![1];
        calls.push(board);
        if (fail.includes(board)) throw new Error('down');
        return envelope([post(Number(board) * 10, `news ${board}`, '2026-11-05T10:00:00Z')]);
      },
    };
    return { client: client as unknown as ReturnType<typeof createClient>, calls };
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
    await refreshFeed({ outDir: dir, client: fake(['986']).client, log: (m) => logs.push(m) });
    expect(read().posts.map((p: { board: string }) => p.board)).toContain('patch');
    expect(logs.some((m) => /986/.test(m))).toBe(true);
  });

  it('fails without writing when no board loads and there is no previous feed', async () => {
    expect(await refreshFeed({ outDir: dir, client: fake(['985', '986', '987', '988']).client })).toBe('failed');
    expect(existsSync(join(dir, 'feed.json'))).toBe(false);
  });

  it('still writes the releases with a single week of data (no previous week to compare)', async () => {
    writeFileSync(join(dir, 'index.json'), JSON.stringify({ periods: ['2026-10-29'] }));
    await refreshFeed({ outDir: dir, client: fake().client });
    expect(read().releases).toEqual([]);
  });
});
