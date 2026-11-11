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
  it('spells & as "and" and drops dots, as the fan site does', () => {
    expect(epic7dbUrl('Baal & Sezan')).toBe('https://epic7db.com/heroes/baal-and-sezan');
    expect(epic7dbUrl('Ainos 2.0')).toBe('https://epic7db.com/heroes/ainos-20');
  });
  it('knows the heroes the fan site names differently from the game', () => {
    expect(epic7dbUrl('Immortal Wukong')).toBe('https://epic7db.com/heroes/immortal-king-wukong');
  });
  it('turns other punctuation into dashes', () => {
    expect(epic7dbUrl('Bellona (Lone Moon)')).toBe('https://epic7db.com/heroes/bellona-lone-moon');
  });
});
