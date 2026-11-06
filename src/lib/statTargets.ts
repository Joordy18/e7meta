import { STAT_RANGES } from '../shared/stats';
import type { StatKey } from '../shared/types';

export const STATS: [StatKey, string][] = [
  ['attack', 'Attack'], ['defense', 'Defense'], ['health', 'Health'], ['speed', 'Speed'],
  ['critChance', 'Crit chance'], ['critDamage', 'Crit damage'], ['effectiveness', 'Effectiveness'],
  ['effectResistance', 'Effect resistance'],
];
export const PERCENT_STATS = new Set<StatKey>(['critChance', 'critDamage', 'effectiveness', 'effectResistance']);
export const num = (n: number) => n.toLocaleString('en-US');
/** "X+" for a lower bound; "Any" when the bound is the stat's minimum (nobody is held back by this stat). */
export const lowerBound = (stat: StatKey, edge: number) =>
  edge <= STAT_RANGES[stat][0] ? 'Any' : `${num(edge)}${PERCENT_STATS.has(stat) ? '%' : ''}+`;

export type StatTarget = {
  typical: [number, number]; // the most common bucket
  median: [number, number]; // the bucket holding the 50th percentile
  top25: number; // lower edge of the bucket holding the 75th percentile: the best-equipped quarter starts here
  top10: number; // same for the 90th percentile
};

/**
 * Turns a 10-bucket distribution into numbers to aim for. Bucket edges assume 10 equal-width buckets
 * between the stat's min and max (an inference, see STAT_RANGES), rounded to whole numbers.
 */
export function statTarget(stat: StatKey, counts: number[]): StatTarget | null {
  const total = counts.reduce((a, b) => a + b, 0);
  if (counts.length === 0 || total <= 0) return null;
  const [lo, hi] = STAT_RANGES[stat];
  const width = (hi - lo) / counts.length;
  const edge = (i: number) => Math.round(lo + i * width);
  const range = (i: number): [number, number] => [edge(i), edge(i + 1)];
  const bucketAt = (q: number) => {
    let cum = 0;
    for (let i = 0; i < counts.length; i++) {
      cum += counts[i];
      if (cum >= total * q - 1e-9) return i;
    }
    return counts.length - 1;
  };
  return {
    typical: range(counts.indexOf(Math.max(...counts))),
    median: range(bucketAt(0.5)),
    top25: edge(bucketAt(0.75)),
    top10: edge(bucketAt(0.9)),
  };
}
