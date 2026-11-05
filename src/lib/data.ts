import type { HeroSnapshot, HeroSummary, Index } from '../shared/types';

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
