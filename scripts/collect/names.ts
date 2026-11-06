import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createClient } from './api';
import { mapArtifactList, mapHeroList, mapSetNames } from './map';
import type { NamesFile } from '../../src/shared/types';

type Client = ReturnType<typeof createClient>;

// our language code -> the guide API's lang_code (checked: fr, de, ja, ko and zh-TW come back translated; es, pt and th mostly in English)
const API_LANG: Record<string, string> = { fr: 'fr', de: 'de', ja: 'ja', ko: 'ko', zh: 'zh-TW', pt: 'pt' };
const LANGS = ['fr', 'de', 'ja', 'ko', 'zh']; // the languages the site shows names in: one file each, about 15 requests per language
const W = 'wearing-status/';
const base = { world_code: 'world_global' };
const MAX_PAGES = 20;

/** Every page of a list until one is empty or adds nothing new. */
async function allPages<T>(client: Client, path: string, params: Record<string, string>, map: (raw: unknown) => T[], key: (x: T) => string): Promise<T[]> {
  const seen = new Map<string, T>();
  for (let page = 1; page <= MAX_PAGES; page++) {
    const found = map(await client.get(path, { ...params, current_page: String(page) }));
    const before = seen.size;
    for (const x of found) seen.set(key(x), x);
    if (found.length === 0 || seen.size === before) break;
  }
  return [...seen.values()];
}

async function fetchLang(client: Client, lang: string, now: string): Promise<NamesFile> {
  const api = API_LANG[lang] ?? lang;
  const heroes = await allPages(client, `${W}hero-list`, { ...base, lang_code: api, is_paging: 'N' }, mapHeroList, (h) => h.code);
  if (heroes.length === 0) throw new Error('no hero in the list');
  // is_paging Y: with N the game drops one artifact at a page boundary
  const artifacts = await allPages(client, `${W}artifact-list`, { ...base, lang_code: api, is_paging: 'Y' }, mapArtifactList, (a) => a.code);
  // the names of the sets are the same on every hero's ranking
  const sets = mapSetNames(await client.get(`${W}hero-equip-ranking`, { ...base, lang_code: api, current_page: '1', is_paging: 'N', hero_code: heroes[0].code }));
  return {
    lang, updated: now,
    heroes: Object.fromEntries(heroes.map((h) => [h.code, h.name])),
    artifacts: Object.fromEntries(artifacts.map((a) => [a.code, a.name])),
    sets,
  };
}

/**
 * Writes names/<lang>.json for each language: the names of heroes, artifacts and sets by code, as the game's guide API gives them in that language.
 * A language whose lists cannot all be read is not written (the file it had stays); the others are. 'failed' when any language failed.
 */
export async function collectNames(opts: {
  outDir: string; client: Client; langs?: string[]; log?: (m: string) => void; now?: () => string;
}): Promise<'written' | 'failed'> {
  const { outDir, client, langs = LANGS, log = () => {}, now = () => new Date().toISOString().slice(0, 10) } = opts;
  let failed = 0;
  for (const lang of langs) {
    try {
      const names = await fetchLang(client, lang, now());
      await mkdir(join(outDir, 'names'), { recursive: true });
      await writeFile(join(outDir, 'names', `${lang}.json`), JSON.stringify(names));
      log(`names: ${lang}: ${Object.keys(names.heroes).length} heroes, ${Object.keys(names.artifacts).length} artifacts, ${Object.keys(names.sets).length} sets`);
    } catch (e) {
      failed++;
      log(`names: ${lang} failed: ${(e as Error).message}`);
    }
  }
  return failed > 0 ? 'failed' : 'written';
}

// shortcut: argv[1] compare only works for `tsx scripts/collect/names.ts`; fine for npm run names ("-- fr de" picks the languages)
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const langs = process.argv.slice(2).filter((a) => !a.startsWith('-'));
  const result = await collectNames({ outDir: 'public/data', client: createClient(), ...(langs.length > 0 ? { langs } : {}), log: console.log });
  console.log(result);
  if (result === 'failed') process.exitCode = 1;
}
