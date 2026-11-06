import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildShifts, refreshTrends } from '../scripts/collect/trends';
import type { ArtifactEntry, HeroSnapshot, ShareEntry } from '../src/shared/types';

const art = (code: string, share: number): ArtifactEntry => ({ code, name: code.toUpperCase(), share, effect: '' });
const set = (code: string, share: number): ShareEntry => ({ code, name: code.toUpperCase(), share });
const hero = (code: string, name: string, sets: ShareEntry[], artifacts: ArtifactEntry[]): HeroSnapshot => ({
  hero: { code, name, grade: 5, job: 'mage', element: 'fire' }, period: { start: 'x', end: 'y' }, sets, artifacts,
});

describe('buildShifts', () => {
  const prev = [hero('a', 'Ann', [set('s1', 40)], [art('x', 50), art('y', 10), art('z', 0.5)])];
  const cur = [
    hero('a', 'Ann', [set('s1', 41)], [art('x', 30), art('y', 35), art('z', 2)]),
    hero('b', 'Bo', [set('s1', 90)], [art('x', 90)]), // new hero: nothing to compare with
  ];

  it('lists the biggest changes in share of a hero\'s sets and artifacts, in points, biggest first', () => {
    expect(buildShifts(prev, cur, 10)).toEqual([
      { hero: 'a', name: 'Ann', kind: 'artifact', code: 'y', item: 'Y', before: 10, after: 35 },
      { hero: 'a', name: 'Ann', kind: 'artifact', code: 'x', item: 'X', before: 50, after: 30 },
      { hero: 'a', name: 'Ann', kind: 'set', code: 's1', item: 'S1', before: 40, after: 41 },
    ]);
  });
  it('ignores noise: nothing under 5% in both weeks, and heroes that only exist in one week', () => {
    const all = buildShifts(prev, cur, 10);
    expect(all.some((s) => s.code === 'z')).toBe(false);
    expect(all.some((s) => s.hero === 'b')).toBe(false);
  });
  it('ignores items that did not move (less than half a point)', () => {
    const r = buildShifts([hero('a', 'A', [set('s', 40)], [])], [hero('a', 'A', [set('s', 40.3)], [])], 5);
    expect(r).toEqual([]);
  });
  it('treats an item that appeared or vanished as 0% in the other week', () => {
    const r = buildShifts([hero('a', 'Ann', [], [art('x', 60)])], [hero('a', 'Ann', [], [art('w', 25)])], 10);
    expect(r.map((s) => [s.code, s.before, s.after])).toEqual([['x', 60, 0], ['w', 0, 25]]);
  });
  it('ignores a hero that had no data in one of the weeks (a new release, not a shift)', () => {
    const none = hero('a', 'Ann', [], []);
    expect(buildShifts([none], [hero('a', 'Ann', [set('s', 50)], [art('x', 60)])], 10)).toEqual([]);
    expect(buildShifts([hero('a', 'Ann', [set('s', 50)], [art('x', 60)])], [none], 10)).toEqual([]);
  });
  it('cuts to n', () => expect(buildShifts(prev, cur, 1)).toHaveLength(1));
  it('rounds to two decimals', () => {
    const r = buildShifts([hero('a', 'A', [], [art('x', 10.123)])], [hero('a', 'A', [], [art('x', 20.456)])], 5);
    expect([r[0].before, r[0].after]).toEqual([10.12, 20.46]);
  });
});

describe('refreshTrends', () => {
  let dir: string;
  const write = (period: string, heroes: HeroSnapshot[]) => {
    mkdirSync(join(dir, period, 'hero'), { recursive: true });
    writeFileSync(join(dir, period, 'heroes.json'), JSON.stringify(heroes.map((h) => h.hero)));
    for (const h of heroes) writeFileSync(join(dir, period, 'hero', `${h.hero.code}.json`), JSON.stringify(h));
  };
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'e7-trends-'));
    write('2026-10-22', [hero('a', 'Ann', [set('s1', 40)], [art('x', 50)])]);
    write('2026-10-29', [hero('a', 'Ann', [set('s1', 40)], [art('x', 20)])]);
    writeFileSync(join(dir, 'index.json'), JSON.stringify({ periods: ['2026-10-29', '2026-10-22'] }));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));
  const read = () => JSON.parse(readFileSync(join(dir, 'trends.json'), 'utf8'));

  it('compares the latest week with the one before and writes trends.json', async () => {
    expect(await refreshTrends({ outDir: dir })).toBe('written');
    expect(read()).toEqual({
      from: '2026-10-22', to: '2026-10-29',
      builds: [{ hero: 'a', name: 'Ann', kind: 'artifact', code: 'x', item: 'X', before: 50, after: 20 }],
    });
  });
  it('does nothing when the file already compares these two weeks', async () => {
    await refreshTrends({ outDir: dir });
    expect(await refreshTrends({ outDir: dir })).toBe('skipped');
  });
  it('is recomputed when a newer week appears', async () => {
    await refreshTrends({ outDir: dir });
    write('2026-11-05', [hero('a', 'Ann', [set('s1', 40)], [art('x', 45)])]);
    writeFileSync(join(dir, 'index.json'), JSON.stringify({ periods: ['2026-11-05', '2026-10-29', '2026-10-22'] }));
    expect(await refreshTrends({ outDir: dir })).toBe('written');
    expect(read()).toMatchObject({ from: '2026-10-29', to: '2026-11-05' });
  });
  it('needs two weeks: with one there is nothing to compare', async () => {
    writeFileSync(join(dir, 'index.json'), JSON.stringify({ periods: ['2026-10-29'] }));
    expect(await refreshTrends({ outDir: dir })).toBe('skipped');
    expect(existsSync(join(dir, 'trends.json'))).toBe(false);
  });
  it('skips a hero whose file is missing in one of the weeks instead of failing', async () => {
    rmSync(join(dir, '2026-10-22', 'hero', 'a.json'));
    expect(await refreshTrends({ outDir: dir })).toBe('written');
    expect(read().builds).toEqual([]);
  });
});
