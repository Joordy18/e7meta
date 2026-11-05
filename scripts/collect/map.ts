import { unwrap } from './api';
import type {
  ArtifactEntry, HeroDetail, HeroSummary, ModeEntry, Period, RiftInfo, SetCombo, ShareEntry, StatDistribution, Team,
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

/**
 * Merges combos whose sets are equal as a set ("a,b" + "b,a"), summing shares.
 * Inference, not confirmed against the API: a pair of sets with fixed piece counts (4+2) has a single
 * gear layout, so the reversed order is the same build. Display order is the highest-share variant's.
 */
export function mergeCombos(combos: SetCombo[]): SetCombo[] {
  const byKey = new Map<string, { best: SetCombo; total: number }>();
  for (const c of combos) {
    const key = [...c.codes].sort().join('|');
    const cur = byKey.get(key);
    if (!cur) byKey.set(key, { best: c, total: c.share });
    else {
      cur.total += c.share;
      if (c.share > cur.best.share) cur.best = c;
    }
  }
  return [...byKey.values()]
    .map(({ best, total }) => ({ sets: best.sets, codes: best.codes, share: Math.round(total * 100) / 100 }))
    .sort((a, b) => b.share - a.share);
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
    // the API pads both lists with empty {share: 0} filler rows: not results
    combos: mergeCombos(
      (v.hero_eqips ?? [])
        .filter((c: any) => c.rank_sets && c.eqip_rank_share > 0)
        .map((c: any) => {
          const codes = String(c.rank_sets).split(',').map((s) => `set_${s}`);
          return { sets: codes.map((code) => setNames[code] ?? code), codes, share: c.eqip_rank_share };
        }),
    ),
    artifacts: (v.hero_arti ?? [])
      .filter((a: any) => a.rank_arti && a.arti_rank_share > 0)
      .map((a: any) => ({ code: a.rank_arti, name: a.rank_arti_name, share: a.arti_rank_share })),
    stats,
  };
}

/** A mode's hero ranking. The share field differs by mode: specific_gravity (hunts, abyss), success_rate (expedition). */
export function mapModeList(raw: unknown, shareField: 'specific_gravity' | 'success_rate'): ModeEntry[] {
  return list(raw)
    .map((h) => ({ code: h.hero_code, name: h.hero_name, share: h[shareField] as number }))
    .filter((h) => h.share > 0)
    .sort((a, b) => b.share - a.share);
}

export function mapRift(raw: unknown): RiftInfo {
  const v = unwrap<any>(raw);
  return {
    title: v.crack_title, description: v.crack_desc, start: v.season_start_date, end: v.season_end_date,
    elements: Array.isArray(v.attribute_code) ? v.attribute_code : [],
  };
}

/** A team ranking: hero codes of each team (the selected hero comes first) and the team's share, best first. */
export function mapTeams(raw: unknown, shareField: 'specific_gravity' | 'success_rate'): Team[] {
  return list(raw)
    .filter((t) => Array.isArray(t.hero_list) && t.hero_list.length > 0)
    .map((t) => ({ share: t[shareField] as number, heroes: (t.hero_list as any[]).map((h) => h.hero_code as string) }))
    .filter((t) => t.share > 0)
    .sort((a, b) => b.share - a.share);
}
