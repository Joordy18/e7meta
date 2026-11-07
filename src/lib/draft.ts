import type { RtaHeroPairs } from '../shared/types';
import type { RtaRow } from './rta';

export type Side = 'you' | 'bot';
export const PRE_BANS = 2; // heroes each side removes from the draft before it starts
/** The third hero a team picks is protected: the game does not let the other side ban it (no such ban in 48,000 recorded teams). */
export const PROTECTED_SLOT = 2;
const TOP_PICK = 6; // the bot picks among the six most picked heroes that are left
const TOP_PREBAN = 6; // and pre-bans among the six most pre-banned ones

/** Who picks at each of the 10 turns: the side that picks first takes turns 1, 4, 5, 8 and 9, the other one 2, 3, 6, 7 and 10 (the 1-2-2-2-2-1 draft). */
export const pickSides = (youFirst: boolean): Side[] =>
  (['A', 'B', 'B', 'A', 'A', 'B', 'B', 'A', 'A', 'B'] as const).map((s) => ((s === 'A') === youFirst ? 'you' : 'bot'));

/** A small seeded random generator: the same seed plays the same game, which is what the tests need. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Rarity = 'meta' | 'mainstream' | 'offmeta' | 'rare';
/** How common a hero is, by the share of battles it is picked in. */
export const rarityOf = (pick: number): Rarity => (pick >= 20 ? 'meta' : pick >= 8 ? 'mainstream' : pick >= 2 ? 'offmeta' : 'rare');

function weighted<T>(items: T[], weight: (t: T) => number, rng: () => number): T {
  const total = items.reduce((s, t) => s + weight(t), 0);
  let at = rng() * total;
  for (const t of items) { at -= weight(t); if (at <= 0) return t; }
  return items[items.length - 1];
}

/** The bot pre-bans PRE_BANS different heroes drawn among the most pre-banned ones, weighted by their pre-ban rate. Both sides choose blind: in 42% of the recorded battles they removed the same hero. */
export function botPreBans(pool: RtaRow[], rng: () => number): string[] {
  const left = [...pool].sort((a, b) => b.preban - a.preban || a.code.localeCompare(b.code)).slice(0, TOP_PREBAN);
  const out: string[] = [];
  while (out.length < PRE_BANS && left.length > 0) {
    const r = weighted(left, (x) => Math.max(x.preban, 0.1), rng);
    out.push(r.code);
    left.splice(left.indexOf(r), 1);
  }
  return out;
}

/** The bot picks like the players of the sample: among the most picked heroes that are left, weighted by their pick rate. */
export function botPick(pool: RtaRow[], unavailable: ReadonlySet<string>, rng: () => number): string {
  const left = pool.filter((r) => !unavailable.has(r.code)).sort((a, b) => b.pick - a.pick || a.code.localeCompare(b.code)).slice(0, TOP_PICK);
  return weighted(left, (x) => Math.max(x.pick, 0.1), rng).code;
}

const winOf = (pool: RtaRow[], code: string) => pool.find((r) => r.code === code)?.win ?? null;

/** The heroes of a team (in pick order) that the other side may ban: all but the protected third pick. */
export const bannable = (team: string[]): string[] => team.filter((_, i) => i !== PROTECTED_SLOT);

/** The bot bans the hero of your team that wins most, leaving out the protected one. */
export function botBan(pool: RtaRow[], yourTeam: string[]): string {
  return bannable(yourTeam).sort((a, b) => (winOf(pool, b) ?? -1) - (winOf(pool, a) ?? -1) || a.localeCompare(b))[0];
}

export type Draft = { you: string[]; bot: string[]; youBan: string; botBan: string; youPreBans: string[]; botPreBans?: string[] }; // teams in pick order
export type SideScore = { avgWin: number | null; typicalPick: number; style: Rarity };
/** A partnership or a matchup that stands out in the recorded battles (see rta/pairs.json): side is the team it helps, edge the points it adds to that team's win rate. */
export type PairNote = { kind: 'with' | 'over' | 'under'; side: Side; a: string; b: string; edge: number };
export type DraftScore = {
  score: number; you: SideScore; bot: SideScore;
  synergy: { you: number; bot: number } | null; // points of partnership in each team, null without pair data
  matchup: number | null; // points of matchup for your team (negative: the other team is favoured)
  notes: PairNote[]; // the strongest partnerships and matchups, most important first
  banRank: number | null; // your ban among the heroes you could ban, by win rate: 1 = the best target; null when the hero is protected or not in the team
  botBanRank: number | null; // the same for the ban of the other side
  bannable: number; // how many heroes a side could ban (all but the protected one)
  preBanRanks: { code: string; rank: number }[]; // your pre-bans among all heroes, by pre-ban rate: 1 = the most pre-banned
  botPreBanRanks: { code: string; rank: number }[]; // the pre-bans of the other side, when given
};

