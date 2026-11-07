export type Period = { start: string; end: string }; // YYYY-MM-DD
export type HeroSummary = {
  code: string; name: string; grade: number; job: string; element: string;
  topSet?: number; // share (%) of the most worn set, used to sort the hero list
  topArtifact?: number; // share (%) of the most worn artifact
};
export type ShareEntry = { code: string; name: string; share: number }; // share in %
export type ArtifactEntry = ShareEntry & { effect: string };
export type SetCombo = { sets: string[]; codes: string[]; share: number }; // sets = display names, codes = set_<code> (same order, for icons)
export type StatKey =
  | 'attack' | 'defense' | 'health' | 'speed'
  | 'critChance' | 'critDamage' | 'effectiveness' | 'effectResistance';
export type StatDistribution = Record<StatKey, number[]>; // 10 buckets, counts
export type HeroDetail = { period: Period; combos: SetCombo[]; artifacts: ShareEntry[]; stats: StatDistribution };
export type HeroSnapshot = {
  hero: HeroSummary;
  period: Period;
  sets: ShareEntry[];
  artifacts: ArtifactEntry[];
  detail?: HeroDetail;
  skills?: string[]; // names of skills 1 to 3
  exclusive?: ExclusiveUse[]; // most used exclusive equipment upgrades, best first (heroes that have one)
};
export type ExclusiveUse = { skill: number; option: number; share: number }; // the upgrade option (1 to 3) of the exclusive equipment, which skill (1 to 3) it improves, % of players
export type Index = { periods: string[] }; // period start dates, newest first

// Other game modes: how often each hero shows up in successful teams (the guide's "success rate" rankings)
export type ModeEntry = { code: string; name: string; share: number }; // share in %
export type ModeList = {
  id: string; // e.g. hunt-1-13, abyss-120, challenge-20, expedition-1-1
  mode: 'hunts' | 'abyss' | 'challenge' | 'expedition'; // challenge: the abyss Challenge Mode, floors 1 to 20
  title: string; // e.g. "Wyvern Hunt, Hell"
  group: string; // the boss or mode, e.g. "Wyvern Hunt", "Abyss", "Moroi Expedition"
  variant: string; // the difficulty, floor or level, e.g. "Hell", "Floor 120", "Level 3"
  period?: Period; // absent when the API does not say
  heroes: ModeEntry[]; // highest share first
};
export type RiftInfo = { title: string; description: string; start: string; end: string; elements: string[] };
export type Modes = { key: string; lists: ModeList[]; rift?: RiftInfo }; // key = hunt period start the lists were fetched for

// The best teams (up to 4 heroes) that include a given hero, per mode list. Shares are global: the same team has the same share whichever hero you start from.
export type Team = { share: number; heroes: string[] }; // hero codes, share in %
export type Teams = { key: string; lists: Record<string, Record<string, Team[]>> }; // list id -> hero code -> teams, best first

// Artifact catalog, with the heroes wearing each most (same period as the gear ranking)
export type ArtifactValue = { level1: string; max: string }; // what the nth "@" of the description stands for
export type ArtifactInfo = {
  code: string; name: string; job: string; grade: number;
  attack: number; health: number; maxAttack: number; maxHealth: number; // base (level 1) and max level stats
  description: string; // with "@" placeholders, filled from values
  values: ArtifactValue[];
  heroes: ModeEntry[]; // highest share first
};
export type Gear = { key: string; artifacts: Record<string, ArtifactInfo> };

// World Arena (RTA, the draft mode): the developers' season infographics. One file per season, rates in %.
export type ArenaTier = 'champion' | 'warlord' | 'emperor' | 'legend'; // "this league and above"
export type PreBanRow = { hero: string; rate: number };
export type DraftRow = { hero: string; rate: number; ban: number; win: number }; // rate = first pick or pick rate
export type ArenaSeason = {
  id: string; title: string; season: string; published: string; url: string; // season = "Spring 2026", published = YYYY-MM-DD
  preBan: Record<ArenaTier, PreBanRow[]>; // best first, 20 rows
  firstPick: Record<ArenaTier, DraftRow[]>;
  pick: Record<ArenaTier, DraftRow[]>;
  leagues: { league: string; avgWinRate: number; players: number }[]; // global, top leagues
  cutoffs: { league: string; points: number }[];
};
export type ArenaIndex = { seasons: { id: string; season: string; published: string; title: string; url: string }[] }; // newest first

// Skill descriptions, from epic7db.com (a fan site; the game's own guide only names the skills). One file for all heroes.
export type SkillInfo = {
  name: string;
  cooldown?: string; // "Passive" or "3 Turns"; absent for a basic attack
  soulGain?: number;
  effects: { name: string; text: string }[]; // buffs, debuffs and other effects the skill applies
  description: string; // Markdown: key words in **bold**
  soulburn?: string;
  upgrades: { level: number; text: string }[]; // skill enhancements
};
// Exclusive equipment: a stat bonus plus three skill upgrade options (same order as the options of the game's usage ranking)
export type ExclusiveEquipment = {
  name: string;
  stat?: { name: string; min: string; max: string }; // e.g. Effectiveness 8% to 16% (the roll range)
  options: { skill: string; text: string; recommended?: boolean }[]; // option 1 to 3
};
export type SkillsFile = {
  version: number; // 2: includes exclusive equipment; an older file is collected again
  fetchedAt: string; source: string;
  heroes: Record<string, SkillInfo[]>; // hero code -> skills 1 to 3
  exclusive: Record<string, ExclusiveEquipment>; // only the heroes that have one
};

