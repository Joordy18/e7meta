import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { collectRta, listPlayers, parseBattle, tally, type Battle } from '../scripts/collect/rta';
import type { createClient } from '../scripts/collect/api';

const fx = (n: string) => JSON.parse(readFileSync(`tests/fixtures/${n}.json`, 'utf8'));
const battles = fx('rta-battles').value.result_body.battle_list;

describe('parseBattle', () => {
  it('reads both drafts of a battle with who won (iswin 1 = win, 2 = loss)', () => {
    const b = parseBattle(battles[0])!; // a loss
    expect(b.seq).toBe('91204480');
    expect(b.season).toBe('pvp_rta_ss21');
    expect(b.decks).toHaveLength(2);
    expect(b.decks[0].won).toBe(false);
    expect(b.decks[1].won).toBe(true);
    expect(b.decks[0].heroes).toHaveLength(5);
    expect(b.decks[0].heroes[0]).toEqual({ code: expect.stringMatching(/^c\d+/), first: expect.any(Boolean), ban: expect.any(Boolean) });
    expect(b.decks[0].prebans).toHaveLength(2);
    expect(parseBattle(battles[1])!.decks[0].won).toBe(true);
  });
  it('marks exactly one first pick per battle', () => {
    for (const raw of battles) expect(parseBattle(raw)!.decks.flatMap((d) => d.heroes).filter((h) => h.first)).toHaveLength(1);
  });
  it('is null for a battle without drafts or without an id', () => {
    expect(parseBattle({ battle_seq: '1', iswin: 1, season_code: 's', my_deck: { hero_list: [] }, enemy_deck: { hero_list: [] } })).toBeNull();
    expect(parseBattle({ iswin: 1, season_code: 's', my_deck: battles[0].my_deck, enemy_deck: battles[0].enemy_deck })).toBeNull();
    expect(parseBattle({})).toBeNull();
  });
});

const h = (code: string, o: { first?: boolean; ban?: boolean } = {}) => ({ code, first: !!o.first, ban: !!o.ban });
const battle = (seq: string, a: { heroes: ReturnType<typeof h>[]; prebans: string[]; won: boolean }, b: { heroes: ReturnType<typeof h>[]; prebans: string[] }): Battle =>
  ({ seq, season: 's', date: '', decks: [a, { ...b, won: !a.won }] });

describe('tally', () => {
  const sample = [
    battle('1', { heroes: [h('a', { first: true }), h('b', { ban: true })], prebans: ['x'], won: true }, { heroes: [h('b'), h('c')], prebans: ['x', 'y'] }),
    battle('2', { heroes: [h('a')], prebans: [], won: false }, { heroes: [h('c', { first: true })], prebans: [] }),
  ];
  const t = tally(sample);
  it('counts picks of both sides, plays (not banned), wins and first picks', () => {
    expect(t.a).toMatchObject({ pick: 2, played: 2, win: 1, first: 1 }); // won battle 1, lost battle 2
    expect(t.b).toMatchObject({ pick: 2, played: 1, win: 0, ban: 1 }); // banned on one side in battle 1, played (and lost) on the other side
    expect(t.c).toMatchObject({ pick: 2, played: 2, win: 1, first: 1 });
  });
  it('counts a pre-ban once per battle even when both sides pre-banned the hero', () => {
    expect(t.x.preban).toBe(1);
    expect(t.y.preban).toBe(1);
  });
  it('counts a hero that was only pre-banned (never drafted)', () => {
    expect(t.x).toMatchObject({ pick: 0, played: 0, win: 0, preban: 1 });
  });
});

describe('listPlayers', () => {
  it('reads the ids of the ranked players, without keeping names', () => {
    const p = listPlayers(fx('rta-ranking'));
    expect(p).toHaveLength(2);
    expect(p[0]).toEqual({ nick: expect.any(Number), world: expect.stringMatching(/^world_/), tier: expect.any(String) });
  });
});

