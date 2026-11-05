import type { StatKey } from './types';

// constants from the official site's JS; 10 equal-width buckets between min and max is an inference (unverified)
export const STAT_RANGES: Record<StatKey, [number, number]> = {
  attack: [1200, 5200],
  defense: [800, 2400],
  health: [9000, 25000],
  speed: [110, 270],
  critChance: [15, 100],
  critDamage: [150, 350],
  effectiveness: [0, 180],
  effectResistance: [0, 225],
};
