import type { ModeList, Modes, Team, Teams } from '../shared/types';

const teamKey = (t: Team) => [...t.heroes].sort().join('|');

/** The best teams of a mode list: every hero's teams merged, a team counted once whatever its order, best share first. */
export function bestTeams(teams: Teams | null, listId: string, n: number): Team[] {
  const byKey = new Map<string, Team>();
  for (const heroTeams of Object.values(teams?.lists[listId] ?? {})) {
    for (const t of heroTeams) {
      const k = teamKey(t);
      if (!byKey.has(k)) byKey.set(k, t);
    }
  }
  return [...byKey.values()].sort((a, b) => b.share - a.share).slice(0, n);
}

export type HeroTeam = { listId: string; title: string; team: Team };

/** The best teams a hero plays in, across every mode list, with the list they come from. */
export function heroTeams(teams: Teams, modes: Modes, code: string, n: number): HeroTeam[] {
  const titles = new Map(modes.lists.map((l) => [l.id, l.title]));
  const out: HeroTeam[] = [];
  for (const [listId, byHero] of Object.entries(teams.lists)) {
    for (const team of byHero[code] ?? []) out.push({ listId, title: titles.get(listId) ?? listId, team });
  }
  return out.sort((a, b) => b.team.share - a.team.share).slice(0, n);
}

/** Name of the guide file (src/content/guides/<slug>.md) for a boss or mode: "Golem Hunt" -> golem-hunt. */
export function guideSlug(list: Pick<ModeList, 'mode' | 'group'>): string {
  return list.group.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export type ModeGroup = { mode: ModeList['mode']; group: string; lists: ModeList[] };

/** Lists grouped by boss or mode ("Golem Hunt": Hell, Hard, Normal), in the order of the data. */
export function groupModes(modes: Modes): ModeGroup[] {
  const groups = new Map<string, ModeGroup>();
  for (const l of modes.lists) {
    const g = groups.get(l.group) ?? { mode: l.mode, group: l.group, lists: [] };
    g.lists.push(l);
    groups.set(l.group, g);
  }
  return [...groups.values()];
}

export type Teammate = { code: string; teams: number; total: number; share: number };

/**
 * The heroes that most often share a team with `code` in the collected team rankings. A lineup is counted once per mode list,
 * however many heroes it was listed under; the same lineup in two modes counts twice. Most teams first, then the combined share
 * of those teams, then code. `total` is how many teams include the hero.
 */
export function teammates(teams: Teams, code: string, n: number): Teammate[] {
  const seen = new Set<string>();
  const mine: Team[] = [];
  for (const [listId, byHero] of Object.entries(teams.lists)) {
    for (const t of Object.values(byHero).flat()) {
      const key = `${listId}:${teamKey(t)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (t.heroes.includes(code)) mine.push(t);
    }
  }
  const byCode = new Map<string, Teammate>();
  for (const t of mine) {
    for (const h of t.heroes) {
      if (h === code) continue;
      const e = byCode.get(h) ?? { code: h, teams: 0, total: mine.length, share: 0 };
      e.teams++;
      e.share = Math.round((e.share + t.share) * 100) / 100;
      byCode.set(h, e);
    }
  }
  return [...byCode.values()].sort((a, b) => b.teams - a.teams || b.share - a.share || a.code.localeCompare(b.code)).slice(0, n);
}