const mean = (xs: number[]) => (xs.length > 0 ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const round2 = (n: number) => Math.round(n * 100) / 100;

function sideScore(pool: RtaRow[], picks: string[], banned: string): SideScore {
  const wins = picks.filter((c) => c !== banned).map((c) => winOf(pool, c)).filter((w): w is number => w !== null);
  const rates = picks.map((c) => Math.max(pool.find((r) => r.code === c)?.pick ?? 0, 0.1)); // a hero without data counts as very rare
  const typical = Math.exp(rates.reduce((s, r) => s + Math.log(r), 0) / Math.max(rates.length, 1));
  const avg = mean(wins);
  return { avgWin: avg === null ? null : round2(avg), typicalPick: round2(typical), style: rarityOf(typical) };
}

// The edges of listed pairs are added up and damped by one constant. Fitted on the battles: pairs listed from the older half, the weight measured on the newer half
// (37,621 battles, after the sample was widened with opponents): regression ratio 0.18, and the side the score favours won 58.1% of the time at 0.2 against 54.9% without the pairs (0.5 gives 57.4%).
// shortcut: one weight for every kind of pair, refit it when the sample has grown.
const PAIR_WEIGHT = 0.2;
const NOTES = 4;
const mid = (xs: number[]) => (xs.length > 0 ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/** What the listed partnerships (inside each team) and matchups (across) of the heroes that play add up to; each pair counts once, a pair listed from both sides by the mean of the two. */
function pairsOf(pairs: Record<string, RtaHeroPairs> | undefined, you: string[], bot: string[]) {
  if (!pairs) return null;
  const notes: PairNote[] = [];
  const together = (team: string[], side: Side) => {
    let sum = 0;
    team.forEach((a, i) => team.slice(i + 1).forEach((b) => {
      const e = mid([pairs[a]?.with.find((p) => p.code === b)?.edge, pairs[b]?.with.find((p) => p.code === a)?.edge].filter((x): x is number => x !== undefined));
      if (e !== null) { sum += e; notes.push({ kind: 'with', side, a, b, edge: round2(e) }); }
    }));
    return sum;
  };
  const edgeVs = (x: string, y: string) => { const l = pairs[x]; return l?.over.find((p) => p.code === y)?.edge ?? l?.under.find((p) => p.code === y)?.edge; };
  let matchup = 0;
  for (const a of you) for (const b of bot) {
    const e = mid([edgeVs(a, b), ...[edgeVs(b, a)].map((x) => (x === undefined ? undefined : -x))].filter((x): x is number => x !== undefined));
    if (e === null || e === 0) continue;
    matchup += e;
    notes.push(e > 0 ? { kind: 'over', side: 'you', a, b, edge: round2(e) } : { kind: 'under', side: 'you', a, b, edge: round2(e) });
  }
  const synergy = { you: together(you, 'you'), bot: together(bot, 'bot') };
  notes.sort((x, y) => Math.abs(y.edge) - Math.abs(x.edge) || x.a.localeCompare(y.a) || x.b.localeCompare(y.b));
  return { synergy, matchup, notes: notes.slice(0, NOTES) };
}

/**
 * Scores a finished draft. The two sides are compared by the average win rate of the heroes that actually play (the banned one is left out):
 * 50 plus ten points per point of advantage, between 0 and 100. It also says how common the picks are, and how good the ban and the pre-bans were.
 * With the pair data of rta/pairs.json, the partnerships and matchups that stand out add PAIR_WEIGHT of their points to the advantage.
 */
export function scoreDraft(pool: RtaRow[], d: Draft, pairs?: Record<string, RtaHeroPairs>): DraftScore {
  const you = sideScore(pool, d.you, d.botBan);
  const bot = sideScore(pool, d.bot, d.youBan);
  const played = (team: string[], banned: string) => team.filter((c) => c !== banned);
  const pa = pairsOf(pairs, played(d.you, d.botBan), played(d.bot, d.youBan));
  const advantage = (you.avgWin !== null && bot.avgWin !== null ? you.avgWin - bot.avgWin : 0) + (pa ? PAIR_WEIGHT * (pa.synergy.you - pa.synergy.bot + pa.matchup) : 0);
  const rankOf = (team: string[], banned: string) => {
    const at = bannable(team).sort((a, b) => (winOf(pool, b) ?? -1) - (winOf(pool, a) ?? -1) || a.localeCompare(b)).indexOf(banned);
    return at < 0 ? null : at + 1;
  };
  const byPreban = [...pool].sort((a, b) => b.preban - a.preban || a.code.localeCompare(b.code)).map((r) => r.code);
  const preRanks = (codes: string[]) => codes.map((code) => ({ code, rank: byPreban.indexOf(code) + 1 })).filter((x) => x.rank > 0);
  return {
    score: Math.max(0, Math.min(100, Math.round(50 + advantage * 10))), you, bot,
    synergy: pa ? { you: round2(pa.synergy.you), bot: round2(pa.synergy.bot) } : null, matchup: pa ? round2(pa.matchup) : null, notes: pa?.notes ?? [],
    banRank: rankOf(d.bot, d.youBan), botBanRank: rankOf(d.you, d.botBan), bannable: bannable(d.bot).length,
    preBanRanks: preRanks(d.youPreBans), botPreBanRanks: preRanks(d.botPreBans ?? []),
  };
}
