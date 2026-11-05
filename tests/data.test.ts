import { afterEach, describe, expect, it, vi } from 'vitest';
import { filterHeroes, loadIndex, normalize } from '../src/lib/data';
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