// Week over week: how the share of a hero's sets and artifacts moved between the two latest weeks (in points)
export type BuildShift = { hero: string; name: string; kind: 'set' | 'artifact'; code: string; item: string; before: number; after: number };
export type Trends = { from: string; to: string; builds: BuildShift[] }; // builds: biggest moves first

// What is new in the game: the latest official posts of four boards, and heroes / artifacts that appeared in the data.
export type FeedBoard = 'patch' | 'notice' | 'dev' | 'event';
export type FeedPost = { id: string; board: FeedBoard; title: string; date: string; url: string; image?: string }; // date = YYYY-MM-DD, image = the post's official banner
// A hero or artifact that is new. `announced`: the update post that announced it (the game's data can lag behind); `code` and `since` come
// from the game's data (since = the weekly period that first listed it), so an entry may have only one of the two sources.
export type Release = {
  kind: 'hero' | 'artifact'; name: string; code?: string; since?: string; announced?: { date: string; url: string };
  grade?: number; job?: string; element?: string; // job: the class of a hero, or of the class an artifact is exclusive to; element: heroes only (codes as in heroes.json)
};
// The names of heroes, artifacts and sets in one language (names/<lang>.json), by code; English is the data itself.
export type NamesFile = { lang: string; updated: string; heroes: Record<string, string>; artifacts: Record<string, string>; sets: Record<string, string> };

// A balance preview: the heroes and artifacts the developers will adjust on `date` (their own words), from the latest "Balance Adjustment Preview" post.
// One changed skill: its text before and after (lines joined by "\n"), and the effect labels the developers add ("Damage Dealt Decreased", "Cooldown: 4 Turns").
export type SkillChange = { skill: string; before: string; after: string; tags?: { before: string[]; after: string[] } };
export type BalanceChange = {
  kind: 'hero' | 'artifact'; name: string; grade?: number; skills?: string[]; summary?: string; details?: SkillChange[];
  code?: string; job?: string; element?: string; // from the game's data when the name is known
};
export type Balance = { id: string; title: string; url: string; posted: string; date: string; changes: BalanceChange[] }; // posted, date = YYYY-MM-DD
// Official posts about the limited-time modes (limited.json), newest first per mode id of shared/limited.ts
export type LimitedFile = { updated: string; modes: Record<string, FeedPost[]> };
export type Feed = { updated: string; posts: FeedPost[]; releases: Release[]; balance?: Balance }; // posts: newest first per board, releases: newest first

// RTA statistics counted by us from the recent matches of the top players (one file, the current season). Rates = counts / battles.
export type RtaHeroCount = {
  pick: number; // battles where either side drafted the hero (a banned hero counts)
  played: number; // picks that were not banned afterwards
  win: number; // wins among those that were played
  first: number; // battles where it was the very first pick
  ban: number; // banned after the draft
  preban: number; // battles where it was pre-banned (by either side)
};
// What each hero wears in the battles counted for RTA (rta/builds.json). A combination lists its sets with the one with most pieces first.
export type RtaHeroBuilds = {
  sets: { n: number; combos: { sets: string[]; n: number }[] }; // n: battles with the sets of the hero known; the combos are the most worn
  artifacts: { n: number; top: { code: string; n: number }[] };
};
export type RtaBuilds = { code: string; updated: string; heroes: Record<string, RtaHeroBuilds>; setNames: Record<string, string>; artifactNames: Record<string, string> };

// Partners and matchups of each hero in the RTA battles counted (rta/pairs.json). win: win rate of the pair in %, n: games, edge: points above (or below)
// what the two heroes predict alone. Only pairs seen often enough and clearly off that expectation are listed.
export type RtaPairEntry = { code: string; n: number; win: number; edge: number };
export type RtaHeroPairs = { with: RtaPairEntry[]; over: RtaPairEntry[]; under: RtaPairEntry[] };
export type RtaTableRow = [code: string, games: number, win: number, edge: number, clear: 0 | 1]; // clear: the gap to the expectation is past chance
export type RtaHeroTable = { with: RtaTableRow[]; versus: RtaTableRow[] };
export type RtaTable = { code: string; updated: string; battles: number; minGames: number; heroes: Record<string, RtaHeroTable> };
export type RtaPairs ={ code: string; updated: string; battles: number; minGames: number; heroes: Record<string, RtaHeroPairs> };

// since / until: the day of the oldest and of the newest battle counted (the battles of the season are accumulated run after run)
export type RtaStats = { season: string; code: string; updated: string; players: number; battles: number; since?: string; until?: string; heroes: Record<string, RtaHeroCount> };
