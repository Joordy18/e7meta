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
  id: string; // e.g. hunt-1-13, abyss-120, expedition-1-1
  mode: 'hunts' | 'abyss' | 'expedition';
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
export type FeedPost = { id: string; board: FeedBoard; title: string; date: string; url: string }; // date = YYYY-MM-DD
export type Release = { kind: 'hero' | 'artifact'; code: string; name: string; since: string }; // since = the weekly period that first listed it
export type Feed = { updated: string; posts: FeedPost[]; releases: Release[] }; // posts: newest first per board, releases: newest first
