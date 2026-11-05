import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { mapDetail, mapHeroList, mapPeriod, mapSetNames, mapShares } from '../scripts/collect/map';

const fx = (n: string) => JSON.parse(readFileSync(`tests/fixtures/${n}.json`, 'utf8'));
const heroList = fx('hero-list');
const equip = fx('hero-equip-ranking');
const artifact = fx('hero-artifact-ranking');
const detail = fx('hero-detail');
const period = { start: '2026-10-29', end: '2026-11-04' };
const names = { set_immune: 'Set Immunité', set_riposte: 'Set Réaction' };

describe('mapHeroList', () => {
  it('maps all 392 heroes', () => {
    const heroes = mapHeroList(heroList);
    expect(heroes).toHaveLength(392);
    expect(heroes).toContainEqual({ code: 'c1176', name: 'Setsuka', grade: 5, job: 'assassin', element: 'fire' });
  });
});

describe('mapShares', () => {
  it('maps sets, sorted by share desc', () => {
    const sets = mapShares(equip, 'set');
    expect(sets[0]).toEqual({ code: 'set_riposte', name: 'Set Réaction', share: 23.86 });
    expect(sets.map((s) => s.share)).toEqual([...sets.map((s) => s.share)].sort((a, b) => b - a));
  });
  it('drops zero-share entries', () => {
    const raw = { code: 0, value: { guide_list: [
      { equip_code: 'a', equip_name: 'A', specific_gravity: 0 },
      { equip_code: 'b', equip_name: 'B', specific_gravity: 3 },
    ] } };
    expect(mapShares(raw, 'set').map((s) => s.code)).toEqual(['b']);
  });
  it('maps artifacts with their effect', () => {
    const arts = mapShares(artifact, 'artifact');
    expect(arts[0].code).toBe('efa29');
    expect(arts[0].share).toBe(77.81);
    expect((arts[0] as { effect: string }).effect).not.toBe('');
  });
});

describe('mapSetNames', () => {
  it('maps every set code to its name', () => {
    const m = mapSetNames(equip);
    expect(Object.keys(m)).toHaveLength(24);
    expect(m.set_riposte).toBe('Set Réaction');
  });
});

describe('mapPeriod', () => {
  it('maps week dates', () => {
    expect(mapPeriod(fx('hunt-last-update-time'))).toEqual(period);
  });
});

describe('mapDetail', () => {
  const d = mapDetail(detail, period, names)!;
  it('maps combos through set_<code>', () => {
    expect(d.period).toEqual(period);
    expect(d.combos[0]).toEqual({ sets: ['Set Immunité', 'Set Réaction'], share: 39.2 }); // 29.9 + 9.3, reversed order merged
  });
  it('merges reversed combos and keeps a different pair separate', () => {
    expect(d.combos).toHaveLength(2);
    expect(d.combos[1]).toEqual({ sets: ['set_max_hp', 'Set Réaction'], share: 7.3 });
  });
  it('keeps the display order of the highest-share variant and re-sorts', () => {
    const raw = { code: 0, value: { ...detail.value, hero_eqips: [
      { rank_sets: 'a,b', eqip_rank_share: 5 }, { rank_sets: 'c,d', eqip_rank_share: 8 }, { rank_sets: 'b,a', eqip_rank_share: 6.1 },
    ] } };
    expect(mapDetail(raw, period, {})!.combos).toEqual([
      { sets: ['set_b', 'set_a'], share: 11.1 }, { sets: ['set_c', 'set_d'], share: 8 },
    ]);
  });
  it('drops the empty filler rows the hunt API pads with', () => {
    const raw = { code: 0, value: { ...detail.value,
      hero_eqips: [detail.value.hero_eqips[0], { eqip_rank_share: 0.0 }, { eqip_rank_share: 0.0 }],
      hero_arti: [detail.value.hero_arti[0], { arti_rank_share: 0.0 }, { arti_rank_share: 0.0 }] } };
    const f = mapDetail(raw, period, names)!;
    expect(f.combos).toEqual([{ sets: ['Set Immunité', 'Set Réaction'], share: 29.9 }]);
    expect(f.artifacts).toHaveLength(1);
    expect(JSON.stringify(f)).not.toContain('set_undefined');
  });
  it('maps artifacts', () => {
    expect(d.artifacts[0]).toEqual({ code: 'efa29', name: 'Murmure dangereux', share: 91.5 });
  });
  it('maps stat distributions', () => {
    const nums = (s: string) => s.split(',').map(Number);
    const v = detail.value;
    expect(d.stats.speed).toHaveLength(10);
    expect(d.stats.speed).toEqual(nums(v.speed_statistics));
    expect(d.stats.critChance).toEqual(nums(v.critical_statistics));
    expect(d.stats.critDamage).toEqual(nums(v.critical_hit_statistics));
    expect(d.stats.attack).toEqual(nums(v.attack_stats));
    expect(d.stats.defense).toEqual(nums(v.defense_stats));
    expect(d.stats.health).toEqual(nums(v.vitality_statistics));
    expect(d.stats.effectiveness).toEqual(nums(v.effective_statistics));
    expect(d.stats.effectResistance).toEqual(nums(v.effect_resistance_statistics));
  });
  it('returns undefined for a placeholder row (rows present, stats absent)', () => {
    const placeholder = { code: 0, value: { hero_code: 'c3051', hero_eqips: [{ eqip_rank_share: 0 }], hero_arti: [{ arti_rank_share: 0 }] } };
    expect(mapDetail(placeholder, period, names)).toBeUndefined();
  });
  it('returns undefined without equipment and artifact data', () => {
    expect(mapDetail({ code: 0, value: { hero_code: 'c1' } }, period, names)).toBeUndefined();
  });
});
