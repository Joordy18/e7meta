import { describe, expect, it } from 'vitest';
import { diffWords } from '../src/lib/diff';

describe('diffWords', () => {
  it('marks the words that were removed and the ones that were added, keeping the common ones', () => {
    expect(diffWords('has a 30% chance to stun', 'has a 35% chance to stun')).toEqual([
      { kind: 'same', text: 'has a' }, { kind: 'del', text: '30%' }, { kind: 'add', text: '35%' }, { kind: 'same', text: 'chance to stun' },
    ]);
  });
  it('finds an insertion and a deletion', () => {
    expect(diffWords('dispelling one buff', 'dispelling two buffs')).toEqual([
      { kind: 'same', text: 'dispelling' }, { kind: 'del', text: 'one buff' }, { kind: 'add', text: 'two buffs' },
    ]);
    expect(diffWords('a b c', 'a c')).toEqual([{ kind: 'same', text: 'a' }, { kind: 'del', text: 'b' }, { kind: 'same', text: 'c' }]);
    expect(diffWords('a c', 'a b c')).toEqual([{ kind: 'same', text: 'a' }, { kind: 'add', text: 'b' }, { kind: 'same', text: 'c' }]);
  });
  it('is one block of common text when nothing changed, and handles empty sides', () => {
    expect(diffWords('same text', 'same text')).toEqual([{ kind: 'same', text: 'same text' }]);
    expect(diffWords('', 'new')).toEqual([{ kind: 'add', text: 'new' }]);
    expect(diffWords('old', '')).toEqual([{ kind: 'del', text: 'old' }]);
    expect(diffWords('', '')).toEqual([]);
  });
  it('keeps line breaks out of the way: lines are just more words', () => {
    expect(diffWords('first line.\nsecond line.', 'first line. second line.')).toEqual([{ kind: 'same', text: 'first line. second line.' }]);
  });
  it('cuts Japanese and Chinese at each character, since they have no spaces, and still glues the changed stretch back', () => {
    expect(diffWords('100%の確率で睡眠を付与', '100%の確率で猛毒を付与')).toEqual([
      { kind: 'same', text: '100%の確率で' }, { kind: 'del', text: '睡眠' }, { kind: 'add', text: '猛毒' }, { kind: 'same', text: 'を付与' },
    ]);
  });
  it('keeps cutting Korean at spaces', () => {
    expect(diffWords('1턴 간 수면을 발생', '2턴 간 수면을 발생')).toEqual([
      { kind: 'del', text: '1턴' }, { kind: 'add', text: '2턴' }, { kind: 'same', text: '간 수면을 발생' },
    ]);
  });
});
