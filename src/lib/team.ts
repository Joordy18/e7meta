import type { RtaHeroTable, RtaTableRow } from '../shared/types';
import type { RtaRow } from './rta';

export type Table = Record<string, RtaHeroTable>;
/** `edge`: points over what the win rates of the two heroes predict; `code`: the other hero of the pair; `games`: how often the pair was seen. */
export type Link = { code: string; edge: number; games: number };
export type Suggestion = { code: string; score: number; win: number | null; withs: Link[]; vs: Link[] };

export const MAX_TEAM = 5;
const round1 = (n: number) => Math.round(n * 10) / 10;
const sum = (links: Link[]) => round1(links.reduce((s, l) => s + l.edge, 0));
// only gaps clearly past chance count (the `clear` flag of rta/table.json), the same rule as the short lists the draft score uses
const clearRow = (rows: RtaTableRow[] | undefined, code: string) => { const r = rows?.find((x) => x[0] === code); return r && r[4] === 1 ? r : undefined; };

/** What the partnership of `a` with `b` adds, from the records of either of them (the mean when both have it); null when it does not clearly stand out. */
export function withLink(table: Table, a: string, b: string): Link | null {
  const rows = [clearRow(table[a]?.with, b), clearRow(table[b]?.with, a)].filter((r): r is RtaTableRow => !!r);
  return rows.length === 0 ? null : { code: b, edge: round1(rows.reduce((s, r) => s + r[3], 0) / rows.length), games: Math.max(...rows.map((r) => r[1])) };
}

/** What `a` gains against `b` (negative: it loses more than expected), from either side's record; null when it does not clearly stand out. */
export function versusLink(table: Table, a: string, b: string): Link | null {
  const mine = clearRow(table[a]?.versus, b);
  const theirs = clearRow(table[b]?.versus, a);
  const edges = [mine ? mine[3] : null, theirs ? -theirs[3] : null].filter((e): e is number => e !== null);
  return edges.length === 0 ? null : { code: b, edge: round1(edges.reduce((s, e) => s + e, 0) / edges.length), games: Math.max(mine?.[1] ?? 0, theirs?.[1] ?? 0) };
}

const links = (found: (Link | null)[]) => found.filter((l): l is Link => l !== null);

/**
 * The heroes that fit best next to `team` (and against `foes`): the hero's win rate over 50 plus the points of its partnerships and matchups that clearly stand out.
 * (In the draft score the same two terms are weighted 1/5 and 0.2: one weight for both, so the order is the same.) Best first; heroes already chosen are left out.
 */
export function suggest(pool: RtaRow[], table: Table, team: string[], foes: string[]): Suggestion[] {
  const taken = new Set([...team, ...foes]);
  return pool.filter((r) => !taken.has(r.code)).map((r) => {
    const withs = links(team.map((t) => withLink(table, r.code, t)));
    const vs = links(foes.map((f) => versusLink(table, r.code, f)));
    return { code: r.code, win: r.win, withs, vs, score: round1((r.win ?? 50) - 50 + sum(withs) + sum(vs)) };
  }).sort((a, b) => b.score - a.score || a.code.localeCompare(b.code));
}

/** The heroes that beat `team` most (the sum of what each gains against your heroes, clearly past chance only), worst first; those that do not beat it are left out. */
export function threats(pool: RtaRow[], table: Table, team: string[]): Suggestion[] {
  return pool.filter((r) => !team.includes(r.code)).map((r) => {
    const vs = links(team.map((t) => versusLink(table, r.code, t)));
    return { code: r.code, win: r.win, withs: [], vs, score: sum(vs) };
  }).filter((s) => s.score > 0).sort((a, b) => b.score - a.score || a.code.localeCompare(b.code));
}

/** The points of partnership inside `team`, and of matchup of `team` against `foes` (negative: the opponents are favoured); null when no pair stands out. */
export function summary(table: Table, team: string[], foes: string[]) {
  const together = links(team.flatMap((a, i) => team.slice(i + 1).map((b) => withLink(table, a, b))));
  const across = links(team.flatMap((a) => foes.map((b) => versusLink(table, a, b))));
  return { synergy: together.length > 0 ? sum(together) : null, matchup: across.length > 0 ? sum(across) : null };
}
