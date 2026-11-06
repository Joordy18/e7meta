import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createClient, unwrap } from './api';
import { text } from './html';
import type { Balance, BalanceChange, Feed, FeedBoard, FeedPost, Release } from '../../src/shared/types';

type Client = ReturnType<typeof createClient>;

// The official community boards (English), found by probing the board ids next to Developer Notes (987).
const BOARDS: [number, FeedBoard][] = [[985, 'notice'], [986, 'patch'], [987, 'dev'], [988, 'event']];
const PER_BOARD = 6;
const KEEP_RELEASES = 20;
const UPDATE_POSTS = 2; // how many of the newest "Update Content" posts are read for announcements
const DEV_LIST = 15; // the balance previews are among the developer notes, a few weeks apart
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


const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const SUMMARY_MAX = 300;

/** At most SUMMARY_MAX characters, cut at the end of a sentence when there is one. */
function clip(s: string): string {
  if (s.length <= SUMMARY_MAX) return s;
  const cut = s.slice(0, SUMMARY_MAX);
  const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '));
  return end > 100 ? cut.slice(0, end + 1) : `${cut.slice(0, SUMMARY_MAX - 1).trimEnd()}…`;
}

/**
 * Reads a "Balance Adjustment Preview" post: the patch day ("scheduled to take place on November 19"), the table of heroes and artifacts it
 * adjusts, and for each the skills it changes and the developers' explanation. Null when the post has no such table.
 */
