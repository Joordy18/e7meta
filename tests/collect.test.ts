import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { collect } from '../scripts/collect/collect';
import { createClient } from '../scripts/collect/api';

const fx = (n: string) => JSON.parse(readFileSync(`tests/fixtures/${n}.json`, 'utf8'));
const heroListFx = fx('hero-list');
const ok = (value: unknown) => ({ code: 0, message: 'OK', value });

type Opts = { total?: number; wearingStart?: string; failHeroes?: string[]; failDetail?: boolean; emptyDetail?: boolean;
  repeatPage?: boolean; endless?: boolean; failAll?: boolean; emptyEquipFor?: string[]; noModes?: boolean; noTeams?: boolean };

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
      if (/^(hunt\/hero-ranking|abyss\/hero-ranking|expedition\/ranking)\/all$|^abyss\/last-update-time$|^crack\/info$/.test(path)) {
        if (o.noModes) throw new Error('modes down');
        if (path === 'hunt/hero-ranking/all') return fx('mode-hunt');
        if (path === 'abyss/hero-ranking/all') return fx('mode-abyss');
        if (path === 'expedition/ranking/all') return fx('mode-expedition');
        if (path === 'crack/info') return fx('rift-info');
        return fx('hunt-last-update-time'); // abyss/last-update-time
      }
      if (/team-ranking$/.test(path)) {
        if (o.noTeams) throw new Error('teams down');
        return fx(path.startsWith('hunt') ? 'team-hunt' : path.startsWith('abyss') ? 'team-abyss' : 'team-expedition');
      }
      if (path === 'expedition/last-update-time') throw new Error('API respond 5xx status.'); // as the live API does
      if (path === 'wearing-status/hero-list') {
        const n = o.repeatPage ? 1 : Number(params.current_page);
        if (o.endless) {
          const list = Array.from({ length: 50 }, (_, i) => ({ ...all[0], hero_code: `x${n}_${i}` }));
          return ok({ ...heroListFx.value, current_page: n, guide_list: list });
        }
        return ok({ ...heroListFx.value, current_page: n, guide_list: all.slice(50 * (n - 1), 50 * n) });
      }
      if (o.failAll || o.failHeroes?.includes(params.hero_code)) throw new Error('boom');
      if (path === 'wearing-status/hero-equip-ranking') {
        const raw = fx('hero-equip-ranking');
        return o.emptyEquipFor?.includes(params.hero_code) ? ok({ ...raw.value, guide_list: [] }) : raw;
      }
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

