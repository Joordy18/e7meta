import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createClient, unwrap } from './api';
import type { Feed, FeedBoard, FeedPost, Release } from '../../src/shared/types';

type Client = ReturnType<typeof createClient>;

// The official community boards (English), found by probing the board ids next to Developer Notes (987).
const BOARDS: [number, FeedBoard][] = [[985, 'notice'], [986, 'patch'], [987, 'dev'], [988, 'event']];
const PER_BOARD = 6;
const KEEP_RELEASES = 20;

/** The newest posts of a board list, with the date (UTC) and the public link. Throws on a bad envelope. */
export function listPosts(raw: unknown, board: FeedBoard, n: number): FeedPost[] {
  const items = unwrap<{ list?: { article_id: string | number; title: string; create_datetime: number; media_thumbnail_url?: string | null }[] }>(raw).list ?? [];
  return items.slice(0, n).map((a) => ({
    id: String(a.article_id), board, title: a.title.trim(), date: new Date(a.create_datetime).toISOString().slice(0, 10),
    url: `https://page.onstove.com/epicseven/global/view/${a.article_id}`,
    ...(a.media_thumbnail_url ? { image: a.media_thumbnail_url.replace(/^\/\//, 'https://') } : {}), // protocol-relative link to the official banner
  }));
}

type Week = { heroes: { code: string; name: string }[]; artifacts: Record<string, { name: string }> };

/** Heroes and artifacts the latest week lists and the previous one does not. */
export function findReleases(prev: Week, cur: Week, since: string): Release[] {
  const had = new Set(prev.heroes.map((h) => h.code));
  const heroes = cur.heroes.filter((h) => !had.has(h.code)).map((h) => ({ kind: 'hero' as const, code: h.code, name: h.name, since }));
  const artifacts = Object.entries(cur.artifacts).filter(([code]) => !(code in prev.artifacts)).map(([code, a]) => ({ kind: 'artifact' as const, code, name: a.name, since }));
  return [...heroes, ...artifacts];
}

const readJson = async <T>(p: string): Promise<T | undefined> => {
  try { return JSON.parse(await readFile(p, 'utf8')) as T; } catch { return undefined; }
};

async function loadWeek(outDir: string, period: string): Promise<Week | undefined> {
  const heroes = await readJson<Week['heroes']>(join(outDir, period, 'heroes.json'));
  const gear = await readJson<{ artifacts: Week['artifacts'] }>(join(outDir, period, 'gear.json'));
  return heroes && gear ? { heroes, artifacts: gear.artifacts } : undefined;
}

/**
 * Writes feed.json: the latest posts of the notice, patch, developer-notes and event boards (a board that fails keeps its previous posts)
 * and the heroes / artifacts that appeared between the two latest weeks (added on top of those already recorded).
 */
export async function refreshFeed(opts: {
  outDir: string; client: Client; log?: (m: string) => void; now?: () => string;
}): Promise<'written' | 'failed'> {
  const { outDir, client, log = () => {}, now = () => new Date().toISOString().slice(0, 10) } = opts;
  const path = join(outDir, 'feed.json');
  const old = await readJson<Feed>(path);

  const posts: FeedPost[] = [];
  let loaded = 0;
  for (const [id, board] of BOARDS) {
    try {
      const raw = await client.get(`v3.0/article_group/BOARD/${id}/article/list`, {
        interaction_type_code: 'VIEW', content_yn: 'N', summary_yn: 'N', sort_type_code: 'LATEST', translation_yn: 'N', page: '1', size: String(PER_BOARD)
      });
      posts.push(...listPosts(raw, board, PER_BOARD));
      loaded++;
    } catch (e) {
      log(`feed: board ${id} (${board}) failed: ${(e as Error).message}`);
      posts.push(...(old?.posts.filter((p) => p.board === board) ?? []));
    }
  }
  if (loaded === 0 && !old) return 'failed';

  const periods = (await readJson<{ periods: string[] }>(join(outDir, 'index.json')))?.periods ?? [];
  const [to, from] = periods;
  const cur = to ? await loadWeek(outDir, to) : undefined;
  const prev = from ? await loadWeek(outDir, from) : undefined;
  const recorded = old?.releases ?? [];
  const known = new Set(recorded.map((r) => `${r.kind}:${r.code}`));
  const fresh = cur && prev ? findReleases(prev, cur, to).filter((r) => !known.has(`${r.kind}:${r.code}`)) : [];

  await mkdir(outDir, { recursive: true });
  await writeFile(path, JSON.stringify({ updated: now(), posts, releases: [...fresh, ...recorded].slice(0, KEEP_RELEASES) } satisfies Feed));
  log(`feed: ${posts.length} posts, ${fresh.length} new releases`);
  return 'written';
}

// shortcut: argv[1] compare only works for `tsx scripts/collect/feed.ts`; fine for npm run feed
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await refreshFeed({ outDir: 'public/data', client: createClient({ baseUrl: 'https://api.onstove.com/cwms/' }), log: console.log });
  console.log(result);
  if (result === 'failed') process.exitCode = 1;
}
