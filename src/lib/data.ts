import type { ArenaIndex, ArenaSeason, Gear, HeroSnapshot, HeroSummary, Index, ModeList, Modes, SkillsFile, Teams, Feed, NamesFile, LimitedFile, RtaBuilds, RtaPairs, RtaStats, RtaTable, Trends } from '../shared/types';

export const normalize = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export type HeroFilter = { text: string; job?: string; element?: string; grade?: number };

export function filterHeroes(heroes: HeroSummary[], f: HeroFilter): HeroSummary[] {
  const q = normalize(f.text.trim());
  return heroes.filter(
    (h) =>
      normalize(h.name).includes(q) &&
      (!f.job || h.job === f.job) &&
      (!f.element || h.element === f.element) &&
      (!f.grade || h.grade === f.grade),
  );
}

export type SortKey = 'name' | 'topSet' | 'topArtifact';

/** New array; name A→Z (accents aside), or by top share, highest first, heroes without a share last, ties by name. */
export function sortHeroes(heroes: HeroSummary[], key: SortKey): HeroSummary[] {
  const byName = (a: HeroSummary, b: HeroSummary) => normalize(a.name).localeCompare(normalize(b.name));
  if (key === 'name') return [...heroes].sort(byName);
  return [...heroes].sort((a, b) => (b[key] ?? -1) - (a[key] ?? -1) || byName(a, b));
}

/** A data file that does not exist: 404, or the HTML fallback vite dev serves (200 text/html) for a missing file. */
export class NotFoundError extends Error {}

const isJson = (res: Response) => (res.headers.get('content-type') ?? '').includes('json');
const dataUrl = (path: string) => `${import.meta.env.BASE_URL}data/${path}`; // base is './' in the build

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(dataUrl(path));
  if (res.status === 404 || (res.ok && !isJson(res))) throw new NotFoundError(path);
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

// null = no data yet: 404, or the HTML fallback vite dev serves (200 text/html) for a missing file.
export async function loadIndex(): Promise<Index | null> {
  const res = await fetch(dataUrl('index.json'));
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`index.json: HTTP ${res.status}`);
  if (!isJson(res)) return null;
  const body: unknown = await res.json();
  const periods = (body as Partial<Index> | null)?.periods;
  if (!Array.isArray(periods) || !periods.every((p) => typeof p === 'string')) throw new Error('index.json: unexpected shape');
  return { periods };
}

export const loadHeroes = (period: string) => getJson<HeroSummary[]>(`${period}/heroes.json`);
export const loadHero = (period: string, code: string) => getJson<HeroSnapshot>(`${period}/hero/${code}.json`);

/** An extra file of a period (modes, teams, gear); null when that period has none (collected before it existed, or the fetch failed). */
async function loadOptional<T>(period: string, file: string): Promise<T | null> {
  try { return await getJson<T>(`${period}/${file}`); } catch (e) {
    if (e instanceof NotFoundError) return null;
    throw e;
  }
}

export const loadModes = (period: string) => loadOptional<Modes>(period, 'modes.json');
export const loadTeams = (period: string) => loadOptional<Teams>(period, 'teams.json');
export const loadGear = (period: string) => loadOptional<Gear>(period, 'gear.json');

export type ModeUsage = { id: string; mode: ModeList['mode']; title: string; share: number; rank: number };

/** Where a hero shows up across the mode lists: highest share first, with its rank in each list. */
export function heroModeUsage(modes: Modes, code: string): ModeUsage[] {
  const out: ModeUsage[] = [];
  for (const l of modes.lists) {
    const i = l.heroes.findIndex((h) => h.code === code);
    if (i >= 0) out.push({ id: l.id, mode: l.mode, title: l.title, share: l.heroes[i].share, rank: i + 1 });
  }
  return out.sort((a, b) => b.share - a.share);
}

/** World Arena seasons are not tied to a weekly period: they live in data/arena/. null when none were collected. */
export async function loadArenaIndex(): Promise<ArenaIndex | null> {
  try { return await getJson<ArenaIndex>('arena/index.json'); } catch (e) {
    if (e instanceof NotFoundError) return null;
    throw e;
  }
}
export const loadArenaSeason = (id: string) => getJson<ArenaSeason>(`arena/${id}.json`);

/** Skill descriptions of every hero (from epic7db.com); not tied to a weekly period. null when not collected yet. */
export async function loadSkills(): Promise<SkillsFile | null> {
  try { return await getJson<SkillsFile>('skills.json'); } catch (e) {
    if (e instanceof NotFoundError) return null;
    throw e;
  }
}

/** Week-over-week build shifts (trends.json); not tied to a period. null when not computed yet (fewer than two weeks). */
export async function loadTrends(): Promise<Trends | null> {
  try { return await getJson<Trends>('trends.json'); } catch (e) {
    if (e instanceof NotFoundError) return null;
    throw e;
  }
}

/** Latest official posts and new heroes / artifacts (feed.json); not tied to a period. null when not collected yet. */
export async function loadFeed(): Promise<Feed | null> {
  try { return await getJson<Feed>('feed.json'); } catch (e) {
    if (e instanceof NotFoundError) return null;
    throw e;
  }
}

/** Official posts about the limited-time modes (limited.json); null when not collected yet. */
export async function loadLimited(): Promise<LimitedFile | null> {
  try { return await getJson<LimitedFile>('limited.json'); } catch (e) {
    if (e instanceof NotFoundError) return null;
    throw e;
  }
}

/** RTA counts from the recent battles of the top players (rta/stats.json); null when not collected yet. */
export async function loadRta(): Promise<RtaStats | null> {
  try { return await getJson<RtaStats>('rta/stats.json'); } catch (e) {
    if (e instanceof NotFoundError) return null;
    throw e;
  }
}

/** The names of heroes, artifacts and sets in a language (names/<lang>.json); null when not collected for that language. */
export async function loadNames(lang: string): Promise<NamesFile | null> {
  try { return await getJson<NamesFile>(`names/${lang}.json`); } catch (e) {
    if (e instanceof NotFoundError) return null;
    throw e;
  }
}

/** What each hero wears in the RTA battles counted (rta/builds.json); null when not collected yet. */
export async function loadRtaBuilds(): Promise<RtaBuilds | null> {
  try { return await getJson<RtaBuilds>('rta/builds.json'); } catch (e) {
    if (e instanceof NotFoundError) return null;
    throw e;
  }
}

/** The partners and matchups of each hero in the RTA battles counted (rta/pairs.json); null when not collected yet. */
export async function loadRtaPairs(): Promise<RtaPairs | null> {
  try { return await getJson<RtaPairs>('rta/pairs.json'); } catch (e) {
    if (e instanceof NotFoundError) return null;
    throw e;
  }
}

/** Every partner and opponent seen often enough, for the full table of a hero page (rta/table.json); null when not collected yet. */
export async function loadRtaTable(): Promise<RtaTable | null> {
  try { return await getJson<RtaTable>('rta/table.json'); } catch (e) {
    if (e instanceof NotFoundError) return null;
    throw e;
  }
}
