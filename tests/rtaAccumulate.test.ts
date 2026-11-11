import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { battleKey, collectRta, parseBattle } from '../scripts/collect/rta';
import { appendBattles, loadStore } from '../scripts/collect/rtaStore';
import type { createClient } from '../scripts/collect/api';

type Raw = Record<string, unknown>;
const teamInfo = (rows: { c: string; art?: string; sets?: string[] }[]) =>
  `"my_team":[${rows.map((r, i) => `{"pick_order" :${i + 1},"hero_code":"${r.c}","artifact":"${r.art ?? ''}","equip":${JSON.stringify(r.sets ?? [])},"level":60}`).join(',')}]`;

/** A raw battle as the record API gives it, seen from one player. */
function raw(seq: number, date: string, mine: string[], theirs: string[], o: { win?: boolean; season?: string; builds?: boolean } = {}): Raw {
  const deck = (heroes: string[], first: boolean) => ({
    hero_list: heroes.map((c, i) => ({ hero_code: c, first_pick: first && i === 0 ? 1 : 0, mvp: 0, ban: 0 })), preban_list: ['x1', 'x2'],
  });
  return {
    battle_seq: seq, iswin: o.win === false ? 2 : 1, season_code: o.season ?? 'pvp_rta_ss21', battleCompletedate: `${date}.0`, enemy_grade_code: 'emperor',
    my_deck: deck(mine, true), enemy_deck: deck(theirs, false),
    ...(o.builds ? {
      teamBettleInfo: teamInfo(mine.map((c) => ({ c, art: `art_${c}`, sets: ['set_speed', 'set_chase'] }))),
      teamBettleInfoenemy: teamInfo(theirs.map((c) => ({ c, art: '', sets: [] }))),
    } : {}),
  };
}
const A = ['a1', 'a2', 'a3', 'a4', 'a5'];
const B = ['b1', 'b2', 'b3', 'b4', 'b5'];

describe('parseBattle: what is kept for later', () => {
  it('reads the day and time of the battle and the league of each side', () => {
    const b = parseBattle(raw(1, '2026-11-04 09:51:25', A, B), 'legend')!;
    expect(b.date).toBe('2026-11-04 09:51:25');
    expect(b.decks.map((d) => d.tier)).toEqual(['legend', 'emperor']);
  });
  it('reads the artifact and the sets of each hero when the record has them, and nothing otherwise', () => {
    const b = parseBattle(raw(1, '2026-11-04 09:51:25', A, B, { builds: true }))!;
    expect(b.decks[0].heroes[0]).toEqual({ code: 'a1', first: true, ban: false, artifact: 'art_a1', sets: ['set_speed', 'set_chase'] });
    expect(b.decks[1].heroes[0]).toEqual({ code: 'b1', first: false, ban: false }); // an enemy hero without a build: no empty fields
    const plain = parseBattle(raw(2, '2026-11-04 09:51:25', A, B))!;
    expect(plain.decks[0].heroes[0]).toEqual({ code: 'a1', first: true, ban: false });
  });
  it('does not fail on a build text it cannot read', () => {
    const r = { ...raw(1, '2026-11-04 09:51:25', A, B), teamBettleInfo: '"my_team":[{broken', teamBettleInfoenemy: 42 };
    expect(parseBattle(r)!.decks[0].heroes[0]).toEqual({ code: 'a1', first: true, ban: false });
  });
});

describe('battleKey', () => {
  it('is the same for the two views of one battle, and different for another battle', () => {
    const mine = parseBattle(raw(1, '2026-11-04 09:51:25', A, B, { win: true }))!;
    const theirs = parseBattle(raw(2, '2026-11-04 09:51:25', B, A, { win: false }))!; // the opponent's record of the same battle
    expect(battleKey(mine)).toBe(battleKey(theirs));
    expect(battleKey(mine)).not.toBe(battleKey(parseBattle(raw(3, '2026-11-04 10:00:00', A, B))!));
  });
});

