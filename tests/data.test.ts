import { afterEach, describe, expect, it, vi } from 'vitest';
import { NotFoundError, filterHeroes, heroModeUsage, loadModes, sortHeroes, loadHero, loadHeroes, loadIndex, normalize } from '../src/lib/data';
import type { HeroSummary } from '../src/shared/types';

const h = (code: string, name: string, grade: number, job: string, element: string): HeroSummary => ({ code, name, grade, job, element });
const heroes = [
  h('c1', 'Abigaëlle', 5, 'warrior', 'fire'),
  h('c2', 'ae-KARINA', 5, 'knight', 'ice'),
  h('c3', 'Aki', 4, 'warrior', 'fire'),
];

describe('normalize', () => {
  it('lowercases and strips accents', () => expect(normalize('Abigaëlle')).toBe('abigaelle'));
});

describe('sortHeroes', () => {
  const hs: HeroSummary[] = [
    { code: 'b', name: 'Éric', grade: 5, job: 'mage', element: 'fire', topSet: 10, topArtifact: 90 },
    { code: 'a', name: 'Abel', grade: 5, job: 'mage', element: 'fire', topSet: 40 },
    { code: 'c', name: 'Zed', grade: 5, job: 'mage', element: 'fire', topSet: 40, topArtifact: 20 },
    { code: 'd', name: 'Bob', grade: 5, job: 'mage', element: 'fire' },
  ];
  const s = (k: Parameters<typeof sortHeroes>[1]) => sortHeroes(hs, k).map((h) => h.code);
  it('sorts by name, accents and case aside', () => expect(s('name')).toEqual(['a', 'd', 'b', 'c']));
  it('sorts by top set share, highest first, ties by name, missing last', () => expect(s('topSet')).toEqual(['a', 'c', 'b', 'd']));
  it('sorts by top artifact share, missing last', () => expect(s('topArtifact')).toEqual(['b', 'c', 'a', 'd']));
  it('does not mutate its input', () => { const copy = [...hs]; sortHeroes(hs, 'topSet'); expect(hs).toEqual(copy); });
});

describe('filterHeroes', () => {
  const f = (o: Partial<Parameters<typeof filterHeroes>[1]>) => filterHeroes(heroes, { text: '', ...o }).map((x) => x.code);
  it('ignores accents and case', () => expect(f({ text: 'ABIGAELLE' })).toEqual(['c1']));
  it('finds ae- heroes', () => expect(f({ text: 'ae-' })).toEqual(['c2']));
  it('returns all with empty filters', () => expect(f({})).toEqual(['c1', 'c2', 'c3']));
  it('combines job, element and grade with AND', () => {
    expect(f({ job: 'warrior' })).toEqual(['c1', 'c3']);
    expect(f({ job: 'warrior', grade: 4 })).toEqual(['c3']);
    expect(f({ job: 'knight', element: 'fire' })).toEqual([]);
    expect(f({ text: 'a', element: 'ice', grade: 5 })).toEqual(['c2']);
  });
});

describe('loadIndex', () => {
  afterEach(() => vi.unstubAllGlobals());
  const stub = (res: Response) => vi.stubGlobal('fetch', vi.fn().mockResolvedValue(res));
  const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });

  it('returns null on 404', async () => {
    stub(new Response('', { status: 404 }));
    expect(await loadIndex()).toBeNull();
  });
  it('throws on 500', async () => {
    stub(new Response('', { status: 500 }));
    await expect(loadIndex()).rejects.toThrow();
  });
  it('returns a valid index', async () => {
    stub(json({ periods: ['2026-11-02'] }));
    expect(await loadIndex()).toEqual({ periods: ['2026-11-02'] });
  });
  it('treats the vite dev HTML fallback (200 text/html) as missing', async () => {
    stub(new Response('<!doctype html>', { headers: { 'content-type': 'text/html' } }));
    expect(await loadIndex()).toBeNull();
  });
  it('throws on a JSON body of the wrong shape', async () => {
    stub(json({ nope: 1 }));
    await expect(loadIndex()).rejects.toThrow();
  });
});

