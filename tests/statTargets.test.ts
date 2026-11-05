import { describe, expect, it } from 'vitest';
import { statTarget } from '../src/lib/statTargets';

describe('statTarget', () => {
  // speed spans 110..270: 10 buckets of 16
  const counts = [0, 0, 10, 40, 30, 10, 5, 3, 2, 0];

  it('gives the most common bucket as a range', () => {
    expect(statTarget('speed', counts)!.typical).toEqual([158, 174]);
  });
  it('gives the bucket holding the median', () => {
    expect(statTarget('speed', counts)!.median).toEqual([158, 174]);
  });
  it('gives where the top 25% and top 10% start (lower edge of the bucket holding the 75th / 90th percentile)', () => {
    const t = statTarget('speed', counts)!;
    expect(t.top25).toBe(174);
    expect(t.top10).toBe(190);
  });
  it('rounds edges to whole numbers', () => {
    // crit chance spans 15..100: buckets of 8.5
    expect(statTarget('critChance', [0, 0, 0, 0, 0, 0, 0, 0, 0, 1])!.typical).toEqual([92, 100]);
    expect(statTarget('critChance', [1, 0, 0, 0, 0, 0, 0, 0, 0, 0])!.typical).toEqual([15, 24]);
  });
  it('picks the first bucket on a tie', () => {
    expect(statTarget('speed', [5, 5, 0, 0, 0, 0, 0, 0, 0, 0])!.typical).toEqual([110, 126]);
  });
  it('returns null when nobody is counted', () => {
    expect(statTarget('speed', new Array(10).fill(0))).toBeNull();
    expect(statTarget('speed', [])).toBeNull();
  });
});
