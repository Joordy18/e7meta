import { expect, it } from 'vitest';
import { STAT_RANGES } from '../src/shared/stats';

it('has a valid range for each of the 8 stats', () => {
  const entries = Object.entries(STAT_RANGES);
  expect(entries).toHaveLength(8);
  for (const [, [min, max]] of entries) expect(min).toBeLessThan(max);
});
