import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createClient, unwrap } from './api';
import { text } from './html';
import type { ArenaIndex, ArenaSeason, ArenaTier, DraftRow, PreBanRow } from '../../src/shared/types';

type Client = ReturnType<typeof createClient>;

// The developers publish one "World Arena <Season> <Year> Season Infographic" post per season on the Developer Notes board (987).
const BOARD_LIST = 'v3.0/article_group/BOARD/987/article/list';
const ARTICLE = 'v3.0/article';
const TITLE = /^World Arena (Spring|Summer|Fall|Winter) (\d{4}) Season Infographic$/;
// shortcut: posts before Fall 2025 use an older table layout (season comparison, not split by league tier); not parsed, move this date back if they are ever supported
const SUPPORTED_SINCE = '2025-10-01';

const TIERS: [string, ArenaTier][] = [['Champion', 'champion'], ['Warlord', 'warlord'], ['Emperor', 'emperor'], ['Legend', 'legend']];

const num = (s: string) => Number.parseFloat(s.replace('%', '').replace(/,/g, ''));

const rowsOf = (table: string) =>
  [...table.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((r) => [...r[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map((c) => text(c[1])));

type Parsed = Pick<ArenaSeason, 'preBan' | 'firstPick' | 'pick' | 'leagues' | 'cutoffs'>;

/**
 * Reads the tables of a season infographic: pre-ban, first pick and pick rates for the four league tiers,
 * the global win rate and player count of the top leagues, and the cutoffs. Throws when no draft table is found.
 */
export function parseArena(html: string): Parsed {
  const out: Parsed = {
    preBan: { champion: [], warlord: [], emperor: [], legend: [] },
    firstPick: { champion: [], warlord: [], emperor: [], legend: [] },
    pick: { champion: [], warlord: [], emperor: [], legend: [] },
    leagues: [],
    cutoffs: [],
  };
  let pos = 0;
  for (const m of html.matchAll(/<table[\s\S]*?<\/table>/g)) {
    const before = text(html.slice(pos, m.index));
    pos = m.index! + m[0].length;
    const rows = rowsOf(m[0]);
    const head = rows[0] ?? [];

    const tiers = head.map((h) => TIERS.find(([name]) => h.startsWith(name))?.[1]);
    if (tiers.length > 0 && tiers.every(Boolean) && rows[1]) {
      const cols = rows[1];
      const width = cols.length / tiers.length;
      const metric = cols[1];
      for (const row of rows.slice(2)) {
        tiers.forEach((tier, i) => {
          const c = row.slice(i * width, (i + 1) * width);
          const nums = c.slice(1).map(num);
          if (!c[0] || nums.length !== width - 1 || nums.some(Number.isNaN)) return;
          if (metric === 'Pre-Ban') out.preBan[tier!].push({ hero: c[0], rate: nums[0] } satisfies PreBanRow);
          else if (metric === 'First Pick' || metric === 'Pick') {
            (metric === 'Pick' ? out.pick : out.firstPick)[tier!].push({ hero: c[0], rate: nums[0], ban: nums[1], win: nums[2] } satisfies DraftRow);
          }
        });
      }
    } else if (head[0] === 'Server') {
      const league = [...before.matchAll(/(Legend|Emperor|Warlord) League/g)].pop()?.[1];
      const g = rows.find((r) => r[0] === 'Global');
      if (league && g && !Number.isNaN(num(g[1])) && !Number.isNaN(num(g[2]))) out.leagues.push({ league, avgWinRate: num(g[1]), players: num(g[2]) });
    } else if (head[0] === 'Cutoff') {
      for (const r of rows.slice(1)) if (r[0] && !Number.isNaN(num(r[1]))) out.cutoffs.push({ league: r[0], points: num(r[1]) });
    }
  }
  const drafted = Object.values(out.pick).some((rows) => rows.length > 0);
  if (!drafted) throw new Error('arena page layout not recognised: no pick table found');
  return out;
}

export type Infographic = { id: string; title: string; season: string; published: string; url: string };

/** The season infographic posts of the board list, newest first (older layouts left out). */
export function listInfographics(raw: unknown): Infographic[] {
  const items = (unwrap<{ list?: { article_id: string | number; title: string; create_datetime: number }[] }>(raw).list ?? []);
  return items
    .flatMap((a) => {
      const m = TITLE.exec(a.title);
      if (!m) return [];
      const id = String(a.article_id);
      return [{
        id, title: a.title, season: `${m[1]} ${m[2]}`, published: new Date(a.create_datetime).toISOString().slice(0, 10),
        url: `https://page.onstove.com/epicseven/global/view/${id}`,
      }];
    })
    .filter((x) => x.published >= SUPPORTED_SINCE)
    .sort((a, b) => b.published.localeCompare(a.published));
}

const exists = (p: string) => readFile(p).then(() => true, () => false);
const writeJson = async (p: string, data: unknown) => {
  await mkdir(join(p, '..'), { recursive: true });
  await writeFile(p, JSON.stringify(data));
};

/**
 * Saves each supported season infographic once as arena/<id>.json and keeps arena/index.json (newest first).
 * A season that fails is logged and retried next run; other seasons are kept.
 */
export async function collectArena(opts: {
  outDir: string; client: Client; log?: (m: string) => void;
}): Promise<'written' | 'skipped' | 'failed'> {
  const { outDir, client, log = () => {} } = opts;
  const dir = join(outDir, 'arena');
  let infos: Infographic[];
  try {
    infos = listInfographics(await client.get(BOARD_LIST, {
      interaction_type_code: 'VIEW', content_yn: 'N', summary_yn: 'N', sort_type_code: 'LATEST', translation_yn: 'N', page: '1', size: '50',
    }));
  } catch (e) {
    log(`arena: could not list the season infographics: ${(e as Error).message}`);
    return 'failed';
  }

  let written = 0;
  for (const info of infos) {
    if (await exists(join(dir, `${info.id}.json`))) continue;
    try {
      const raw = await client.get(ARTICLE, { article_id: info.id, interaction_type_code: 'VIEW', translation_yn: 'N', request_id: 'CM' });
      const season: ArenaSeason = { ...info, ...parseArena(unwrap<{ content: string }>(raw).content) };
      await writeJson(join(dir, `${info.id}.json`), season);
      written++;
      log(`arena: ${info.season} saved`);
    } catch (e) {
      log(`arena: ${info.season} (${info.id}) failed: ${(e as Error).message}`);
    }
  }

  const have: ArenaIndex['seasons'] = [];
  for (const info of infos) if (await exists(join(dir, `${info.id}.json`))) have.push({ id: info.id, season: info.season, published: info.published, title: info.title, url: info.url });
  if (written === 0 && (have.length === 0 || (await exists(join(dir, 'index.json'))))) return have.length === 0 ? 'failed' : 'skipped';
  await writeJson(join(dir, 'index.json'), { seasons: have } satisfies ArenaIndex);
  return 'written';
}

// shortcut: argv[1] compare only works for `tsx scripts/collect/arena.ts`; fine for npm run arena
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await collectArena({ outDir: 'public/data', client: createClient({ baseUrl: 'https://api.onstove.com/cwms/' }), log: console.log });
  console.log(result);
  if (result === 'failed') process.exitCode = 1;
}
