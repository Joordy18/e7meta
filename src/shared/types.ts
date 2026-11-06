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
