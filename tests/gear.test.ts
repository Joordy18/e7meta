import { describe, expect, it } from 'vitest';
import { describeArtifact } from '../src/lib/gear';

const values = [{ level1: '8.0%', max: '16.0%' }, { level1: '4.0%', max: '9.0%' }];

describe('describeArtifact', () => {
  const text = 'Increases damage by @ with a Single Attack, and by an additional @@ if the enemy has a barrier.';
  it('puts the level 1 values where the @ placeholders are (one @ = first value, @@ = second)', () => {
    expect(describeArtifact(text, values, 'level1')).toBe('Increases damage by 8.0% with a Single Attack, and by an additional 4.0% if the enemy has a barrier.');
  });
  it('puts the max level values', () => {
    expect(describeArtifact(text, values, 'max')).toBe('Increases damage by 16.0% with a Single Attack, and by an additional 9.0% if the enemy has a barrier.');
  });
  it('leaves a placeholder alone when the value is missing, and turns a literal backslash-n into a space', () => {
    expect(describeArtifact('A @ and @@@.\\nB', values, 'max')).toBe('A 16.0% and @@@. B');
  });
  it('says so when the game publishes a zero for a value (some artifacts are listed with 0.0%), instead of showing a false 0.0%', () => {
    expect(describeArtifact('Has a @ chance.', [{ level1: '0.0%', max: '0.0%' }], 'max')).toBe('Has a (value not published) chance.');
    expect(describeArtifact('Has a @ chance.', [{ level1: '0', max: '30.0%' }], 'level1')).toBe('Has a (value not published) chance.');
    expect(describeArtifact('Has a @ chance.', [{ level1: '0', max: '30.0%' }], 'max')).toBe('Has a 30.0% chance.');
  });
  it('is unchanged without placeholders', () => expect(describeArtifact('Increases Health by 10%.', [], 'max')).toBe('Increases Health by 10%.'));
});
