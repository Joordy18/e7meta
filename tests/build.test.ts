import { describe, expect, it } from 'vitest';
import { NOTE_MAX, SETS, addSet, buildHash, parseBuild, piecesOf, piecesUsed, removeSet, setFallbackName, shareLink } from '../src/lib/build';

describe('parseBuild / buildHash', () => {
  it('writes only what is filled in, and reads it back', () => {
    const b = { hero: 'c1007', sets: ['set_speed', 'set_cri'], artifact: 'efa17', note: 'Speed 190+ & crit 100%' };
    const hash = buildHash(b);
    expect(hash).toBe('#/tools/build?h=c1007&s=set_speed,set_cri&a=efa17&n=Speed%20190%2B%20%26%20crit%20100%25');
    expect(parseBuild(hash)).toEqual(b);
    expect(buildHash({ hero: '', sets: [], artifact: '', note: '' })).toBe('#/tools/build');
    expect(parseBuild('#/tools/build')).toEqual({ hero: '', sets: [], artifact: '', note: '' });
  });
  it('drops what is not a code, a set that does not exist, what does not fit in six pieces and a note that is too long', () => {
    const b = parseBuild('#/tools/build?h=%3Cscript%3E&s=set_speed,x%20y,set_nope,set_cri,set_att,set_def&a=../../x&n=' + 'a'.repeat(500));
    expect(b.hero).toBe('');
    expect(b.sets).toEqual(['set_speed', 'set_cri']); // 4 + 2 = six pieces: set_att (4) and set_def (2) no longer fit
    expect(b.artifact).toBe('');
    expect(b.note).toHaveLength(NOTE_MAX);
  });
  it('counts pieces: four-piece sets first, a two-piece set can be taken twice, never more than six pieces', () => {
    expect([piecesOf('set_speed'), piecesOf('set_cri'), piecesOf('set_shield'), piecesOf('set_max_hp')]).toEqual([4, 2, 4, 2]);
    expect(addSet(addSet([], 'set_immune'), 'set_speed')).toEqual(['set_speed', 'set_immune']);
    expect(addSet(['set_max_hp', 'set_max_hp'], 'set_immune')).toEqual(['set_max_hp', 'set_max_hp', 'set_immune']);
    expect(piecesUsed(['set_speed', 'set_immune'])).toBe(6);
    expect(addSet(['set_speed', 'set_immune'], 'set_cri')).toEqual(['set_speed', 'set_immune']); // full
    expect(addSet(['set_speed'], 'set_att')).toEqual(['set_speed']); // 4 + 4
    expect(addSet(['set_cri', 'set_def', 'set_res'], 'set_speed')).toHaveLength(3);
    expect(removeSet(['set_max_hp', 'set_max_hp', 'set_immune'], 'set_max_hp')).toEqual(['set_max_hp', 'set_immune']);
  });
  it('writes the link that shows a preview in a chat, and the preview server reads it back as the same build', () => {
    const b = { hero: 'c1137', sets: ['set_max_hp', 'set_max_hp', 'set_immune'], artifact: 'efk03', note: 'Speed 190+ & more' };
    const link = shareLink('https://share.example.app/', b, 'fr');
    expect(link).toBe('https://share.example.app/b?h=c1137&s=set_max_hp,set_max_hp,set_immune&a=efk03&n=Speed%20190%2B%20%26%20more&l=fr');
    expect(shareLink('https://share.example.app', { hero: 'c1', sets: [], artifact: '', note: '' }, 'en')).toBe('https://share.example.app/b?h=c1&l=en');
    expect(parseBuild(`#/tools/build?${link.split('?')[1]}`)).toEqual(b);
  });
  it('lists every set once, and names an unknown one from its code', () => {
    expect(new Set(SETS).size).toBe(SETS.length);
    expect(setFallbackName('set_rage')).toBe('Rage Set');
    expect(setFallbackName('set_cri_dmg')).toBe('Cri Dmg Set');
  });
});
