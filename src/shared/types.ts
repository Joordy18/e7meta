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
};
export type Index = { periods: string[] }; // period start dates, newest first

// Other game modes: how often each hero shows up in successful teams (the guide's "success rate" rankings)
export type ModeEntry = { code: string; name: string; share: number }; // share in %
export type ModeList = {
  id: string; // e.g. hunt-1-13, abyss-120, expedition-1-1
  mode: 'hunts' | 'abyss' | 'expedition';
  title: string; // e.g. "Wyvern Hunt, Hell"
  period?: Period; // absent when the API does not say
  heroes: ModeEntry[]; // highest share first
};
export type RiftInfo = { title: string; description: string; start: string; end: string; elements: string[] };
export type Modes = { key: string; lists: ModeList[]; rift?: RiftInfo }; // key = hunt period start the lists were fetched for
