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

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`/data/${path}`);
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

export async function loadIndex(): Promise<Index | null> {
  const res = await fetch('/data/index.json');
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`index.json: HTTP ${res.status}`);
  return res.json() as Promise<Index>;
}

export const loadHeroes = (period: string) => getJson<HeroSummary[]>(`${period}/heroes.json`);
export const loadHero = (period: string, code: string) => getJson<HeroSnapshot>(`${period}/hero/${code}.json`);
