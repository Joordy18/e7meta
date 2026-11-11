import { normalize } from './data';

// Heroes epic7db.com names differently from the game (found in its sitemap); the others follow the rule below.
const SLUG: Record<string, string> = { 'immortal wukong': 'immortal-king-wukong' };

/** Page of a hero on epic7db.com (a fan site, not the game's): its slug is the name in lower case, words joined by dashes. */
export const epic7dbUrl = (heroName: string) =>
  `https://epic7db.com/heroes/${SLUG[normalize(heroName)] ?? normalize(heroName).replace(/&/g, ' and ').replace(/['’.]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
