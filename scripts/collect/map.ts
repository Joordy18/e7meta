import { unwrap } from './api';
import type {
  ArtifactEntry, HeroDetail, HeroSummary, Period, ShareEntry, StatDistribution,
} from '../../src/shared/types';

const list = (raw: unknown): any[] => unwrap<any>(raw).guide_list ?? [];

export function mapHeroList(raw: unknown): HeroSummary[] {
  return list(raw).map((h) => ({
    code: h.hero_code, name: h.hero_name, grade: h.grade, job: h.job_code, element: h.attribute_code,
  }));
}

export function mapShares(raw: unknown, kind: 'set'): ShareEntry[];
export function mapShares(raw: unknown, kind: 'artifact'): ArtifactEntry[];
export function mapShares(raw: unknown, kind: 'set' | 'artifact'): ShareEntry[] {
  const set = kind === 'set';
  return list(raw)
    .map((e) => ({
      code: e[set ? 'equip_code' : 'artifact_code'],
      name: e[set ? 'equip_name' : 'artifact_name'],
      share: e.specific_gravity,
      ...(set ? {} : { effect: e.info_text }),
    }))
    .filter((e) => e.share > 0)
    .sort((a, b) => b.share - a.share);
}

/** set code -> display name, zero-share entries included */
export function mapSetNames(raw: unknown): Record<string, string> {
  return Object.fromEntries(list(raw).map((e) => [e.equip_code, e.equip_name]));
}

export function mapPeriod(raw: unknown): Period {
  const v = unwrap<any>(raw);
  return { start: v.week_start_date, end: v.week_end_date };
}

const nums = (s: string) => s.split(',').map(Number);

export function mapDetail(raw: unknown, period: Period, setNames: Record<string, string>): HeroDetail | undefined {
  const v = unwrap<any>(raw);
  if (!v.hero_eqips && !v.hero_arti) return undefined;
  if (typeof v.attack_stats !== 'string') return undefined; // placeholder row (no hunt data); a renamed field elsewhere still throws
  const stats: StatDistribution = {
    attack: nums(v.attack_stats),
    defense: nums(v.defense_stats),
    health: nums(v.vitality_statistics),
    speed: nums(v.speed_statistics),
    critChance: nums(v.critical_statistics),
    critDamage: nums(v.critical_hit_statistics),
    effectiveness: nums(v.effective_statistics),
    effectResistance: nums(v.effect_resistance_statistics),
  };
  return {
    period,
    combos: (v.hero_eqips ?? []).map((c: any) => ({
      sets: String(c.rank_sets).split(',').map((s) => setNames[`set_${s}`] ?? `set_${s}`),
      share: c.eqip_rank_share,
    })),
    artifacts: (v.hero_arti ?? []).map((a: any) => ({
      code: a.rank_arti, name: a.rank_arti_name, share: a.arti_rank_share,
    })),
    stats,
  };
}
