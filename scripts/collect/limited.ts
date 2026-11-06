import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createClient } from './api';
import { listPosts } from './feed';
import { LIMITED } from '../../src/shared/limited';
import type { FeedBoard, FeedPost, LimitedFile } from '../../src/shared/types';

type Client = ReturnType<typeof createClient>;

const BOARDS: [number, FeedBoard][] = [[985, 'notice'], [986, 'patch'], [987, 'dev'], [988, 'event']]; // the same community boards as the feed
const PAGES = 8; // 50 posts each: months of titles, enough to find the posts of a mode that is not in the news every week
const KEEP = 3; // newest posts kept per mode

const readJson = async <T>(p: string): Promise<T | undefined> => { try { return JSON.parse(await readFile(p, 'utf8')) as T; } catch { return undefined; } };

/** Which mode (if any) a post title is about: the first whose pattern matches and whose skip pattern does not. */
export const modeOf = (title: string): string | undefined =>
  LIMITED.find((m) => new RegExp(m.match, 'i').test(title) && !(m.skip && new RegExp(m.skip, 'i').test(title)))?.id;

/**
 * Writes limited.json: for each limited-time mode, the newest official posts whose title names it. The game publishes no hero statistics for these modes,
 * so the posts (what changed, the events around them) are what the Modes page can offer. Posts found earlier are kept when they scroll out of the window;
 * 'failed' only when no board could be read and there is no earlier file.
 */
export async function refreshLimited(opts: { outDir: string; client: Client; log?: (m: string) => void; now?: () => string; pages?: number }): Promise<'written' | 'failed'> {
  const { outDir, client, log = () => {}, now = () => new Date().toISOString().slice(0, 10), pages = PAGES } = opts;
  const path = join(outDir, 'limited.json');
  const old = await readJson<LimitedFile>(path);
  const found = new Map<string, FeedPost[]>(Object.entries(old?.modes ?? {}));
  let read = 0;
  for (const [id, board] of BOARDS) {
    try {
      for (let page = 1; page <= pages; page++) {
        const raw = await client.get(`v3.0/article_group/BOARD/${id}/article/list`, {
          interaction_type_code: 'VIEW', content_yn: 'N', summary_yn: 'N', sort_type_code: 'LATEST', translation_yn: 'N', page: String(page), size: '50',
        });
        const posts = listPosts(raw, board, 50);
        if (posts.length === 0) break;
        for (const p of posts) {
          const mode = modeOf(p.title);
          if (!mode) continue;
          const list = found.get(mode) ?? [];
          if (!list.some((q) => q.id === p.id)) list.push(p);
          found.set(mode, list);
        }
      }
      read++;
    } catch (e) {
      log(`limited: board ${id} (${board}) failed: ${(e as Error).message}`);
    }
  }
  if (read === 0 && !old) return 'failed';
  const modes: LimitedFile['modes'] = {};
  for (const m of LIMITED) {
    const list = (found.get(m.id) ?? []).sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id)).slice(0, KEEP);
    if (list.length > 0) modes[m.id] = list;
  }
  await mkdir(outDir, { recursive: true });
  await writeFile(path, JSON.stringify({ updated: now(), modes } satisfies LimitedFile));
  log(`limited: ${Object.values(modes).reduce((n, l) => n + l.length, 0)} posts for ${Object.keys(modes).length} modes`);
  return 'written';
}

// shortcut: argv[1] compare only works for `tsx scripts/collect/limited.ts`; fine for npm run limited
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await refreshLimited({ outDir: 'public/data', client: createClient({ baseUrl: 'https://api.onstove.com/cwms/' }), log: console.log });
  console.log(result);
  if (result === 'failed') process.exitCode = 1;
}
