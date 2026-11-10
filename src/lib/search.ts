import { normalize } from './data';
import { guides } from './guides';
import { groupModes } from './modes';
import type { NameLookup } from '../i18n';
import type { Gear, HeroSummary, Modes } from '../shared/types';

export type SearchItem = { kind: 'hero' | 'artifact' | 'mode' | 'guide' | 'page'; label: string; href: string; code?: string; alt?: string }; // alt: the English name, when label is a translation

const KIND_ORDER: SearchItem['kind'][] = ['hero', 'artifact', 'mode', 'guide', 'page'];
export type PageLink = [label: string, href: string];
const PAGES: PageLink[] = [['Home', '#/'], ['Heroes', '#/heroes'], ['Modes', '#/modes'], ['Tier list', '#/tiers'], ['RTA', '#/arena'], ['Tools', '#/tools'], ['Draft simulator', '#/tools/draft'], ['Team builder', '#/tools/team'], ['Guides', '#/guides'], ['About and FAQ', '#/about']];

/** Everything that can be jumped to: the pages and guides always, heroes, artifacts and modes when their data is loaded. */
export function buildSearchItems(data: { heroes?: HeroSummary[]; gear?: Gear | null; modes?: Modes | null }, name?: Pick<NameLookup, 'hero' | 'artifact'>, pages: PageLink[] = PAGES): SearchItem[] {
  const named = (label: string, shown: string) => (shown === label ? { label } : { label: shown, alt: label });
  return [
    ...(data.heroes ?? []).map((h): SearchItem => ({ kind: 'hero', ...named(h.name, name?.hero(h.code, h.name) ?? h.name), href: `#/hero/${h.code}`, code: h.code })),
    ...Object.values(data.gear?.artifacts ?? {}).map((a): SearchItem => ({ kind: 'artifact', ...named(a.name, name?.artifact(a.code, a.name) ?? a.name), href: `#/artifact/${a.code}`, code: a.code })),
    ...(data.modes ? groupModes(data.modes).map((g): SearchItem => ({ kind: 'mode', label: g.group, href: `#/modes/${g.lists[0].id}` })) : []),
    ...guides.map((g): SearchItem => ({ kind: 'guide', label: g.title, href: `#/guides/${g.slug}` })),
    ...pages.map(([label, href]): SearchItem => ({ kind: 'page', label, href })),
  ];
}

/** 0: the name starts with the text, 1: a word of it does, 2: it appears inside, null: no match. Every word of the query must match. */
function rank(label: string, words: string[]): number | null {
  const name = normalize(label);
  let worst = 0;
  for (const w of words) {
    const at = name.indexOf(w);
    if (at < 0) return null;
    const r = at === 0 ? 0 : /[^a-z0-9]/.test(name[at - 1]) ? 1 : 2;
    if (r > worst) worst = r;
  }
  return worst;
}

/** The best matches for a query (case and accents ignored), best first, heroes before other kinds on equal rank. */
export function searchItems(items: SearchItem[], query: string, limit: number): SearchItem[] {
  const words = normalize(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  return items
    .flatMap((i) => {
      const ranks = [rank(i.label, words), i.alt ? rank(i.alt, words) : null].filter((r): r is number => r !== null); // the shown name or the English one
      return ranks.length === 0 ? [] : [{ i, r: Math.min(...ranks) }];
    })
    .sort((a, b) => a.r - b.r || KIND_ORDER.indexOf(a.i.kind) - KIND_ORDER.indexOf(b.i.kind) || a.i.label.localeCompare(b.i.label))
    .slice(0, limit)
    .map((x) => x.i);
}
