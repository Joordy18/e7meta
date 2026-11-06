import { describe, expect, it } from 'vitest';
import { epic7dbUrl } from '../src/lib/links';

describe('epic7dbUrl', () => {
  it('builds the fan site page of a hero from its name', () => {
    expect(epic7dbUrl('Setsuka')).toBe('https://epic7db.com/heroes/setsuka');
    expect(epic7dbUrl('Mei Lin')).toBe('https://epic7db.com/heroes/mei-lin');
  });
  it('drops accents, and apostrophes without splitting the word', () => {
    expect(epic7dbUrl('Abigaëlle')).toBe('https://epic7db.com/heroes/abigaelle');
    expect(epic7dbUrl("Archdemon's Shadow")).toBe('https://epic7db.com/heroes/archdemons-shadow');
    expect(epic7dbUrl('Archdemon’s Shadow')).toBe('https://epic7db.com/heroes/archdemons-shadow');
  });
  it('turns other punctuation into dashes', () => {
    expect(epic7dbUrl('Bellona (Lone Moon)')).toBe('https://epic7db.com/heroes/bellona-lone-moon');
  });
});
