import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { collect } from '../scripts/collect/collect';
import type { createClient } from '../scripts/collect/api';

const fx = (n: string) => JSON.parse(readFileSync(`tests/fixtures/${n}.json`, 'utf8'));
const heroListFx = fx('hero-list');
const ok = (value: unknown) => ({ code: 0, message: 'OK', value });

type Opts = { total?: number; wearingStart?: string; failHeroes?: string[]; failDetail?: boolean; emptyDetail?: boolean };

/** Fake client serving the fixtures by path; hero-list is served 50 per page like the real API. */
function fake(o: Opts = {}) {
  const all = heroListFx.value.guide_list.slice(0, o.total ?? 2);
  const calls: { path: string; params: Record<string, string> }[] = [];
  const client = {
    async get(path: string, params: Record<string, string>) {
      calls.push({ path, params });
      if (path === 'wearing-status/last-update-time') {
        const v = fx('last-update-time').value;
        return ok({ ...v, ...(o.wearingStart ? { week_start_date: o.wearingStart } : {}) });
      }
      if (path === 'hunt/last-update-time') return fx('hunt-last-update-time');
      if (path === 'wearing-status/hero-list') {
        const n = Number(params.current_page);
        return ok({ ...heroListFx.value, current_page: n, guide_list: all.slice(50 * (n - 1), 50 * n) });
      }
      if (o.failHeroes?.includes(params.hero_code)) throw new Error('boom');
      if (path === 'wearing-status/hero-equip-ranking') return fx('hero-equip-ranking');
      if (path === 'wearing-status/hero-artifact-ranking') return fx('hero-artifact-ranking');
      if (path === 'hunt/hero-detail-for-game') {
        if (o.failDetail) throw new Error('detail down');
        return o.emptyDetail ? ok({ hero_code: params.hero_code }) : fx('hero-detail');
      }
      throw new Error(`unexpected path ${path}`);
    },
  };
  return { client: client as unknown as ReturnType<typeof createClient>, calls, heroes: all };
}

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'e7-collect-')); });
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const read = (...p: string[]) => JSON.parse(readFileSync(join(dir, ...p), 'utf8'));

describe('collect', () => {
  it('writes heroes, hero files and index', async () => {
    const { client, heroes } = fake();
    expect(await collect({ outDir: dir, client })).toBe('written');
    expect(read('index.json')).toEqual({ periods: ['2026-10-22'] });
    expect(read('2026-10-22', 'heroes.json')).toHaveLength(2);
    const snap = read('2026-10-22', 'hero', `${heroes[0].hero_code}.json`);
    expect(snap.hero.code).toBe(heroes[0].hero_code);
    expect(snap.period).toEqual({ start: '2026-10-22', end: '2026-10-28' });
    expect(snap.sets[0].name).toBe('Set Réaction');
    expect(snap.artifacts[0].code).toBe('efa29');
    expect(snap.detail.period.start).toBe('2026-10-29');
    expect(snap.detail.combos[0].sets).toEqual(['Set Immunité', 'Set Réaction']);
  });

  it('skips an existing period, rewrites with force', async () => {
    await collect({ outDir: dir, client: fake().client });
    const before = readFileSync(join(dir, '2026-10-22', 'heroes.json'), 'utf8');
    const { client, calls } = fake();
    expect(await collect({ outDir: dir, client })).toBe('skipped');
    expect(calls.map((c) => c.path)).not.toContain('wearing-status/hero-list');
    expect(readFileSync(join(dir, '2026-10-22', 'heroes.json'), 'utf8')).toBe(before);
    expect(await collect({ outDir: dir, client: fake().client, force: true })).toBe('written');
    expect(read('index.json')).toEqual({ periods: ['2026-10-22'] });
  });

  it('puts a new period first in the index', async () => {
    await collect({ outDir: dir, client: fake().client });
    expect(await collect({ outDir: dir, client: fake({ wearingStart: '2026-10-29' }).client })).toBe('written');
    expect(read('index.json')).toEqual({ periods: ['2026-10-29', '2026-10-22'] });
  });

  it('fails without publishing when more than 5% of heroes fail', async () => {
    const failHeroes = fake().heroes.map((h: { hero_code: string }) => h.hero_code);
    expect(await collect({ outDir: dir, client: fake({ failHeroes }).client })).toBe('failed');
    expect(existsSync(join(dir, '2026-10-22', 'heroes.json'))).toBe(false);
    expect(existsSync(join(dir, 'index.json'))).toBe(false);
  });

  it('keeps the previous index when a new period fails', async () => {
    await collect({ outDir: dir, client: fake().client });
    const failHeroes = fake().heroes.map((h: { hero_code: string }) => h.hero_code);
    const c = fake({ wearingStart: '2026-10-29', failHeroes }).client;
    expect(await collect({ outDir: dir, client: c })).toBe('failed');
    expect(read('index.json')).toEqual({ periods: ['2026-10-22'] });
    expect(existsSync(join(dir, '2026-10-29', 'heroes.json'))).toBe(false);
  });

  it('tolerates up to 5% hero failures and drops the failed hero', async () => {
    const f = fake({ total: 40 });
    const bad = f.heroes[3].hero_code;
    const { client } = fake({ total: 40, failHeroes: [bad] });
    expect(await collect({ outDir: dir, client })).toBe('written');
    expect(read('2026-10-22', 'heroes.json')).toHaveLength(39);
    expect(existsSync(join(dir, '2026-10-22', 'hero', `${bad}.json`))).toBe(false);
  });

  it('writes no detail when the detail response is empty or fails', async () => {
    await collect({ outDir: dir, client: fake({ emptyDetail: true }).client });
    const code = read('2026-10-22', 'heroes.json')[0].code;
    expect('detail' in read('2026-10-22', 'hero', `${code}.json`)).toBe(false);
    rmSync(join(dir, '2026-10-22'), { recursive: true });
    expect(await collect({ outDir: dir, client: fake({ failDetail: true }).client })).toBe('written');
    expect('detail' in read('2026-10-22', 'hero', `${code}.json`)).toBe(false);
  });

  it('pages the hero list until an empty page and logs progress', async () => {
    const { client, calls } = fake({ total: 392 });
    const logs: string[] = [];
    expect(await collect({ outDir: dir, client, log: (m) => logs.push(m) })).toBe('written');
    const pages = calls.filter((c) => c.path === 'wearing-status/hero-list').map((c) => c.params.current_page);
    expect(pages).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9']);
    expect(read('2026-10-22', 'heroes.json')).toHaveLength(392);
    expect(new Set(read('2026-10-22', 'heroes.json').map((h: { code: string }) => h.code)).size).toBe(392);
    expect(readdirSync(join(dir, '2026-10-22', 'hero'))).toHaveLength(392);
    expect(logs.filter((m) => /\d+\/392/.test(m))).toHaveLength(Math.floor(392 / 25));
  });
});
