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
