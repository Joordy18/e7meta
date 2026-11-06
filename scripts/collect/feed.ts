import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createClient, unwrap } from './api';
import { text } from './html';
import type { Feed, FeedBoard, FeedPost, Release } from '../../src/shared/types';

type Client = ReturnType<typeof createClient>;

// The official community boards (English), found by probing the board ids next to Developer Notes (987).
const BOARDS: [number, FeedBoard][] = [[985, 'notice'], [986, 'patch'], [987, 'dev'], [988, 'event']];
const PER_BOARD = 6;
const KEEP_RELEASES = 20;
const UPDATE_POSTS = 2; // how many of the newest "Update Content" posts are read for announcements
const PATCH_LIST = 20; // the patch board list is read deeper than it is shown: update posts are weekly, patch information daily

/** The newest posts of a board list, with the date (UTC) and the public link. Throws on a bad envelope. */
export function listPosts(raw: unknown, board: FeedBoard, n: number): FeedPost[] {
  const items = unwrap<{ list?: { article_id: string | number; title: string; create_datetime: number; media_thumbnail_url?: string | null }[] }>(raw).list ?? [];
  return items.slice(0, n).map((a) => ({
    id: String(a.article_id), board, title: a.title.trim(), date: new Date(a.create_datetime).toISOString().slice(0, 10),
    url: `https://page.onstove.com/epicseven/global/view/${a.article_id}`,
    ...(a.media_thumbnail_url ? { image: a.media_thumbnail_url.replace(/^\/\//, 'https://') } : {}), // protocol-relative link to the official banner
  }));
}

const HEADING = /^\d+\.\s*New\s+\d\s*★\s*(Hero|Artifact),\s*(.+)$/i;

const JOBS: Record<string, string> = { knight: 'knight', warrior: 'warrior', mage: 'mage', ranger: 'ranger', thief: 'assassin', 'soul weaver': 'manauser' }; // post wording -> job code

type Announcement = { kind: 'hero' | 'artifact'; name: string; job?: string };

/**
 * The new heroes and artifacts an update post announces: its numbered headings such as "2. New 5★ Hero, Name".
 * For an artifact the class comes from the text under the heading ("The Knight-exclusive 5★ Artifact, ...").
 */
export function parseAnnouncements(html: string): Announcement[] {
  const out: Announcement[] = [];
  let current: Announcement | undefined;
  for (const p of html.matchAll(/<p[\s>][\s\S]*?<\/p>/g)) {
    const t = text(p[0]);
    const m = HEADING.exec(t);
    if (m) out.push((current = { kind: m[1].toLowerCase() as 'hero' | 'artifact', name: m[2].trim() }));
    else if (/^\d+\.\s/.test(t)) current = undefined; // another numbered section: what follows is not about the last item
    else if (current?.kind === 'artifact' && !current.job) {
      const job = JOBS[/The ([A-Za-z ]+?)-exclusive/.exec(t)?.[1].toLowerCase() ?? ''];
      if (job) current.job = job;
    }
  }
  return out;
}

const when = (r: Release) => r.announced?.date ?? r.since ?? ''; // newest first; ties keep their order
const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '');
const keyOf = (r: { kind: string; name: string }) => `${r.kind}:${slug(r.name)}`;

type Info = { grade?: number; job?: string; element?: string };
type Week = { heroes: ({ code: string; name: string } & Info)[]; artifacts: Record<string, { name: string; grade?: number; job?: string }> };

/** Only the details the data has (no undefined fields in the JSON). */
const details = ({ grade, job, element }: Info): Info => ({ ...(grade ? { grade } : {}), ...(job ? { job } : {}), ...(element ? { element } : {}) });

/** Heroes and artifacts the latest week lists and the previous one does not. */
export function findReleases(prev: Week, cur: Week, since: string): Release[] {
  const had = new Set(prev.heroes.map((h) => h.code));
  const heroes = cur.heroes.filter((h) => !had.has(h.code)).map((h) => ({ kind: 'hero' as const, code: h.code, name: h.name, since, ...details(h) }));
  const artifacts = Object.entries(cur.artifacts).filter(([code]) => !(code in prev.artifacts)).map(([code, a]) => ({ kind: 'artifact' as const, code, name: a.name, since, ...details(a) }));
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
  const updates: FeedPost[] = []; // newest "Update Content" posts, read below for announcements
  let loaded = 0;
  for (const [id, board] of BOARDS) {
    try {
      const raw = await client.get(`v3.0/article_group/BOARD/${id}/article/list`, {
        interaction_type_code: 'VIEW', content_yn: 'N', summary_yn: 'N', sort_type_code: 'LATEST', translation_yn: 'N', page: '1', size: String(board === 'patch' ? PATCH_LIST : PER_BOARD),
      });
      posts.push(...listPosts(raw, board, PER_BOARD));
      if (board === 'patch') updates.push(...listPosts(raw, board, PATCH_LIST).filter((p) => /Update Content/i.test(p.title)).slice(0, UPDATE_POSTS));
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
  const releases: Release[] = [...(old?.releases ?? [])];
  const byKey = new Map(releases.map((r) => [keyOf(r), r]));
  const added: Release[] = [];
  const add = (r: Release) => {
    const e = byKey.get(keyOf(r));
    if (!e) { byKey.set(keyOf(r), r); added.push(r); return; }
    if (r.code) { e.code ??= r.code; e.since ??= r.since; } // the same item seen from another source
    if (r.job) e.job ??= r.job;
    if (r.announced) e.announced ??= r.announced;
  };
  if (cur && prev) findReleases(prev, cur, to).forEach(add);
  for (const u of updates) {
    try {
      const raw = await client.get('v3.0/article', { article_id: u.id, interaction_type_code: 'VIEW', translation_yn: 'N', request_id: 'CM' });
      for (const a of parseAnnouncements(unwrap<{ content: string }>(raw).content)) add({ ...a, announced: { date: u.date, url: u.url } });
    } catch (e) {
      log(`feed: update post ${u.id} failed: ${(e as Error).message}`);
    }
  }
  if (cur) { // an announced item shows up in the game's data later: take its code and details from there
    const catalog = new Map<string, { code: string } & Info>([
      ...cur.heroes.map((h) => [keyOf({ kind: 'hero', name: h.name }), { code: h.code, ...details(h) }] as const),
      ...Object.entries(cur.artifacts).map(([code, x]) => [keyOf({ kind: 'artifact', name: x.name }), { code, ...details(x) }] as const),
    ]);
    for (const r of [...added, ...releases]) {
      const c = catalog.get(keyOf(r));
      if (!c) continue;
      r.code ??= c.code; // no week here: only the comparison of two weeks knows when it appeared
      r.grade ??= c.grade; r.job ??= c.job; r.element ??= c.element;
    }
  }
  const fresh = added;

  await mkdir(outDir, { recursive: true });
  await writeFile(path, JSON.stringify({ updated: now(), posts, releases: [...added, ...releases].sort((a, b) => when(b).localeCompare(when(a))).slice(0, KEEP_RELEASES) } satisfies Feed));
  log(`feed: ${posts.length} posts, ${fresh.length} new releases`);
  return 'written';
}

// shortcut: argv[1] compare only works for `tsx scripts/collect/feed.ts`; fine for npm run feed
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await refreshFeed({ outDir: 'public/data', client: createClient({ baseUrl: 'https://api.onstove.com/cwms/' }), log: console.log });
  console.log(result);
  if (result === 'failed') process.exitCode = 1;
}
