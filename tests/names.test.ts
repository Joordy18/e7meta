import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { collectNames } from '../scripts/collect/names';
import type { createClient } from '../scripts/collect/api';

const fx = (n: string) => JSON.parse(readFileSync(`tests/fixtures/${n}.json`, 'utf8'));
const ok = (value: unknown) => ({ code: 0, message: 'OK', value });
const heroList = fx('hero-list');
const artifactList = fx('gear-artifact-list');
const equip = fx('hero-equip-ranking');

describe('collectNames', () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'e7-names-')); });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));
  const read = (lang = 'fr') => JSON.parse(readFileSync(join(dir, 'names', `${lang}.json`), 'utf8'));

  function fake(o: { failArtifacts?: boolean; failSets?: boolean; failHeroes?: boolean } = {}) {
    const calls: { path: string; params: Record<string, string> }[] = [];
    const client = {
      async get(path: string, params: Record<string, string>) {
        calls.push({ path, params });
        if (path.endsWith('hero-list')) {
          if (o.failHeroes) throw new Error('heroes down');
          return Number(params.current_page) === 1 ? heroList : ok({ guide_list: [] });
        }
        if (path.endsWith('artifact-list')) {
          if (o.failArtifacts) throw new Error('artifacts down');
          return Number(params.current_page) === 1 ? artifactList : ok({ guide_list: [] });
        }
        if (path.endsWith('hero-equip-ranking')) {
          if (o.failSets) throw new Error('sets down');
          return equip;
        }
        throw new Error(`unexpected ${path}`);
      },
    };
    return { client: client as unknown as ReturnType<typeof createClient>, calls };
  }

  it('writes the names of heroes, artifacts and sets of a language, by code', async () => {
    const { client } = fake();
    expect(await collectNames({ outDir: dir, client, langs: ['fr'], now: () => '2026-11-06' })).toBe('written');
    const n = read();
    expect(n.lang).toBe('fr');
    expect(n.updated).toBe('2026-11-06');
    expect(Object.keys(n.heroes)).toHaveLength(392);
    expect(n.heroes.c1144).toBeTruthy();
    expect(Object.keys(n.artifacts)).toEqual(['efk21', 'efw21', 'efk23']);
    expect(Object.keys(n.sets)).toHaveLength(24);
    expect(n.sets.set_speed).toBeTruthy();
  });

  it('asks the API for that language, the whole artifact catalog (is_paging Y) and one hero for the set names', async () => {
    const { client, calls } = fake();
    await collectNames({ outDir: dir, client, langs: ['fr'] });
    expect(calls.every((c) => c.params.lang_code === 'fr')).toBe(true);
    expect(calls.filter((c) => c.path.endsWith('artifact-list')).every((c) => c.params.is_paging === 'Y')).toBe(true);
    const sets = calls.filter((c) => c.path.endsWith('hero-equip-ranking'));
    expect(sets).toHaveLength(1);
    expect(sets[0].params.hero_code).toBe(heroList.value.guide_list[0].hero_code);
  });

  it('does one language after the other, each in its own file', async () => {
    const { client, calls } = fake();
    expect(await collectNames({ outDir: dir, client, langs: ['fr', 'de'] })).toBe('written');
    expect(existsSync(join(dir, 'names', 'fr.json'))).toBe(true);
    expect(existsSync(join(dir, 'names', 'de.json'))).toBe(true);
    expect(calls.find((c) => c.params.lang_code === 'de')).toBeTruthy();
  });

  it('writes nothing for a language when any of its three lists fails, and keeps the file it had', async () => {
    mkdirSync(join(dir, 'names'));
    writeFileSync(join(dir, 'names', 'fr.json'), JSON.stringify({ lang: 'fr', updated: 'old', heroes: { x: 'Old' }, artifacts: {}, sets: {} }));
    for (const o of [{ failHeroes: true }, { failArtifacts: true }, { failSets: true }]) {
      const logs: string[] = [];
      expect(await collectNames({ outDir: dir, client: fake(o).client, langs: ['fr'], log: (m) => logs.push(m) })).toBe('failed');
      expect(read().updated).toBe('old');
      expect(logs.some((m) => /fr/.test(m))).toBe(true);
    }
  });

  it('still writes the languages that worked when another one fails', async () => {
    let call = 0;
    const { client } = fake();
    const flaky = { async get(path: string, params: Record<string, string>) { if (params.lang_code === 'de') throw new Error('no de'); call++; return (client as unknown as { get: (p: string, q: Record<string, string>) => Promise<unknown> }).get(path, params); } };
    expect(await collectNames({ outDir: dir, client: flaky as unknown as ReturnType<typeof createClient>, langs: ['de', 'fr'] })).toBe('failed');
    expect(existsSync(join(dir, 'names', 'fr.json'))).toBe(true);
    expect(existsSync(join(dir, 'names', 'de.json'))).toBe(false);
    expect(call).toBeGreaterThan(0);
  });
});
