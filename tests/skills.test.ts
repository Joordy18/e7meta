import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { collectSkills, parseSkills } from '../scripts/collect/skills';

const html = (n: string) => readFileSync(`tests/fixtures/e7db-${n}-skills.html`, 'utf8');

describe('parseSkills', () => {
  const setsuka = parseSkills(html('setsuka'));

  it('reads the three skills in order', () => {
    expect(setsuka.map((s) => s.name)).toEqual(['Horizontal Slash', 'Surpressed Desire', 'Rouge Aroma']);
  });

  it('reads cooldown, soul gain, description (key words in **bold**), soulburn and the enhancements of an attack', () => {
    const s1 = setsuka[0];
    expect(s1.cooldown).toBeUndefined(); // "None": a basic attack has no cooldown
    expect(s1.soulGain).toBe(1);
    expect(s1.description).toBe('Attack the enemy with a sword, and absorbs some of the damage dealt as Health. Damage dealt increases proportional to the **caster\'s max HP**.');
    expect(s1.soulburn).toBe('Increases damage dealt. (-10 souls)');
    expect(s1.upgrades).toHaveLength(6);
    expect(s1.upgrades[0]).toEqual({ level: 1, text: expect.any(String) });
    expect(s1.upgrades.map((u) => u.level)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('keeps "Passive" as the cooldown of a passive and has no soul gain or soulburn for it', () => {
    const s2 = setsuka[1];
    expect(s2.cooldown).toBe('Passive');
    expect(s2.soulGain).toBeUndefined();
    expect(s2.soulburn).toBeUndefined();
    expect(s2.upgrades[5]).toEqual({ level: 6, text: '+10% damage dealt' });
  });

  it('reads the status effects of a skill with their explanation (name and text from the icon)', () => {
    const [s1] = parseSkills(html('tamarinne'));
    expect(s1.effects.map((e) => e.name)).toEqual(['Dual Attack', 'Dispel', 'Healing']);
    expect(s1.effects[0].text).toBe('Chance to attack an enemy after an ally has attacked them, unless immobilized.');
    expect(setsuka[0].effects).toEqual([]);
  });

  it('keeps the spaces around the words in bold', () => {
    const d = parseSkills(html('tamarinne'))[0].description;
    expect(d).toContain('**heals** the ally');
    expect(d).toContain('(**Tamarinne**) Attacks');
  });

  it('turns a skill with a cooldown in turns into plain text', () => {
    const cds = parseSkills(html('tamarinne')).map((s) => s.cooldown);
    expect(cds.some((c) => /^\d+ Turns?$/.test(c ?? ''))).toBe(true);
  });

  it('throws when the page has no skills section, so a changed layout is noticed', () => {
    expect(() => parseSkills('<html>nothing</html>')).toThrow(/skills/);
  });
});

describe('collectSkills', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'e7-skills-'));
    mkdirSync(join(dir, '2026-10-29'), { recursive: true });
    writeFileSync(join(dir, 'index.json'), JSON.stringify({ periods: ['2026-10-29'] }));
    writeFileSync(join(dir, '2026-10-29', 'heroes.json'), JSON.stringify([
      { code: 'c1176', name: 'Setsuka', grade: 5, job: 'assassin', element: 'fire' },
      { code: 'c1067', name: 'Tamarinne', grade: 5, job: 'manauser', element: 'wind' },
      { code: 'c9', name: 'No Such Hero', grade: 3, job: 'mage', element: 'ice' },
    ]));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  const read = () => JSON.parse(readFileSync(join(dir, 'skills.json'), 'utf8'));
  function fake(fail: string[] = []) {
    const urls: string[] = [];
    const fetchFn = (async (url: string) => {
      urls.push(url);
      const slug = url.split('/').pop()!;
      if (fail.includes(slug) || slug === 'no-such-hero') return new Response('nope', { status: 404 });
      return new Response(`<html>${html(slug)}</html>`, { status: 200, headers: { 'content-type': 'text/html' } });
    }) as unknown as typeof fetch;
    return { fetchFn, urls };
  }

  it('fetches the skills of every hero of the latest period, politely, and writes skills.json', async () => {
    const { fetchFn, urls } = fake();
    expect(await collectSkills({ outDir: dir, fetchFn, delayMs: 0 })).toBe('written');
    expect(urls).toEqual([
      'https://epic7db.com/heroes/setsuka', 'https://epic7db.com/heroes/tamarinne', 'https://epic7db.com/heroes/no-such-hero',
    ]);
    const f = read();
    expect(f.source).toBe('epic7db.com');
    expect(Object.keys(f.heroes)).toEqual(['c1176', 'c1067']);
    expect(f.heroes.c1176).toHaveLength(3);
  });

  it('logs the heroes whose page it could not read and keeps the others', async () => {
    const logs: string[] = [];
    await collectSkills({ outDir: dir, fetchFn: fake().fetchFn, delayMs: 0, log: (m) => logs.push(m) });
    expect(logs.some((m) => /No Such Hero/.test(m) && /404/.test(m))).toBe(true);
  });

  it('only fetches the heroes it does not have yet', async () => {
    await collectSkills({ outDir: dir, fetchFn: fake().fetchFn, delayMs: 0 });
    const again = fake();
    expect(await collectSkills({ outDir: dir, fetchFn: again.fetchFn, delayMs: 0 })).toBe('skipped'); // only the unreadable hero is retried
    expect(again.urls).toEqual(['https://epic7db.com/heroes/no-such-hero']);
  });

  it('refetches everything on request', async () => {
    await collectSkills({ outDir: dir, fetchFn: fake().fetchFn, delayMs: 0 });
    const again = fake();
    expect(await collectSkills({ outDir: dir, fetchFn: again.fetchFn, delayMs: 0, refresh: true })).toBe('written');
    expect(again.urls).toHaveLength(3);
  });

  it('fails clearly when there is no hero list yet', async () => {
    rmSync(join(dir, '2026-10-29', 'heroes.json'));
    const logs: string[] = [];
    expect(await collectSkills({ outDir: dir, fetchFn: fake().fetchFn, delayMs: 0, log: (m) => logs.push(m) })).toBe('failed');
    expect(existsSync(join(dir, 'skills.json'))).toBe(false);
    expect(logs.some((m) => /npm run collect/.test(m))).toBe(true);
  });
});