const snapshotFiles = (d: string) =>
  Object.fromEntries(
    (readdirSync(d, { recursive: true, encoding: 'utf8' }) as string[])
      .filter((f) => /.json$/.test(f))
      .sort()
      .map((f) => [f, readFileSync(join(d, f), 'utf8')]),
  );
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

  it('puts the top set and artifact shares in heroes.json and in the hero file (used to sort the list)', async () => {
    const { client } = fake();
    await collect({ outDir: dir, client });
    const [first] = read('2026-10-22', 'heroes.json');
    expect(first.topSet).toBe(23.86);
    expect(first.topArtifact).toBe(77.81);
    expect(read('2026-10-22', 'hero', `${first.code}.json`).hero).toEqual(first);
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
  it('stops paging when a page adds no new hero', async () => {
    const { client, calls } = fake({ repeatPage: true });
    const logs: string[] = [];
    expect(await collect({ outDir: dir, client, log: (m) => logs.push(m) })).toBe('written');
    expect(calls.filter((c) => c.path === 'wearing-status/hero-list')).toHaveLength(2);
    expect(read('2026-10-22', 'heroes.json')).toHaveLength(2);
    expect(logs.some((m) => /no new hero/.test(m))).toBe(true);
  });

  it('caps paging at 20 pages', async () => {
    const { client, calls } = fake({ endless: true, failAll: true });
    const logs: string[] = [];
    await collect({ outDir: dir, client, log: (m) => logs.push(m) });
    expect(calls.filter((c) => c.path === 'wearing-status/hero-list')).toHaveLength(20);
    expect(logs.some((m) => /page cap 20/.test(m))).toBe(true);
  });

  it('leaves a published snapshot untouched when a forced run fails', async () => {
    await collect({ outDir: dir, client: fake({ total: 40 }).client });
    const before = { snap: snapshotFiles(join(dir, '2026-10-22')), index: snapshotFiles(dir) };
    const failHeroes = fake({ total: 40 }).heroes.slice(0, 5).map((h: { hero_code: string }) => h.hero_code);
    expect(await collect({ outDir: dir, client: fake({ total: 40, failHeroes, emptyDetail: true }).client, force: true })).toBe('failed');
    expect(snapshotFiles(join(dir, '2026-10-22'))).toEqual(before.snap);
    expect(snapshotFiles(dir)).toEqual(before.index);
  });

  it('warns, but still publishes, when most heroes have no detail', async () => {
    const logs: string[] = [];
    expect(await collect({ outDir: dir, client: fake({ emptyDetail: true }).client, log: (m) => logs.push(m) })).toBe('written');
    expect(logs).toContain('warning: 2/2 heroes without detail, the hunt schema may have changed');
    expect(logs.some((m) => /^no detail for /.test(m))).toBe(true);
    expect(logs.some((m) => /unexpected detail error/.test(m))).toBe(false);
  });

  it('does not warn when details are present, and labels a thrown detail error as unexpected', async () => {
    const logs: string[] = [];
    await collect({ outDir: dir, client: fake().client, log: (m) => logs.push(m) });
    expect(logs.some((m) => /warning/.test(m))).toBe(false);
    rmSync(join(dir, '2026-10-22'), { recursive: true });
    logs.length = 0;
    await collect({ outDir: dir, client: fake({ failDetail: true }).client, log: (m) => logs.push(m) });
    expect(logs.some((m) => /^unexpected detail error for .*detail down/.test(m))).toBe(true);
  });

  it('names combos from the first non-empty set-name map, not only the first hero', async () => {
    const { client, heroes } = fake({ emptyEquipFor: [fake().heroes[0].hero_code] });
    expect(await collect({ outDir: dir, client })).toBe('written');
    expect(read('2026-10-22', 'hero', `${heroes[0].hero_code}.json`).detail.combos[0].sets).toEqual(['set_immune', 'set_riposte']);
    expect(read('2026-10-22', 'hero', `${heroes[1].hero_code}.json`).detail.combos[0].sets).toEqual(['Set Immunité', 'Set Réaction']);
  });

  it('does not skip a period whose heroes.json exists but the index does not list it', async () => {
    await collect({ outDir: dir, client: fake().client });
    writeFileSync(join(dir, 'index.json'), JSON.stringify({ periods: [] }));
    const { client, calls } = fake();
    expect(await collect({ outDir: dir, client })).toBe('written');
    expect(calls.map((c) => c.path)).toContain('wearing-status/hero-list');
    expect(read('index.json')).toEqual({ periods: ['2026-10-22'] });
  });

  it('survives a corrupt index.json: warns and rebuilds it from the period folders on disk', async () => {
    mkdirSync(join(dir, '2026-10-15'));
    writeFileSync(join(dir, '2026-10-15', 'heroes.json'), '[]');
    mkdirSync(join(dir, '2026-10-08')); // no heroes.json: not a period
    mkdirSync(join(dir, 'notes'));
    writeFileSync(join(dir, 'index.json'), '{"periods": [');
    const logs: string[] = [];
    expect(await collect({ outDir: dir, client: fake().client, log: (m) => logs.push(m) })).toBe('written');
    expect(read('index.json')).toEqual({ periods: ['2026-10-22', '2026-10-15'] });
    expect(logs.some((m) => /index\.json is unreadable/.test(m))).toBe(true);
  });

  // Regression: the real client (stubbed fetch) feeding the real mappers. A fake client returning
  // envelopes hid a double unwrap that crashed the first live run.
  it('runs end to end with the real createClient over a stubbed fetch', async () => {
    const { client: routes } = fake();
    const langs = new Set<string | null>();
    const fetchFn = async (url: string | URL | Request) => {
      const u = new URL(String(url));
      if (!u.pathname.endsWith('last-update-time')) langs.add(u.searchParams.get('lang_code'));
      const path = u.pathname.replace('/pub-meta/v1.0/epic7/guide/', '');
      const body = await routes.get(path, Object.fromEntries(u.searchParams));
      return new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
    };
    const client = createClient({ fetchFn: fetchFn as unknown as typeof fetch, delayMs: 0 });
    expect(await collect({ outDir: dir, client })).toBe('written');
    const code = read('2026-10-22', 'heroes.json')[0].code;
    const snap = read('2026-10-22', 'hero', `${code}.json`);
    expect(snap.sets[0].share).toBe(23.86);
    expect(snap.detail.combos[0].share).toBe(39.2);
    expect(snap.detail.combos[0].codes).toEqual(['set_immune', 'set_riposte']);
    expect([...langs]).toEqual(['en']); // the product is in English: every localised endpoint is asked in English
  });

  describe('other game modes', () => {
    it('writes modes.json: hunts, abyss and expedition lists plus the Rift season', async () => {
      await collect({ outDir: dir, client: fake().client });
      const m = read('2026-10-22', 'modes.json');
      expect(m.key).toBe('2026-10-29');
      expect(m.lists).toHaveLength(15 + 12 + 15);
      expect(new Set(m.lists.map((l: { id: string }) => l.id)).size).toBe(42);
      expect(m.lists[0]).toMatchObject({ id: 'hunt-1-13', mode: 'hunts', title: 'Wyvern Hunt, Hell', period: { start: '2026-10-29', end: '2026-11-04' } });
      expect(m.lists[0].heroes[0]).toEqual({ code: 'c1145', name: 'Brieg', share: 46.11 });
      const abyss = m.lists.find((l: { id: string }) => l.id === 'abyss-120');
      expect(abyss.title).toBe('Abyss, floor 120');
      expect(abyss.heroes[0].name).toBe('Fenne');
      const exp = m.lists.find((l: { id: string }) => l.id === 'expedition-5-3');
      expect(exp).toMatchObject({ mode: 'expedition', title: 'Moroi Expedition, level 3' });
      expect(exp.period).toBeUndefined(); // the API gives none for expeditions
      expect(m.rift.title).toBe('Nightmare of the Oceans');
    });

    it('never blocks the snapshot when the modes endpoints fail', async () => {
      const logs: string[] = [];
      expect(await collect({ outDir: dir, client: fake({ noModes: true }).client, log: (x) => logs.push(x) })).toBe('written');
      expect(existsSync(join(dir, '2026-10-22', 'heroes.json'))).toBe(true);
      expect(existsSync(join(dir, '2026-10-22', 'modes.json'))).toBe(false);
      expect(logs.some((x) => /modes/.test(x))).toBe(true);
    });

    it('a skipped run still fetches modes when they are missing', async () => {
      await collect({ outDir: dir, client: fake({ noModes: true }).client });
      expect(await collect({ outDir: dir, client: fake().client })).toBe('skipped');
      expect(read('2026-10-22', 'modes.json').lists).toHaveLength(42);
    });

    it('a skipped run refreshes modes fetched for an older hunt period, and leaves current ones alone', async () => {
      await collect({ outDir: dir, client: fake().client });
      writeFileSync(join(dir, '2026-10-22', 'modes.json'), JSON.stringify({ key: '2026-10-22', lists: [] }));
      const { client, calls } = fake();
      expect(await collect({ outDir: dir, client })).toBe('skipped');
      expect(read('2026-10-22', 'modes.json').key).toBe('2026-10-29');
      const again = fake();
      await collect({ outDir: dir, client: again.client });
      expect(again.calls.some((c) => c.path.includes('ranking'))).toBe(false);
      expect(calls.some((c) => c.path === 'hunt/hero-ranking/all')).toBe(true);
    });
  });

  describe('team rankings', () => {
    const teamCalls = (calls: { path: string; params: Record<string, string> }[]) => calls.filter((c) => /team-ranking$/.test(c.path));

    it('writes teams.json: the best teams of each mode list for its top heroes', async () => {
      const { client, calls } = fake();
      await collect({ outDir: dir, client });
      const t = read('2026-10-22', 'teams.json');
      expect(t.key).toBe('2026-10-29');
      expect(Object.keys(t.lists)).toHaveLength(42);
      expect(t.lists['hunt-1-13']['c1145'][0]).toEqual({ share: 8.08, heroes: ['c1145', 'c1072', 'c1087', 'c3132'] });
      expect(t.lists['abyss-120']['c1170'][0].share).toBe(19.09);
      expect(t.lists['expedition-1-1']['c1145'][0].share).toBe(4.79);
      // each list fixture has 5 heroes: 42 lists x 5 heroes, one call each
      expect(teamCalls(calls)).toHaveLength(42 * 5);
      expect(teamCalls(calls)[0].params).toMatchObject({ hero_code: 'c1145', current_page: '1', is_paging: 'N', dungeon: '1', stage: '13', lang_code: 'en' });
    });

    it('keeps at most 5 teams per hero', async () => {
      await collect({ outDir: dir, client: fake().client });
      for (const byHero of Object.values(read('2026-10-22', 'teams.json').lists) as Record<string, unknown[]>[]) {
        for (const teams of Object.values(byHero)) expect(teams.length).toBeLessThanOrEqual(5);
      }
    });

    it('never blocks the snapshot or the modes when team rankings fail', async () => {
      const logs: string[] = [];
      expect(await collect({ outDir: dir, client: fake({ noTeams: true }).client, log: (x) => logs.push(x) })).toBe('written');
      expect(existsSync(join(dir, '2026-10-22', 'modes.json'))).toBe(true);
      expect(existsSync(join(dir, '2026-10-22', 'teams.json'))).toBe(false);
      expect(logs.some((x) => /teams/.test(x))).toBe(true);
    });

    it('a skipped run fetches teams when they are missing, and leaves current ones alone', async () => {
      await collect({ outDir: dir, client: fake({ noTeams: true }).client });
      const { client, calls } = fake();
      expect(await collect({ outDir: dir, client })).toBe('skipped');
      expect(read('2026-10-22', 'teams.json').key).toBe('2026-10-29');
      expect(calls.some((c) => c.path === 'hunt/hero-ranking/all')).toBe(false); // modes were current: reused, not refetched
      const again = fake();
      await collect({ outDir: dir, client: again.client });
      expect(teamCalls(again.calls)).toHaveLength(0);
    });

    it('modesOnly refreshes modes and teams without touching the heroes', async () => {
      await collect({ outDir: dir, client: fake().client });
      const heroesBefore = readFileSync(join(dir, '2026-10-22', 'heroes.json'), 'utf8');
      const { client, calls } = fake();
      expect(await collect({ outDir: dir, client, modesOnly: true })).toBe('written');
      expect(calls.some((c) => c.path === 'wearing-status/hero-list')).toBe(false);
      expect(calls.some((c) => c.path === 'hunt/hero-ranking/all')).toBe(true);
      expect(teamCalls(calls).length).toBeGreaterThan(0);
      expect(readFileSync(join(dir, '2026-10-22', 'heroes.json'), 'utf8')).toBe(heroesBefore);
    });

    it('modesOnly fails clearly when the period has no snapshot yet', async () => {
      const logs: string[] = [];
      expect(await collect({ outDir: dir, client: fake().client, modesOnly: true, log: (x) => logs.push(x) })).toBe('failed');
      expect(logs.some((x) => /no snapshot/.test(x))).toBe(true);
    });
  });

  it('gives each mode list a group and a variant (for links and visual pickers)', async () => {
    await collect({ outDir: dir, client: fake().client });
    const lists = read('2026-10-22', 'modes.json').lists;
    const pick = (id: string) => lists.find((l: { id: string }) => l.id === id);
    expect(pick('hunt-2-13')).toMatchObject({ group: 'Golem Hunt', variant: 'Hell', title: 'Golem Hunt, Hell' });
    expect(pick('abyss-120')).toMatchObject({ group: 'Abyss', variant: 'Floor 120', title: 'Abyss, floor 120' });
    expect(pick('expedition-5-3')).toMatchObject({ group: 'Moroi Expedition', variant: 'Level 3' });
  });
});
