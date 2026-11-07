import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildPairs, buildTable, writePairs } from '../scripts/collect/rtaPairs';
import type { Battle } from '../scripts/collect/rtaStore';

type H = string | { code: string; ban: true };
const hero = (h: H) => (typeof h === 'string' ? { code: h, first: false, ban: false } : { code: h.code, first: false, ban: true });
let seq = 0;
const battle = (mine: H[], theirs: H[], won: boolean): Battle => ({
  seq: String(++seq), season: 's', date: '2026-11-01 10:00:00',
  decks: [{ heroes: mine.map(hero), prebans: [], won }, { heroes: theirs.map(hero), prebans: [], won: !won }],
});
const times = (n: number, f: () => Battle) => Array.from({ length: n }, f);

describe('buildPairs', () => {
  // a plays 80 times and wins half: 40 with b (won), 40 with c (lost); b and c win half of their games overall, so a+b beats what they predict
  const base = [
    ...times(40, () => battle(['a', 'b'], [], true)), ...times(40, () => battle(['a', 'c'], [], false)),
    ...times(40, () => battle(['b', 'x'], [], false)), ...times(40, () => battle(['c', 'y'], [], true)),
  ];

  it('lists a partner when the pair wins clearly more than its two heroes predict, judged against the heroes and not 50%', () => {
    const a = buildPairs(base).a;
    expect(a.with).toEqual([{ code: 'b', n: 40, win: 100, edge: 50 }]); // a 50%, b 50%: 50% expected, 100% seen
    expect(a.with.map((e) => e.code)).not.toContain('c'); // 0% seen is below the expectation: not a partner
  });

  it('does not credit a strong hero to every partner: a pair that wins as much as the two predict is not listed', () => {
    // s wins 90% of its games whoever it plays with: no partner stands out
    const strong = [
      ...times(45, () => battle(['s', 'p'], [], true)), ...times(5, () => battle(['s', 'p'], [], false)),
      ...times(45, () => battle(['s', 'q'], [], true)), ...times(5, () => battle(['s', 'q'], [], false)),
      ...times(50, () => battle(['p', 'z'], [], true)), ...times(50, () => battle(['p', 'z'], [], false)),
      ...times(50, () => battle(['q', 'z'], [], true)), ...times(50, () => battle(['q', 'z'], [], false)),
    ];
    expect(buildPairs(strong).s?.with ?? []).toEqual([]);
  });

  it('lists the heroes it beats and the heroes that beat it, against the expectation of both', () => {
    const duels = [
      ...times(40, () => battle(['a'], ['e'], true)), ...times(40, () => battle(['a'], ['f'], false)),
      ...times(40, () => battle(['e', 'g'], [], true)), ...times(40, () => battle(['f', 'h'], [], false)),
    ];
    const a = buildPairs(duels).a;
    expect(a.over.map((e) => e.code)).toEqual(['e']);
    expect(a.under.map((e) => e.code)).toEqual(['f']);
  });

  it('never lists a pair seen fewer times than the minimum', () => {
    const few = [
      ...times(29, () => battle(['a', 'b'], [], true)), ...times(29, () => battle(['a', 'c'], [], false)),
      ...times(40, () => battle(['b', 'x'], [], false)), ...times(40, () => battle(['c', 'y'], [], true)),
    ];
    expect(buildPairs(few).a?.with ?? []).toEqual([]);
    expect(buildPairs(few, 29).a.with.map((e) => e.code)).toEqual(['b']);
  });

  it('leaves out a hero that was banned after the draft: it did not play', () => {
    const banned = base.map((b) => ({ ...b, decks: [{ ...b.decks[0], heroes: b.decks[0].heroes.map((h) => (h.code === 'b' ? { ...h, ban: true } : h)) }, b.decks[1]] as Battle['decks'] }));
    expect(buildPairs(banned).a?.with ?? []).toEqual([]);
  });

  it('keeps at most five heroes in each list', () => {
    const partners = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7'];
    const battles = [
      ...partners.flatMap((p) => [...times(40, () => battle(['a', p], [], true)), ...times(40, () => battle([p, 'o'], [], false))]),
      ...times(280, () => battle(['a', 'q'], [], false)), ...times(280, () => battle(['q', 'o'], [], true)),
    ];
    expect(buildPairs(battles).a.with).toHaveLength(5);
  });
});

describe('buildTable', () => {
  it('lists every partner and opponent seen often enough, partners best first and opponents hardest first, starring only the gaps past chance', () => {
    const battles = [
      ...times(40, () => battle(['a', 'b'], ['x'], true)), ...times(40, () => battle(['a', 'c'], ['y'], false)),
      ...times(40, () => battle(['b', 'x'], [], false)), ...times(40, () => battle(['c', 'y'], [], true)),
      ...times(29, () => battle(['a', 'd'], [], true)), // seen too few times
    ];
    const a = buildTable(battles).a;
    expect(a.with.map((r) => r[0])).toEqual(['b', 'c']); // 100% then 0%; d is under the minimum
    expect(a.with[0].slice(0, 3)).toEqual(['b', 40, 100]);
    expect(a.with[0][3]).toBeGreaterThan(0); // above what a and b predict
    expect(a.with[0][4]).toBe(1);
    expect(a.versus.map((r) => r[0])).toEqual(['y', 'x']); // lost against y, won against x
    expect(buildTable(battles, 29).a.with.map((r) => r[0])).toContain('d');
  });
});

describe('writePairs', () => {
  it('writes rta/pairs.json with the season, the number of battles and the minimum', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pairs-'));
    try {
      await writePairs({ outDir: dir, season: 'pvp_rta_ss21', battles: [battle(['a'], ['b'], true)], now: () => '2026-11-06T00:00:00Z' });
      const out = JSON.parse(readFileSync(join(dir, 'rta', 'pairs.json'), 'utf8'));
      expect(out).toMatchObject({ code: 'pvp_rta_ss21', updated: '2026-11-06T00:00:00Z', battles: 1, minGames: 30, heroes: {} });
      expect(JSON.parse(readFileSync(join(dir, 'rta', 'table.json'), 'utf8'))).toMatchObject({ battles: 1, minGames: 30, heroes: {} });
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
