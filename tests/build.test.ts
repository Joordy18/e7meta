import { describe, expect, it } from 'vitest';
import { NOTE_MAX, SETS, buildHash, parseBuild, setFallbackName } from '../src/lib/build';

describe('parseBuild / buildHash', () => {
  it('writes only what is filled in, and reads it back', () => {
    const b = { hero: 'c1007', sets: ['set_speed', 'set_cri'], artifact: 'efa17', note: 'Speed 190+ & crit 100%' };
    const hash = buildHash(b);
    expect(hash).toBe('#/tools/build?h=c1007&s=set_speed,set_cri&a=efa17&n=Speed%20190%2B%20%26%20crit%20100%25');
    expect(parseBuild(hash)).toEqual(b);
    expect(buildHash({ hero: '', sets: [], artifact: '', note: '' })).toBe('#/tools/build');
    expect(parseBuild('#/tools/build')).toEqual({ hero: '', sets: [], artifact: '', note: '' });
  });
  it('drops what is not a code, repeats, more than three sets and a note that is too long', () => {
    const b = parseBuild('#/tools/build?h=%3Cscript%3E&s=set_speed,set_speed,x%20y,set_cri,set_att,set_def&a=../../x&n=' + 'a'.repeat(500));
    expect(b.hero).toBe('');
    expect(b.sets).toEqual(['set_speed', 'set_cri', 'set_att']);
    expect(b.artifact).toBe('');
    expect(b.note).toHaveLength(NOTE_MAX);
  });
  it('lists every set once, and names an unknown one from its code', () => {
    expect(new Set(SETS).size).toBe(SETS.length);
    expect(setFallbackName('set_rage')).toBe('Rage Set');
    expect(setFallbackName('set_cri_dmg')).toBe('Cri Dmg Set');
  });
});