export function parseBalance(html: string, posted: string): { date: string; changes: BalanceChange[] } | null {
  // a cell holds one or more paragraphs: its lines
  const lines = (cell: string) => { const ps = [...cell.matchAll(/<p[\s>][\s\S]*?<\/p>/g)].map((p) => text(p[0])).filter(Boolean); return ps.length > 0 ? ps : [text(cell)].filter(Boolean); };
  const tokens = [...html.matchAll(/<(p|tr)[\s>][\s\S]*?<\/\1>/g)]
    .map((m) => ({ tr: m[1] === 'tr', t: text(m[0]), cells: m[1] === 'tr' ? [...m[0].matchAll(/<t[dh][\s>][\s\S]*?<\/t[dh]>/g)].map((c) => lines(c[0])) : [] }))
    .filter((x) => x.t);
  let date: string | undefined;
  let listing: 'hero' | 'artifact' | undefined;
  const rows: { kind: 'hero' | 'artifact'; grade?: number; full: string; change?: BalanceChange }[] = [];
  let i = 0;
  for (; i < tokens.length; i++) { // 1. the table of what is adjusted, until the first numbered section
    const { tr, t } = tokens[i];
    if (!tr && /^\d+-\d+\.\s/.test(t)) break;
    const d = /take place on ([A-Za-z]+) (\d{1,2})/.exec(t);
    if (!tr && d && MONTHS.includes(d[1].toLowerCase())) {
      const month = MONTHS.indexOf(d[1].toLowerCase()) + 1;
      const at = (y: number) => `${y}-${String(month).padStart(2, '0')}-${d[2].padStart(2, '0')}`;
      const year = Number(posted.slice(0, 4));
      date = at(Date.parse(at(year)) < Date.parse(posted) - 90 * 864e5 ? year + 1 : year); // a January patch announced in December
    } else if (!tr && (t === 'Hero' || t === 'Artifact')) listing = t === 'Hero' ? 'hero' : 'artifact';
    else if (tr && listing === 'hero') { const m = /^(\d)\s*★\s*(.+)$/.exec(t); if (m) rows.push({ kind: 'hero', grade: Number(m[1]), full: m[2] }); }
    else if (tr && listing === 'artifact') { const m = /^★\s*(\d)\s+(.+)$/.exec(t); if (m) rows.push({ kind: 'artifact', grade: Number(m[1]), full: m[2] }); }
  }
  if (!date || rows.length === 0) return null;

  // 2. the details: a heading with the hero's own name (the table adds its summon type, "Moonlight Death Dealer Ray"), then skill tables and paragraphs
  const names = (full: string) => full.split(' ').map((_, k, w) => w.slice(k).join(' ').toLowerCase());
  const text_: Record<number, string[]> = {};
  let current: (typeof rows)[number] | undefined;
  let fresh = false; // the next row of a skill table holds its before / after texts
  for (; i < tokens.length; i++) {
    const { tr, t } = tokens[i];
    if (!tr && /^That concludes/.test(t)) break;
    if (!tr && /^\d+(-\d+)*\.\s/.test(t)) { current = undefined; continue; }
    const heading = !tr ? rows.find((r) => !r.change && names(r.full).includes(t.toLowerCase())) : undefined;
    if (heading) {
      heading.change = { kind: heading.kind, name: t, ...(heading.grade ? { grade: heading.grade } : {}) };
      current = heading;
      text_[rows.indexOf(heading)] = [];
    } else if (current?.change) {
      if (tr) { // a skill table: a title row "Skill (Before) | Skill (After)", the texts, then optionally rows of effect labels
        const [left = [], right = []] = tokens[i].cells;
        const head = /^(.+?) \(Before\)$/.exec(left.join(' '));
        const details = current.change.details ??= [];
        if (head && right.join(' ').endsWith('(After)')) { details.push({ skill: head[1], before: '', after: '' }); fresh = true; }
        else if (details.length > 0) {
          const d = details[details.length - 1];
          if (fresh) { d.before = left.join('\n'); d.after = right.join('\n'); fresh = false; }
          else { const tags = (d.tags ??= { before: [], after: [] }); tags.before.push(...left); tags.after.push(...right); }
        }
      } else if (!t.startsWith('*')) text_[rows.indexOf(current)].push(t);
    }
  }
  const changes = rows.map((r, k): BalanceChange => {
    const c = r.change ?? { kind: r.kind, name: r.full, ...(r.grade ? { grade: r.grade } : {}) };
    // the awakened and enhanced versions of a skill fold into the skill
    const skills = [...new Set((c.details ?? []).map((d) => d.skill.replace(/ \((Awakened|Skill Enhance)\)$/, '')))];
    if (skills.length > 0) c.skills = skills;
    const summary = (text_[k] ?? []).join(' ');
    return summary ? { ...c, summary: clip(summary) } : c;
  });
  return { date, changes };
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
  let preview: FeedPost | undefined; // the newest balance preview among the developer notes
  let loaded = 0;
  for (const [id, board] of BOARDS) {
    try {
      const raw = await client.get(`v3.0/article_group/BOARD/${id}/article/list`, {
        interaction_type_code: 'VIEW', content_yn: 'N', summary_yn: 'N', sort_type_code: 'LATEST', translation_yn: 'N', page: '1', size: String(board === 'patch' ? PATCH_LIST : board === 'dev' ? DEV_LIST : PER_BOARD),
      });
      posts.push(...listPosts(raw, board, PER_BOARD));
      if (board === 'dev') preview = listPosts(raw, board, DEV_LIST).find((p) => /Balance Adjustment Preview/i.test(p.title));
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
  const catalog = new Map<string, { code: string } & Info>(cur ? [
    ...cur.heroes.map((h) => [keyOf({ kind: 'hero', name: h.name }), { code: h.code, ...details(h) }] as const),
    ...Object.entries(cur.artifacts).map(([code, x]) => [keyOf({ kind: 'artifact', name: x.name }), { code, ...details(x) }] as const),
  ] : []);
  for (const r of [...added, ...releases]) { // an announced item shows up in the game's data later: take its code and details from there
    const c = catalog.get(keyOf(r));
    if (!c) continue;
    r.code ??= c.code; // no week here: only the comparison of two weeks knows when it appeared
    r.grade ??= c.grade; r.job ??= c.job; r.element ??= c.element;
  }

  let balance: Balance | undefined = old?.balance;
  if (preview) {
    try {
      const raw = await client.get('v3.0/article', { article_id: preview.id, interaction_type_code: 'VIEW', translation_yn: 'N', request_id: 'CM' });
      const parsed = parseBalance(unwrap<{ content: string }>(raw).content, preview.date);
      if (parsed) {
        const changes = parsed.changes.map((c) => { const k = catalog.get(keyOf(c)); return k ? { ...c, code: k.code, ...(k.job ? { job: k.job } : {}), ...(k.element ? { element: k.element } : {}) } : c; });
        balance = { id: preview.id, title: preview.title, url: preview.url, posted: preview.date, date: parsed.date, changes };
      } else log(`feed: balance preview ${preview.id} has no table of changes`);
    } catch (e) {
      log(`feed: balance preview ${preview.id} failed: ${(e as Error).message}`);
    }
  }
  const fresh = added;

  await mkdir(outDir, { recursive: true });
  await writeFile(path, JSON.stringify({ updated: now(), posts, releases: [...added, ...releases].sort((a, b) => when(b).localeCompare(when(a))).slice(0, KEEP_RELEASES), ...(balance ? { balance } : {}) } satisfies Feed));
  log(`feed: ${posts.length} posts, ${fresh.length} new releases`);
  return 'written';
}

// shortcut: argv[1] compare only works for `tsx scripts/collect/feed.ts`; fine for npm run feed
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await refreshFeed({ outDir: 'public/data', client: createClient({ baseUrl: 'https://api.onstove.com/cwms/' }), log: console.log });
  console.log(result);
  if (result === 'failed') process.exitCode = 1;
}