describe('collectRta', () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'e7-rta-')); });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));
  const env = (value: unknown) => ({ code: 0, message: 'SUCCESS', value });
  const ranking = (n: number) => env({ result_body: Array.from({ length: n }, (_, i) => ({ nick_no: 100 + i, world_code: 'world_kor', nickname: `secret${i}` })) });

  function fake(o: { players?: number; failNick?: number[]; otherSeason?: boolean } = {}) {
    const calls: string[] = [];
    const client = {
      async get(path: string, params: Record<string, string>) {
        calls.push(path.split('/').pop()! + (params.nick_no ? `:${params.nick_no}:${params.current_page}` : params.current_page ? `:${params.current_page}` : ''));
        if (path.endsWith('getSeasonList')) return env({ result_body: [{ season_code: 'pvp_rta_ss20', name: 'Summer 2026', is_now_season: 0 }, { season_code: 'pvp_rta_ss21', name: 'Fall 2026', is_now_season: 1 }] });
        if (path.endsWith('getWorldUserRankingDetail')) return Number(params.current_page) === 1 ? ranking(o.players ?? 2) : env({ result_body: [] });
        if (o.failNick?.includes(Number(params.nick_no))) throw new Error('down');
        if (Number(params.current_page) > 1) return env({ result_body: { total_count: 4, battle_list: [] } });
        const list = o.otherSeason ? battles.map((b: object) => ({ ...b, season_code: 'pvp_rta_ss20' })) : battles;
        return env({ result_body: { total_count: list.length, battle_list: list } });
      },
    };
    return { client: client as unknown as ReturnType<typeof createClient>, calls };
  }
  const read = () => JSON.parse(readFileSync(join(dir, 'rta', 'stats.json'), 'utf8'));

  it('counts the current season battles of the ranked players once each, and writes the counts without any name', async () => {
    const { client, calls } = fake({ players: 2 });
    expect(await collectRta({ outDir: dir, storeDir: join(dir, 'store'), client, now: () => '2026-11-06' })).toBe('written');
    const s = read();
    expect(s).toMatchObject({ season: 'Fall 2026', code: 'pvp_rta_ss21', updated: '2026-11-06', players: 2, battles: 4 }); // the same 4 battles seen by both players count once
    expect(Object.keys(s.heroes).length).toBeGreaterThan(5);
    expect(JSON.stringify(s)).not.toMatch(/secret|nick/);
    expect(calls[0]).toBe('getSeasonList');
  });

  it('ignores battles of another season', async () => {
    expect(await collectRta({ outDir: dir, storeDir: join(dir, 'store'), client: fake({ otherSeason: true }).client })).toBe('failed');
    expect(existsSync(join(dir, 'rta', 'stats.json'))).toBe(false);
  });

  it('tolerates a few failing players but not many, and then writes nothing', async () => {
    expect(await collectRta({ outDir: dir, storeDir: join(dir, 'store'), client: fake({ players: 5, failNick: [101] }).client })).toBe('written'); // 4 of 5
    rmSync(join(dir, 'rta'), { recursive: true });
    const logs: string[] = [];
    expect(await collectRta({ outDir: dir, storeDir: join(dir, 'store'), client: fake({ players: 5, failNick: [101, 102] }).client, log: (m) => logs.push(m) })).toBe('failed');
    expect(existsSync(join(dir, 'rta', 'stats.json'))).toBe(false);
    expect(logs.some((m) => /too many players failed/.test(m))).toBe(true);
  });

  it('stops asking for pages when a player has no more battles', async () => {
    const { client, calls } = fake({ players: 1 });
    await collectRta({ outDir: dir, storeDir: join(dir, 'store'), client });
    expect(calls.filter((c) => c.startsWith('getBattleList:100'))).toEqual(['getBattleList:100:1']); // total_count 4 fits one page
  });
});
