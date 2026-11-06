import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { epic7dbUrl } from '../../src/lib/links';
import { decode, text } from './html';
import type { ExclusiveEquipment, HeroSummary, SkillInfo, SkillsFile } from '../../src/shared/types';

const VERSION = 2;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** First capture group of `re` in `s`, as visible text. */
const grab = (s: string, re: RegExp) => {
  const m = re.exec(s);
  return m ? text(m[1]) : undefined;
};

/** Description HTML to Markdown: key words (<strong>) become **bold**, every other tag goes. */
const markdown = (html: string) =>
  decode(html.replace(/<strong>\s*([\s\S]*?)\s*<\/strong>/g, '**$1**').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

/**
 * Reads the skills section of an epic7db.com hero page: name, cooldown, soul gain, status effects, description,
 * soulburn effect and skill enhancements. Throws when the section or its skills are missing (the layout changed).
 */
export function parseSkills(html: string): SkillInfo[] {
  const a = html.indexOf('<section id="skills"');
  if (a < 0) throw new Error('no skills section in the page');
  const section = html.slice(a, html.indexOf('</section>', a));
  const blocks = section.split(/<div class="skill accordion[^"]*">/).slice(1);
  if (blocks.length === 0) throw new Error('skills section without skills');

  return blocks.map((b) => {
    const cooldown = grab(b, /<div class="cooldown">([\s\S]*?)<\/div>/);
    const gain = grab(b, /<div class="soul-gain">([\s\S]*?)<\/div>/)?.match(/\d+/)?.[0];
    const bottom = /<div class="bottom">([\s\S]*?)<\/div>/.exec(b)?.[1] ?? '';
    const soulburn = grab(b, /<div class="soulburn">\s*<p>([\s\S]*?)<\/p>/);
    return {
      name: grab(b, /<h3>([\s\S]*?)<\/h3>/) ?? '',
      ...(cooldown && cooldown !== 'None' ? { cooldown } : {}),
      ...(gain ? { soulGain: Number(gain) } : {}),
      effects: [...b.matchAll(/<img src="\/images\/status_effects\/[^"]*" alt="([^"]*)" title="([^"]*)"/g)].map((m) => {
        const name = decode(m[1]);
        return { name, text: decode(m[2]).replace(new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*-\\s*`), '') };
      }),
      description: markdown(bottom),
      ...(soulburn ? { soulburn } : {}),
      upgrades: [...b.matchAll(/<div class="level">\s*(\d+)\s*<\/div>\s*<div class="description">([\s\S]*?)<\/div>/g)].map((m) => ({ level: Number(m[1]), text: text(m[2]) })),
    };
  });
}

/** The exclusive equipment section of an epic7db.com hero page: name, stat bonus and the three upgrade options. Undefined when the hero has none. */
export function parseExclusive(html: string): ExclusiveEquipment | undefined {
  const a = html.indexOf('<section id="exclusive-equipment"');
  if (a < 0) return undefined;
  const section = html.slice(a, html.indexOf('</section>', a));
  const stat = /<div class="details">\s*<h4>([\s\S]*?)<\/h4>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/.exec(section);
  const [min, max] = [/Min Roll:\s*([^<]*?)\s*</.exec(section)?.[1], /Max Roll:\s*([^<]*?)\s*</.exec(section)?.[1]];
  const options = section.split('<div class="skill">').slice(1).map((b) => {
    const content = /<div class="skill-content">\s*<h4>([\s\S]*?)<\/h4>\s*<p>([\s\S]*?)<\/p>/.exec(b);
    return {
      skill: text(content?.[1] ?? ''), text: text(content?.[2] ?? ''),
      ...(b.includes('class="recommended"') ? { recommended: true } : {}),
    };
  });
  return {
    name: grab(section, /<div class="title">\s*<h3>([\s\S]*?)<\/h3>/) ?? '',
    ...(stat && min && max ? { stat: { name: text(stat[1]), min, max } } : {}),
    options,
  };
}

const exists = (p: string) => readFile(p).then(() => true, () => false);

/**
 * Keeps public/data/skills.json (skills of every hero, from epic7db.com, a fan site) up to date. Fetches only the heroes
 * the file does not have yet (or all with `refresh`), one page a second, and logs the pages it cannot read.
 * 'written' when it saved something new, 'skipped' when there was nothing to add, 'failed' when there is no hero list.
 */
export async function collectSkills(opts: {
  outDir: string; fetchFn?: typeof fetch; delayMs?: number; refresh?: boolean; log?: (m: string) => void;
}): Promise<'written' | 'skipped' | 'failed'> {
  const { outDir, fetchFn = fetch, delayMs = 1000, refresh = false, log = () => {} } = opts;
  let heroes: HeroSummary[];
  try {
    const latest = (JSON.parse(await readFile(join(outDir, 'index.json'), 'utf8')) as { periods: string[] }).periods[0];
    heroes = JSON.parse(await readFile(join(outDir, latest, 'heroes.json'), 'utf8'));
  } catch {
    log('skills: no hero list yet, run `npm run collect` first');
    return 'failed';
  }

  const path = join(outDir, 'skills.json');
  const previous: SkillsFile | undefined = !refresh && (await exists(path)) ? JSON.parse(await readFile(path, 'utf8')) : undefined;
  // a file from an older collector lacks the exclusive equipment: start over rather than keep half the data
  const file: SkillsFile = previous?.version === VERSION ? previous : { version: VERSION, fetchedAt: '', source: 'epic7db.com', heroes: {}, exclusive: {} };
  let added = 0;
  for (const hero of heroes) {
    if (file.heroes[hero.code]) continue;
    const url = epic7dbUrl(hero.name);
    try {
      await sleep(delayMs);
      const res = await fetchFn(url, { signal: AbortSignal.timeout(20000), headers: { 'user-agent': 'e7overlay (personal stats tool)' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const page = await res.text();
      file.heroes[hero.code] = parseSkills(page);
      const ee = parseExclusive(page);
      if (ee) file.exclusive[hero.code] = ee;
      added++;
    } catch (e) {
      log(`skills: ${hero.name} (${url}) failed: ${(e as Error).message}`);
    }
  }
  if (added === 0) return 'skipped';
  file.fetchedAt = new Date().toISOString().slice(0, 10);
  await mkdir(outDir, { recursive: true });
  await writeFile(path, JSON.stringify(file));
  log(`skills: ${added} heroes added, ${Object.keys(file.heroes).length} in total`);
  return 'written';
}

// shortcut: argv[1] compare only works for `tsx scripts/collect/skills.ts`; fine for npm run skills
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await collectSkills({ outDir: 'public/data', refresh: process.argv.includes('--refresh'), log: console.log });
  console.log(result);
  if (result === 'failed') process.exitCode = 1;
}