describe('loadHeroes / loadHero', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
  const stub = (res: Response) => { const f = vi.fn().mockResolvedValue(res); vi.stubGlobal('fetch', f); return f; };

  it('treats a 404 as absent (NotFoundError)', async () => {
    stub(new Response('', { status: 404 }));
    await expect(loadHero('2026-10-22', 'c1')).rejects.toBeInstanceOf(NotFoundError);
  });
  it('treats the vite dev HTML fallback (200 text/html) as absent', async () => {
    stub(new Response('<!doctype html>', { headers: { 'content-type': 'text/html' } }));
    await expect(loadHeroes('2026-10-22')).rejects.toBeInstanceOf(NotFoundError);
  });
  it('keeps a generic error for other failures', async () => {
    stub(new Response('', { status: 500 }));
    const err = await loadHero('2026-10-22', 'c1').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(NotFoundError);
  });
  it('returns the parsed JSON', async () => {
    stub(new Response(JSON.stringify([{ code: 'c1' }]), { headers: { 'content-type': 'application/json' } }));
    expect(await loadHeroes('2026-10-22')).toEqual([{ code: 'c1' }]);
  });
  it('builds data URLs from the build base', async () => {
    vi.stubEnv('BASE_URL', '/e7/');
    const f = stub(new Response('{"periods":[]}', { headers: { 'content-type': 'application/json' } }));
    await loadIndex();
    expect(f).toHaveBeenLastCalledWith('/e7/data/index.json');
    f.mockResolvedValue(new Response('[]', { headers: { 'content-type': 'application/json' } }));
    await loadHeroes('2026-10-22');
    expect(f).toHaveBeenLastCalledWith('/e7/data/2026-10-22/heroes.json');
  });
});

describe('heroModeUsage', () => {
  const modes = { key: 'k', lists: [
    { id: 'a', mode: 'abyss' as const, title: 'Abyss, floor 120', heroes: [{ code: 'x', name: 'X', share: 70 }, { code: 'h', name: 'H', share: 20 }] },
    { id: 'b', mode: 'hunts' as const, title: 'Golem Hunt, Hell', heroes: [{ code: 'h', name: 'H', share: 45.5 }] },
    { id: 'c', mode: 'expedition' as const, title: 'Moroi Expedition, level 1', heroes: [{ code: 'x', name: 'X', share: 9 }] },
  ] };
  it('lists the modes a hero appears in, highest share first, with its rank in each', () => {
    expect(heroModeUsage(modes, 'h')).toEqual([
      { id: 'b', mode: 'hunts', title: 'Golem Hunt, Hell', share: 45.5, rank: 1 },
      { id: 'a', mode: 'abyss', title: 'Abyss, floor 120', share: 20, rank: 2 },
    ]);
  });
  it('is empty for a hero that no list mentions', () => expect(heroModeUsage(modes, 'zzz')).toEqual([]));
});

describe('loadModes', () => {
  afterEach(() => vi.unstubAllGlobals());
  const stub = (res: Response) => vi.stubGlobal('fetch', vi.fn().mockResolvedValue(res));
  const json = (body: unknown, init: ResponseInit = {}) =>
    new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' }, ...init });
  it('returns the modes of a period', async () => {
    stub(json({ key: 'k', lists: [] }));
    expect(await loadModes('2026-10-22')).toEqual({ key: 'k', lists: [] });
    expect(vi.mocked(fetch).mock.calls[0][0]).toContain('data/2026-10-22/modes.json');
  });
  it('returns null when the period has no modes file (404, or the dev server HTML fallback)', async () => {
    stub(new Response('', { status: 404 }));
    expect(await loadModes('2026-10-22')).toBeNull();
    stub(new Response('<!doctype html>', { headers: { 'content-type': 'text/html' } }));
    expect(await loadModes('2026-10-22')).toBeNull();
  });
  it('throws on a server error', async () => {
    stub(new Response('', { status: 500 }));
    await expect(loadModes('2026-10-22')).rejects.toThrow(/500/);
  });
});