describe('the store of battles', () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'e7-store-')); });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('is empty at first, keeps what is appended, and gives it back next time', async () => {
    const store = await loadStore(dir, 'pvp_rta_ss21');
    expect(store.battles).toHaveLength(0);
    const b = parseBattle(raw(7, '2026-11-04 09:51:25', A, B, { builds: true }), 'legend')!;
    await appendBattles(store, [b]);
    const again = await loadStore(dir, 'pvp_rta_ss21');
    expect(again.battles).toEqual([{ ...b, seqs: ['7'] }]);
    expect(again.seqs.has('7')).toBe(true);
    expect(again.keys.has(battleKey(b))).toBe(true);
  });

  it('has one file per season', async () => {
    await appendBattles(await loadStore(dir, 'pvp_rta_ss21'), [parseBattle(raw(1, '2026-11-04 09:00:00', A, B))!]);
    await appendBattles(await loadStore(dir, 'pvp_rta_ss22'), [parseBattle(raw(2, '2026-12-04 09:00:00', A, B, { season: 'pvp_rta_ss22' }))!]);
    expect(readdirSync(dir).sort()).toEqual(['pvp_rta_ss21.jsonl', 'pvp_rta_ss22.jsonl']);
    expect((await loadStore(dir, 'pvp_rta_ss22')).battles).toHaveLength(1);
  });

  it('stops on a store it cannot read instead of taking it for an empty one', async () => {
    mkdirSync(join(dir, 'broken.jsonl')); // a directory where the file should be: reading it fails, and that is not "no battles yet"
    await expect(loadStore(dir, 'broken')).rejects.toThrow();
  });

  it('skips a damaged line instead of losing the rest', async () => {
    const store = await loadStore(dir, 's');
    await appendBattles(store, [parseBattle(raw(1, '2026-11-04 09:00:00', A, B))!]);
    const { appendFileSync } = await import('node:fs');
    appendFileSync(join(dir, 's.jsonl'), '{"seq": "9", "dec\n'); // a write cut short
    await appendBattles(await loadStore(dir, 's'), [parseBattle(raw(2, '2026-11-04 10:00:00', A, B))!]);
    expect((await loadStore(dir, 's')).battles.map((x) => x.seq)).toEqual(['1', '2']);
  });
});

