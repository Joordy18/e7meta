import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildStats, writeBuilds } from '../scripts/collect/rtaBuilds';
import type { Battle } from '../scripts/collect/rtaStore';

type H = { code: string; artifact?: string; sets?: string[] };
const hero = (h: H) => ({ code: h.code, first: false, ban: false, ...(h.artifact ? { artifact: h.artifact } : {}), ...(h.sets ? { sets: h.sets } : {}) });
const battle = (seq: number, mine: H[], theirs: H[] = []): Battle => ({
  seq: String(seq), season: 's', date: '2026-11-01 10:00:00',
  decks: [{ heroes: mine.map(hero), prebans: [], won: true }, { heroes: theirs.map(hero), prebans: [], won: false }],
});
const SPEED4_IMMUNE2 = ['set_speed', 'set_speed', 'set_immune']; // the game lists a set once per two pieces

describe('buildStats', () => {
  it('counts the set combinations of a hero, written as the sets by number of pieces, most pieces first', () => {
    const battles = [
      battle(1, [{ code: 'a', sets: SPEED4_IMMUNE2 }]),
      battle(2, [{ code: 'a', sets: ['set_immune', 'set_speed', 'set_speed'] }]), // same build, listed in another order
      battle(3, [{ code: 'a', sets: ['set_immune', 'set_immune', 'set_speed'] }]), // immune 4 + speed 2: not the same build
      battle(4, [{ code: 'a', sets: ['set_cri', 'set_speed', 'set_immune'] }]), // three sets of two pieces
    ];
    const a = buildStats(battles, 1).a;
    expect(a.sets.n).toBe(4);
    expect(a.sets.combos).toEqual([
      { sets: ['set_speed', 'set_immune'], n: 2 },
      { sets: ['set_cri', 'set_immune', 'set_speed'], n: 1 }, // equal counts: the order of the codes decides
      { sets: ['set_immune', 'set_speed'], n: 1 },
    ]);
  });

  it('counts the artifacts of a hero, best first', () => {
    const battles = [1, 2, 3].map((i) => battle(i, [{ code: 'a', artifact: i === 3 ? 'efk2' : 'efk1', sets: SPEED4_IMMUNE2 }]));
    expect(buildStats(battles, 1).a.artifacts).toEqual({ n: 3, top: [{ code: 'efk1', n: 2 }, { code: 'efk2', n: 1 }] });
  });

  it('counts the heroes of both sides, and ignores a hero whose record has no build', () => {
    const battles = [battle(1, [{ code: 'a', sets: SPEED4_IMMUNE2, artifact: 'efk1' }, { code: 'plain' }], [{ code: 'a', sets: SPEED4_IMMUNE2, artifact: 'efk1' }])];
    const out = buildStats(battles, 1);
    expect(out.a.sets.n).toBe(2);
    expect(out.plain).toBeUndefined();
  });

  it('keeps the five most worn of each, and leaves out a hero seen with a build too few times', () => {
    const many = Array.from({ length: 8 }, (_, i) => battle(i, [{ code: 'a', artifact: `art${i}`, sets: [`set${i}`] }]));
    const a = buildStats(many, 1).a;
    expect(a.sets.combos).toHaveLength(5);
    expect(a.artifacts.top).toHaveLength(5);
    expect(a.sets.n).toBe(8); // the total counts them all, the list is cut
    expect(buildStats(many.slice(0, 3), 4).a).toBeUndefined();
  });

  it('breaks a tie by code, so two runs give the same file', () => {
    const battles = [battle(1, [{ code: 'a', artifact: 'efk9', sets: ['set_b'] }]), battle(2, [{ code: 'a', artifact: 'efk1', sets: ['set_a'] }])];
    const a = buildStats(battles, 1).a;
    expect(a.artifacts.top.map((x) => x.code)).toEqual(['efk1', 'efk9']);
    expect(a.sets.combos.map((x) => x.sets[0])).toEqual(['set_a', 'set_b']);
  });
});

describe('writeBuilds', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'e7-builds-'));
    mkdirSync(join(dir, '2026-10-29', 'hero'), { recursive: true });
    writeFileSync(join(dir, 'index.json'), JSON.stringify({ periods: ['2026-10-29'] }));
    writeFileSync(join(dir, '2026-10-29', 'gear.json'), JSON.stringify({ key: 'k', artifacts: { efk1: { code: 'efk1', name: 'Sun Blade' }, other: { code: 'other', name: 'Unused' } } }));
    writeFileSync(join(dir, '2026-10-29', 'hero', 'a.json'), JSON.stringify({ sets: [{ code: 'set_speed', name: 'Speed Set', share: 1 }, { code: 'set_unused', name: 'Unused Set', share: 1 }] }));
    writeFileSync(join(dir, '2026-10-29', 'hero', 'b.json'), JSON.stringify({ sets: [{ code: 'set_immune', name: 'Immunity Set', share: 1 }] }));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('writes rta/builds.json with the English names of the sets and artifacts it mentions, and no more', async () => {
    const battles = [1, 2].map((i) => battle(i, [{ code: 'a', artifact: 'efk1', sets: SPEED4_IMMUNE2 }]));
    await writeBuilds({ outDir: dir, season: 'pvp_rta_ss21', battles, now: () => '2026-11-06', minBuilds: 1 });
    const out = JSON.parse(readFileSync(join(dir, 'rta', 'builds.json'), 'utf8'));
    expect(out).toMatchObject({ code: 'pvp_rta_ss21', updated: '2026-11-06' });
    expect(out.heroes.a.sets.combos[0]).toEqual({ sets: ['set_speed', 'set_immune'], n: 2 });
    expect(out.setNames).toEqual({ set_speed: 'Speed Set', set_immune: 'Immunity Set' });
    expect(out.artifactNames).toEqual({ efk1: 'Sun Blade' });
  });

  it('still writes the builds when the names of a code are not known (the code stands in for it)', async () => {
    await writeBuilds({ outDir: dir, season: 's', battles: [battle(1, [{ code: 'a', artifact: 'zzz', sets: ['set_new'] }])], now: () => 'd', minBuilds: 1 });
    const out = JSON.parse(readFileSync(join(dir, 'rta', 'builds.json'), 'utf8'));
    expect(out.heroes.a.artifacts.top[0].code).toBe('zzz');
    expect(out.artifactNames).toEqual({});
    expect(out.setNames).toEqual({});
  });
});