describe('collectRta: accumulating', () => {
  let dir: string;
  let storeDir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'e7-acc-')); storeDir = join(dir, 'store'); });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));
  const env = (value: unknown) => ({ code: 0, message: 'SUCCESS', value });
  const stats = () => JSON.parse(readFileSync(join(dir, 'rta', 'stats.json'), 'utf8'));

  /** Players and their battle pages (newest first, 10 a page like the API); `pages[player]` is a list of pages of raw battles. */
  function fake(o: { pages: Record<number, Raw[][]>; season?: string; failAll?: boolean; rankings?: Record<string, number[]>; failRanking?: string[] }) {
    const calls: string[] = [];
    const rankingCalls: string[] = [];
    const client = {
      async get(path: string, params: Record<string, string>) {
        if (path.endsWith('getSeasonList')) return env({ result_body: [{ season_code: o.season ?? 'pvp_rta_ss21', name: 'Fall 2026', is_now_season: 1 }] });
        if (path.endsWith('getWorldUserRankingDetail')) {
          rankingCalls.push(`${params.world_code}:${params.current_page}`);
          if (o.failRanking?.includes(params.world_code)) throw new Error('ranking down');
          const nicks = o.rankings ? (o.rankings[params.world_code] ?? []) : Object.keys(o.pages).map(Number); // by default every leaderboard lists everybody
          return Number(params.current_page) === 1
            ? env({ result_body: nicks.map((n) => ({ nick_no: n, world_code: n > 200 ? 'world_eu' : 'world_kor', season_tiercode: 'legend', nickname: `secret${n}` })) })
            : env({ result_body: [] });
        }
        calls.push(`${params.nick_no}:${params.current_page}`);
        if (o.failAll) throw new Error('down');
        const pages = o.pages[Number(params.nick_no)];
        const page = Number(params.current_page);
        return env({ result_body: { total_count: 100, battle_list: pages[page - 1] ?? [] } }); // 100: the API keeps that many, so only an empty or a known page ends the walk
      },
    };
    return { client: client as unknown as ReturnType<typeof createClient>, calls, rankingCalls };
  }
  const run = (client: ReturnType<typeof createClient>, log?: (m: string) => void) => collectRta({ outDir: dir, storeDir, client, now: () => '2026-11-06', ...(log ? { log } : {}) });

  it('does not run twice on one store, and frees it afterwards', async () => {
    const one = raw(1, '2026-11-01 10:00:00', A, B);
    mkdirSync(storeDir, { recursive: true });
    writeFileSync(join(storeDir, '.lock'), '');
    const logs: string[] = [];
    expect(await run(fake({ pages: { 101: [[one]] } }).client, (m) => logs.push(m))).toBe('failed');
    expect(logs.some((m) => /another run is in progress/.test(m))).toBe(true);
    rmSync(join(storeDir, '.lock'));
    expect(await run(fake({ pages: { 101: [[one]] } }).client)).toBe('written');
    expect(existsSync(join(storeDir, '.lock'))).toBe(false);
  });

  it('does not publish statistics made from fewer battles than the ones already published', async () => {
    mkdirSync(join(dir, 'rta'), { recursive: true });
    writeFileSync(join(dir, 'rta', 'stats.json'), JSON.stringify({ code: 'pvp_rta_ss21', battles: 999 }));
    const logs: string[] = [];
    expect(await run(fake({ pages: { 101: [[raw(1, '2026-11-01 10:00:00', A, B)]] } }).client, (m) => logs.push(m))).toBe('failed');
    expect(logs.some((m) => /nothing written/.test(m))).toBe(true);
    expect(stats().battles).toBe(999); // untouched
  });

  it('gives up when players fail one after the other, instead of waiting for them all', async () => {
    const pages = Object.fromEntries(Array.from({ length: 40 }, (_, i) => [101 + i, [[]]]));
    const f = fake({ pages, failAll: true });
    const logs: string[] = [];
    expect(await run(f.client, (m) => logs.push(m))).toBe('failed');
    expect(f.calls).toHaveLength(25);
    expect(logs.some((m) => /25 players failed in a row/.test(m))).toBe(true);
  });

  it('keeps the battles of every run, and a later run asks only for what is new', async () => {
    const a1 = raw(1, '2026-11-01 10:00:00', A, B);
    const a2 = raw(2, '2026-11-01 09:00:00', A, B.map((c) => `${c}x`));
    const first = fake({ pages: { 101: [[a1, a2]] } });
    expect(await run(first.client)).toBe('written');
    expect(stats().battles).toBe(2);

    const b1 = raw(3, '2026-11-02 10:00:00', B, A);
    const b2 = raw(4, '2026-11-02 09:00:00', ['c1', 'c2', 'c3', 'c4', 'c5'], A);
    const old = raw(5, '2026-10-30 09:00:00', ['d1', 'd2', 'd3', 'd4', 'd5'], A); // older than anything stored: never asked for
    const second = fake({ pages: { 101: [[b1, b2], [a1, a2], [old]] } });
    const logs: string[] = [];
    expect(await run(second.client, (m) => logs.push(m))).toBe('written');
    expect(stats().battles).toBe(4); // a1 a2 b1 b2: the two runs together
    expect(second.calls).toEqual(['101:1', '101:2']); // page 2 held a known battle: nothing older is asked
    expect(logs.some((m) => /2 new/.test(m) && /4 in total/.test(m))).toBe(true);
  });

  it('keeps the battles read so far when a run is cut short (the scheduled task has a time limit)', async () => {
    const mine = raw(1, '2026-11-01 10:00:00', A, B);
    const foe = (n: number) => ({ ...raw(10 + n, `2026-11-01 0${n}:00:00`, B, ['f1', 'f2', 'f3', 'f4', 'f5']), matchPlayerNicknameno: 500 + n, enemy_world_code: 'world_kor' });
    const first = { ...mine, matchPlayerNicknameno: 501, enemy_world_code: 'world_kor' };
    const second = { ...raw(2, '2026-11-01 11:00:00', A, B.map((c) => `${c}y`)), matchPlayerNicknameno: 502, enemy_world_code: 'world_kor' };
    const f = fake({ pages: { 101: [[first, second]], 501: [[foe(1)]], 502: [[foe(2)]] }, rankings: { all: [101] } });
    const crash = (m: string) => { if (/opponent failed/.test(m)) throw new Error('killed'); };
    // the first opponent is read and kept; the second one fails and the log callback stands for the process being killed there
    const get = f.client.get.bind(f.client);
    (f.client as unknown as { get: unknown }).get = async (path: string, p: Record<string, string>) => { if (p.nick_no === '502') throw new Error('down'); return get(path, p); };
    await expect(run(f.client, crash)).rejects.toThrow('killed');
    const store = await loadStore(storeDir, 'pvp_rta_ss21');
    expect(store.battles.length).toBeGreaterThanOrEqual(3); // the ranked player's two battles and the first opponent's
    expect(existsSync(join(dir, 'rta', 'stats.json'))).toBe(false); // the statistics are written only by a run that ends
  });

  it('counts a battle once although each of its two players has a record of it, with its own id', async () => {
    const mine = raw(10, '2026-11-01 10:00:00', A, B, { win: true });
    const theirs = raw(20, '2026-11-01 10:00:00', B, A, { win: false });
    expect(await run(fake({ pages: { 101: [[mine]], 102: [[theirs]] } }).client)).toBe('written');
    expect(stats().battles).toBe(1);
    const store = await loadStore(storeDir, 'pvp_rta_ss21');
    expect(store.battles).toHaveLength(1);
    expect([...store.seqs].sort()).toEqual(['10', '20']); // both ids are remembered
    // next run: both players' pages start with a battle already known
    expect(await run(fake({ pages: { 101: [[mine]], 102: [[theirs]] } }).client)).toBe('written');
    expect(stats().battles).toBe(1);
  });

  it('reads the leaderboard of every server, since each one lists its top 100 only, and counts a player in two of them once', async () => {
    const f = fake({
      pages: { 101: [[raw(1, '2026-11-01 10:00:00', A, B)]], 201: [[raw(2, '2026-11-01 11:00:00', B, ['e1', 'e2', 'e3', 'e4', 'e5'])]] },
      rankings: { all: [101], world_global: [], world_kor: [101], world_eu: [201], world_asia: [] }, failRanking: ['world_jpn'],
    });
    const logs: string[] = [];
    expect(await run(f.client, (m) => logs.push(m))).toBe('written');
    expect(stats()).toMatchObject({ battles: 2, players: 2 });
    expect(new Set(f.rankingCalls.map((c) => c.split(':')[0]))).toEqual(new Set(['all', 'world_global', 'world_kor', 'world_asia', 'world_eu', 'world_jpn']));
    expect(f.calls.filter((c) => c.startsWith('101:'))).toEqual(['101:1', '101:2']); // listed twice, read once (the empty second page ends the walk)
    expect(logs.some((m) => /world_jpn/.test(m))).toBe(true); // a leaderboard that fails does not stop the others
  });

  it('fails when no leaderboard can be read', async () => {
    const f = fake({ pages: { 101: [[raw(1, '2026-11-01 10:00:00', A, B)]] }, failRanking: ['all', 'world_global', 'world_kor', 'world_asia', 'world_eu', 'world_jpn'] });
    expect(await run(f.client)).toBe('failed');
    expect(existsSync(join(dir, 'rta', 'stats.json'))).toBe(false);
  });

  it('writes the builds of the heroes next to the stats, from every battle kept', async () => {
    const many = Array.from({ length: 20 }, (_, i) => raw(i + 1, `2026-11-01 10:${String(i).padStart(2, '0')}:00`, A, B, { builds: true }));
    await run(fake({ pages: { 101: [many] } }).client);
    const builds = JSON.parse(readFileSync(join(dir, 'rta', 'builds.json'), 'utf8'));
    expect(builds.code).toBe('pvp_rta_ss21');
    expect(builds.heroes.a1.sets).toEqual({ n: 20, combos: [{ sets: ['set_chase', 'set_speed'], n: 20 }] }); // two sets of two pieces: by code
    expect(builds.heroes.a1.artifacts.top).toEqual([{ code: 'art_a1', n: 20 }]);
  });

  it('says when the battles were played', async () => {
    await run(fake({ pages: { 101: [[raw(1, '2026-11-03 10:00:00', A, B), raw(2, '2026-10-20 08:30:00', A, B.map((c) => `${c}y`))]] } }).client);
    expect(stats()).toMatchObject({ since: '2026-10-20', until: '2026-11-03' });
  });

  it('keeps each season in its own file and counts only the current one', async () => {
    await run(fake({ pages: { 101: [[raw(1, '2026-11-01 10:00:00', A, B)]] } }).client);
    await run(fake({ season: 'pvp_rta_ss22', pages: { 101: [[raw(2, '2027-01-02 10:00:00', A, B, { season: 'pvp_rta_ss22' })]] } }).client);
    expect(readdirSync(storeDir).sort()).toEqual(['pvp_rta_ss21.jsonl', 'pvp_rta_ss22.jsonl']);
    expect(stats().battles).toBe(1);
    expect(stats().code).toBe('pvp_rta_ss22');
  });

  it('writes no nickname into the store or the stats', async () => {
    await run(fake({ pages: { 101: [[raw(1, '2026-11-01 10:00:00', A, B, { builds: true })]] } }).client);
    for (const text of [readFileSync(join(storeDir, 'pvp_rta_ss21.jsonl'), 'utf8'), readFileSync(join(dir, 'rta', 'stats.json'), 'utf8')]) {
      expect(text).not.toMatch(/secret|nick/);
    }
  });

  it('leaves the store and the stats alone when the run fails', async () => {
    await run(fake({ pages: { 101: [[raw(1, '2026-11-01 10:00:00', A, B)]] } }).client);
    const before = readFileSync(join(storeDir, 'pvp_rta_ss21.jsonl'), 'utf8');
    expect(await run(fake({ pages: { 101: [[raw(2, '2026-11-02 10:00:00', B, A)]] }, failAll: true }).client)).toBe('failed');
    expect(readFileSync(join(storeDir, 'pvp_rta_ss21.jsonl'), 'utf8')).toBe(before);
    expect(stats().battles).toBe(1);
    expect(existsSync(join(storeDir, 'other.jsonl'))).toBe(false);
  });
});
